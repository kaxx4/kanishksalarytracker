/**
 * Payroll engine.
 *
 * Every rule here was reverse-engineered from the existing CT/MKCP workbooks and
 * is pinned by payroll.test.ts, which reproduces the July-2026 runs for both
 * companies to the rupee (CT 1,10,785 and MKCP 1,20,269 — the figures that
 * appear on the signed bank letters).
 *
 * The two day-counts are deliberately different, because that is what the
 * workbooks do:
 *   - the salary divisor uses CALENDAR days of the month (31 for July)
 *   - absence and tiffin run on WORKING days (27 for July — Sundays off)
 */

export type DayBasis = 'calendar' | 'working'

export interface PtaxSlab {
  /** Inclusive upper bound of monthly gross; null means "and above". */
  upto: number | null
  amount: number
}

/**
 * West Bengal profession tax, salaried employees.
 * Nil <=10,000 | 110 <=15,000 | 130 <=25,000 | 150 <=40,000 | 200 above.
 * The CT workbook already used this; the MKCP workbook was missing the top
 * slab and under-deducted Rs 50/month for anyone above 40,000.
 */
export const WB_PTAX_SLABS: PtaxSlab[] = [
  { upto: 10000, amount: 0 },
  { upto: 15000, amount: 110 },
  { upto: 25000, amount: 130 },
  { upto: 40000, amount: 150 },
  { upto: null, amount: 200 },
]

export type RoundRule = 'up' | 'nearest' | 'down'

export interface CompanySettings {
  /** Weekday numbers that are weekly offs. 0 = Sunday. */
  weeklyOffDays: number[]
  /** ISO yyyy-mm-dd dates treated as non-working days on top of weekly offs. */
  holidays: string[]
  /** Rupees per day present, for tiffin-eligible employees. */
  tiffinRate: number
  /** Which day count divides the monthly pay. Historically 'calendar'. */
  payDivisorBasis: DayBasis
  ptaxSlabs: PtaxSlab[]
  /**
   * How the final payable is rounded before it reaches the bank file.
   * 'up' is the historical behaviour — the workbooks never shorted an
   * employee by rounding down.
   */
  roundRule: RoundRule
  /** Rounding granularity in rupees: 1 for whole-rupee, 10 for nearest ten. */
  roundUnit: number
}

export const DEFAULT_SETTINGS: CompanySettings = {
  weeklyOffDays: [0],
  holidays: [],
  tiffinRate: 10,
  payDivisorBasis: 'calendar',
  ptaxSlabs: WB_PTAX_SLABS,
  roundRule: 'up',
  roundUnit: 1,
}

export interface EmployeeInput {
  id: string
  name: string
  monthlyPay: number
  /** When true, tiffin is auto-computed as rate x days present. */
  tiffinEligible: boolean
}

export interface LineInput {
  employee: EmployeeInput
  /** Days absent in the month, counted against working days. */
  absence: number
  /** Paid-leave days credited back. Entered manually. */
  leavePay: number
  /** Overrides the auto tiffin figure when set (including 0). */
  tiffinOverride?: number
  /** Salary advance already taken, deducted before the bank transfer. */
  advance?: number
  /** TDS deducted (used for directors). */
  tds?: number
  /** 'neft' rows go into the bank file; 'cash' and 'excluded' do not. */
  payMode?: PayMode
}

export type PayMode = 'neft' | 'cash' | 'excluded'

export interface LineResult {
  employeeId: string
  name: string
  monthlyPay: number
  calendarDays: number
  workingDays: number
  absence: number
  leavePay: number
  daysPresent: number
  tiffin: number
  /** Unrounded, as the workbook computes it. */
  gross: number
  ptax: number
  tds: number
  advance: number
  /** gross - ptax - tds, before advance. */
  net: number
  /** net - advance, unrounded. */
  payable: number
  /** payable rounded up to the whole rupee — what actually goes to the bank. */
  rounded: number
  payMode: PayMode
}

export interface MonthTotals {
  gross: number
  ptax: number
  tds: number
  advance: number
  /** Sum of rounded amounts for NEFT lines only — matches the bank letter. */
  neftTotal: number
  cashTotal: number
  /** Sum of rounded amounts across every line, NEFT and cash. */
  grandTotal: number
}

export interface MonthResult {
  year: number
  /** 1-12. */
  month: number
  calendarDays: number
  workingDays: number
  lines: LineResult[]
  totals: MonthTotals
}

/** Calendar days in the given month. `month` is 1-12. */
export function calendarDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Working days in the month: calendar days minus weekly offs and holidays.
 * July 2026 -> 31 - 4 Sundays = 27, which is the figure the tiffin column uses.
 */
export function workingDaysInMonth(
  year: number,
  month: number,
  settings: Pick<CompanySettings, 'weeklyOffDays' | 'holidays'>,
): number {
  const total = calendarDaysInMonth(year, month)
  const offs = new Set(settings.weeklyOffDays)
  const holidays = new Set(settings.holidays)
  let count = 0
  for (let day = 1; day <= total; day++) {
    const date = new Date(Date.UTC(year, month - 1, day))
    if (offs.has(date.getUTCDay())) continue
    if (holidays.has(isoDate(year, month, day))) continue
    count++
  }
  return count
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Profession tax for a given monthly gross, from the slab table. */
export function ptaxFor(gross: number, slabs: PtaxSlab[] = WB_PTAX_SLABS): number {
  for (const slab of slabs) {
    if (slab.upto === null || gross <= slab.upto) return slab.amount
  }
  return slabs[slabs.length - 1]?.amount ?? 0
}

/**
 * Round an amount per the company's rule and unit.
 *
 * 'up' is the historical, and still the default, behaviour — the workbooks
 * never shorted an employee by rounding down. 'nearest' and 'down' exist for
 * companies that round differently; `unit` lets that rounding land on the
 * nearest 10 rupees instead of the nearest 1.
 */
export function roundAmount(amount: number, rule: RoundRule, unit: number): number {
  const safeUnit = unit > 0 ? unit : 1
  // Guard against binary-float dust (e.g. 15630.000000000002 -> 15631) before
  // dividing, so it can't tip an exact multiple over to the next unit.
  const clean = Number(amount.toFixed(6))
  const scaled = clean / safeUnit
  const rounder = rule === 'up' ? Math.ceil : rule === 'down' ? Math.floor : Math.round
  return Number((rounder(Number(scaled.toFixed(6))) * safeUnit).toFixed(2))
}

/** Round up to the whole rupee — kept as the historical default shorthand. */
export function roundUpRupee(amount: number): number {
  return roundAmount(amount, 'up', 1)
}

export function computeLine(
  input: LineInput,
  year: number,
  month: number,
  settings: CompanySettings = DEFAULT_SETTINGS,
): LineResult {
  const calendarDays = calendarDaysInMonth(year, month)
  const workingDays = workingDaysInMonth(year, month, settings)
  const divisor = settings.payDivisorBasis === 'working' ? workingDays : calendarDays

  const { employee, absence, leavePay } = input
  const daysPresent = Math.max(0, workingDays - absence)

  const tiffin =
    input.tiffinOverride !== undefined
      ? input.tiffinOverride
      : employee.tiffinEligible
        ? settings.tiffinRate * daysPresent
        : 0

  const paidDays = divisor - absence + leavePay
  const gross = (employee.monthlyPay * paidDays) / divisor + tiffin

  const ptax = ptaxFor(gross, settings.ptaxSlabs)
  const tds = input.tds ?? 0
  const advance = input.advance ?? 0

  const net = gross - ptax - tds
  const payable = net - advance

  return {
    employeeId: employee.id,
    name: employee.name,
    monthlyPay: employee.monthlyPay,
    calendarDays,
    workingDays,
    absence,
    leavePay,
    daysPresent,
    tiffin,
    gross,
    ptax,
    tds,
    advance,
    net,
    payable,
    rounded: roundAmount(payable, settings.roundRule, settings.roundUnit),
    payMode: input.payMode ?? 'neft',
  }
}

export function computeMonth(
  inputs: LineInput[],
  year: number,
  month: number,
  settings: CompanySettings = DEFAULT_SETTINGS,
): MonthResult {
  const lines = inputs.map((i) => computeLine(i, year, month, settings))

  const totals: MonthTotals = {
    gross: sum(lines.map((l) => l.gross)),
    ptax: sum(lines.map((l) => l.ptax)),
    tds: sum(lines.map((l) => l.tds)),
    advance: sum(lines.map((l) => l.advance)),
    neftTotal: sum(lines.filter((l) => l.payMode === 'neft').map((l) => l.rounded)),
    cashTotal: sum(lines.filter((l) => l.payMode === 'cash').map((l) => l.rounded)),
    grandTotal: sum(lines.filter((l) => l.payMode !== 'excluded').map((l) => l.rounded)),
  }

  return {
    year,
    month,
    calendarDays: calendarDaysInMonth(year, month),
    workingDays: workingDaysInMonth(year, month, settings),
    lines,
    totals,
  }
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

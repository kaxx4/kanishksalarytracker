/**
 * Bonus engine.
 *
 * The formula was reverse-engineered against BONUS CALCULATION.xls (six
 * financial years of real payouts) and pinned by bonus.test.ts:
 *
 *   monthly bonus wage = payable + ptax - tiffin   (for a month with a saved run)
 *   annual bonus wage   = sum of that figure for the 12 FY months, April -> March
 *   bonus                = annual bonus wage x rate, rounded per company/FY setting
 *
 * This is the Payment of Bonus Act's definition of bonus-eligible wage: it
 * excludes special allowances (tiffin) but includes what P.Tax would
 * otherwise have deducted. Every FY in the source workbook used a flat 16.5%
 * rate and rounded to the *nearest* rupee (not the payroll default of always
 * rounding up), so those are this engine's defaults — both are meant to be
 * overridden per company per financial year, not hardcoded at call sites.
 */
import { roundAmount, type RoundRule } from './payroll.ts'
import type { PayMode } from '../types.ts'

export const DEFAULT_BONUS_RATE = 0.165
export const DEFAULT_BONUS_ROUND_RULE: RoundRule = 'nearest'

/**
 * The 12 (year, month) pairs of the financial year starting in April of
 * `fyStartYear`, e.g. fyMonths(2024) -> Apr 2024 .. Mar 2025.
 */
export function fyMonths(fyStartYear: number): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = []
  for (let i = 0; i < 12; i++) {
    const month = ((3 + i) % 12) + 1 // 4,5,...,12,1,2,3
    const year = month >= 4 ? fyStartYear : fyStartYear + 1
    out.push({ year, month })
  }
  return out
}

export function fyLabel(fyStartYear: number): string {
  return `FY${fyStartYear}-${String(fyStartYear + 1).slice(2)}`
}

/**
 * Bonus-eligible wage for one saved payroll month.
 *
 * The Act counts what a person earned; `payable` is only what reached their
 * bank, and the two differ by whatever was withheld on the way. P.Tax, TDS and
 * a recovered advance are all deductions *from* an earned wage rather than
 * reductions *of* it — an advance in particular is money the person has
 * already been paid, so treating it as a shortfall would dock their bonus for
 * having been paid early. Each is added back. Tiffin is an allowance and falls
 * outside the Act's definition of wages, so it comes off.
 *
 * That makes this `gross - tiffin` by another name, and it is worth checking
 * against the stored `gross` if these ever disagree.
 */
export function monthlyBonusWage(line: {
  payable: number
  ptax: number
  tiffin: number
  tds?: number
  advance?: number
}): number {
  return line.payable + line.ptax + (line.tds ?? 0) + (line.advance ?? 0) - line.tiffin
}

export interface BonusEmployeeInput {
  employeeId: string
  name: string
  beneficiaryName: string
  bankIfsc: string | null
  bankAccountNo: string | null
  bankAccountType: string
  /** Bonus-eligible wage for each FY month that has a figure (saved run or manual entry). */
  monthlyWages: number[]
  payMode?: PayMode
}

export interface BonusLineResult {
  employeeId: string
  name: string
  annualWage: number
  monthsCounted: number
  /** Unrounded annualWage x rate. */
  bonusAmount: number
  rounded: number
  payMode: PayMode
}

export interface BonusTotals {
  annualWage: number
  bonusAmount: number
  neftTotal: number
  cashTotal: number
  grandTotal: number
}

export interface BonusRunResult {
  fyStartYear: number
  rate: number
  roundRule: RoundRule
  lines: BonusLineResult[]
  totals: BonusTotals
}

export function computeBonusLine(
  input: BonusEmployeeInput,
  rate: number,
  roundRule: RoundRule,
): BonusLineResult {
  const annualWage = sum(input.monthlyWages)
  const bonusAmount = annualWage * rate
  return {
    employeeId: input.employeeId,
    name: input.name,
    annualWage,
    monthsCounted: input.monthlyWages.length,
    bonusAmount,
    rounded: roundAmount(bonusAmount, roundRule, 1),
    payMode: input.payMode ?? 'neft',
  }
}

export function computeBonusRun(
  inputs: BonusEmployeeInput[],
  fyStartYear: number,
  rate: number = DEFAULT_BONUS_RATE,
  roundRule: RoundRule = DEFAULT_BONUS_ROUND_RULE,
): BonusRunResult {
  const lines = inputs.map((i) => computeBonusLine(i, rate, roundRule))
  const totals: BonusTotals = {
    annualWage: sum(lines.map((l) => l.annualWage)),
    bonusAmount: sum(lines.map((l) => l.bonusAmount)),
    neftTotal: sum(lines.filter((l) => l.payMode === 'neft').map((l) => l.rounded)),
    cashTotal: sum(lines.filter((l) => l.payMode === 'cash').map((l) => l.rounded)),
    grandTotal: sum(lines.filter((l) => l.payMode !== 'excluded').map((l) => l.rounded)),
  }
  return { fyStartYear, rate, roundRule, lines, totals }
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

import type { AttendanceStatus } from '../types.ts'

/**
 * Derived attendance for one employee in one month.
 *
 * A paid-leave day counts as an absence *and* is credited back through leave
 * pay — that is how the workbooks behave (Shambhu: 5 absent, 5 leave pay, full
 * month's salary), and it is also why paid leave earns no tiffin.
 *
 * There is no half-day concept — the business runs a strict present/absent/
 * paid-leave register, so every mark counts as a whole day one way or another.
 */
export interface DerivedAttendance {
  absence: number
  leavePay: number
  present: number
  /** Weekly offs charged by the sandwich rule; part of `absence`, kept separate
   *  so the Month End page can explain a figure the daily grid cannot show. */
  sandwiched: number
}

const key = (employeeId: string, iso: string) => `${employeeId}|${iso}`

export interface DeriveOptions {
  /**
   * Charge a weekly off that is flanked by absence on both sides.
   *
   * The daily register only has columns for working days, so a Sunday lost
   * this way is invisible in it while the pay register counts it — which is
   * exactly why the two books disagreed on MKCP's absence totals. Off by
   * default; MKCP turns it on under Settings.
   */
  chargeSandwichedOffDays?: boolean
}

/**
 * Weekly offs and holidays that fall inside a stretch of absence.
 *
 * Scoped to the month on purpose. An off day on the 1st or the 31st has a
 * neighbour in an adjacent month that may not be loaded, and a figure that
 * changed depending on which months happened to be in memory would be worse
 * than one that is merely conservative. Those edges stay uncharged and the
 * operator can override the row.
 *
 * Only `absent` triggers it. Paid leave is authorised time off, and docking
 * someone's Sunday for taking approved leave either side of it would be a
 * different and much harsher rule than the one the register shows.
 */
function sandwichedOffDays(
  attendance: Record<string, AttendanceStatus>,
  employeeId: string,
  year: number,
  month: number,
  isWorkingDay: (iso: string) => boolean,
  daysInMonth: number,
): number {
  const isoOf = (d: number) =>
    `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  /** The mark on the nearest working day in `step` direction, if any. */
  const neighbour = (from: number, step: -1 | 1): AttendanceStatus | undefined | null => {
    for (let d = from + step; d >= 1 && d <= daysInMonth; d += step) {
      const iso = isoOf(d)
      if (isWorkingDay(iso)) return attendance[key(employeeId, iso)]
    }
    return null // ran off the edge of the month
  }

  let charged = 0
  for (let d = 1; d <= daysInMonth; d++) {
    if (isWorkingDay(isoOf(d))) continue
    if (neighbour(d, -1) === 'absent' && neighbour(d, 1) === 'absent') charged++
  }
  return charged
}

/**
 * Roll a month of attendance marks into the two figures payroll needs:
 * absence (which reduces paid days) and leave pay (which credits days back).
 *
 * Pulled out of the Supabase-backed store so it is plain, dependency-free
 * calculation logic — testable under Node without a Supabase client.
 */
export function deriveAttendance(
  attendance: Record<string, AttendanceStatus>,
  employeeId: string,
  year: number,
  month: number,
  isWorkingDay: (iso: string) => boolean,
  options: DeriveOptions = {},
): DerivedAttendance {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  let absent = 0
  let paidLeave = 0
  let present = 0

  for (let d = 1; d <= days; d++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (!isWorkingDay(iso)) continue
    const status = attendance[key(employeeId, iso)]
    switch (status) {
      case 'absent': absent++; break
      case 'paid_leave': paidLeave++; break
      case 'holiday': break
      // Unmarked days count as present, so a clean month needs no clicking.
      default: present++
    }
  }

  const sandwiched = options.chargeSandwichedOffDays
    ? sandwichedOffDays(attendance, employeeId, year, month, isWorkingDay, days)
    : 0

  return {
    // Sandwiched offs reduce paid days like any absence, but they are not
    // working days, so they earn no tiffin and do not touch `present`.
    absence: absent + paidLeave + sandwiched,
    leavePay: paidLeave,
    present,
    sandwiched,
  }
}

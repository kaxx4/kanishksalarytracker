import type { AttendanceStatus } from '../types.ts'

/**
 * Derived attendance for one employee in one month.
 *
 * A paid-leave day counts as an absence *and* is credited back through leave
 * pay — that is how the workbooks behave (Shambhu: 5 absent, 5 leave pay, full
 * month's salary), and it is also why paid leave earns no tiffin.
 */
export interface DerivedAttendance {
  absence: number
  leavePay: number
  present: number
  halfDays: number
}

const key = (employeeId: string, iso: string) => `${employeeId}|${iso}`

/**
 * Roll a month of attendance marks into the two figures payroll needs:
 * absence (which reduces paid days) and leave pay (which credits days back).
 *
 * Pulled out of the Supabase-backed store so it is plain, dependency-free
 * calculation logic — testable under Node without a Supabase client, and the
 * one place `half_day_weight` (a per-company setting) actually takes effect.
 */
export function deriveAttendance(
  attendance: Record<string, AttendanceStatus>,
  employeeId: string,
  year: number,
  month: number,
  isWorkingDay: (iso: string) => boolean,
  /**
   * Fraction of a day a half-day mark counts against attendance. Defaults to
   * 0.5 (half absent, half present) but is a per-company setting
   * (`half_day_weight`) — some companies may want a half day to weigh
   * differently against absence.
   */
  halfDayWeight = 0.5,
): DerivedAttendance {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  let absent = 0
  let paidLeave = 0
  let halfDays = 0
  let present = 0

  for (let d = 1; d <= days; d++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (!isWorkingDay(iso)) continue
    const status = attendance[key(employeeId, iso)]
    switch (status) {
      case 'absent': absent++; break
      case 'paid_leave': paidLeave++; break
      case 'half_day': halfDays++; present += 1 - halfDayWeight; break
      case 'holiday': break
      // Unmarked days count as present, so a clean month needs no clicking.
      default: present++
    }
  }

  return {
    absence: absent + paidLeave + halfDays * halfDayWeight,
    leavePay: paidLeave,
    present,
    halfDays,
  }
}

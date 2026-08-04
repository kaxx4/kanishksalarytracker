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
}

const key = (employeeId: string, iso: string) => `${employeeId}|${iso}`

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

  return {
    absence: absent + paidLeave,
    leavePay: paidLeave,
    present,
  }
}

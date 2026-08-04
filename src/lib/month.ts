import { calendarDaysInMonth, isoDate } from '../calc/payroll.ts'
import type { Company, Holiday } from '../types.ts'

export interface MonthDay {
  day: number
  iso: string
  /** 0 = Sunday. */
  weekday: number
  isWeeklyOff: boolean
  isHoliday: boolean
  isWorking: boolean
  label: string
}

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function buildMonthDays(
  year: number,
  month: number,
  company: Pick<Company, 'weekly_off_days' | 'id'>,
  holidays: Holiday[],
): MonthDay[] {
  const offs = new Set(company.weekly_off_days ?? [0])
  const holidaySet = new Set(
    holidays
      .filter((h) => h.company_id === null || h.company_id === company.id)
      .map((h) => h.holiday_on),
  )

  const total = calendarDaysInMonth(year, month)
  const days: MonthDay[] = []
  for (let day = 1; day <= total; day++) {
    const iso = isoDate(year, month, day)
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    const isWeeklyOff = offs.has(weekday)
    const isHoliday = holidaySet.has(iso)
    days.push({
      day,
      iso,
      weekday,
      isWeeklyOff,
      isHoliday,
      isWorking: !isWeeklyOff && !isHoliday,
      label: WEEKDAY_LETTERS[weekday],
    })
  }
  return days
}

/** The month a salary run is normally prepared for: the one just finished. */
export function previousMonth(): { year: number; month: number } {
  const now = new Date()
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const month = now.getMonth() === 0 ? 12 : now.getMonth()
  return { year, month }
}

export function monthOptions(back = 24): { year: number; month: number; label: string }[] {
  const out: { year: number; month: number; label: string }[] = []
  const now = new Date()
  for (let i = 1; i <= back; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i + 1, 1))
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth() + 1
    out.push({
      year,
      month,
      label: new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-IN', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    })
  }
  return out
}

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { deriveAttendance } from './attendance.ts'
import type { AttendanceStatus } from '../types.ts'

const YEAR = 2026
const MONTH = 7 // 31 calendar days, 27 working days (4 Sundays)

const sunday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() !== 0

test('an empty month is entirely present, zero absence', () => {
  const d = deriveAttendance({}, 'e1', YEAR, MONTH, sunday)
  assert.equal(d.absence, 0)
  assert.equal(d.leavePay, 0)
  assert.equal(d.present, 27)
})

test('default half-day weight is 0.5, matching historical behaviour', () => {
  const attendance: Record<string, AttendanceStatus> = {
    'e1|2026-07-07': 'half_day',
  }
  const d = deriveAttendance(attendance, 'e1', YEAR, MONTH, sunday)
  assert.equal(d.absence, 0.5)
  assert.equal(d.present, 26.5)
  assert.equal(d.halfDays, 1)
})

test('a company can weight half-days differently', () => {
  const attendance: Record<string, AttendanceStatus> = {
    'e1|2026-07-07': 'half_day',
  }
  // A company that treats a half-day as only a quarter absence.
  const light = deriveAttendance(attendance, 'e1', YEAR, MONTH, sunday, 0.25)
  assert.equal(light.absence, 0.25)
  assert.equal(light.present, 26.75)

  // A company that treats a half-day as a full absence.
  const strict = deriveAttendance(attendance, 'e1', YEAR, MONTH, sunday, 1)
  assert.equal(strict.absence, 1)
  assert.equal(strict.present, 26)
})

test('paid leave counts as absence and is credited back, independent of half-day weight', () => {
  const attendance: Record<string, AttendanceStatus> = {
    'e1|2026-07-03': 'paid_leave',
    'e1|2026-07-04': 'paid_leave',
  }
  const d = deriveAttendance(attendance, 'e1', YEAR, MONTH, sunday, 0.9)
  assert.equal(d.absence, 2)
  assert.equal(d.leavePay, 2)
})

test('marks on non-working days are ignored', () => {
  // 2026-07-05 is a Sunday; a stray mark there should not affect the total.
  const attendance: Record<string, AttendanceStatus> = {
    'e1|2026-07-05': 'absent',
  }
  const d = deriveAttendance(attendance, 'e1', YEAR, MONTH, sunday)
  assert.equal(d.absence, 0)
})

test('mixed statuses combine correctly', () => {
  const attendance: Record<string, AttendanceStatus> = {
    'e1|2026-07-06': 'absent',
    'e1|2026-07-07': 'paid_leave',
    'e1|2026-07-08': 'half_day',
  }
  const d = deriveAttendance(attendance, 'e1', YEAR, MONTH, sunday)
  assert.equal(d.absence, 2.5) // 1 absent + 1 leave + 0.5 half-day
  assert.equal(d.leavePay, 1)
  assert.equal(d.halfDays, 1)
})

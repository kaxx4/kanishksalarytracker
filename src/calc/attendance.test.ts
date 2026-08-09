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

test('paid leave counts as absence and is credited back', () => {
  const attendance: Record<string, AttendanceStatus> = {
    'e1|2026-07-03': 'paid_leave',
    'e1|2026-07-04': 'paid_leave',
  }
  const d = deriveAttendance(attendance, 'e1', YEAR, MONTH, sunday)
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
  }
  const d = deriveAttendance(attendance, 'e1', YEAR, MONTH, sunday)
  assert.equal(d.absence, 2) // 1 absent + 1 leave
  assert.equal(d.leavePay, 1)
  assert.equal(d.present, 25)
})

// ---------------------------------------------------------- the sandwich rule

test('a weekly off between two absences is charged only when the rule is on', () => {
  // 2026-07-05 is a Sunday; the 4th and 6th are the working days either side.
  const attendance: Record<string, AttendanceStatus> = {
    'e1|2026-07-04': 'absent',
    'e1|2026-07-06': 'absent',
  }
  const off = deriveAttendance(attendance, 'e1', YEAR, MONTH, sunday)
  assert.equal(off.absence, 2)
  assert.equal(off.sandwiched, 0)

  const on = deriveAttendance(attendance, 'e1', YEAR, MONTH, sunday, {
    chargeSandwichedOffDays: true,
  })
  assert.equal(on.absence, 3)
  assert.equal(on.sandwiched, 1)
  // The Sunday is not a working day, so it never counted as present and the
  // tiffin-bearing figure must not move.
  assert.equal(on.present, off.present)
})

test('absence on only one side of a weekly off leaves it paid', () => {
  for (const day of ['2026-07-04', '2026-07-06']) {
    const d = deriveAttendance({ [`e1|${day}`]: 'absent' }, 'e1', YEAR, MONTH, sunday, {
      chargeSandwichedOffDays: true,
    })
    assert.equal(d.sandwiched, 0, `one-sided absence on ${day} should not charge the Sunday`)
    assert.equal(d.absence, 1)
  }
})

test('approved leave either side of a weekly off leaves it paid', () => {
  const d = deriveAttendance(
    { 'e1|2026-07-04': 'paid_leave', 'e1|2026-07-06': 'paid_leave' },
    'e1', YEAR, MONTH, sunday, { chargeSandwichedOffDays: true },
  )
  assert.equal(d.sandwiched, 0)
  assert.equal(d.absence, 2)
  assert.equal(d.leavePay, 2)
})

test('a weekly off at the edge of the month is never charged', () => {
  // 2026-07-05, 12, 19, 26 are Sundays; the 4th and 6th bracket the first.
  // Absent every working day of the month: the three interior Sundays are
  // charged, and July neither opens nor closes on a Sunday, so all four are
  // interior. Use a month that does: 2026-03 opens on a Sunday (the 1st).
  const marks: Record<string, AttendanceStatus> = {}
  for (let d = 1; d <= 31; d++) {
    const iso = `2026-03-${String(d).padStart(2, '0')}`
    if (sunday(iso)) marks[`e1|${iso}`] = 'absent'
  }
  const d = deriveAttendance(marks, 'e1', 2026, 3, sunday, { chargeSandwichedOffDays: true })
  // Sundays in March 2026: 1, 8, 15, 22, 29. The 1st has no working day before
  // it inside the month, so four are charged, not five.
  assert.equal(d.sandwiched, 4)
})

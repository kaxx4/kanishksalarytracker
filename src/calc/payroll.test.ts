import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_SETTINGS,
  calendarDaysInMonth,
  computeMonth,
  ptaxFor,
  roundAmount,
  roundUpRupee,
  workingDaysInMonth,
  type LineInput,
} from './payroll.ts'
import { buildNeftRows, splitAmount, verifyTotals } from './neft.ts'

/**
 * The reference month is July 2026 — the run paid out on 04.08.2026, whose
 * signed bank letters say Rs 1,10,785 (Calcutta Traders) and Rs 1,20,269
 * (M.K. Cycles). Every input below is copied from the original workbooks.
 */
const YEAR = 2026
const MONTH = 7

const emp = (id: string, name: string, monthlyPay: number, tiffinEligible: boolean) => ({
  id,
  name,
  monthlyPay,
  tiffinEligible,
})

const CT_LINES: LineInput[] = [
  { employee: emp('ct1', 'DINESH RAM', 15840, true), absence: 6, leavePay: 3 },
  { employee: emp('ct2', 'SUKUMAR SARDAR', 15760, true), absence: 31, leavePay: 2 },
  { employee: emp('ct3', 'SURAJIT PAL', 35500, true), absence: 0, leavePay: 0, advance: 5000 },
  { employee: emp('ct4', 'BIRENDER KR SHAW', 15490, true), absence: 0, leavePay: 0 },
  { employee: emp('ct5', 'BAPI MONDAL', 15490, true), absence: 3, leavePay: 3 },
  { employee: emp('ct6', 'AVIJIT PAL', 18500, true), absence: 1, leavePay: 1 },
  { employee: emp('ct7', 'RAHUL SARKAR', 14750, true), absence: 1, leavePay: 1 },
]

const MKCP_LINES: LineInput[] = [
  { employee: emp('mk1', 'SATINDER RAJBANSHI', 15650, false), absence: 0, leavePay: 0 },
  { employee: emp('mk2', 'RANJIT RAJBANSHI', 15650, false), absence: 0, leavePay: 0 },
  { employee: emp('mk3', 'SHAMBHU PRASAD SINGH', 15650, false), absence: 5, leavePay: 5 },
  { employee: emp('mk4', 'MAHESH RAM', 15650, false), absence: 0, leavePay: 0 },
  { employee: emp('mk5', 'SHATRUDAHAN', 15650, false), absence: 0, leavePay: 0 },
  { employee: emp('mk6', 'BHARAT RAM', 15650, false), absence: 0, leavePay: 0 },
  { employee: emp('mk7', 'RAMNARESH BHAGAT', 17000, false), absence: 9, leavePay: 4 },
  {
    employee: emp('mk8', 'SUNIL KUMAR TIWARI', 18000, false),
    absence: 0,
    leavePay: 0,
    tiffinOverride: 130,
    advance: 5000,
  },
]

test('July 2026 has 31 calendar days and 27 working days', () => {
  assert.equal(calendarDaysInMonth(YEAR, MONTH), 31)
  assert.equal(workingDaysInMonth(YEAR, MONTH, DEFAULT_SETTINGS), 27)
})

test('August 2026 has 26 working days (five Sundays)', () => {
  assert.equal(workingDaysInMonth(2026, 8, DEFAULT_SETTINGS), 26)
})

test('WB profession tax slabs', () => {
  assert.equal(ptaxFor(9999), 0)
  assert.equal(ptaxFor(10000), 0)
  assert.equal(ptaxFor(10001), 110)
  assert.equal(ptaxFor(15000), 110)
  assert.equal(ptaxFor(15001), 130)
  assert.equal(ptaxFor(25000), 130)
  assert.equal(ptaxFor(25001), 150)
  assert.equal(ptaxFor(40000), 150)
  // The slab the MKCP workbook was missing.
  assert.equal(ptaxFor(40001), 200)
  assert.equal(ptaxFor(400000), 200)
})

test('custom slab tables are honoured, since slabs are user-editable', () => {
  // A two-band table with a different threshold entirely.
  const custom = [
    { upto: 20000, amount: 0 },
    { upto: null, amount: 175 },
  ]
  assert.equal(ptaxFor(19999, custom), 0)
  assert.equal(ptaxFor(20000, custom), 0)
  assert.equal(ptaxFor(20001, custom), 175)

  // A single open-ended band charges everyone the same.
  const flat = [{ upto: null, amount: 50 }]
  assert.equal(ptaxFor(0, flat), 50)
  assert.equal(ptaxFor(999999, flat), 50)

  // An empty table must not throw — it simply deducts nothing.
  assert.equal(ptaxFor(30000, []), 0)
})

test('a company can run on its own slab table', () => {
  const lines: LineInput[] = [
    { employee: emp('x', 'SOMEONE', 30000, false), absence: 0, leavePay: 0 },
  ]
  const withCustom = computeMonth(lines, YEAR, MONTH, {
    ...DEFAULT_SETTINGS,
    ptaxSlabs: [
      { upto: 20000, amount: 0 },
      { upto: null, amount: 175 },
    ],
  })
  assert.equal(withCustom.lines[0].ptax, 175)
  assert.equal(withCustom.lines[0].rounded, 29825)

  // The same month on the statutory table deducts 150 instead.
  const withWb = computeMonth(lines, YEAR, MONTH)
  assert.equal(withWb.lines[0].ptax, 150)
})

test('rounding always goes up to the whole rupee', () => {
  assert.equal(roundUpRupee(14407.09677419355), 14408)
  assert.equal(roundUpRupee(1016.7741935483871), 1017)
  assert.equal(roundUpRupee(15630), 15630)
})

test('Calcutta Traders July 2026 reproduces the bank letter exactly', () => {
  const result = computeMonth(CT_LINES, YEAR, MONTH)
  const byName = Object.fromEntries(result.lines.map((l) => [l.name, l]))

  // Tiffin = Rs 10 x (27 working days - absence), floored at zero.
  assert.equal(byName['DINESH RAM'].tiffin, 210)
  assert.equal(byName['SUKUMAR SARDAR'].tiffin, 0)
  assert.equal(byName['SURAJIT PAL'].tiffin, 270)
  assert.equal(byName['BIRENDER KR SHAW'].tiffin, 270)
  assert.equal(byName['BAPI MONDAL'].tiffin, 240)
  assert.equal(byName['AVIJIT PAL'].tiffin, 260)
  assert.equal(byName['RAHUL SARKAR'].tiffin, 260)

  // Per-row amounts as they appear in the bulk NEFT file.
  assert.equal(byName['DINESH RAM'].rounded, 14408)
  assert.equal(byName['SUKUMAR SARDAR'].rounded, 1017)
  assert.equal(byName['SURAJIT PAL'].rounded, 30620)
  assert.equal(byName['BIRENDER KR SHAW'].rounded, 15630)
  assert.equal(byName['BAPI MONDAL'].rounded, 15600)
  assert.equal(byName['AVIJIT PAL'].rounded, 18630)
  assert.equal(byName['RAHUL SARKAR'].rounded, 14880)

  // The figure typed on the letterhead.
  assert.equal(result.totals.neftTotal, 110785)
})

test('M.K. Cycles July 2026 reproduces the bank letter exactly', () => {
  const result = computeMonth(MKCP_LINES, YEAR, MONTH)
  const byName = Object.fromEntries(result.lines.map((l) => [l.name, l]))

  // Equal absence and leave-pay cancel out, so a full month's pay stands.
  assert.equal(byName['SHAMBHU PRASAD SINGH'].rounded, 15520)
  assert.equal(byName['RAMNARESH BHAGAT'].rounded, 14149)
  // 18,130 gross less 130 P-Tax less a 5,000 advance.
  assert.equal(byName['SUNIL KUMAR TIWARI'].rounded, 13000)

  assert.equal(result.totals.neftTotal, 120269)
})

test('gross drives the P-Tax slab, not the full monthly salary', () => {
  // Dinesh is on 15,840/month but only grossed 14,517, so he pays 110 not 130.
  const { lines } = computeMonth(CT_LINES, YEAR, MONTH)
  const dinesh = lines.find((l) => l.name === 'DINESH RAM')!
  assert.equal(dinesh.ptax, 110)
  assert.ok(dinesh.gross > 14517 && dinesh.gross < 14518)
})

test('cash and excluded lines stay out of the bank total', () => {
  const lines: LineInput[] = [
    { employee: emp('a', 'NEFT GUY', 20000, false), absence: 0, leavePay: 0 },
    { employee: emp('b', 'CASH GUY', 12000, false), absence: 0, leavePay: 0, payMode: 'cash' },
    { employee: emp('c', 'DIRECTOR', 400000, false), absence: 0, leavePay: 0, tds: 60000, payMode: 'excluded' },
  ]
  const { totals } = computeMonth(lines, YEAR, MONTH)
  assert.equal(totals.neftTotal, 19870)
  assert.equal(totals.cashTotal, 11890)
  assert.equal(totals.grandTotal, 31760)
  assert.equal(totals.tds, 60000)
})

test('splitAmount matches the cuts seen in the workbooks', () => {
  assert.deepEqual(splitAmount(14880), [10000, 4880])
  assert.deepEqual(splitAmount(15520), [10000, 5520])
  assert.deepEqual(splitAmount(12382), [10000, 2382])
  // Avijit's second cut: 8,630 became 4,000 + 4,630.
  assert.deepEqual(splitAmount(8630), [4000, 4630])
  assert.equal(splitAmount(500), null)
})

test('the split-chunk size is a per-company setting, not a fixed 10,000', () => {
  // A company with a smaller preferred chunk (e.g. 5,000) splits differently.
  assert.deepEqual(splitAmount(14880, 5000), [5000, 9880])
  assert.deepEqual(splitAmount(4880, 5000), [2000, 2880])

  const payments = [
    { employeeId: 'a', beneficiaryName: 'A', ifsc: 'X', accountNo: '1', accountType: 'SB', amount: 18630 },
    { employeeId: 'b', beneficiaryName: 'B', ifsc: 'X', accountNo: '2', accountType: 'SB', amount: 14880 },
  ]
  const withDefault = buildNeftRows(payments, 4)
  const withSmallerChunk = buildNeftRows(payments, 4, 5000)
  // Both reach the row minimum and preserve the total, but split differently.
  assert.ok(withDefault.rows.length >= 4)
  assert.ok(withSmallerChunk.rows.length >= 4)
  assert.ok(verifyTotals(payments, withDefault.rows))
  assert.ok(verifyTotals(payments, withSmallerChunk.rows))
  assert.notDeepEqual(
    withDefault.rows.map((r) => r.amount),
    withSmallerChunk.rows.map((r) => r.amount),
  )
})

test('seven CT payments are padded to the ten rows HDFC requires', () => {
  const payments = computeMonth(CT_LINES, YEAR, MONTH).lines.map((l) => ({
    employeeId: l.employeeId,
    beneficiaryName: l.name,
    ifsc: 'BKID0004022',
    accountNo: '402210100024291',
    accountType: 'SB',
    amount: l.rounded,
  }))

  const { rows, short } = buildNeftRows(payments)
  assert.equal(short, false)
  assert.equal(rows.length, 10)
  assert.ok(verifyTotals(payments, rows))
  assert.equal(
    rows.reduce((sum, r) => sum + r.amount, 0),
    110785,
  )
})

test('eight MKCP payments are padded to ten rows', () => {
  const payments = computeMonth(MKCP_LINES, YEAR, MONTH).lines.map((l) => ({
    employeeId: l.employeeId,
    beneficiaryName: l.name,
    ifsc: 'PUNB0038600',
    accountNo: '0685001700286801',
    accountType: 'SB',
    amount: l.rounded,
  }))

  const { rows, short } = buildNeftRows(payments)
  assert.equal(short, false)
  assert.equal(rows.length, 10)
  assert.ok(verifyTotals(payments, rows))
  assert.equal(
    rows.reduce((sum, r) => sum + r.amount, 0),
    120269,
  )
})

test('roundAmount honours rule and unit independently', () => {
  // Whole-rupee, all three rules.
  assert.equal(roundAmount(14407.09, 'up', 1), 14408)
  assert.equal(roundAmount(14407.09, 'down', 1), 14407)
  assert.equal(roundAmount(14407.49, 'nearest', 1), 14407)
  assert.equal(roundAmount(14407.5, 'nearest', 1), 14408)

  // Nearest-ten, all three rules.
  assert.equal(roundAmount(14407, 'up', 10), 14410)
  assert.equal(roundAmount(14407, 'down', 10), 14400)
  assert.equal(roundAmount(14404, 'nearest', 10), 14400)
  assert.equal(roundAmount(14406, 'nearest', 10), 14410)

  // An exact multiple must not tip over from floating-point dust.
  assert.equal(roundAmount(15630.000000000002, 'up', 1), 15630)
  assert.equal(roundAmount(15630, 'up', 10), 15630)

  // roundUpRupee is exactly roundAmount(..., 'up', 1).
  assert.equal(roundUpRupee(1016.7741935483871), roundAmount(1016.7741935483871, 'up', 1))
})

test('a company can round nearest-ten instead of up-to-the-rupee', () => {
  const lines: LineInput[] = [
    { employee: emp('x', 'SOMEONE', 15840, false), absence: 6, leavePay: 3 },
  ]
  // No tiffin (not eligible): gross = 15,840 x (31-6+3)/31 = 14,307.0967...,
  // P-Tax 110 (10,001-15,000 slab) -> payable 14,197.0967...
  const nearestTen = computeMonth(lines, YEAR, MONTH, {
    ...DEFAULT_SETTINGS,
    roundRule: 'nearest',
    roundUnit: 10,
  })
  assert.equal(nearestTen.lines[0].rounded, 14200)

  const roundedDown = computeMonth(lines, YEAR, MONTH, {
    ...DEFAULT_SETTINGS,
    roundRule: 'down',
    roundUnit: 1,
  })
  assert.equal(roundedDown.lines[0].rounded, 14197)
})

test('switching the divisor to working days lowers pay, as expected', () => {
  const working = computeMonth(CT_LINES, YEAR, MONTH, {
    ...DEFAULT_SETTINGS,
    payDivisorBasis: 'working',
  })
  const dinesh = working.lines.find((l) => l.name === 'DINESH RAM')!
  // 15,840 x 24/27 + 210 tiffin = 14,290 gross.
  assert.equal(dinesh.gross, 14290)
  assert.ok(dinesh.rounded < 14408)
})

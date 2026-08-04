import { test } from 'node:test'
import assert from 'node:assert/strict'

import { computeBonusLine, computeBonusRun, fyLabel, fyMonths, monthlyBonusWage } from './bonus.ts'

test('fyMonths runs April through March', () => {
  const months = fyMonths(2024)
  assert.equal(months.length, 12)
  assert.deepEqual(months[0], { year: 2024, month: 4 })
  assert.deepEqual(months[8], { year: 2024, month: 12 })
  assert.deepEqual(months[9], { year: 2025, month: 1 })
  assert.deepEqual(months[11], { year: 2025, month: 3 })
})

test('fyLabel formats as FYyyyy-yy', () => {
  assert.equal(fyLabel(2024), 'FY2024-25')
  assert.equal(fyLabel(2019), 'FY2019-20')
})

test('monthlyBonusWage adds back P.Tax and strips tiffin', () => {
  // payable + ptax - tiffin, matching the Payment of Bonus Act's wage definition.
  assert.equal(monthlyBonusWage({ payable: 14880, ptax: 0, tiffin: 0 }), 14880)
  assert.equal(monthlyBonusWage({ payable: 11373, ptax: 130, tiffin: 270 }), 11233)
})

test('FY2024-25 CT Dinesh Ram reproduces the workbook bonus to the rupee', () => {
  // gross bonus wage 138,530 -> bonus 22,857.45 -> paid 22,857 (round nearest).
  const line = computeBonusLine(
    {
      employeeId: 'e1', name: 'DINESH RAM', beneficiaryName: 'DINESH RAM',
      bankIfsc: null, bankAccountNo: null, bankAccountType: 'SB',
      monthlyWages: [138530],
    },
    0.165,
    'nearest',
  )
  assert.equal(line.annualWage, 138530)
  assert.equal(line.bonusAmount, 22857.45)
  assert.equal(line.rounded, 22857)
})

test('FY2024-25 CT Surajit Pal reproduces the workbook bonus to the rupee', () => {
  // 369,678 x 16.5% = 60,996.87 -> paid 60,997.
  const line = computeBonusLine(
    {
      employeeId: 'e2', name: 'SURAJIT PAL', beneficiaryName: 'SURAJIT PAL',
      bankIfsc: null, bankAccountNo: null, bankAccountType: 'SB',
      monthlyWages: [369678],
    },
    0.165,
    'nearest',
  )
  assert.equal(line.bonusAmount, 60996.87)
  assert.equal(line.rounded, 60997)
})

test('FY2024-25 MKCP Satinder Rajbanshi reproduces the workbook bonus to the rupee', () => {
  // 157,580 x 16.5% = 26,000.7 -> paid 26,001.
  const line = computeBonusLine(
    {
      employeeId: 'e3', name: 'SATINDER RAJBANSHI', beneficiaryName: 'SATENDRA RAJVANSHI',
      bankIfsc: null, bankAccountNo: null, bankAccountType: 'SB',
      monthlyWages: [157580],
    },
    0.165,
    'nearest',
  )
  assert.equal(line.bonusAmount, 26000.7)
  assert.equal(line.rounded, 26001)
})

test('round-nearest, not always-up, is what the workbook actually did', () => {
  // Ranjit Rajbanshi 27,226.32 was paid 27,226 -- would be 27,227 under 'up'.
  const line = computeBonusLine(
    {
      employeeId: 'e4', name: 'RANJIT RAJBANSHI', beneficiaryName: 'RANJIT RAJBANSHI',
      bankIfsc: null, bankAccountNo: null, bankAccountType: 'SB',
      monthlyWages: [165008, 0], // any split that sums to the annual wage
    },
    0.165,
    'nearest',
  )
  assert.equal(Math.round(line.bonusAmount * 100) / 100, 27226.32)
  assert.equal(line.rounded, 27226)
})

test('computeBonusRun sums annual wage, months counted, and totals across employees', () => {
  const result = computeBonusRun(
    [
      {
        employeeId: 'e1', name: 'A', beneficiaryName: 'A',
        bankIfsc: null, bankAccountNo: null, bankAccountType: 'SB',
        monthlyWages: [10000, 10000, 10000], payMode: 'neft',
      },
      {
        employeeId: 'e2', name: 'B', beneficiaryName: 'B',
        bankIfsc: null, bankAccountNo: null, bankAccountType: 'SB',
        monthlyWages: [5000, 5000], payMode: 'cash',
      },
      {
        employeeId: 'e3', name: 'C', beneficiaryName: 'C',
        bankIfsc: null, bankAccountNo: null, bankAccountType: 'SB',
        monthlyWages: [1000], payMode: 'excluded',
      },
    ],
    2024,
    0.165,
    'nearest',
  )
  assert.equal(result.lines[0].monthsCounted, 3)
  assert.equal(result.lines[1].monthsCounted, 2)
  assert.equal(result.totals.annualWage, 30000 + 10000 + 1000)
  assert.equal(result.totals.neftTotal, result.lines[0].rounded)
  assert.equal(result.totals.cashTotal, result.lines[1].rounded)
  assert.equal(result.totals.grandTotal, result.lines[0].rounded + result.lines[1].rounded)
})

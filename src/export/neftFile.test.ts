import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildNeftMatrix, NEFT_HEADERS } from './neftFile.ts'
import type { NeftRow } from '../calc/neft.ts'
import type { Company } from '../types.ts'

/**
 * Cell-for-cell comparison against the real file uploaded to HDFC on
 * 04.08.2026 ("CT Bulk NEFT_NON_HDFC_format 2026.xls"). If this drifts, the
 * generated file no longer matches what the bank has been accepting.
 */

const CT: Company = {
  id: 'ct', code: 'CT', name: 'CALCUTTA TRADERS',
  address_line: '4 BENTINCK STREET, KOLKATA : 700001',
  gst_no: '19AACFC1126H1ZU', cin_no: null,
  remitter_name: 'CALCUTTA TRADERS',
  account_no: '12428020000010',
  branch_code: '1242',
  sender_account_type: 'CA',
  bank_name: 'HDFC BANK', bank_branch: 'India Exchange Place Branch', bank_city: 'Kolkata',
  tiffin_rate: 10, pay_divisor_basis: 'calendar', weekly_off_days: [0],
  ptax_slabs: [], min_neft_rows: 10,
  round_rule: 'up', round_unit: 1, neft_split_chunk: 10000, half_day_weight: 0.5,
}

const row = (name: string, ifsc: string, acct: string, amount: number, i: number): NeftRow => ({
  employeeId: `e${i}`, beneficiaryName: name, ifsc, accountNo: acct,
  accountType: 'SB', amount, paymentIndex: i,
})

// The ten rows exactly as they went to the bank, including the padding splits.
const ROWS: NeftRow[] = [
  row('DINESH RAM',          'BKID0004022', '402210100024291', 14408, 0),
  row('SUKUMAR SARDAR',      'PUNB0007220', '0072010201626',    1017, 1),
  row('SURAJIT PAL',         'SBIN0001401', '35014596473',     30620, 2),
  row('BIRENDER KUMAR SHAW', 'BKID0004022', '402210110005805', 15630, 3),
  row('BAPI MONDAL',         'PUNB0RRBBGB', '5152010093578',   15600, 4),
  row('AVIJIT PAL',          'KKBK0006562', '3548345572',      10000, 5),
  row('AVIJIT PAL',          'KKBK0006562', '3548345572',       4000, 5),
  row('AVIJIT PAL',          'KKBK0006562', '3548345572',       4630, 5),
  row('RAHUL SARKAR',        'CBIN0282013', '3305103931',      10000, 6),
  row('RAHUL SARKAR',        'CBIN0282013', '3305103931',       4880, 6),
]

const ORIGINAL_HEADERS = [
  'Transaction_Ref_No', 'Amount', 'Value_Date', 'Branch_Code', 'Sender_Account_Type',
  'Remitter_Account_No', 'Remitter_Name', 'IFSC_Code', 'Debit_Account',
  'Beneficiary_Account_type', 'Bank_Account_Number', 'Beneficiary_Name',
  'Remittance_Details', 'Debit_Account_System', 'Originator_Of_Remmittance',
  'Email ID / Mobile number',
]

test('header row matches the bank template exactly', () => {
  assert.deepEqual([...NEFT_HEADERS], ORIGINAL_HEADERS)
})

test('generated rows match the file uploaded on 04.08.2026', () => {
  const matrix = buildNeftMatrix({ company: CT, rows: ROWS, valueDate: '2026-08-04' })

  assert.deepEqual(matrix[0], ORIGINAL_HEADERS)
  assert.equal(matrix.length, 11) // header + 10 transactions

  assert.deepEqual(matrix[1], [
    '', 14408, '04/08/2026', '1242', 'CA', '12428020000010', 'CALCUTTA TRADERS',
    'BKID0004022', '12428020000010', 'SB', '402210100024291', 'DINESH RAM', '', '', '', '',
  ])

  // The account number with a leading zero must survive as text.
  assert.deepEqual(matrix[2], [
    '', 1017, '04/08/2026', '1242', 'CA', '12428020000010', 'CALCUTTA TRADERS',
    'PUNB0007220', '12428020000010', 'SB', '0072010201626', 'SUKUMAR SARDAR', '', '', '', '',
  ])

  // Last of the three padding rows for Avijit Pal.
  assert.deepEqual(matrix[8], [
    '', 4630, '04/08/2026', '1242', 'CA', '12428020000010', 'CALCUTTA TRADERS',
    'KKBK0006562', '12428020000010', 'SB', '3548345572', 'AVIJIT PAL', '', '', '', '',
  ])

  assert.equal(
    matrix.slice(1).reduce((sum, r) => sum + (r[1] as number), 0),
    110785,
  )
})

test('debit account always equals the remitter account', () => {
  const matrix = buildNeftMatrix({ company: CT, rows: ROWS, valueDate: '2026-08-04' })
  for (const r of matrix.slice(1)) {
    assert.equal(r[8], CT.account_no)
    assert.equal(r[5], CT.account_no)
  }
})

/**
 * Builds the HDFC "Bulk NEFT NON_HDFC" upload workbook.
 *
 * The column order, header spelling (including the bank's own typo in
 * "Originator_Of_Remmittance") and the Field Validation sheet are reproduced
 * from the template already being uploaded, so the generated file drops into
 * the same net-banking screen without any re-mapping.
 *
 * Account numbers are written as text — several beneficiary accounts have
 * leading zeros (e.g. 0072010201626) that would be destroyed by numeric typing.
 */
import * as XLSX from 'xlsx'

import { neftDate } from '../lib/format.ts'
import type { NeftRow } from '../calc/neft.ts'
import type { Company } from '../types.ts'

export const NEFT_HEADERS = [
  'Transaction_Ref_No',
  'Amount',
  'Value_Date',
  'Branch_Code',
  'Sender_Account_Type',
  'Remitter_Account_No',
  'Remitter_Name',
  'IFSC_Code',
  'Debit_Account',
  'Beneficiary_Account_type',
  'Bank_Account_Number',
  'Beneficiary_Name',
  'Remittance_Details',
  'Debit_Account_System',
  'Originator_Of_Remmittance',
  'Email ID / Mobile number',
] as const

const FIELD_VALIDATION_ROWS: (string | number)[][] = [
  ['', '', '', '', '', ''],
  ['Column Name', 'Field Name', 'M/O', 'A/N', 'Max Width', 'Validations required'],
  ['A', 'Transaction Ref No', 'M', 'A/N', 16, 'Max length validation'],
  ['B', 'Remittance Amount', 'M', 'N', '19d', 'Max Amt can be 16.2 digits'],
  ['C', 'Value Date (yyyymmdd)', 'M', 'D', 8, 'YYYYMMDD'],
  ['D', 'Branch Code', 'M', 'N', 6, 'Max length validation'],
  ['E', "Sender's Account Type", 'M', 'A/N', 2, '#'],
  ['F', "Remitter's  Account No", 'M', 'A/N', 16, 'Max length validation.'],
  ['G', "Remitter's  Name", 'M', 'A/N', 49, 'Max length validation'],
  ['H', 'Bene Bank Branch IFSC Code', 'M', 'A/N', 11, 'Length must be equal to 11.'],
  ['I', 'Debit Account', 'M', 'A/N', 16, 'Remitter account and Debit account both are same'],
  ['J', 'Beneficiary Account Type', 'M', 'A/N', 2, '#'],
  ['K', 'Beneficiary Account No', 'M', 'A/N', 35, 'Max length validation'],
  ['L', 'Beneficiary Name ', 'M', 'A/N', 49, 'Max length validation'],
  ['M', 'Remittance Details', 'M', 'A/N', 210,
    'single column of max 210 characters, WITH No special characters.'],
  ['N', 'Debit Account  System', 'M', 'N', 1, 'Keep it Blank'],
  ['O', 'Originator of remmittance', 'M', 'A/N', '4*35',
    'Max Length Validation (7002 (max 140 chars alpha-num))'],
  ['P', 'Email ID / Mobile number', 'O', 'N', 10,
    'Only one valid email id / 10 digit Mobile number'],
]

export interface NeftFileOptions {
  company: Company
  rows: NeftRow[]
  /** ISO date; becomes Value_Date on every row. */
  valueDate: string
}

/** One spreadsheet row per transaction, in the bank's column order. */
export function buildNeftMatrix({ company, rows, valueDate }: NeftFileOptions): (string | number)[][] {
  const date = neftDate(valueDate)
  const body = rows.map((row) => [
    '',                              // Transaction_Ref_No — left blank, as in the originals
    row.amount,
    date,
    company.branch_code,
    company.sender_account_type,
    company.account_no,
    company.remitter_name,
    row.ifsc,
    company.account_no,              // Debit_Account is always the remitter account
    row.accountType,
    row.accountNo,
    row.beneficiaryName,
    '', '', '', '',
  ])
  return [[...NEFT_HEADERS], ...body]
}

function sheetFromMatrix(matrix: (string | number)[][]): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet(matrix)
  // Force the two account-number columns and the branch code to text so that
  // leading zeros survive the round-trip.
  const textColumns = [3, 5, 8, 10] // D, F, I, K
  for (let r = 1; r < matrix.length; r++) {
    for (const c of textColumns) {
      const ref = XLSX.utils.encode_cell({ r, c })
      const cell = sheet[ref]
      if (cell) {
        cell.t = 's'
        cell.v = String(cell.v)
        cell.z = '@'
      }
    }
  }
  return sheet
}

export function buildNeftWorkbook(options: NeftFileOptions): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheetFromMatrix(buildNeftMatrix(options)), 'File Format')
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(FIELD_VALIDATION_ROWS),
    'Field Validation',
  )
  return workbook
}

export function neftFileName(company: Company, year: number, month: number): string {
  const mm = String(month).padStart(2, '0')
  return `${company.code} Bulk NEFT_NON_HDFC_format ${year}-${mm}`
}

export function bonusNeftFileName(company: Company, fyStartYear: number): string {
  return `${company.code} Bulk NEFT_NON_HDFC_format BONUS FY${fyStartYear}-${String(fyStartYear + 1).slice(2)}`
}

/** Writes a real BIFF8 .xls, matching the format the bank template uses. */
export function downloadNeftXls(options: NeftFileOptions, fileName: string): void {
  XLSX.writeFile(buildNeftWorkbook(options), `${fileName}.xls`, { bookType: 'biff8' })
}

/** CSV fallback, in case net-banking rejects the .xls on a given day. */
export function downloadNeftCsv(options: NeftFileOptions, fileName: string): void {
  const sheet = sheetFromMatrix(buildNeftMatrix(options))
  const csv = XLSX.utils.sheet_to_csv(sheet)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  triggerDownload(blob, `${fileName}.csv`)
}

export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

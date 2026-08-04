import type { DayBasis, PayMode, PtaxSlab, RoundRule } from './calc/payroll.ts'

export type { DayBasis, PayMode, PtaxSlab, RoundRule }

export interface Company {
  id: string
  code: string
  name: string
  address_line: string | null
  gst_no: string | null
  cin_no: string | null
  remitter_name: string
  account_no: string
  branch_code: string
  sender_account_type: string
  bank_name: string
  bank_branch: string
  bank_city: string
  tiffin_rate: number
  pay_divisor_basis: DayBasis
  weekly_off_days: number[]
  ptax_slabs: PtaxSlab[]
  min_neft_rows: number
  round_rule: RoundRule
  round_unit: number
  neft_split_chunk: number
  half_day_weight: number
}

export interface Employee {
  id: string
  company_id: string
  name: string
  beneficiary_name: string
  monthly_pay: number
  tiffin_eligible: boolean
  bank_ifsc: string | null
  bank_account_no: string | null
  bank_account_type: string
  is_director: boolean
  default_pay_mode: PayMode
  join_date: string | null
  phone: string | null
  notes: string | null
  sort_order: number
  active: boolean
}

export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'paid_leave' | 'holiday'

export interface AttendanceMark {
  id?: string
  employee_id: string
  marked_on: string
  status: AttendanceStatus
  note?: string | null
}

export interface Holiday {
  id: string
  company_id: string | null
  holiday_on: string
  name: string | null
}

export interface Run {
  id: string
  company_id: string
  year: number
  month: number
  status: 'draft' | 'approved'
  pay_divisor_basis: DayBasis
  calendar_days: number
  working_days: number
  tiffin_rate: number
  cheque_no: string | null
  letter_date: string | null
  value_date: string | null
  neft_total: number
  cash_total: number
  grand_total: number
  is_historical: boolean
  notes: string | null
  approved_at: string | null
}

export interface RunLine {
  id: string
  run_id: string
  employee_id: string | null
  employee_name: string
  beneficiary_name: string
  bank_ifsc: string | null
  bank_account_no: string | null
  bank_account_type: string
  monthly_pay: number
  absence: number
  leave_pay: number
  days_present: number
  tiffin: number
  gross: number
  ptax: number
  tds: number
  advance: number
  net: number
  payable: number
  rounded: number
  pay_mode: PayMode
  sort_order: number
}

export interface NeftRowRecord {
  id: string
  run_id: string
  run_line_id: string
  seq: number
  amount: number
}

/** Editable per-employee inputs for a month being prepared. */
export interface DraftEntry {
  employeeId: string
  absence: number
  leavePay: number
  tiffinOverride?: number
  advance: number
  tds: number
  payMode: PayMode
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  half_day: 'Half day',
  paid_leave: 'Paid leave',
  holiday: 'Holiday',
}

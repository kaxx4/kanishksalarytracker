/**
 * Printable documents: the bank letter, the salary summary sheet and payslips.
 *
 * These are rendered as standalone HTML and sent to the browser's print dialog,
 * which gives both paper and PDF ("Save as PDF") from the same code path. The
 * letter reproduces the layout of the existing SALARY LETTERS.xlsx letterhead.
 */
import { amountInWords, inr, letterDate, rupees } from '../lib/format.ts'
import { fyLabel } from '../calc/bonus.ts'
import { MONTH_NAMES } from '../types.ts'
import type { BonusRunLine, Company, RunLine } from '../types.ts'

export interface LetterData {
  company: Company
  /** ISO date printed top-right. */
  date: string
  chequeNo: string
  total: number
}

const PRINT_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Times New Roman", Georgia, serif;
    color: #000; margin: 0; font-size: 12pt; line-height: 1.5;
  }
  .sheet { page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
  .letterhead { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; }
  .letterhead h1 { font-size: 20pt; margin: 0 0 4px; letter-spacing: .5px; }
  .letterhead .addr { font-size: 11pt; margin: 2px 0; }
  .letterhead .reg { font-size: 10pt; margin: 2px 0; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; }
  .spacer-lg { height: 42px; }
  .spacer { height: 22px; }
  .body p { margin: 0 0 14px; }
  .sign { margin-top: 56px; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { border: 1px solid #333; padding: 5px 7px; }
  th { background: #eee; text-align: left; font-weight: bold; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: bold; background: #f4f4f4; }
  h2.doc-title { font-size: 14pt; margin: 14px 0 4px; text-align: center; }
  .sub { text-align: center; font-size: 10pt; margin-bottom: 14px; }
  .slip { border: 1.5px solid #000; padding: 14px 16px; margin-bottom: 18px; }
  .slip-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 26px; }
  .slip-grid table { font-size: 10.5pt; }
  .slip-grid td { border: none; padding: 3px 0; }
  .muted { color: #444; font-size: 9.5pt; }
  .net { border-top: 1.5px solid #000; margin-top: 10px; padding-top: 8px;
         display: flex; justify-content: space-between; font-size: 12pt; font-weight: bold; }
  .bn { font-family: "Noto Sans Bengali", "Nirmala UI", "Vrinda", sans-serif; }
  .formm-head { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; }
  .formm-head .en { font-size: 16pt; font-weight: bold; letter-spacing: .5px; }
  .formm-head .bn { font-size: 15pt; font-weight: bold; }
  .formm-head .sub { font-size: 10pt; font-weight: normal; margin-top: 2px; }
  .formm .doc-title .bn { font-size: 12pt; }
  .formm-cert { margin-top: 20px; font-size: 10.5pt; }
`

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function letterhead(company: Company): string {
  const reg = [
    company.cin_no ? `CIN: ${company.cin_no}` : null,
    company.gst_no ? `GSTIN No: ${company.gst_no}` : null,
  ]
    .filter(Boolean)
    .join(' , ')

  return `
    <div class="letterhead">
      <h1>${esc(company.name)}</h1>
      <div class="addr">${esc(company.address_line)}</div>
      ${reg ? `<div class="reg">${esc(reg)}</div>` : ''}
    </div>`
}

/** The NEFT request letter, matching the existing signed layout. */
export function renderLetter({ company, date, chequeNo, total }: LetterData): string {
  return `
  <div class="sheet">
    ${letterhead(company)}
    <div class="spacer-lg"></div>
    <div class="row">
      <div>To</div>
      <div>${esc(letterDate(date))}</div>
    </div>
    <div>The Manager</div>
    <div>${esc(company.bank_name)}</div>
    <div>${esc(company.bank_branch)}</div>
    <div>${esc(company.bank_city)}</div>
    <div class="spacer"></div>
    <div>Dear Sir</div>
    <div class="spacer"></div>
    <div class="body">
      <p>You are requested to make NEFT transfers to the beneficiaries whose details are
      enclosed herewith from our current account no: ${esc(company.account_no)}:</p>
      <p>We&nbsp;&nbsp; enclose&nbsp;&nbsp; herewith&nbsp;&nbsp; cheque&nbsp; no :
      <strong>${esc(chequeNo)}</strong> amounting to Rs : <strong>${inr(total)}/-</strong></p>
      <p>Thanking you</p>
    </div>
    <div class="sign">Yours faithfully</div>
  </div>`
}

export interface SummaryData {
  company: Company
  year: number
  month: number
  calendarDays: number
  workingDays: number
  lines: RunLine[]
}

/** The month's calculation sheet — the on-screen table, print-formatted. */
export function renderSummary({
  company, year, month, calendarDays, workingDays, lines,
}: SummaryData): string {
  const paid = lines.filter((l) => l.pay_mode !== 'excluded')
  const totals = {
    gross: sum(paid.map((l) => l.gross)),
    tiffin: sum(paid.map((l) => l.tiffin)),
    ptax: sum(paid.map((l) => l.ptax)),
    tds: sum(paid.map((l) => l.tds)),
    advance: sum(paid.map((l) => l.advance)),
    rounded: sum(paid.map((l) => l.rounded)),
  }

  const body = lines
    .map(
      (l, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${esc(l.employee_name)}${l.pay_mode !== 'neft' ? ` <span class="muted">(${esc(l.pay_mode)})</span>` : ''}</td>
        <td class="num">${inr(l.monthly_pay)}</td>
        <td class="num">${l.absence}</td>
        <td class="num">${l.leave_pay}</td>
        <td class="num">${inr(l.tiffin)}</td>
        <td class="num">${inr(l.gross, { paise: true })}</td>
        <td class="num">${inr(l.ptax)}</td>
        <td class="num">${l.tds ? inr(l.tds) : '—'}</td>
        <td class="num">${l.advance ? inr(l.advance) : '—'}</td>
        <td class="num"><strong>${inr(l.rounded)}</strong></td>
      </tr>`,
    )
    .join('')

  return `
  <div class="sheet">
    ${letterhead(company)}
    <h2 class="doc-title">Salary Statement — ${MONTH_NAMES[month - 1]} ${year}</h2>
    <div class="sub">${calendarDays} calendar days · ${workingDays} working days ·
      tiffin ${rupees(company.tiffin_rate)}/day · pay divided by ${company.pay_divisor_basis} days</div>
    <table>
      <thead>
        <tr>
          <th class="num">#</th><th>Name</th><th class="num">Monthly Pay</th>
          <th class="num">Absent</th><th class="num">Leave Pay</th><th class="num">Tiffin</th>
          <th class="num">Gross</th><th class="num">P-Tax</th><th class="num">TDS</th>
          <th class="num">Advance</th><th class="num">Payable</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr>
          <td colspan="5">Total (${paid.length} paid)</td>
          <td class="num">${inr(totals.tiffin)}</td>
          <td class="num">${inr(totals.gross, { paise: true })}</td>
          <td class="num">${inr(totals.ptax)}</td>
          <td class="num">${inr(totals.tds)}</td>
          <td class="num">${inr(totals.advance)}</td>
          <td class="num">${inr(totals.rounded)}</td>
        </tr>
      </tfoot>
    </table>
  </div>`
}

export interface BonusSummaryData {
  company: Company
  fyStartYear: number
  rate: number
  lines: BonusRunLine[]
}

/** The bonus computation sheet — one row per employee, print-formatted. */
export function renderBonusSummary({ company, fyStartYear, rate, lines }: BonusSummaryData): string {
  const paid = lines.filter((l) => l.pay_mode !== 'excluded')
  const totals = {
    annualWage: sum(paid.map((l) => l.annual_wage)),
    rounded: sum(paid.map((l) => l.rounded)),
  }

  const body = lines
    .map(
      (l, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${esc(l.employee_name)}${l.pay_mode !== 'neft' ? ` <span class="muted">(${esc(l.pay_mode)})</span>` : ''}</td>
        <td class="num">${l.months_counted}</td>
        <td class="num">${inr(l.annual_wage, { paise: true })}</td>
        <td class="num"><strong>${inr(l.rounded)}</strong></td>
      </tr>`,
    )
    .join('')

  return `
  <div class="sheet">
    ${letterhead(company)}
    <h2 class="doc-title">Bonus Statement — ${esc(fyLabel(fyStartYear))}</h2>
    <div class="sub">Bonus rate ${(rate * 100).toFixed(2)}% of annual bonus-eligible wage</div>
    <table>
      <thead>
        <tr>
          <th class="num">#</th><th>Name</th><th class="num">Months</th>
          <th class="num">Annual Wage</th><th class="num">Bonus</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr>
          <td colspan="3">Total (${paid.length} paid)</td>
          <td class="num">${inr(totals.annualWage, { paise: true })}</td>
          <td class="num">${inr(totals.rounded)}</td>
        </tr>
      </tfoot>
    </table>
  </div>`
}

export interface PayslipData {
  company: Company
  year: number
  month: number
  workingDays: number
  line: RunLine
}

/** One payslip per employee, two to a page. */
export function renderPayslip({ company, year, month, workingDays, line }: PayslipData): string {
  const row = (label: string, value: string) =>
    `<tr><td>${esc(label)}</td><td class="num">${value}</td></tr>`

  return `
    <div class="slip">
      <div style="text-align:center;border-bottom:1px solid #000;padding-bottom:6px;margin-bottom:10px">
        <strong style="font-size:14pt">${esc(company.name)}</strong><br/>
        <span class="muted">${esc(company.address_line)}</span><br/>
        <strong>Pay Slip — ${MONTH_NAMES[month - 1]} ${year}</strong>
      </div>
      <div class="row" style="margin-bottom:8px">
        <div><strong>${esc(line.employee_name)}</strong></div>
        <div class="muted">A/c ${esc(line.bank_account_no ?? '—')} · ${esc(line.bank_ifsc ?? '—')}</div>
      </div>
      <div class="slip-grid">
        <table>
          ${row('Monthly pay', inr(line.monthly_pay))}
          ${row('Working days', String(workingDays))}
          ${row('Days present', String(line.days_present))}
          ${row('Days absent', String(line.absence))}
          ${row('Paid leave', String(line.leave_pay))}
          ${row('Tiffin allowance', inr(line.tiffin))}
        </table>
        <table>
          ${row('Gross earnings', inr(line.gross, { paise: true }))}
          ${row('Less: Profession Tax', inr(line.ptax))}
          ${line.tds ? row('Less: TDS', inr(line.tds)) : ''}
          ${line.advance ? row('Less: Advance', inr(line.advance)) : ''}
          ${row('Net payable', inr(line.rounded))}
          ${row('Paid by', line.pay_mode.toUpperCase())}
        </table>
      </div>
      <div class="net">
        <span>Net Pay</span>
        <span>${rupees(line.rounded)}</span>
      </div>
      <div class="muted" style="margin-top:6px">${esc(amountInWords(line.rounded))}</div>
      <div class="muted" style="margin-top:10px">
        Computer generated pay slip — no signature required.
      </div>
    </div>`
}

export interface FormMData {
  company: Company
  year: number
  month: number
  lines: RunLine[]
}

/**
 * Form M (West Bengal Shops & Establishments Rules, Rule 30) — the statutory
 * pay register. The revenue-stamp cell and both signature areas are left
 * blank on purpose: they get filled in by hand or physically stamped after
 * printing, never rendered here.
 */
export function renderFormM({ company, year, month, lines }: FormMData): string {
  const paid = lines.filter((l) => l.pay_mode !== 'excluded')

  const body = paid
    .map(
      (l, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${esc(l.employee_name)}</td>
        <td class="num">${inr(l.monthly_pay)}</td>
        <td class="num">—</td>
        <td>${l.advance || l.tds ? esc(deductionNote(l)) : '—'}</td>
        <td class="num"><strong>${inr(l.rounded)}</strong></td>
        <td></td>
        <td></td>
      </tr>`,
    )
    .join('')

  return `
  <div class="sheet formm">
    <div class="formm-head">
      <div class="bn">ফরম &apos;এম&apos;</div>
      <div class="en">FORM &apos;M&apos;</div>
      <div class="bn sub">৩০ বিধি দ্রষ্টব্য</div>
      <div class="en sub">[See Rule 30]</div>
    </div>
    <h2 class="doc-title">
      <span class="bn">বেতনের হিসাব বহি</span><br/>
      PAY REGISTER
    </h2>
    <div class="sub">
      ${esc(company.name)} — ${esc(MONTH_NAMES[month - 1])} ${year}
    </div>
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Name of Persons employed</th>
          <th class="num">Rate of wages</th>
          <th class="num">Additional wages for overtime</th>
          <th>Deductions if any and reasons therefor</th>
          <th class="num">Total amount paid as wages</th>
          <th>Revenue Stamp</th>
          <th>Signature of the persons employee</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
    <p class="muted" style="margin-top:10px">Remarks: ____________________________________________________</p>
    <div class="formm-cert">
      <p>Certified that the above register correctly records the wages paid to the persons named
      above for the month of ${esc(MONTH_NAMES[month - 1])} ${year}.</p>
      <div class="row" style="margin-top:40px">
        <div>Witness: ______________________</div>
        <div>Date: ______________________</div>
      </div>
      <div class="sign">Signature of Employer</div>
    </div>
  </div>`
}

export function renderPayslipSheets(slips: PayslipData[]): string {
  const pages: string[] = []
  for (let i = 0; i < slips.length; i += 2) {
    pages.push(`<div class="sheet">${slips.slice(i, i + 2).map(renderPayslip).join('')}</div>`)
  }
  return pages.join('')
}

/** Opens a print window containing the given document bodies. */
export function printHtml(title: string, bodyHtml: string): void {
  const win = window.open('', '_blank', 'width=900,height=1000')
  if (!win) {
    alert('Allow pop-ups for this site to print.')
    return
  }
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>` +
      `<style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`,
  )
  win.document.close()
  win.focus()
  // Give the browser a moment to lay out before opening the dialog.
  setTimeout(() => win.print(), 250)
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

function deductionNote(line: RunLine): string {
  const parts: string[] = []
  if (line.advance) parts.push(`Advance ${rupees(line.advance)}`)
  if (line.tds) parts.push(`TDS ${rupees(line.tds)}`)
  return parts.join(', ')
}

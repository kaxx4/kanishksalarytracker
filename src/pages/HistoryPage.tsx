import { useEffect, useState } from 'react'

import { downloadNeftXls, neftFileName } from '../export/neftFile.ts'
import { printHtml, renderFormM, renderLetter, renderPayslipSheets, renderSummary } from '../export/documents.ts'
import { inr } from '../lib/format.ts'
import { useStore } from '../store/useStore.ts'
import { MONTH_NAMES } from '../types.ts'
import type { NeftRowRecord, Run, RunLine } from '../types.ts'

export default function HistoryPage() {
  const { runs, companies, activeCompanyId, loadRunDetail } = useStore()
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ run: Run; lines: RunLine[]; neft: NeftRowRecord[] } | null>(
    null,
  )

  const company = companies.find((c) => c.id === activeCompanyId)

  useEffect(() => {
    if (!selected) {
      setDetail(null)
      return
    }
    void loadRunDetail(selected).then(setDetail)
  }, [selected, loadRunDetail])

  // Open the most recent month by default rather than an empty panel.
  useEffect(() => {
    if (!selected && runs.length) setSelected(runs[0].id)
  }, [runs, selected])

  if (!company) return <p className="font-mono text-xs text-ink-3">No company selected.</p>

  return (
    <div className="grid gap-6 lg:grid-cols-[290px_1fr]">
      {/* ---------------------------------------------------------- the index */}
      <aside className="rise space-y-2">
        <div className="rubric">
          <span>Index</span>
          <span className="ml-auto tnum normal-case tracking-normal text-ink-4">
            {runs.length}
          </span>
        </div>

        {runs.length === 0 && (
          <p className="font-mono text-[11px] text-ink-3">Nothing recorded yet.</p>
        )}

        <ul className="leaf overflow-hidden">
          {runs.map((run, i) => {
            const active = selected === run.id
            return (
              <li key={run.id} className="rise" style={{ animationDelay: `${i * 40}ms` }}>
                <button
                  onClick={() => setSelected(run.id)}
                  className={`flex w-full items-baseline gap-3 border-b border-rule px-4 py-3
                    text-left transition-colors last:border-b-0 ${
                      active ? 'bg-paper-sunk' : 'hover:bg-paper-sunk/50'
                    }`}
                >
                  <span
                    className={`h-full w-[3px] self-stretch ${
                      active ? 'bg-verdigris' : 'bg-transparent'
                    }`}
                  />
                  <span className="flex-1">
                    <span className="block font-display text-lg leading-tight">
                      {MONTH_NAMES[run.month - 1]}{' '}
                      <span className="text-ink-4">{run.year}</span>
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[.1em] text-ink-3">
                      {run.cheque_no ? `Cheque ${run.cheque_no}` : 'No cheque'}
                      {run.is_historical && ' · imported'}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="tnum block text-sm font-semibold">
                      ₹{inr(run.neft_total)}
                    </span>
                    <span
                      className={`mt-1 inline-block ${
                        run.status === 'approved' ? 'stamp-approved' : 'stamp-draft'
                      }`}
                    >
                      {run.status}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      {/* --------------------------------------------------------- the folio */}
      <div>
        {!detail && (
          <p className="font-mono text-[11px] text-ink-3">Pick a month from the index.</p>
        )}

        {detail && (
          <div className="space-y-5">
            <div className="rise leaf relative p-5">
              <div className="pointer-events-none absolute right-6 top-6 hidden sm:block">
                <span
                  className={detail.run.status === 'approved' ? 'stamp-approved' : 'stamp-draft'}
                >
                  {detail.run.status}
                </span>
              </div>

              <h2 className="font-display text-3xl leading-none">
                {MONTH_NAMES[detail.run.month - 1]}{' '}
                <span className="text-ink-4">{detail.run.year}</span>
              </h2>
              <p className="mt-2 font-mono text-[11px] text-ink-3">
                {detail.run.calendar_days} calendar · {detail.run.working_days} working days ·
                divided by {detail.run.pay_divisor_basis} days · {detail.neft.length} bank rows
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="btn-secondary"
                  onClick={() =>
                    printHtml(
                      'Salary Statement',
                      renderSummary({
                        company,
                        year: detail.run.year,
                        month: detail.run.month,
                        calendarDays: detail.run.calendar_days,
                        workingDays: detail.run.working_days,
                        lines: detail.lines,
                      }),
                    )
                  }
                >
                  Statement
                </button>
                <button
                  className="btn-secondary"
                  disabled={!detail.run.cheque_no}
                  onClick={() =>
                    printHtml(
                      'NEFT Letter',
                      renderLetter({
                        company,
                        date: detail.run.letter_date ?? '',
                        chequeNo: detail.run.cheque_no ?? '',
                        total: detail.run.neft_total,
                      }),
                    )
                  }
                >
                  Bank letter
                </button>
                <button
                  className="btn-secondary"
                  onClick={() =>
                    printHtml(
                      'Pay Slips',
                      renderPayslipSheets(
                        detail.lines
                          .filter((l) => l.pay_mode !== 'excluded')
                          .map((line) => ({
                            company,
                            year: detail.run.year,
                            month: detail.run.month,
                            workingDays: detail.run.working_days,
                            line,
                          })),
                      ),
                    )
                  }
                >
                  Pay slips
                </button>
                <button
                  className="btn-secondary"
                  onClick={() =>
                    printHtml(
                      'Pay Register (Form M)',
                      renderFormM({
                        company,
                        year: detail.run.year,
                        month: detail.run.month,
                        lines: detail.lines,
                      }),
                    )
                  }
                >
                  Pay register
                </button>
                <button
                  className="btn-primary"
                  disabled={detail.neft.length === 0}
                  onClick={() => {
                    const byLine = new Map(detail.lines.map((l) => [l.id, l]))
                    const rows = detail.neft.map((n, i) => {
                      const line = byLine.get(n.run_line_id)!
                      return {
                        employeeId: line.employee_id ?? '',
                        beneficiaryName: line.beneficiary_name,
                        ifsc: line.bank_ifsc ?? '',
                        accountNo: line.bank_account_no ?? '',
                        accountType: line.bank_account_type,
                        amount: Number(n.amount),
                        paymentIndex: i,
                      }
                    })
                    downloadNeftXls(
                      {
                        company,
                        rows,
                        valueDate: detail.run.value_date ?? detail.run.letter_date ?? '',
                      },
                      neftFileName(company, detail.run.year, detail.run.month),
                    )
                  }}
                >
                  Bank file
                </button>
              </div>
            </div>

            <section className="rise space-y-2" style={{ animationDelay: '80ms' }}>
              <div className="rubric">
                <span>As paid</span>
              </div>

              <div className="leaf overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Employee</th>
                      <th className="th text-right">Monthly Pay</th>
                      <th className="th text-right">Abs</th>
                      <th className="th text-right">Leave</th>
                      <th className="th text-right">Tiffin</th>
                      <th className="th text-right">Gross</th>
                      <th className="th text-right">P-Tax</th>
                      <th className="th text-right">TDS</th>
                      <th className="th text-right">Advance</th>
                      <th className="th text-right">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((line) => (
                      <tr
                        key={line.id}
                        className={`transition-colors hover:bg-paper-sunk/60 ${
                          line.pay_mode === 'excluded' ? 'text-ink-4' : ''
                        }`}
                      >
                        <td className="td font-medium">
                          {line.employee_name}
                          {line.pay_mode === 'excluded' && (
                            <span className="tag ml-2 text-ink-4">off run</span>
                          )}
                        </td>
                        <td className="td tnum text-right text-ink-2">{inr(line.monthly_pay)}</td>
                        <td
                          className={`td tnum text-right ${
                            line.absence ? 'text-vermillion' : 'text-ink-4'
                          }`}
                        >
                          {line.absence || '—'}
                        </td>
                        <td className="td tnum text-right text-ink-2">{line.leave_pay || '—'}</td>
                        <td className="td tnum text-right text-ink-2">
                          {line.tiffin ? inr(line.tiffin) : '—'}
                        </td>
                        <td className="td tnum text-right">{inr(line.gross, { paise: true })}</td>
                        <td className="td tnum text-right text-ink-2">{inr(line.ptax)}</td>
                        <td className="td tnum text-right text-ink-2">
                          {line.tds ? inr(line.tds) : '—'}
                        </td>
                        <td className="td tnum text-right text-ink-2">
                          {line.advance ? inr(line.advance) : '—'}
                        </td>
                        <td className="td tnum text-right text-[15px] font-semibold">
                          {inr(line.rounded)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="rule-total">
                      <td
                        className="td border-b-0 font-mono text-[10px] uppercase tracking-[.13em] text-ink-3"
                        colSpan={9}
                      >
                        Transferred to bank
                      </td>
                      <td className="td tnum border-b-0 text-right text-[15px] font-semibold text-ink">
                        {inr(detail.run.neft_total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            {detail.run.notes && (
              <p className="font-mono text-[10px] leading-relaxed text-ink-4">
                {detail.run.notes}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

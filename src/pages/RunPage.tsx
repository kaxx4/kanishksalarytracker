import { useEffect, useMemo, useState } from 'react'

import { ConfirmDialog } from '../components/ConfirmDialog.tsx'
import { computeMonth, type CompanySettings, type LineInput } from '../calc/payroll.ts'
import { buildNeftRows, type PaymentInput } from '../calc/neft.ts'
import { downloadNeftCsv, downloadNeftXls, neftFileName } from '../export/neftFile.ts'
import { printHtml, renderFormM, renderLetter, renderPayslipSheets, renderSummary } from '../export/documents.ts'
import { inr, rupees, todayIso } from '../lib/format.ts'
import { buildMonthDays, currentMonth, monthOptions } from '../lib/month.ts'
import { replaceRunLines } from '../lib/replaceLines.ts'
import { supabase } from '../lib/supabase.ts'
import { deriveAttendance, useStore } from '../store/useStore.ts'
import { toast } from '../store/useToast.ts'
import { MONTH_NAMES } from '../types.ts'
import type { DraftEntry, PayMode, RunLine } from '../types.ts'

export default function RunPage() {
  const {
    companies, activeCompanyId, employees, holidays, attendance,
    loadAttendance, refreshRuns, runs,
  } = useStore()

  const [{ year, month }, setPeriod] = useState(currentMonth)
  const [entries, setEntries] = useState<Record<string, DraftEntry>>({})
  const [chequeNo, setChequeNo] = useState('')
  const [letterDateIso, setLetterDateIso] = useState(todayIso)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [splits, setSplits] = useState<Record<number, number[]> | null>(null)
  const [confirmingOverwrite, setConfirmingOverwrite] = useState<null | { approve: boolean }>(null)

  const company = companies.find((c) => c.id === activeCompanyId)
  const staff = useMemo(() => employees.filter((e) => e.active), [employees])
  const existing = runs.find((r) => r.year === year && r.month === month)

  useEffect(() => {
    void loadAttendance(year, month)
    setEntries({})
    setSplits(null)
    setSavedAt(null)
  }, [year, month, activeCompanyId, loadAttendance])

  /*
   * Hydrate the cheque number and letter date from the month's saved run.
   *
   * Without this the fields open blank on an already-saved month, and because
   * `save()` writes `chequeNo || null` a second Save silently wipes the cheque
   * number off an approved run and resets its letter date to today. That has
   * already destroyed one real record (MKCP July 2026, cheque 000614), so the
   * fields must always show what is actually stored.
   *
   * Keyed on the run's id rather than the run object: the id only changes when
   * a run is created or deleted for this month, so a realtime refresh (or the
   * refresh after saving) can never clobber what is being typed.
   */
  useEffect(() => {
    setChequeNo(existing?.cheque_no ?? '')
    setLetterDateIso(existing?.letter_date ?? todayIso())
  }, [existing?.id, year, month, activeCompanyId])

  const days = useMemo(
    () => (company ? buildMonthDays(year, month, company, holidays) : []),
    [company, year, month, holidays],
  )

  const settings: CompanySettings | null = useMemo(() => {
    if (!company) return null
    return {
      weeklyOffDays: company.weekly_off_days ?? [0],
      holidays: holidays
        .filter((h) => h.company_id === null || h.company_id === company.id)
        .map((h) => h.holiday_on),
      tiffinRate: Number(company.tiffin_rate),
      payDivisorBasis: company.pay_divisor_basis,
      ptaxSlabs: company.ptax_slabs,
      roundRule: company.round_rule,
      roundUnit: Number(company.round_unit),
    }
  }, [company, holidays])

  /** What the daily register says, before any manual override. */
  const derivedMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof deriveAttendance>> = {}
    for (const employee of staff) {
      map[employee.id] = deriveAttendance(
        attendance, employee.id, year, month,
        (iso) => days.find((d) => d.iso === iso)?.isWorking ?? false,
      )
    }
    return map
  }, [staff, attendance, year, month, days])

  /** Attendance-derived defaults, overridable per row. */
  const lineInputs: LineInput[] = useMemo(() => {
    if (!company) return []
    return staff.map((employee) => {
      const derived = derivedMap[employee.id]
      const override = entries[employee.id]
      return {
        employee: {
          id: employee.id,
          name: employee.name,
          monthlyPay: Number(employee.monthly_pay),
          tiffinEligible: employee.tiffin_eligible,
        },
        absence: override?.absence ?? derived.absence,
        leavePay: override?.leavePay ?? derived.leavePay,
        tiffinOverride: override?.tiffinOverride,
        advance: override?.advance ?? 0,
        tds: override?.tds ?? 0,
        payMode: override?.payMode ?? employee.default_pay_mode,
      }
    })
  }, [company, staff, derivedMap, entries])

  const result = useMemo(
    () => (settings ? computeMonth(lineInputs, year, month, settings) : null),
    [settings, lineInputs, year, month],
  )

  /** The same month costed on the other divisor, for comparison. */
  const alternate = useMemo(() => {
    if (!settings) return null
    const other = settings.payDivisorBasis === 'calendar' ? 'working' : 'calendar'
    return computeMonth(lineInputs, year, month, { ...settings, payDivisorBasis: other })
  }, [settings, lineInputs, year, month])

  const payments: PaymentInput[] = useMemo(() => {
    if (!result) return []
    return result.lines
      .filter((l) => l.payMode === 'neft')
      .map((line) => {
        const employee = staff.find((e) => e.id === line.employeeId)!
        return {
          employeeId: line.employeeId,
          beneficiaryName: employee.beneficiary_name,
          ifsc: employee.bank_ifsc ?? '',
          accountNo: employee.bank_account_no ?? '',
          accountType: employee.bank_account_type,
          amount: line.rounded,
        }
      })
  }, [result, staff])

  const neft = useMemo(() => {
    const auto = buildNeftRows(
      payments,
      company?.min_neft_rows ?? 10,
      company ? Number(company.neft_split_chunk) : undefined,
    )
    if (!splits) return auto
    // Manual override of the split, keyed by payment index.
    const rows = payments.flatMap((p, index) =>
      (splits[index] ?? [p.amount]).map((amount) => ({ ...p, amount, paymentIndex: index })),
    )
    return { rows, short: rows.length < (company?.min_neft_rows ?? 10), warning: undefined }
  }, [payments, splits, company])

  if (!company || !result || !settings) {
    return <p className="font-mono text-xs text-ink-3">No company selected.</p>
  }

  const missingBank = payments.filter((p) => !p.ifsc || !p.accountNo)

  /**
   * Seed a new override from what is currently on screen, so that editing (say)
   * the advance column does not silently reset an attendance-derived absence.
   */
  const set = (id: string, patch: Partial<DraftEntry>) =>
    setEntries((prev) => {
      const existingOverride = prev[id]
      const employee = staff.find((e) => e.id === id)
      const derived = derivedMap[id]
      const base: DraftEntry = existingOverride ?? {
        employeeId: id,
        absence: derived?.absence ?? 0,
        leavePay: derived?.leavePay ?? 0,
        advance: 0,
        tds: 0,
        payMode: employee?.default_pay_mode ?? 'neft',
      }
      return { ...prev, [id]: { ...base, ...patch } }
    })

  /** A cell is highlighted only when it actually differs from the register. */
  const isEdited = (employeeId: string, field: 'absence' | 'leavePay') => {
    const override = entries[employeeId]
    if (!override) return false
    return override[field] !== derivedMap[employeeId]?.[field]
  }

  const asRunLines = (): RunLine[] =>
    result.lines.map((line, i) => {
      const employee = staff.find((e) => e.id === line.employeeId)!
      return {
        id: line.employeeId, run_id: '', employee_id: line.employeeId,
        employee_name: line.name, beneficiary_name: employee.beneficiary_name,
        bank_ifsc: employee.bank_ifsc, bank_account_no: employee.bank_account_no,
        bank_account_type: employee.bank_account_type,
        monthly_pay: line.monthlyPay, absence: line.absence, leave_pay: line.leavePay,
        days_present: line.daysPresent, tiffin: line.tiffin, arrears: 0, gross: line.gross,
        ptax: line.ptax, tds: line.tds, advance: line.advance, net: line.net,
        payable: line.payable, rounded: line.rounded, pay_mode: line.payMode, sort_order: i + 1,
      }
    })

  /**
   * Saving upserts on (company, year, month), so re-saving a month that is
   * already approved or was imported from a pay register overwrites it in
   * place. Those two cases go through a confirmation first; an ordinary draft
   * saves straight away.
   */
  function requestSave(approve: boolean) {
    if (existing && (existing.status === 'approved' || existing.is_historical)) {
      setConfirmingOverwrite({ approve })
      return
    }
    void save(approve)
  }

  async function save(approve: boolean) {
    if (!company || !result) return
    setSaving(true)
    try {
      const { data: run, error } = await supabase
        .from('salary_runs')
        .upsert(
          {
            company_id: company.id, year, month,
            status: approve ? 'approved' : 'draft',
            pay_divisor_basis: company.pay_divisor_basis,
            calendar_days: result.calendarDays, working_days: result.workingDays,
            tiffin_rate: company.tiffin_rate,
            cheque_no: chequeNo || null,
            letter_date: letterDateIso, value_date: letterDateIso,
            neft_total: result.totals.neftTotal, cash_total: result.totals.cashTotal,
            grand_total: result.totals.grandTotal,
            // Recomputing a month imported from a pay register must not quietly
            // relabel it as a run this app calculated from attendance.
            is_historical: existing?.is_historical ?? false,
            approved_at: approve ? new Date().toISOString() : null,
          },
          { onConflict: 'company_id,year,month' },
        )
        .select()
        .single()
      if (error) throw error

      await replaceRunLines({
        linesTable: 'salary_run_lines',
        neftTable: 'salary_neft_rows',
        runId: run.id,
        lines: asRunLines().map(({ id: _id, run_id: _r, ...rest }) => ({ ...rest, run_id: run.id })),
        neftRowsFor: (inserted) => {
          const byEmployee = new Map(inserted.map((l) => [l.employee_id, l.id]))
          return neft.rows.map((row, i) => ({
            run_id: run.id,
            run_line_id: byEmployee.get(row.employeeId)!,
            seq: i + 1,
            amount: row.amount,
          }))
        },
      })

      await refreshRuns()
      setSavedAt(new Date().toLocaleTimeString('en-IN'))
      toast.ok(approve ? `${MONTH_NAMES[month - 1]} ${year} approved` : 'Draft saved')
    } catch (err) {
      toast.fail(`Could not save: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const summaryDoc = () =>
    renderSummary({
      company, year, month,
      calendarDays: result.calendarDays, workingDays: result.workingDays,
      lines: asRunLines(),
    })

  const approved = existing?.status === 'approved'
  const fileTotal = neft.rows.reduce((s, r) => s + r.amount, 0)
  const balanced = fileTotal === result.totals.neftTotal
  const divisorDelta = alternate ? alternate.totals.neftTotal - result.totals.neftTotal : 0

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ the sum in question */}
      <section className="rise leaf relative overflow-hidden p-6">
        {approved && (
          <div className="pointer-events-none absolute right-8 top-7 hidden sm:block">
            <span className="stamp-approved !px-3 !py-1 !text-[0.8125rem]">Approved</span>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
          <div>
            <div className="font-mono text-[0.625rem] uppercase tracking-stamp text-ink-3">
              Payable to bank
            </div>
            <div className="tnum mt-1 text-[3.4rem] font-medium leading-[1] text-ink">
              ₹{inr(result.totals.neftTotal)}
            </div>
            <div className="mt-2 font-mono text-[0.6875rem] text-ink-3">
              {MONTH_NAMES[month - 1]} {year} · {result.calendarDays} calendar ·{' '}
              {result.workingDays} working days
            </div>
          </div>

          <div className="grid content-start gap-4 sm:grid-cols-3 lg:justify-items-end">
            <Field label="Salary month">
              <select
                className="input"
                value={`${year}-${month}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-').map(Number)
                  setPeriod({ year: y, month: m })
                }}
              >
                {monthOptions().map((o) => (
                  <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Cheque no.">
              <input
                className="input tnum"
                value={chequeNo}
                onChange={(e) => setChequeNo(e.target.value)}
                placeholder="007068"
              />
            </Field>

            <Field label="Letter / value date">
              <input
                className="input"
                type="date"
                value={letterDateIso}
                onChange={(e) => setLetterDateIso(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- notes */}
      <div className="space-y-2">
        {existing && (approved || existing.is_historical) && (
          <Note tone="ochre">
            {MONTH_NAMES[month - 1]} {year} is already{' '}
            {existing.is_historical ? 'on record from a pay register' : 'approved'}
            {existing.cheque_no ? ` under cheque ${existing.cheque_no}` : ''} at ₹
            {inr(Number(existing.grand_total))}. Saving asks before it overwrites.
          </Note>
        )}
        {missingBank.length > 0 && (
          <Note tone="vermillion">
            No IFSC or account number for {missingBank.map((m) => m.beneficiaryName).join(', ')}.
            The bank will reject the file until this is filled in under Employees.
          </Note>
        )}
        {neft.short && <Note tone="vermillion">{neft.warning}</Note>}
        {alternate && divisorDelta !== 0 && (
          <Note tone="quiet">
            Divided by <strong className="font-medium">{company.pay_divisor_basis} days</strong>{' '}
            this comes to <span className="tnum">{rupees(result.totals.neftTotal)}</span>. On{' '}
            {company.pay_divisor_basis === 'calendar' ? 'working' : 'calendar'} days it would be{' '}
            <span className="tnum">{rupees(alternate.totals.neftTotal)}</span>{' '}
            <span className="tnum text-vermillion">
              ({divisorDelta > 0 ? '+' : ''}
              {inr(divisorDelta)})
            </span>
            . Change it under Settings.
          </Note>
        )}
      </div>

      {/* ----------------------------------------------------------- the roll */}
      <section className="rise space-y-2" style={{ animationDelay: '90ms' }}>
        <h2 className="rubric">
          <span>Statement of pay</span>
          <span className="ml-auto normal-case tracking-normal text-ink-4">
            Amber cells are edited by hand
          </span>
        </h2>

        <div className="leaf overflow-x-auto sm:overflow-x-auto">
          <table className="stack-sm w-full">
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
                <th className="th text-right">Payable</th>
                <th className="th">Mode</th>
              </tr>
            </thead>
            <tbody>
              {result.lines.map((line) => {
                const muted = line.payMode === 'excluded'
                return (
                  <tr
                    key={line.employeeId}
                    className={`transition-colors hover:bg-paper-sunk/60 ${
                      muted ? 'text-ink-4' : ''
                    }`}
                  >
                    <td className="td font-medium" data-label="Employee">
                      {line.name}
                      {muted && <span className="tag ml-2 text-ink-4">off run</span>}
                    </td>
                    <td className="td tnum text-right text-ink-2" data-label="Monthly pay">{inr(line.monthlyPay)}</td>
                    <td className="td text-right" data-label="Absent">
                      <Cell
                        value={line.absence}
                        edited={isEdited(line.employeeId, 'absence')}
                        onChange={(v) => set(line.employeeId, { absence: v })}
                      />
                    </td>
                    <td className="td text-right" data-label="Leave">
                      <Cell
                        value={line.leavePay}
                        edited={isEdited(line.employeeId, 'leavePay')}
                        onChange={(v) => set(line.employeeId, { leavePay: v })}
                      />
                    </td>
                    <td className="td text-right" data-label="Tiffin">
                      <Cell
                        value={line.tiffin}
                        edited={entries[line.employeeId]?.tiffinOverride !== undefined}
                        onChange={(v) => set(line.employeeId, { tiffinOverride: v })}
                      />
                    </td>
                    <td className="td tnum text-right" data-label="Gross">{inr(line.gross, { paise: true })}</td>
                    <td className="td tnum text-right text-ink-2" data-label="P-Tax">{inr(line.ptax)}</td>
                    <td className="td text-right" data-label="TDS">
                      <Cell
                        value={line.tds}
                        edited={!!line.tds}
                        onChange={(v) => set(line.employeeId, { tds: v })}
                      />
                    </td>
                    <td className="td text-right" data-label="Advance">
                      <Cell
                        value={line.advance}
                        edited={!!line.advance}
                        onChange={(v) => set(line.employeeId, { advance: v })}
                      />
                    </td>
                    <td className="td tnum text-right text-[15px] font-semibold" data-label="Payable">
                      {inr(line.rounded)}
                    </td>
                    <td className="td" data-label="Mode">
                      <select
                        className="rounded-[2px] border border-transparent bg-transparent px-1 py-0.5
                                   font-mono text-[0.625rem] uppercase tracking-[.1em] text-ink-3
                                   hover:border-rule-strong focus:border-vermillion"
                        value={line.payMode}
                        onChange={(e) =>
                          set(line.employeeId, { payMode: e.target.value as PayMode })
                        }
                      >
                        <option value="neft">NEFT</option>
                        <option value="cash">Cash</option>
                        <option value="excluded">Off run</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="rule-total">
                <td
                  className="td border-b-0 font-mono text-[0.625rem] uppercase tracking-[.13em] text-ink-3"
                  colSpan={5}
                >
                  Total
                </td>
                <td className="td tnum border-b-0 text-right">
                  {inr(result.totals.gross, { paise: true })}
                </td>
                <td className="td tnum border-b-0 text-right">{inr(result.totals.ptax)}</td>
                <td className="td tnum border-b-0 text-right">{inr(result.totals.tds)}</td>
                <td className="td tnum border-b-0 text-right">{inr(result.totals.advance)}</td>
                <td className="td tnum border-b-0 text-right text-[15px] font-semibold text-ink">
                  {inr(result.totals.grandTotal)}
                </td>
                <td className="td border-b-0" />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* --------------------------------------------------------- bank file */}
      <section className="rise space-y-2" style={{ animationDelay: '150ms' }}>
        <h2 className="rubric">
          <span>Bank file</span>
          <span
            className={`tag ${
              neft.rows.length >= company.min_neft_rows
                ? 'bg-verdigris-wash text-verdigris'
                : 'bg-vermillion-wash text-vermillion'
            }`}
          >
            {neft.rows.length} / {company.min_neft_rows} rows
          </span>
          <span className="ml-auto normal-case tracking-normal text-ink-4">
            HDFC rejects a bulk upload below {company.min_neft_rows} transactions
          </span>
        </h2>

        <div className="leaf p-4">
          <ol className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            {neft.rows.map((row, i) => {
              const isSplit =
                neft.rows.filter((r) => r.paymentIndex === row.paymentIndex).length > 1
              return (
                <li
                  key={i}
                  className="flex items-baseline gap-3 border-b border-rule py-1.5 last:border-b-0"
                >
                  <span className="tnum w-5 text-right font-mono text-[0.625rem] text-ink-4">
                    {i + 1}
                  </span>
                  <span className="truncate text-sm">
                    {row.beneficiaryName}
                    {isSplit && <span className="ml-1.5 text-[0.625rem] text-ochre">split</span>}
                  </span>
                  <span className="tnum ml-auto text-sm">{inr(row.amount)}</span>
                </li>
              )
            })}
          </ol>

          <div className="rule-total mt-3 flex flex-wrap items-center gap-3 pt-3">
            <span className="font-mono text-[0.625rem] uppercase tracking-[.13em] text-ink-3">
              File total
            </span>
            <span className="tnum text-lg font-semibold">₹{inr(fileTotal)}</span>
            <span
              className={`tag ${
                balanced
                  ? 'bg-verdigris-wash text-verdigris'
                  : 'bg-vermillion-wash text-vermillion'
              }`}
            >
              {balanced ? 'Agrees with letter' : 'Does not agree'}
            </span>

            <div className="ml-auto flex gap-2">
              {splits && (
                <button className="btn-ghost" onClick={() => setSplits(null)}>
                  Reset split
                </button>
              )}
              <button
                className="btn-ghost"
                onClick={() => {
                  const manual: Record<number, number[]> = {}
                  payments.forEach((p, index) => {
                    const raw = prompt(
                      `Split ${p.beneficiaryName} — ${inr(p.amount)} — amounts separated by +`,
                      (splits?.[index] ?? [p.amount]).join(' + '),
                    )
                    manual[index] = raw
                      ? raw.split('+').map((s) => Number(s.trim())).filter((n) => n > 0)
                      : [p.amount]
                  })
                  setSplits(manual)
                }}
              >
                Edit split
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- issue */}
      <section className="rise space-y-2" style={{ animationDelay: '200ms' }}>
        <h2 className="rubric">
          <span>Issue</span>
          {savedAt && (
            <span className="ml-auto normal-case tracking-normal text-verdigris">
              Saved {savedAt}
            </span>
          )}
        </h2>

        <div className="leaf flex flex-wrap items-center gap-2 p-4">
          <button
            className="btn-secondary"
            onClick={() =>
              printHtml(`Salary Statement ${MONTH_NAMES[month - 1]} ${year}`, summaryDoc())
            }
          >
            Statement
          </button>

          <button
            className="btn-secondary"
            disabled={!chequeNo}
            title={chequeNo ? '' : 'Enter a cheque number first'}
            onClick={() =>
              printHtml(
                `NEFT Letter ${MONTH_NAMES[month - 1]} ${year}`,
                renderLetter({
                  company,
                  date: letterDateIso,
                  chequeNo,
                  total: result.totals.neftTotal,
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
                `Pay Slips ${MONTH_NAMES[month - 1]} ${year}`,
                renderPayslipSheets(
                  asRunLines()
                    .filter((l) => l.pay_mode !== 'excluded')
                    .map((line) => ({
                      company,
                      year,
                      month,
                      workingDays: result.workingDays,
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
                `Pay Register ${MONTH_NAMES[month - 1]} ${year}`,
                renderFormM({ company, year, month, lines: asRunLines() }),
              )
            }
          >
            Pay register
          </button>

          <span className="mx-1 h-5 w-px bg-rule" />

          <button
            className="btn-primary"
            disabled={neft.short || missingBank.length > 0}
            onClick={() =>
              void downloadNeftXls(
                { company, rows: neft.rows, valueDate: letterDateIso },
                neftFileName(company, year, month),
              ).catch((err: Error) => toast.fail(`Could not build the file: ${err.message}`))
            }
          >
            Bulk NEFT .xls
          </button>
          <button
            className="btn-ghost"
            onClick={() =>
              void downloadNeftCsv(
                { company, rows: neft.rows, valueDate: letterDateIso },
                neftFileName(company, year, month),
              ).catch((err: Error) => toast.fail(`Could not build the file: ${err.message}`))
            }
          >
            .csv
          </button>

          <div className="ml-auto flex gap-2">
            <button className="btn-secondary" disabled={saving} onClick={() => requestSave(false)}>
              Save draft
            </button>
            <button className="btn-primary" disabled={saving} onClick={() => requestSave(true)}>
              {saving ? 'Saving…' : 'Approve month'}
            </button>
          </div>
        </div>
      </section>

      {confirmingOverwrite && (
        <ConfirmDialog
          title={`Overwrite ${MONTH_NAMES[month - 1]} ${year}?`}
          body={
            `This month is already saved${
              existing?.is_historical ? ' from a pay register' : ''
            }${existing?.cheque_no ? ` under cheque ${existing.cheque_no}` : ''}` +
            ` at ₹${inr(Number(existing?.grand_total ?? 0))}. Saving replaces it with the ` +
            `₹${inr(result.totals.grandTotal)} shown here, and the old figures cannot be recovered.`
          }
          confirmLabel={confirmingOverwrite.approve ? 'Overwrite and approve' : 'Overwrite draft'}
          onCancel={() => setConfirmingOverwrite(null)}
          onConfirm={() => {
            const { approve } = confirmingOverwrite
            setConfirmingOverwrite(null)
            void save(approve)
          }}
        />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="w-full sm:max-w-[13rem]">
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

/**
 * An editable figure. It reads as plain text until touched, so the table stays a
 * document rather than a form; edited values keep an amber rule around them.
 */
function Cell({
  value, edited, onChange,
}: {
  value: number
  edited: boolean
  onChange: (value: number) => void
}) {
  return (
    <input
      className={`tnum w-[4.5rem] rounded-[2px] border px-1.5 py-0.5 text-right text-sm
                  transition-colors focus:border-vermillion focus:bg-paper-raised ${
                    edited
                      ? 'border-ochre bg-ochre-wash text-ochre'
                      : 'border-transparent bg-transparent hover:border-rule-strong'
                  }`}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  )
}

function Note({
  tone, children,
}: {
  tone: 'vermillion' | 'ochre' | 'quiet'
  children: React.ReactNode
}) {
  const styles = {
    vermillion: 'border-l-vermillion bg-vermillion-wash text-vermillion-deep',
    ochre: 'border-l-ochre bg-ochre-wash text-ink-2',
    quiet: 'border-l-rule-strong bg-paper-raised text-ink-2',
  }[tone]
  return (
    <p className={`border border-paper-edge border-l-[3px] px-4 py-2.5 text-[0.8125rem] ${styles}`}>
      {children}
    </p>
  )
}

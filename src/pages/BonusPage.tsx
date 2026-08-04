import { useEffect, useMemo, useState } from 'react'

import {
  computeBonusRun,
  DEFAULT_BONUS_RATE,
  DEFAULT_BONUS_ROUND_RULE,
  fyLabel,
  fyMonths,
  monthlyBonusWage,
  type BonusEmployeeInput,
} from '../calc/bonus.ts'
import { buildNeftRows, type PaymentInput } from '../calc/neft.ts'
import type { RoundRule } from '../calc/payroll.ts'
import { bonusNeftFileName, downloadNeftCsv, downloadNeftXls } from '../export/neftFile.ts'
import { printHtml, renderBonusSummary, renderLetter } from '../export/documents.ts'
import { inr, todayIso } from '../lib/format.ts'
import { supabase } from '../lib/supabase.ts'
import { useStore } from '../store/useStore.ts'
import { toast } from '../store/useToast.ts'
import type { BonusRunLine } from '../types.ts'

/** The financial year a bonus run is normally prepared for: the one just closed. */
function currentFyStartYear(): number {
  const now = new Date()
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1
}

function fyOptions(back = 8): number[] {
  const current = currentFyStartYear()
  return Array.from({ length: back }, (_, i) => current - i)
}

export default function BonusPage() {
  const { companies, activeCompanyId, employees, bonusRuns, refreshBonusRuns } = useStore()

  const [fyStartYear, setFyStartYear] = useState(currentFyStartYear)
  const [rate, setRate] = useState(DEFAULT_BONUS_RATE)
  const [roundRule, setRoundRule] = useState<RoundRule>(DEFAULT_BONUS_ROUND_RULE)
  const [manualAddOn, setManualAddOn] = useState<Record<string, number>>({})
  const [wageByEmployee, setWageByEmployee] = useState<Record<string, { total: number; months: number }>>({})
  const [loadingWages, setLoadingWages] = useState(false)
  const [chequeNo, setChequeNo] = useState('')
  const [letterDateIso, setLetterDateIso] = useState(todayIso)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const company = companies.find((c) => c.id === activeCompanyId)
  const staff = useMemo(() => employees.filter((e) => e.active), [employees])
  const existing = bonusRuns.find((r) => r.fy_start_year === fyStartYear)
  const months = useMemo(() => fyMonths(fyStartYear), [fyStartYear])

  // Pull the per-company/FY rate + round rule, and every saved payroll month's
  // bonus-eligible wage for the roster, whenever the company or FY changes.
  useEffect(() => {
    if (!company) return
    setManualAddOn({})
    setSavedAt(null)
    setChequeNo(existing?.cheque_no ?? '')

    let cancelled = false
    async function load() {
      setLoadingWages(true)
      const settingsRes = await supabase
        .from('salary_bonus_settings')
        .select('*')
        .eq('company_id', company!.id)
        .eq('fy_start_year', fyStartYear)
        .maybeSingle()
      if (!cancelled) {
        setRate(settingsRes.data ? Number(settingsRes.data.rate) : DEFAULT_BONUS_RATE)
        setRoundRule((settingsRes.data?.round_rule as RoundRule) ?? DEFAULT_BONUS_ROUND_RULE)
      }

      const orClause = months.map((m) => `and(year.eq.${m.year},month.eq.${m.month})`).join(',')
      const runsRes = await supabase
        .from('salary_runs')
        .select('id')
        .eq('company_id', company!.id)
        .or(orClause)
      if (runsRes.error || cancelled) {
        setLoadingWages(false)
        return
      }
      const runIds = (runsRes.data ?? []).map((r) => r.id as string)
      if (runIds.length === 0) {
        if (!cancelled) {
          setWageByEmployee({})
          setLoadingWages(false)
        }
        return
      }
      const linesRes = await supabase
        .from('salary_run_lines')
        .select('employee_id, payable, ptax, tiffin')
        .in('run_id', runIds)
      if (linesRes.error || cancelled) {
        setLoadingWages(false)
        return
      }
      const agg: Record<string, { total: number; months: number }> = {}
      for (const line of linesRes.data ?? []) {
        if (!line.employee_id) continue
        const wage = monthlyBonusWage({
          payable: Number(line.payable),
          ptax: Number(line.ptax),
          tiffin: Number(line.tiffin),
        })
        const prev = agg[line.employee_id] ?? { total: 0, months: 0 }
        agg[line.employee_id] = { total: prev.total + wage, months: prev.months + 1 }
      }
      if (!cancelled) {
        setWageByEmployee(agg)
        setLoadingWages(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, fyStartYear])

  const lineInputs: BonusEmployeeInput[] = useMemo(
    () =>
      staff.map((employee) => {
        const auto = wageByEmployee[employee.id]
        const addOn = manualAddOn[employee.id] ?? 0
        const monthlyWages: number[] = []
        if (auto) monthlyWages.push(auto.total)
        if (addOn) monthlyWages.push(addOn)
        return {
          employeeId: employee.id,
          name: employee.name,
          beneficiaryName: employee.beneficiary_name,
          bankIfsc: employee.bank_ifsc,
          bankAccountNo: employee.bank_account_no,
          bankAccountType: employee.bank_account_type,
          monthlyWages,
          payMode: employee.default_pay_mode,
        }
      }),
    [staff, wageByEmployee, manualAddOn],
  )

  const result = useMemo(
    () => computeBonusRun(lineInputs, fyStartYear, rate, roundRule),
    [lineInputs, fyStartYear, rate, roundRule],
  )

  const payments: PaymentInput[] = useMemo(
    () =>
      result.lines
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
        }),
    [result, staff],
  )

  const neft = useMemo(
    () => buildNeftRows(payments, company?.min_neft_rows ?? 10, company ? Number(company.neft_split_chunk) : undefined),
    [payments, company],
  )

  if (!company) {
    return <p className="font-mono text-xs text-ink-3">No company selected.</p>
  }

  const missingBank = payments.filter((p) => !p.ifsc || !p.accountNo)
  const approved = existing?.status === 'approved'
  const monthsInFy = staff.length ? Math.max(...result.lines.map((l) => l.monthsCounted), 0) : 0

  const asBonusRunLines = (): BonusRunLine[] =>
    result.lines.map((line, i) => {
      const employee = staff.find((e) => e.id === line.employeeId)!
      return {
        id: line.employeeId, run_id: '', employee_id: line.employeeId,
        employee_name: line.name, beneficiary_name: employee.beneficiary_name,
        bank_ifsc: employee.bank_ifsc, bank_account_no: employee.bank_account_no,
        bank_account_type: employee.bank_account_type,
        annual_wage: line.annualWage, months_counted: line.monthsCounted,
        bonus_amount: line.bonusAmount, rounded: line.rounded,
        pay_mode: line.payMode, sort_order: i + 1,
      }
    })

  async function saveSettings() {
    if (!company) return
    const { error } = await supabase.from('salary_bonus_settings').upsert(
      { company_id: company.id, fy_start_year: fyStartYear, rate, round_rule: roundRule },
      { onConflict: 'company_id,fy_start_year' },
    )
    if (error) toast.fail(`Could not save rate/rounding: ${error.message}`)
    else toast.ok('Bonus rate saved')
  }

  async function save(approve: boolean) {
    if (!company) return
    setSaving(true)
    try {
      const { data: run, error } = await supabase
        .from('salary_bonus_runs')
        .upsert(
          {
            company_id: company.id, fy_start_year: fyStartYear,
            status: approve ? 'approved' : 'draft',
            rate, round_rule: roundRule,
            cheque_no: chequeNo || null,
            letter_date: letterDateIso, value_date: letterDateIso,
            neft_total: result.totals.neftTotal, cash_total: result.totals.cashTotal,
            grand_total: result.totals.grandTotal,
            is_historical: false,
            approved_at: approve ? new Date().toISOString() : null,
          },
          { onConflict: 'company_id,fy_start_year' },
        )
        .select()
        .single()
      if (error) throw error

      await supabase.from('salary_bonus_lines').delete().eq('run_id', run.id)
      const { data: inserted, error: lineErr } = await supabase
        .from('salary_bonus_lines')
        .insert(asBonusRunLines().map(({ id: _id, run_id: _r, ...rest }) => ({ ...rest, run_id: run.id })))
        .select()
      if (lineErr) throw lineErr

      await supabase.from('salary_bonus_neft_rows').delete().eq('run_id', run.id)
      const byEmployee = new Map((inserted ?? []).map((l) => [l.employee_id, l.id]))
      const neftPayload = neft.rows.map((row, i) => ({
        run_id: run.id,
        run_line_id: byEmployee.get(row.employeeId)!,
        seq: i + 1,
        amount: row.amount,
      }))
      if (neftPayload.length) await supabase.from('salary_bonus_neft_rows').insert(neftPayload)

      await refreshBonusRuns()
      setSavedAt(new Date().toLocaleTimeString('en-IN'))
      toast.ok(approve ? `${fyLabel(fyStartYear)} bonus approved` : 'Bonus draft saved')
    } catch (err) {
      toast.fail(`Could not save: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rise leaf relative overflow-hidden p-6">
        {approved && (
          <div className="pointer-events-none absolute right-8 top-7 hidden sm:block">
            <span className="stamp-approved !px-3 !py-1 !text-[13px]">Approved</span>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-stamp text-ink-3">
              Bonus payable to bank
            </div>
            <div className="tnum mt-1 text-[3.4rem] font-medium leading-[1] text-ink">
              ₹{inr(result.totals.neftTotal)}
            </div>
            <div className="mt-2 font-mono text-[11px] text-ink-3">
              {fyLabel(fyStartYear)} · {rate * 100}% rate · round {roundRule}
              {loadingWages && ' · loading saved months…'}
            </div>
          </div>

          <div className="grid content-start gap-4 sm:grid-cols-3 lg:justify-items-end">
            <Field label="Financial year">
              <select
                className="input"
                value={fyStartYear}
                onChange={(e) => setFyStartYear(Number(e.target.value))}
              >
                {fyOptions().map((y) => (
                  <option key={y} value={y}>{fyLabel(y)}</option>
                ))}
              </select>
            </Field>

            <Field label="Rate (%)">
              <input
                className="input tnum"
                type="number"
                step="0.01"
                value={rate * 100}
                onChange={(e) => setRate((Number(e.target.value) || 0) / 100)}
                onBlur={() => void saveSettings()}
              />
            </Field>

            <Field label="Round rule">
              <select
                className="input"
                value={roundRule}
                onChange={(e) => {
                  setRoundRule(e.target.value as RoundRule)
                  void saveSettings()
                }}
              >
                <option value="up">Up</option>
                <option value="nearest">Nearest</option>
                <option value="down">Down</option>
              </select>
            </Field>
          </div>
        </div>
      </section>

      <div className="space-y-2">
        {approved && (
          <Note tone="ochre">
            {fyLabel(fyStartYear)} bonus is already approved
            {existing?.cheque_no ? ` under cheque ${existing.cheque_no}` : ''}. Saving again overwrites it.
          </Note>
        )}
        {missingBank.length > 0 && (
          <Note tone="vermillion">
            No IFSC or account number for {missingBank.map((m) => m.beneficiaryName).join(', ')}.
          </Note>
        )}
        <Note tone="quiet">
          Wage auto-pulled from saved Month End runs for {months.length} FY months (
          {months[0].year}-{String(months[0].month).padStart(2, '0')} through{' '}
          {months[11].year}-{String(months[11].month).padStart(2, '0')}). For months with no saved
          run, add the missing wage by hand in the Manual add-on column.
        </Note>
      </div>

      <section className="rise space-y-2" style={{ animationDelay: '90ms' }}>
        <div className="rubric">
          <span>Bonus computation</span>
          <span className="ml-auto normal-case tracking-normal text-ink-4">
            {monthsInFy} of 12 months found from saved runs
          </span>
        </div>

        <div className="leaf overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Employee</th>
                <th className="th text-right">Months found</th>
                <th className="th text-right">Auto wage</th>
                <th className="th text-right">Manual add-on</th>
                <th className="th text-right">Annual wage</th>
                <th className="th text-right">Bonus</th>
                <th className="th">Mode</th>
              </tr>
            </thead>
            <tbody>
              {result.lines.map((line) => {
                const auto = wageByEmployee[line.employeeId]
                return (
                  <tr key={line.employeeId} className="transition-colors hover:bg-paper-sunk/60">
                    <td className="td font-medium">{line.name}</td>
                    <td className="td tnum text-right text-ink-2">{auto?.months ?? 0} / 12</td>
                    <td className="td tnum text-right text-ink-2">{inr(auto?.total ?? 0, { paise: true })}</td>
                    <td className="td text-right">
                      <input
                        className="tnum w-[6.5rem] rounded-[2px] border border-transparent bg-transparent
                                   px-1.5 py-0.5 text-right text-sm transition-colors
                                   hover:border-rule-strong focus:border-vermillion focus:bg-paper-raised"
                        value={manualAddOn[line.employeeId] ?? 0}
                        onChange={(e) =>
                          setManualAddOn((prev) => ({
                            ...prev,
                            [line.employeeId]: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    </td>
                    <td className="td tnum text-right">{inr(line.annualWage, { paise: true })}</td>
                    <td className="td tnum text-right text-[15px] font-semibold">{inr(line.rounded)}</td>
                    <td className="td">
                      <span
                        className="font-mono text-[10px] uppercase tracking-[.1em] text-ink-3"
                        title="Change an employee's default pay mode under Employees"
                      >
                        {line.payMode}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="rule-total">
                <td className="td border-b-0 font-mono text-[10px] uppercase tracking-[.13em] text-ink-3" colSpan={4}>
                  Total
                </td>
                <td className="td tnum border-b-0 text-right">{inr(result.totals.annualWage, { paise: true })}</td>
                <td className="td tnum border-b-0 text-right text-[15px] font-semibold text-ink">
                  {inr(result.totals.grandTotal)}
                </td>
                <td className="td border-b-0" />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="rise space-y-2" style={{ animationDelay: '150ms' }}>
        <div className="rubric">
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
        </div>

        <div className="leaf p-4">
          <ol className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            {neft.rows.map((row, i) => (
              <li key={i} className="flex items-baseline gap-3 border-b border-rule py-1.5 last:border-b-0">
                <span className="tnum w-5 text-right font-mono text-[10px] text-ink-4">{i + 1}</span>
                <span className="truncate text-sm">{row.beneficiaryName}</span>
                <span className="tnum ml-auto text-sm">{inr(row.amount)}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="rise space-y-2" style={{ animationDelay: '200ms' }}>
        <div className="rubric">
          <span>Issue</span>
          {savedAt && <span className="ml-auto normal-case tracking-normal text-verdigris">Saved {savedAt}</span>}
        </div>

        <div className="leaf flex flex-wrap items-center gap-2 p-4">
          <Field label="Cheque no.">
            <input className="input tnum" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
          </Field>
          <Field label="Letter / value date">
            <input className="input" type="date" value={letterDateIso} onChange={(e) => setLetterDateIso(e.target.value)} />
          </Field>

          <span className="mx-1 h-5 w-px bg-rule" />

          <button
            className="btn-secondary"
            onClick={() =>
              printHtml(
                `Bonus Statement ${fyLabel(fyStartYear)}`,
                renderBonusSummary({ company, fyStartYear, rate, lines: asBonusRunLines() }),
              )
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
                `Bonus Letter ${fyLabel(fyStartYear)}`,
                renderLetter({ company, date: letterDateIso, chequeNo, total: result.totals.neftTotal }),
              )
            }
          >
            Bank letter
          </button>

          <span className="mx-1 h-5 w-px bg-rule" />

          <button
            className="btn-primary"
            disabled={neft.short || missingBank.length > 0}
            onClick={() =>
              downloadNeftXls(
                { company, rows: neft.rows, valueDate: letterDateIso },
                bonusNeftFileName(company, fyStartYear),
              )
            }
          >
            Bulk NEFT .xls
          </button>
          <button
            className="btn-ghost"
            onClick={() =>
              downloadNeftCsv(
                { company, rows: neft.rows, valueDate: letterDateIso },
                bonusNeftFileName(company, fyStartYear),
              )
            }
          >
            .csv
          </button>

          <div className="ml-auto flex gap-2">
            <button className="btn-secondary" disabled={saving} onClick={() => void save(false)}>
              Save draft
            </button>
            <button className="btn-primary" disabled={saving} onClick={() => void save(true)}>
              {saving ? 'Saving…' : 'Approve bonus'}
            </button>
          </div>
        </div>
      </section>
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

function Note({ tone, children }: { tone: 'vermillion' | 'ochre' | 'quiet'; children: React.ReactNode }) {
  const styles = {
    vermillion: 'border-l-vermillion bg-vermillion-wash text-vermillion-deep',
    ochre: 'border-l-ochre bg-ochre-wash text-ink-2',
    quiet: 'border-l-rule-strong bg-paper-raised text-ink-2',
  }[tone]
  return (
    <p className={`border border-paper-edge border-l-[3px] px-4 py-2.5 text-[13px] ${styles}`}>
      {children}
    </p>
  )
}

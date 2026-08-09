/*
 * Reconcile the daily attendance register against the pay register.
 *
 * Runs the *shipped* deriveAttendance over every employee-month that has daily
 * marks and compares its absence figure to the one the pay register recorded,
 * so the sandwich rule is checked in the code that actually computes payroll
 * rather than only in a one-off SQL query.
 *
 *   node --import tsx scripts/reconcile-attendance.mjs
 *
 * Reads Supabase credentials from .env. Read-only: it writes nothing.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

import { deriveAttendance } from '../src/calc/attendance.ts'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const pick = async (table, cols) => {
  const { data, error } = await sb.from(table).select(cols)
  if (error) throw new Error(`${table}: ${error.message}`)
  return data
}

const [marks, runs, lines, emps, cos] = await Promise.all([
  pick('salary_attendance', 'employee_id, marked_on, status'),
  pick('salary_runs', 'id, year, month, company_id, calendar_days, working_days, pay_divisor_basis'),
  pick('salary_run_lines', 'run_id, employee_id, absence, leave_pay, tiffin, gross, monthly_pay, arrears'),
  pick('salary_employees', 'id, name'),
  pick('salary_companies', 'id, code, weekly_off_days, charge_sandwiched_off_days'),
])

const byKey = {}
const monthsWithMarks = new Set()
for (const m of marks) {
  byKey[`${m.employee_id}|${m.marked_on}`] = m.status
  monthsWithMarks.add(`${m.employee_id}|${m.marked_on.slice(0, 7)}`)
}
const runById = Object.fromEntries(runs.map((r) => [r.id, r]))
const nameById = Object.fromEntries(emps.map((e) => [e.id, e.name]))
const coById = Object.fromEntries(cos.map((c) => [c.id, c]))

let total = 0
let fits = 0
const misses = []

for (const l of lines) {
  const run = runById[l.run_id]
  if (!run || !l.employee_id) continue
  const ym = `${run.year}-${String(run.month).padStart(2, '0')}`
  if (!monthsWithMarks.has(`${l.employee_id}|${ym}`)) continue

  const co = coById[run.company_id]
  const offs = co.weekly_off_days ?? [0]
  const isWorking = (iso) => !offs.includes(new Date(`${iso}T00:00:00Z`).getUTCDay())

  const d = deriveAttendance(byKey, l.employee_id, run.year, run.month, isWorking, {
    chargeSandwichedOffDays: co.charge_sandwiched_off_days,
  })

  /*
   * Which book does the money support?
   *
   * `gross` is the one figure in a historical line that was reconciled against
   * a signed bank letter, so it outranks both registers. Inverting the payroll
   * formula recovers the absence count it must have been built from:
   *   gross = monthly_pay / divisor * (divisor - absence + leave) + tiffin + arrears
   *
   * Arrears must come off first — they are back pay for an earlier period, and
   * leaving them in reads as extra days worked this month. Shatrudahan's March
   * 2026 line carries 5,806 of them and looks like a wild disagreement until
   * they are removed, at which point it agrees with the pay register exactly.
   */
  const divisor = run.pay_divisor_basis === 'working' ? run.working_days : run.calendar_days
  const perDay = Number(l.monthly_pay) / divisor
  const impliedAbsence =
    divisor +
    Number(l.leave_pay) -
    (Number(l.gross) - Number(l.tiffin) - Number(l.arrears)) / perDay
  const implied = Math.round(impliedAbsence * 100) / 100

  total++
  if (d.absence === Number(l.absence)) fits++
  else {
    const near = (a, b) => Math.abs(a - b) < 0.02
    misses.push({
      where: `${co.code} ${ym} ${nameById[l.employee_id]}`,
      app: d.absence,
      sandwiched: d.sandwiched,
      register: Number(l.absence),
      implied: near(implied, Math.round(implied)) ? Math.round(implied) : implied,
      supports: near(implied, d.absence)
        ? 'daily book'
        : near(implied, Number(l.absence))
          ? 'pay register'
          : 'neither',
      delta: Number(l.absence) - d.absence,
    })
  }
}

console.log(`employee-months with daily marks : ${total}`)
console.log(`app agrees with the pay register : ${fits}  (${((fits / total) * 100).toFixed(1)}%)`)
console.log(`still differing                  : ${misses.length}\n`)
misses.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
for (const m of misses) {
  console.log(
    `  ${m.where.padEnd(40)} daily ${String(m.app).padStart(2)}` +
      `  register ${String(m.register).padStart(2)}` +
      `  gross implies ${String(m.implied).padStart(5)}` +
      `  -> ${m.supports}`,
  )
}

const tally = misses.reduce((acc, m) => ({ ...acc, [m.supports]: (acc[m.supports] ?? 0) + 1 }), {})
console.log('\nOf the differences, the reconciled gross supports:')
for (const [k, v] of Object.entries(tally)) console.log(`  ${k.padEnd(14)} ${v}`)

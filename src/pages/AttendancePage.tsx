import { useEffect, useMemo, useState } from 'react'

import { buildMonthDays, previousMonth } from '../lib/month.ts'
import { deriveAttendance, useStore } from '../store/useStore.ts'
import { ATTENDANCE_LABELS, MONTH_NAMES } from '../types.ts'
import type { AttendanceStatus } from '../types.ts'

/**
 * The daily register. Unmarked working days count as present, so a clean month
 * needs no clicking — you only record exceptions, and the page stays quiet
 * until something is actually wrong.
 */
const CYCLE: AttendanceStatus[] = ['present', 'absent', 'half_day', 'paid_leave']

/** Present is a faint tick-mark, not a colour block. Exceptions carry the ink. */
const MARK: Record<AttendanceStatus, { glyph: string; cls: string }> = {
  present: { glyph: '·', cls: 'text-ink-4 hover:bg-paper-sunk' },
  absent: { glyph: 'A', cls: 'bg-vermillion-wash text-vermillion hover:bg-vermillion/20' },
  half_day: { glyph: '½', cls: 'bg-ochre-wash text-ochre hover:bg-ochre/20' },
  paid_leave: { glyph: 'L', cls: 'bg-verdigris-wash text-verdigris hover:bg-verdigris/20' },
  holiday: { glyph: 'H', cls: 'text-ink-4' },
}

export default function AttendancePage() {
  const { companies, activeCompanyId, employees, holidays, attendance, loadAttendance, setMark, bulkMark } =
    useStore()
  const [{ year, month }, setPeriod] = useState(previousMonth)

  const company = companies.find((c) => c.id === activeCompanyId)
  const staff = useMemo(() => employees.filter((e) => e.active && !e.is_director), [employees])

  useEffect(() => {
    void loadAttendance(year, month)
  }, [year, month, activeCompanyId, loadAttendance])

  const days = useMemo(
    () => (company ? buildMonthDays(year, month, company, holidays) : []),
    [company, year, month, holidays],
  )
  const workingDays = days.filter((d) => d.isWorking).length

  const halfDayWeight = company ? Number(company.half_day_weight) : 0.5

  const derivedAll = useMemo(() => {
    const map: Record<string, ReturnType<typeof deriveAttendance>> = {}
    for (const e of staff) {
      map[e.id] = deriveAttendance(
        attendance, e.id, year, month,
        (iso) => days.find((d) => d.iso === iso)?.isWorking ?? false,
        halfDayWeight,
      )
    }
    return map
  }, [staff, attendance, year, month, days, halfDayWeight])

  if (!company) return <p className="font-mono text-xs text-ink-3">No company selected.</p>

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1))
    setPeriod({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 })
  }

  const cycle = (employeeId: string, iso: string) => {
    const current = attendance[`${employeeId}|${iso}`] ?? 'present'
    void setMark(employeeId, iso, CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length])
  }

  const totalExceptions = Object.values(derivedAll).reduce((s, d) => s + d.absence, 0)

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------ head */}
      <div className="rise flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-baseline gap-4">
          <button className="btn-ghost px-2" onClick={() => shift(-1)} aria-label="Previous month">
            ‹
          </button>
          <h2 className="font-display text-3xl leading-none">
            {MONTH_NAMES[month - 1]}{' '}
            <span className="text-ink-4">{year}</span>
          </h2>
          <button className="btn-ghost px-2" onClick={() => shift(1)} aria-label="Next month">
            ›
          </button>
        </div>

        <div className="flex items-end gap-6">
          <Figure label="Calendar days" value={days.length} />
          <Figure label="Working days" value={workingDays} accent />
          <Figure
            label="Days lost"
            value={totalExceptions || '—'}
            tone={totalExceptions ? 'vermillion' : undefined}
          />
          <button
            className="btn-secondary"
            onClick={() =>
              void bulkMark(
                staff.map((e) => e.id),
                days.filter((d) => d.isWorking).map((d) => d.iso),
                'present',
              )
            }
          >
            Clear month
          </button>
        </div>
      </div>

      {/*
        Frozen panes, as in a spreadsheet: the name stays pinned to the left and
        the running totals to the right, while the dates scroll between them.
        Without this you lose track of whose row you are on around the 20th.

        border-separate rather than border-collapse — collapsed borders vanish
        on sticky cells in WebKit.
      */}
      <div
        className="rise leaf max-h-[68vh] overflow-auto"
        style={{ animationDelay: '80ms' }}
      >
        <table className="w-max min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="th sticky left-0 z-30 w-[200px] min-w-[200px] border-r
                             border-rule bg-paper-raised">
                Employee
              </th>

              {days.map((d) => (
                <th
                  key={d.iso}
                  title={d.isHoliday ? 'Holiday' : d.isWeeklyOff ? 'Weekly off' : d.iso}
                  className={`min-w-[32px] border-b border-rule-strong bg-paper-raised px-0 py-1.5
                    text-center font-mono text-[10px] font-medium ${
                      d.isWorking ? 'text-ink-3' : 'text-ink-4'
                    }`}
                >
                  <div className="tnum">{d.day}</div>
                  <div className="font-normal opacity-60">{d.label}</div>
                </th>
              ))}

              <th className="th sticky right-[68px] z-30 w-[68px] min-w-[68px] border-l
                             border-rule bg-paper-raised text-right">
                Abs
              </th>
              <th className="th sticky right-0 z-30 w-[68px] min-w-[68px] bg-paper-raised
                             text-right">
                Lv
              </th>
            </tr>
          </thead>

          <tbody>
            {staff.map((employee, i) => {
              const derived = derivedAll[employee.id]
              return (
                <tr key={employee.id} className="rise" style={{ animationDelay: `${120 + i * 35}ms` }}>
                  <td className="td sticky left-0 z-10 w-[200px] min-w-[200px] border-r
                                 border-rule bg-paper-raised font-medium">
                    {employee.name}
                  </td>

                  {days.map((d) => {
                    if (!d.isWorking) {
                      return (
                        <td key={d.iso} className="hatch border-b border-rule p-0 opacity-40" />
                      )
                    }
                    const status = attendance[`${employee.id}|${d.iso}`] ?? 'present'
                    const mark = MARK[status]
                    return (
                      <td key={d.iso} className="border-b border-rule p-0">
                        <button
                          onClick={() => cycle(employee.id, d.iso)}
                          title={`${employee.name} · ${d.iso} · ${ATTENDANCE_LABELS[status]}`}
                          className={`h-8 w-full font-mono text-[11px] font-semibold
                                      transition-colors ${mark.cls}`}
                        >
                          {mark.glyph}
                        </button>
                      </td>
                    )
                  })}

                  <td
                    className={`td tnum sticky right-[68px] z-10 w-[68px] min-w-[68px] border-l
                                border-rule bg-paper-raised text-right font-semibold ${
                                  derived.absence ? 'text-vermillion' : 'text-ink-4'
                                }`}
                  >
                    {derived.absence || '—'}
                  </td>
                  <td className="td tnum sticky right-0 z-10 w-[68px] min-w-[68px]
                                 bg-paper-raised text-right text-ink-2">
                    {derived.leavePay || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ----------------------------------------------------------- legend */}
      <div className="rise flex flex-wrap items-center gap-x-7 gap-y-2 font-mono text-[10px]
                      uppercase tracking-[.1em] text-ink-3"
           style={{ animationDelay: '260ms' }}>
        {(['present', 'absent', 'half_day', 'paid_leave'] as AttendanceStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-2">
            <span className={`grid h-5 w-5 place-items-center rounded-[2px] border border-rule
                              text-[11px] font-semibold ${MARK[s].cls}`}>
              {MARK[s].glyph}
            </span>
            {ATTENDANCE_LABELS[s]}
          </span>
        ))}
        <span className="inline-flex items-center gap-2">
          <span className="hatch h-5 w-5 rounded-[2px] border border-rule opacity-40" />
          Weekly off
        </span>
        <span className="ml-auto normal-case tracking-normal text-ink-4">
          Paid leave counts as an absence but is credited back — it earns no tiffin.
        </span>
      </div>
    </div>
  )
}

function Figure({
  label, value, accent, tone,
}: {
  label: string
  value: string | number
  accent?: boolean
  tone?: 'vermillion'
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-stamp text-ink-3">{label}</div>
      <div
        className={`tnum text-2xl leading-tight ${
          tone === 'vermillion' ? 'text-vermillion' : accent ? 'text-ink' : 'text-ink-2'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

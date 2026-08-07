import { useEffect, useMemo, useRef, useState } from 'react'

import { ConfirmDialog } from '../components/ConfirmDialog.tsx'
import { buildMonthDays, currentMonth } from '../lib/month.ts'
import { deriveAttendance, useStore } from '../store/useStore.ts'
import { ATTENDANCE_LABELS, MONTH_NAMES } from '../types.ts'
import type { AttendanceStatus } from '../types.ts'

/**
 * The daily register. Unmarked working days count as present, so a clean month
 * needs no clicking — you only record exceptions, and the page stays quiet
 * until something is actually wrong.
 */
const CYCLE: AttendanceStatus[] = ['present', 'absent', 'paid_leave']

/** Present is a faint tick-mark, not a colour block. Exceptions carry the ink. */
const MARK: Record<AttendanceStatus, { glyph: string; cls: string }> = {
  present: { glyph: '·', cls: 'text-ink-4 hover:bg-paper-sunk' },
  absent: { glyph: 'A', cls: 'bg-vermillion-wash text-vermillion hover:bg-vermillion/20' },
  paid_leave: { glyph: 'L', cls: 'bg-verdigris-wash text-verdigris hover:bg-verdigris/20' },
  holiday: { glyph: 'H', cls: 'text-ink-4' },
}

export default function AttendancePage() {
  const { companies, activeCompanyId, employees, holidays, attendance, loadAttendance, bulkMark } =
    useStore()
  const [{ year, month }, setPeriod] = useState(currentMonth)
  const [confirmingClear, setConfirmingClear] = useState(false)

  /**
   * Drag-to-paint: mousedown on a cell decides the status (by the same
   * cycle-to-next rule as a single click), then dragging over further cells —
   * in this row or any other — paints them the same status. Nothing reaches
   * Supabase until mouseup, so dragging across fifty cells is one bulk write,
   * not fifty round trips.
   */
  const [draftPaint, setDraftPaint] = useState<Record<string, AttendanceStatus>>({})
  const paintStatusRef = useRef<AttendanceStatus | null>(null)
  const touchedRef = useRef<Set<string>>(new Set())

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

  // Merged so the Abs/Lv totals update live while a drag is still in progress,
  // not only after it commits.
  const liveAttendance = useMemo(
    () => (Object.keys(draftPaint).length ? { ...attendance, ...draftPaint } : attendance),
    [attendance, draftPaint],
  )

  const derivedAll = useMemo(() => {
    const map: Record<string, ReturnType<typeof deriveAttendance>> = {}
    for (const e of staff) {
      map[e.id] = deriveAttendance(
        liveAttendance, e.id, year, month,
        (iso) => days.find((d) => d.iso === iso)?.isWorking ?? false,
      )
    }
    return map
  }, [staff, liveAttendance, year, month, days])

  // Resolve the exact cell under the pointer on every move, rather than
  // relying on each button's own onMouseEnter. A fast drag can skip a small
  // button's mouseenter entirely (the pointer jumps past it between event
  // samples), which either leaves gaps or, worse, reads as painting a block
  // it never actually crossed. Asking the document what's under the cursor
  // right now is exact regardless of drag speed.
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!paintStatusRef.current) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const cell = el?.closest<HTMLElement>('[data-cell]')
      const key = cell?.dataset.cell
      if (!key) return
      const [employeeId, iso] = key.split('|')
      continuePaint(employeeId, iso, true)
    }
    window.addEventListener('pointermove', onPointerMove)
    return () => window.removeEventListener('pointermove', onPointerMove)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Commit the drag the instant the mouse button is released anywhere on the
  // page — including outside the grid, if the drag ran off its edge.
  useEffect(() => {
    const commit = () => {
      const status = paintStatusRef.current
      const touched = touchedRef.current
      paintStatusRef.current = null
      if (!status || touched.size === 0) return

      const byEmployee = new Map<string, string[]>()
      for (const k of touched) {
        const [employeeId, iso] = k.split('|')
        byEmployee.set(employeeId, [...(byEmployee.get(employeeId) ?? []), iso])
      }
      touchedRef.current = new Set()
      setDraftPaint({})

      const employeeIds = [...byEmployee.keys()]
      const isoDates = [...new Set([...byEmployee.values()].flat())]
      // Every touched cell was painted the same status, so one bulkMark call
      // covers the whole drag regardless of how many cells it crossed.
      void bulkMark(employeeIds, isoDates, status)
    }
    window.addEventListener('mouseup', commit)
    return () => window.removeEventListener('mouseup', commit)
  }, [bulkMark])

  if (!company) return <p className="font-mono text-xs text-ink-3">No company selected.</p>

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1))
    setPeriod({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 })
  }

  const statusAt = (employeeId: string, iso: string): AttendanceStatus => {
    const k = `${employeeId}|${iso}`
    return draftPaint[k] ?? attendance[k] ?? 'present'
  }

  const startPaint = (employeeId: string, iso: string) => {
    const k = `${employeeId}|${iso}`
    const current = attendance[k] ?? 'present'
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]
    paintStatusRef.current = next
    touchedRef.current = new Set([k])
    setDraftPaint({ [k]: next })
  }

  const continuePaint = (employeeId: string, iso: string, buttonPressed: boolean) => {
    const status = paintStatusRef.current
    if (!buttonPressed || !status) return
    const k = `${employeeId}|${iso}`
    if (touchedRef.current.has(k)) return
    touchedRef.current.add(k)
    setDraftPaint((prev) => ({ ...prev, [k]: status }))
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
          <button className="btn-secondary" onClick={() => setConfirmingClear(true)}>
            Clear month
          </button>
        </div>
      </div>

      {confirmingClear && (
        <ConfirmDialog
          title={`Clear ${MONTH_NAMES[month - 1]} ${year}?`}
          body={`Every exception recorded for ${staff.length} employees this month will be wiped and reset to present. This cannot be undone.`}
          confirmLabel="Clear the month"
          onCancel={() => setConfirmingClear(false)}
          onConfirm={() => {
            void bulkMark(
              staff.map((e) => e.id),
              days.filter((d) => d.isWorking).map((d) => d.iso),
              'present',
            )
            setConfirmingClear(false)
          }}
        />
      )}

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
          <caption className="sr-only">
            Daily attendance for {MONTH_NAMES[month - 1]} {year}. Employees down the rows,
            days of the month across the columns. Each cell cycles present, absent, paid leave.
          </caption>
          <thead className="sticky top-0 z-20">
            <tr>
              <th scope="col" className="th sticky left-0 z-30 w-[200px] min-w-[200px] border-r
                             border-rule bg-paper-raised">
                Employee
              </th>

              {days.map((d) => (
                <th
                  key={d.iso}
                  scope="col"
                  title={d.isHoliday ? 'Holiday' : d.isWeeklyOff ? 'Weekly off' : d.iso}
                  className={`min-w-[32px] border-b border-rule-strong bg-paper-raised px-0 py-1.5
                    text-center font-mono text-[0.625rem] font-medium ${
                      d.isWorking ? 'text-ink-3' : 'text-ink-4'
                    }`}
                >
                  <div className="tnum">{d.day}</div>
                  <div className="font-normal opacity-60" aria-hidden="true">{d.label}</div>
                </th>
              ))}

              <th scope="col" className="th sticky right-[68px] z-30 w-[68px] min-w-[68px] border-l
                             border-rule bg-paper-raised text-right">
                Abs
              </th>
              <th scope="col" className="th sticky right-0 z-30 w-[68px] min-w-[68px] bg-paper-raised
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
                  <th scope="row" className="td sticky left-0 z-10 w-[200px] min-w-[200px] border-r
                                 border-rule bg-paper-raised text-left font-medium">
                    {employee.name}
                  </th>

                  {days.map((d) => {
                    if (!d.isWorking) {
                      return (
                        <td key={d.iso} className="hatch border-b border-rule p-0 opacity-40" />
                      )
                    }
                    const status = statusAt(employee.id, d.iso)
                    const mark = MARK[status]
                    const painting = draftPaint[`${employee.id}|${d.iso}`] !== undefined
                    return (
                      <td key={d.iso} className="border-b border-rule p-0">
                        <button
                          data-cell={`${employee.id}|${d.iso}`}
                          onMouseDown={(e) => {
                            e.preventDefault() // don't let the drag select page text
                            startPaint(employee.id, d.iso)
                          }}
                          onMouseEnter={(e) => continuePaint(employee.id, d.iso, e.buttons === 1)}
                          title={`${employee.name} · ${d.iso} · ${ATTENDANCE_LABELS[status]}`}
                          aria-label={`${employee.name}, ${d.day} ${MONTH_NAMES[month - 1]}: ${
                            ATTENDANCE_LABELS[status]
                          }`}
                          className={`day-cell w-full select-none font-mono text-[0.6875rem]
                                      font-semibold transition-colors ${mark.cls} ${
                                        painting ? 'ring-2 ring-inset ring-ink/40' : ''
                                      }`}
                        >
                          <span aria-hidden="true">{mark.glyph}</span>
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
      <div className="rise flex flex-wrap items-center gap-x-7 gap-y-2 font-mono text-[0.625rem]
                      uppercase tracking-[.1em] text-ink-3"
           style={{ animationDelay: '260ms' }}>
        {(['present', 'absent', 'paid_leave'] as AttendanceStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-2">
            <span className={`grid h-5 w-5 place-items-center rounded-[2px] border border-rule
                              text-[0.6875rem] font-semibold ${MARK[s].cls}`}>
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
          Click a cell to cycle it, or press and drag across several to paint them all at once.
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
      <div className="font-mono text-[0.625rem] uppercase tracking-stamp text-ink-3">{label}</div>
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

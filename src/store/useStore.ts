import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { deriveAttendance } from '../calc/attendance.ts'
import { supabase } from '../lib/supabase.ts'
import { toast } from './useToast.ts'
import type {
  AttendanceMark,
  AttendanceStatus,
  BonusRun,
  Company,
  Employee,
  Holiday,
  NeftRowRecord,
  Run,
  RunLine,
} from '../types.ts'

// Re-exported so existing call sites (AttendancePage, RunPage) are unaffected —
// the calculation itself now lives in calc/attendance.ts, dependency-free and
// unit-tested, since it's payroll-adjacent logic rather than app wiring.
export { deriveAttendance }
export type { DerivedAttendance } from '../calc/attendance.ts'

/** Every table the app cares about, all published to Supabase Realtime. */
const SYNCED_TABLES = [
  'salary_companies',
  'salary_employees',
  'salary_holidays',
  'salary_attendance',
  'salary_runs',
  'salary_run_lines',
  'salary_neft_rows',
  'salary_bonus_settings',
  'salary_bonus_runs',
  'salary_bonus_lines',
  'salary_bonus_neft_rows',
] as const

export type SyncState = 'connecting' | 'live' | 'offline'

interface StoreState {
  ready: boolean
  loading: boolean
  error: string | null

  /** Realtime connection health, surfaced in the masthead. */
  sync: SyncState
  lastSyncAt: string | null

  companies: Company[]
  activeCompanyId: string | null
  employees: Employee[]
  holidays: Holiday[]
  runs: Run[]
  bonusRuns: BonusRun[]

  /** Attendance for the month currently open, keyed `${employeeId}|${iso}`. */
  attendance: Record<string, AttendanceStatus>
  attendanceMonth: { year: number; month: number } | null
  /** Marks queued but not yet accepted by the server. 0 means everything saved. */
  unsavedMarks: number

  init: () => Promise<void>

  setActiveCompany: (id: string) => Promise<void>
  loadCompanyData: (silent?: boolean) => Promise<void>
  loadAttendance: (year: number, month: number) => Promise<void>
  setMark: (employeeId: string, iso: string, status: AttendanceStatus) => Promise<void>
  bulkMark: (employeeIds: string[], isoDates: string[], status: AttendanceStatus) => Promise<void>
  queueMarks: (rows: PendingMark[], announce: boolean) => Promise<void>
  /** Retry the queue now — used on reconnect and by the "retry" affordance. */
  flushMarks: () => Promise<void>

  saveEmployee: (employee: Partial<Employee> & { id?: string }) => Promise<void>
  updateCompany: (patch: Partial<Company>) => Promise<void>
  addHoliday: (holidayOn: string, name: string) => Promise<void>
  removeHoliday: (id: string) => Promise<void>

  /*
   * Targeted refetches. Every write used to call `loadCompanyData()`, which
   * re-reads companies, employees, holidays, runs and bonus runs — five
   * queries and a full re-render to record one holiday. These read back only
   * the table that actually changed.
   */
  refreshCompanies: () => Promise<void>
  refreshEmployees: () => Promise<void>
  refreshHolidays: () => Promise<void>

  loadRunDetail: (runId: string) => Promise<{ run: Run; lines: RunLine[]; neft: NeftRowRecord[] }>
  deleteRun: (runId: string) => Promise<void>
  refreshRuns: () => Promise<void>

  deleteBonusRun: (runId: string) => Promise<void>
  refreshBonusRuns: () => Promise<void>
}

const key = (employeeId: string, iso: string) => `${employeeId}|${iso}`

/* ---------------------------------------------------------------- outbox --
 *
 * Attendance is marked every day, often on a phone, often on a bad connection.
 * A mark must never be lost, so it is not written straight to the network and
 * hoped for: it goes into an outbox that survives a failed request, a dropped
 * connection, a closed tab and a browser crash.
 *
 *   click -> outbox (localStorage, synchronous) -> optimistic paint -> flush
 *
 * The flush retries with backoff until the server accepts it, and runs again
 * whenever realtime reconnects or the fallback poll ticks. Nothing is ever
 * rolled back on failure — a rolled-back mark is exactly the silent loss this
 * is meant to prevent — so a queued mark stays on screen and stays in the
 * queue, and `unsavedMarks` reports the backlog until it drains.
 *
 * Reloading the register merges the outbox back over whatever the server
 * returned, so an in-flight mark cannot be blanked by a refresh landing first.
 */
const OUTBOX_KEY = 'salary-tracker.outbox.v1'

type PendingMark = { employee_id: string; marked_on: string; status: AttendanceStatus }

let outbox = new Map<string, PendingMark>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushBackoffMs = 1000
let flushing = false
let consecutiveFailures = 0
let outboxListenersBound = false

/**
 * Guard the ways a browser takes the page away.
 *
 * A queued mark is already durable — it reached localStorage synchronously
 * before any network call, so reopening the app resends it. These handlers
 * shorten the window rather than create the guarantee: flush when the tab is
 * hidden, because phones freeze and kill background tabs without warning; and
 * if marks are still unsent when the page is closing, say so rather than let
 * them leave believing the register is up to date.
 */
function bindOutboxGuards(set: (partial: Partial<StoreState>) => void): void {
  if (outboxListenersBound || typeof window === 'undefined') return
  outboxListenersBound = true

  const flushNow = () => {
    if (outbox.size) void flushOutbox(set)
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow()
    else flushNow() // returning to the tab is also the moment to catch up
  })
  window.addEventListener('pagehide', flushNow)
  window.addEventListener('online', flushNow)

  window.addEventListener('beforeunload', (e) => {
    if (outbox.size === 0) return
    e.preventDefault()
    e.returnValue = ''
  })

  // Another tab saved or queued something: adopt the merged truth on disk.
  window.addEventListener('storage', (e) => {
    if (e.key !== OUTBOX_KEY) return
    outbox = readOutbox()
    set({ unsavedMarks: outbox.size })
  })
}

function readOutbox(): Map<string, PendingMark> {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    if (!raw) return new Map()
    const entries = JSON.parse(raw) as PendingMark[]
    return new Map(entries.map((m) => [key(m.employee_id, m.marked_on), m]))
  } catch {
    // A corrupt or unavailable store must not stop the app from opening.
    return new Map()
  }
}

/**
 * Write the queue to disk, merging with whatever is already there.
 *
 * A plain overwrite loses marks: two tabs open on the same machine each hold
 * their own in-memory queue but share one localStorage key, so whichever tab
 * wrote last would erase the other's pending marks. Only keys this tab has
 * just seen the server accept — `settled` — are allowed to disappear.
 */
function persistOutbox(settled?: Set<string>): void {
  try {
    const merged = readOutbox()
    if (settled) for (const k of settled) merged.delete(k)
    for (const [k, m] of outbox) merged.set(k, m)
    localStorage.setItem(OUTBOX_KEY, JSON.stringify([...merged.values()]))
  } catch {
    /* private mode / quota — the in-memory queue still retries this session. */
  }
}

/**
 * Push the whole queue at the server in one upsert.
 *
 * Returns true when the queue drained. Entries are removed only if they were
 * not re-marked while the request was in flight, so a click made mid-flush is
 * kept and sent on the next pass rather than being dropped as "already saved".
 */
async function flushOutbox(set: (partial: Partial<StoreState>) => void): Promise<boolean> {
  if (outbox.size === 0 || flushing) return outbox.size === 0
  flushing = true

  // Pick up anything a second tab queued while this one was idle.
  for (const [k, m] of readOutbox()) if (!outbox.has(k)) outbox.set(k, m)
  const batch = [...outbox.entries()]

  /** Retire the rows the server took; anything re-marked mid-flight stays. */
  const settle = (accepted: [string, PendingMark][]) => {
    const keys = new Set<string>()
    for (const [k, sent] of accepted) {
      if (outbox.get(k) === sent) {
        outbox.delete(k)
        keys.add(k)
      }
    }
    persistOutbox(keys)
  }

  try {
    const { error } = await supabase
      .from('salary_attendance')
      .upsert(
        batch.map(([, m]) => m),
        { onConflict: 'employee_id,marked_on' },
      )

    if (error) {
      consecutiveFailures++
      /*
       * A batch upsert is all-or-nothing, so one permanently bad row — an
       * employee deleted on another device, say — would fail every retry and
       * take every later mark down with it, and the queue would never drain.
       * After a few whole-batch failures, send them one at a time so the good
       * marks land and only the genuinely broken row stays behind.
       */
      if (consecutiveFailures >= 3 && batch.length > 1) {
        const accepted: [string, PendingMark][] = []
        let lastError = error.message
        for (const entry of batch) {
          const one = await supabase
            .from('salary_attendance')
            .upsert([entry[1]], { onConflict: 'employee_id,marked_on' })
          if (one.error) lastError = one.error.message
          else accepted.push(entry)
        }
        settle(accepted)
        set({
          unsavedMarks: outbox.size,
          error: outbox.size ? `${outbox.size} mark(s) rejected: ${lastError}` : null,
        })
        if (outbox.size) scheduleFlush(set)
        return outbox.size === 0
      }

      set({ unsavedMarks: outbox.size, error: error.message })
      scheduleFlush(set)
      return false
    }

    settle(batch)
    flushBackoffMs = 1000
    consecutiveFailures = 0
    set({ unsavedMarks: outbox.size, error: null })
    return outbox.size === 0
  } catch (err) {
    // Offline throws rather than returning an error — same treatment: keep the
    // queue, keep the marks on screen, try again shortly.
    consecutiveFailures++
    set({ unsavedMarks: outbox.size, error: (err as Error).message })
    scheduleFlush(set)
    return false
  } finally {
    flushing = false
  }
}

function scheduleFlush(set: (partial: Partial<StoreState>) => void): void {
  if (flushTimer) return
  const wait = flushBackoffMs
  flushBackoffMs = Math.min(flushBackoffMs * 2, 30_000)
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushOutbox(set)
  }, wait)
}

export const useStore = create<StoreState>((set, get) => ({
  ready: false,
  loading: false,
  error: null,
  sync: 'connecting',
  lastSyncAt: null,

  companies: [],
  activeCompanyId: null,
  employees: [],
  holidays: [],
  runs: [],
  bonusRuns: [],
  attendance: {},
  attendanceMonth: null,
  unsavedMarks: 0,

  async init() {
    // Recover anything that was queued but never accepted — a tab closed or a
    // browser killed mid-save must not cost a day's marks.
    outbox = readOutbox()
    set({ unsavedMarks: outbox.size })
    bindOutboxGuards(set)

    // Anything recovered from a previous session goes back to the server before
    // the register is read, so the screen never shows a stale "absent".
    await flushOutbox(set)

    // No login: the app talks to Supabase as the anon role and loads straight in.
    await get().loadCompanyData()
    set({ ready: true })
    subscribe(get, set)
    void flushOutbox(set)
  },

  async setActiveCompany(id) {
    set({ activeCompanyId: id })
    await get().loadCompanyData()
  },

  async loadCompanyData(silent = false) {
    if (!silent) set({ loading: true, error: null })
    try {
      const { data: companies, error: cErr } = await supabase
        .from('salary_companies')
        .select('*')
        .order('code')
      if (cErr) throw cErr

      const list = (companies ?? []) as Company[]
      const activeId = get().activeCompanyId ?? list[0]?.id ?? null
      if (!activeId) {
        set({ companies: list, loading: false })
        return
      }

      const [employees, holidays, runs, bonusRuns] = await Promise.all([
        supabase.from('salary_employees').select('*').eq('company_id', activeId).order('sort_order'),
        supabase.from('salary_holidays').select('*'),
        supabase
          .from('salary_runs')
          .select('*')
          .eq('company_id', activeId)
          .order('year', { ascending: false })
          .order('month', { ascending: false }),
        supabase
          .from('salary_bonus_runs')
          .select('*')
          .eq('company_id', activeId)
          .order('fy_start_year', { ascending: false }),
      ])

      if (employees.error) throw employees.error
      if (runs.error) throw runs.error
      if (bonusRuns.error) throw bonusRuns.error

      set({
        companies: list,
        activeCompanyId: activeId,
        employees: (employees.data ?? []) as Employee[],
        holidays: (holidays.data ?? []) as Holiday[],
        runs: (runs.data ?? []) as Run[],
        bonusRuns: (bonusRuns.data ?? []) as BonusRun[],
        loading: false,
        lastSyncAt: new Date().toISOString(),
      })
    } catch (err) {
      set({ loading: false, error: (err as Error).message })
    }
  },

  async loadAttendance(year, month) {
    const companyId = get().activeCompanyId
    if (!companyId) {
      set({ attendance: {}, attendanceMonth: { year, month } })
      return
    }

    const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`

    /*
     * Scope by company on the server rather than by the employee list held in
     * memory. Switching company updates activeCompanyId immediately while the
     * new roster is still loading, so filtering on the client's employee ids
     * would query the *previous* company and silently return an empty register.
     */
    const { data, error } = await supabase
      .from('salary_attendance')
      .select('employee_id, marked_on, status, salary_employees!inner(company_id)')
      .eq('salary_employees.company_id', companyId)
      .gte('marked_on', from)
      .lte('marked_on', to)

    if (error) {
      set({ error: error.message })
      return
    }

    const map: Record<string, AttendanceStatus> = {}
    for (const row of (data ?? []) as AttendanceMark[]) {
      map[key(row.employee_id, row.marked_on)] = row.status
    }
    // Queued marks win over the server's copy: they are newer by definition,
    // and without this a refresh landing between click and save would wipe the
    // mark off the screen and invite a second, wrong click.
    for (const [k, pending] of outbox) map[k] = pending.status

    set({ attendance: map, attendanceMonth: { year, month } })
  },

  async setMark(employeeId, iso, status) {
    await get().queueMarks([{ employee_id: employeeId, marked_on: iso, status }], false)
  },

  async bulkMark(employeeIds, isoDates, status) {
    const rows = employeeIds.flatMap((employeeId) =>
      isoDates.map((marked_on) => ({ employee_id: employeeId, marked_on, status })),
    )
    await get().queueMarks(rows, true)
  },

  /**
   * The single door every attendance write goes through: queue first, paint
   * immediately, then flush. `announce` keeps the drag-to-paint confirmation
   * without firing a toast for every single click.
   */
  async queueMarks(rows, announce) {
    if (rows.length === 0) return

    for (const row of rows) outbox.set(key(row.employee_id, row.marked_on), row)
    persistOutbox()

    set((s) => {
      const next = { ...s.attendance }
      for (const row of rows) next[key(row.employee_id, row.marked_on)] = row.status
      return { attendance: next, unsavedMarks: outbox.size }
    })

    const saved = await flushOutbox(set)
    if (saved && announce) {
      toast.ok(`${rows.length} mark${rows.length === 1 ? '' : 's'} saved`)
    }
  },

  async flushMarks() {
    await flushOutbox(set)
  },

  async saveEmployee(employee) {
    const companyId = get().activeCompanyId
    if (!companyId) return
    const payload = { ...employee, company_id: employee.company_id ?? companyId }
    const { error } = employee.id
      ? await supabase.from('salary_employees').update(payload).eq('id', employee.id)
      : await supabase.from('salary_employees').insert(payload)
    if (error) {
      set({ error: error.message })
      toast.fail(`Could not save employee: ${error.message}`)
    } else {
      await get().refreshEmployees()
      toast.ok(`${employee.name ?? 'Employee'} saved`)
    }
  },

  async updateCompany(patch) {
    const id = get().activeCompanyId
    if (!id) return
    const { error } = await supabase.from('salary_companies').update(patch).eq('id', id)
    if (error) {
      set({ error: error.message })
      toast.fail(`Could not save setting: ${error.message}`)
    } else {
      await get().refreshCompanies()
      toast.ok('Setting saved')
    }
  },

  /**
   * Festival/company holidays affect the working-days count that absence and
   * tiffin are calculated against, so they belong in the calculation-logic
   * settings even though the table also allows a global (company_id null) row.
   */
  async addHoliday(holidayOn, name) {
    const companyId = get().activeCompanyId
    if (!companyId) return

    // The uniqueness rule is an expression index (coalesce(company_id, ...)),
    // which upsert's onConflict can't target by plain column list — so check
    // and branch explicitly instead of relying on ON CONFLICT.
    const existing = await supabase
      .from('salary_holidays')
      .select('id')
      .eq('company_id', companyId)
      .eq('holiday_on', holidayOn)
      .maybeSingle()

    const { error } = existing.data
      ? await supabase.from('salary_holidays').update({ name: name || null }).eq('id', existing.data.id)
      : await supabase
          .from('salary_holidays')
          .insert({ company_id: companyId, holiday_on: holidayOn, name: name || null })

    if (error) {
      set({ error: error.message })
      toast.fail(`Could not save holiday: ${error.message}`)
    } else {
      await get().refreshHolidays()
      toast.ok('Holiday saved')
    }
  },

  async removeHoliday(id) {
    const { error } = await supabase.from('salary_holidays').delete().eq('id', id)
    if (error) {
      set({ error: error.message })
      toast.fail(`Could not remove holiday: ${error.message}`)
    } else {
      await get().refreshHolidays()
      toast.ok('Holiday removed')
    }
  },

  async loadRunDetail(runId) {
    const [run, lines, neft] = await Promise.all([
      supabase.from('salary_runs').select('*').eq('id', runId).single(),
      supabase.from('salary_run_lines').select('*').eq('run_id', runId).order('sort_order'),
      supabase.from('salary_neft_rows').select('*').eq('run_id', runId).order('seq'),
    ])
    if (run.error) throw run.error
    return {
      run: run.data as Run,
      lines: (lines.data ?? []) as RunLine[],
      neft: (neft.data ?? []) as NeftRowRecord[],
    }
  },

  async deleteRun(runId) {
    const { error } = await supabase.from('salary_runs').delete().eq('id', runId)
    if (error) {
      set({ error: error.message })
      toast.fail(`Could not delete: ${error.message}`)
    } else {
      await get().refreshRuns()
      toast.ok('Deleted')
    }
  },

  async refreshCompanies() {
    const { data, error } = await supabase.from('salary_companies').select('*').order('code')
    if (error) set({ error: error.message })
    else set({ companies: (data ?? []) as Company[] })
  },

  async refreshEmployees() {
    const id = get().activeCompanyId
    if (!id) return
    const { data, error } = await supabase
      .from('salary_employees')
      .select('*')
      .eq('company_id', id)
      .order('sort_order')
    if (error) set({ error: error.message })
    else set({ employees: (data ?? []) as Employee[] })
  },

  async refreshHolidays() {
    const { data, error } = await supabase.from('salary_holidays').select('*')
    if (error) set({ error: error.message })
    else set({ holidays: (data ?? []) as Holiday[] })
  },

  async refreshRuns() {
    const id = get().activeCompanyId
    if (!id) return
    const { data, error } = await supabase
      .from('salary_runs')
      .select('*')
      .eq('company_id', id)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
    if (error) set({ error: error.message })
    else set({ runs: (data ?? []) as Run[] })
  },

  async deleteBonusRun(runId) {
    const { error } = await supabase.from('salary_bonus_runs').delete().eq('id', runId)
    if (error) {
      set({ error: error.message })
      toast.fail(`Could not delete: ${error.message}`)
    } else {
      await get().refreshBonusRuns()
      toast.ok('Deleted')
    }
  },

  async refreshBonusRuns() {
    const id = get().activeCompanyId
    if (!id) return
    const { data, error } = await supabase
      .from('salary_bonus_runs')
      .select('*')
      .eq('company_id', id)
      .order('fy_start_year', { ascending: false })
    if (error) set({ error: error.message })
    else set({ bonusRuns: (data ?? []) as BonusRun[] })
  },
}))

/**
 * Cross-device sync — designed so a stale screen is never a dead end.
 *
 * Every salary table is published to Supabase Realtime, so a change made on the
 * office PC lands on the phone without a reload, and vice versa. Writes from
 * this device come back through the same channel, which is harmless: the
 * reload is idempotent and simply re-reads what was just written.
 *
 * Three layers make this "without fail" rather than "usually":
 *  1. Live updates — postgres_changes events, coalesced so that approving a
 *     month (one run, a dozen lines, ten bank rows) triggers one reload, not
 *     twenty-three.
 *  2. Reconnect with backoff — if the socket errors, times out, or is closed
 *     (phone locked, wifi dropped, tab backgrounded by the OS), a fresh
 *     channel is opened automatically, backing off from 1s up to 30s so a
 *     truly offline device doesn't hammer the server. The moment it comes
 *     back it does one full reload, because Realtime does not replay events
 *     missed while disconnected.
 *  3. A fallback poll every 45s, independent of what the socket reports. This
 *     is the belt to the reconnect logic's suspenders: if a browser ever
 *     reports a socket "connected" while no longer actually receiving events
 *     — real failure modes on flaky mobile networks — this bounds staleness
 *     to under a minute regardless.
 */
let channel: RealtimeChannel | null = null
let pending: ReturnType<typeof setTimeout> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let backoffMs = 1000
let wasOffline = false
let listenersBound = false

const MAX_BACKOFF_MS = 30_000
const FALLBACK_POLL_MS = 45_000

function reloadEverything(
  get: () => StoreState,
  set: (partial: Partial<StoreState>) => void,
): void {
  const state = get()
  void state.loadCompanyData(true)
  const month = state.attendanceMonth
  if (month) void state.loadAttendance(month.year, month.month)
  // Coming back from a gap is the moment queued marks are most likely to be
  // waiting, so every catch-up drains the outbox too.
  void flushOutbox(set)
}

function connectChannel(
  get: () => StoreState,
  set: (partial: Partial<StoreState>) => void,
): void {
  if (channel) supabase.removeChannel(channel)

  let reloadCompany = false
  let reloadAttendance = false

  const flush = () => {
    pending = null
    const state = get()
    if (reloadCompany) {
      reloadCompany = false
      void state.loadCompanyData(true)
    }
    if (reloadAttendance) {
      reloadAttendance = false
      const month = state.attendanceMonth
      if (month) void state.loadAttendance(month.year, month.month)
    }
    set({ lastSyncAt: new Date().toISOString() })
  }

  channel = supabase.channel('salary-sync')

  for (const table of SYNCED_TABLES) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => {
        if (table === 'salary_attendance') reloadAttendance = true
        else reloadCompany = true
        if (pending) clearTimeout(pending)
        pending = setTimeout(flush, 300)
      },
    )
  }

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      backoffMs = 1000
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      set({ sync: 'live', lastSyncAt: new Date().toISOString() })
      // The socket carries no memory of what happened while it was down, so
      // coming back online always means catching up in full, not trusting
      // that nothing changed.
      if (wasOffline) {
        wasOffline = false
        reloadEverything(get, set)
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      wasOffline = true
      set({ sync: 'offline' })
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
          connectChannel(get, set)
        }, backoffMs)
      }
    } else {
      set({ sync: 'connecting' })
    }
  })
}

function subscribe(
  get: () => StoreState,
  set: (partial: Partial<StoreState>) => void,
): void {
  if (channel || listenersBound) return
  listenersBound = true

  connectChannel(get, set)

  // Belt-and-suspenders: resync on a fixed clock no matter what the socket
  // reports, so staleness is always bounded even in failure modes the status
  // callback never sees.
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(() => reloadEverything(get, set), FALLBACK_POLL_MS)

  // A device that slept or lost Wi-Fi should catch up — and reconnect
  // immediately rather than wait out whatever backoff it was mid-way through
  // — the moment it has a network or a screen again.
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      backoffMs = 1000
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      connectChannel(get, set)
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      reloadEverything(get, set)
      if (get().sync !== 'live') {
        backoffMs = 1000
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
        connectChannel(get, set)
      }
    })
  }
}


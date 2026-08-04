import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { deriveAttendance } from '../calc/attendance.ts'
import { supabase } from '../lib/supabase.ts'
import type {
  AttendanceMark,
  AttendanceStatus,
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

  /** Attendance for the month currently open, keyed `${employeeId}|${iso}`. */
  attendance: Record<string, AttendanceStatus>
  attendanceMonth: { year: number; month: number } | null

  init: () => Promise<void>

  setActiveCompany: (id: string) => Promise<void>
  loadCompanyData: (silent?: boolean) => Promise<void>
  loadAttendance: (year: number, month: number) => Promise<void>
  setMark: (employeeId: string, iso: string, status: AttendanceStatus) => Promise<void>
  bulkMark: (employeeIds: string[], isoDates: string[], status: AttendanceStatus) => Promise<void>

  saveEmployee: (employee: Partial<Employee> & { id?: string }) => Promise<void>
  updateCompany: (patch: Partial<Company>) => Promise<void>
  addHoliday: (holidayOn: string, name: string) => Promise<void>
  removeHoliday: (id: string) => Promise<void>

  loadRunDetail: (runId: string) => Promise<{ run: Run; lines: RunLine[]; neft: NeftRowRecord[] }>
  deleteRun: (runId: string) => Promise<void>
  refreshRuns: () => Promise<void>
}

const key = (employeeId: string, iso: string) => `${employeeId}|${iso}`

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
  attendance: {},
  attendanceMonth: null,

  async init() {
    // No login: the app talks to Supabase as the anon role and loads straight in.
    await get().loadCompanyData()
    set({ ready: true })
    subscribe(get, set)
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

      const [employees, holidays, runs] = await Promise.all([
        supabase.from('salary_employees').select('*').eq('company_id', activeId).order('sort_order'),
        supabase.from('salary_holidays').select('*'),
        supabase
          .from('salary_runs')
          .select('*')
          .eq('company_id', activeId)
          .order('year', { ascending: false })
          .order('month', { ascending: false }),
      ])

      if (employees.error) throw employees.error
      if (runs.error) throw runs.error

      set({
        companies: list,
        activeCompanyId: activeId,
        employees: (employees.data ?? []) as Employee[],
        holidays: (holidays.data ?? []) as Holiday[],
        runs: (runs.data ?? []) as Run[],
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
    set({ attendance: map, attendanceMonth: { year, month } })
  },

  async setMark(employeeId, iso, status) {
    // Optimistic — the grid should feel instant when clicking through a month.
    set((s) => ({ attendance: { ...s.attendance, [key(employeeId, iso)]: status } }))
    const { error } = await supabase
      .from('salary_attendance')
      .upsert({ employee_id: employeeId, marked_on: iso, status }, { onConflict: 'employee_id,marked_on' })
    if (error) set({ error: error.message })
  },

  async bulkMark(employeeIds, isoDates, status) {
    const rows = employeeIds.flatMap((employeeId) =>
      isoDates.map((marked_on) => ({ employee_id: employeeId, marked_on, status })),
    )
    if (rows.length === 0) return

    set((s) => {
      const next = { ...s.attendance }
      for (const row of rows) next[key(row.employee_id, row.marked_on)] = status
      return { attendance: next }
    })

    const { error } = await supabase
      .from('salary_attendance')
      .upsert(rows, { onConflict: 'employee_id,marked_on' })
    if (error) set({ error: error.message })
  },

  async saveEmployee(employee) {
    const companyId = get().activeCompanyId
    if (!companyId) return
    const payload = { ...employee, company_id: employee.company_id ?? companyId }
    const { error } = employee.id
      ? await supabase.from('salary_employees').update(payload).eq('id', employee.id)
      : await supabase.from('salary_employees').insert(payload)
    if (error) set({ error: error.message })
    else await get().loadCompanyData()
  },

  async updateCompany(patch) {
    const id = get().activeCompanyId
    if (!id) return
    const { error } = await supabase.from('salary_companies').update(patch).eq('id', id)
    if (error) set({ error: error.message })
    else await get().loadCompanyData()
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

    if (error) set({ error: error.message })
    else await get().loadCompanyData()
  },

  async removeHoliday(id) {
    const { error } = await supabase.from('salary_holidays').delete().eq('id', id)
    if (error) set({ error: error.message })
    else await get().loadCompanyData()
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
    if (error) set({ error: error.message })
    else await get().refreshRuns()
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

function reloadEverything(get: () => StoreState): void {
  const state = get()
  void state.loadCompanyData(true)
  const month = state.attendanceMonth
  if (month) void state.loadAttendance(month.year, month.month)
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
        reloadEverything(get)
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
  pollTimer = setInterval(() => reloadEverything(get), FALLBACK_POLL_MS)

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
      reloadEverything(get)
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


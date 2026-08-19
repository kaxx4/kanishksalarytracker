import { useEffect, useState } from 'react'

import { useStore } from './store/useStore.ts'
import { useToast } from './store/useToast.ts'
import AttendancePage from './pages/AttendancePage.tsx'
import BonusPage from './pages/BonusPage.tsx'
import EmployeesPage from './pages/EmployeesPage.tsx'
import HistoryPage from './pages/HistoryPage.tsx'
import RunPage from './pages/RunPage.tsx'
import SettingsPage from './pages/SettingsPage.tsx'
import InstallPrompt from './components/InstallPrompt.tsx'

type Tab = 'attendance' | 'run' | 'bonus' | 'history' | 'employees' | 'settings'

const TABS: { id: Tab; label: string; folio: string }[] = [
  { id: 'attendance', label: 'Attendance', folio: 'I' },
  { id: 'run', label: 'Month End', folio: 'II' },
  { id: 'bonus', label: 'Bonus', folio: 'III' },
  { id: 'history', label: 'History', folio: 'IV' },
  { id: 'employees', label: 'Employees', folio: 'V' },
  { id: 'settings', label: 'Settings', folio: 'VI' },
]

export default function App() {
  const { ready, init, undo } = useStore()
  const [tab, setTab] = useState<Tab>('attendance')

  useEffect(() => {
    void init()
  }, [init])

  /*
   * Undo is bound at the app, not on the register.
   *
   * It lived on the Attendance page, which meant the shortcut existed only
   * while that page was mounted: mark a few cells, glance at Month End, come
   * back, and Ctrl+Z did nothing until the page had re-rendered. The history
   * itself is global, so the key that reaches it should be too.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const z = e.key === 'z' || e.key === 'Z'
      if (!z || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return
      // Leave the browser's own undo alone while text is being edited.
      const el = e.target as HTMLElement | null
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return
      e.preventDefault()
      void undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  if (!ready) return <Opening />

  return (
    <div className="min-h-screen">
      <InstallPrompt />
      <Masthead />
      <TabBar tab={tab} onTab={setTab} />
      <ErrorRule />
      <main className="mx-auto max-w-[1440px] px-6 py-7">
        {tab === 'attendance' && <AttendancePage />}
        {tab === 'run' && <RunPage />}
        {tab === 'bonus' && <BonusPage />}
        {tab === 'history' && <HistoryPage />}
        {tab === 'employees' && <EmployeesPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
      <Colophon />
      <Toaster />
    </div>
  )
}

/**
 * Save feedback for every write in the app — a small stamp sliding in from the
 * corner rather than a generic snackbar, so it reads as part of the ledger
 * rather than a bolted-on UI kit.
 */
function Toaster() {
  const { toasts, dismiss } = useToast()
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`rise flex max-w-sm items-center gap-2.5 border px-4 py-2.5 text-left
                      text-[0.8125rem] shadow-lift transition-opacity hover:opacity-90 ${
                        t.kind === 'success'
                          ? 'border-verdigris/40 bg-paper-raised text-ink-2'
                          : 'border-vermillion/50 bg-vermillion-wash text-vermillion-deep'
                      }`}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              t.kind === 'success' ? 'bg-verdigris' : 'bg-vermillion'
            }`}
          />
          {t.message}
        </button>
      ))}
    </div>
  )
}

function Opening() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="rise text-center">
        <div className="font-mono text-[0.625rem] uppercase tracking-stamp text-ink-3">
          Opening the register
        </div>
        <div className="mt-2 font-display text-3xl italic text-ink-4">Salary Tracker</div>
      </div>
    </div>
  )
}

/** Page head: the register's title block, set like a ledger's front matter. */
function Masthead() {
  const { companies, activeCompanyId, setActiveCompany } = useStore()
  const company = companies.find((c) => c.id === activeCompanyId)

  return (
    <header className="mx-auto max-w-[1440px] overflow-hidden px-6 pt-7">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="rise">
          <div className="font-mono text-[0.625rem] uppercase tracking-stamp text-verdigris">
            Salary&nbsp;Register
          </div>
          <h1 className="mt-1.5 font-display text-[2rem] leading-[1.05] tracking-[-0.015em] sm:text-[2.6rem]">
            {company?.name ?? '—'}
          </h1>
          <p className="mt-1.5 font-mono text-[0.6875rem] text-ink-3">
            {company?.address_line}
          </p>
        </div>

        {/* Only two entities, so a switch beats a dropdown. */}
        <div className="rise flex items-center gap-4" style={{ animationDelay: '60ms' }}>
          <SyncLamp />
          <div className="flex gap-0">
          {companies.map((c) => {
            const active = c.id === activeCompanyId
            return (
              <button
                key={c.id}
                onClick={() => void setActiveCompany(c.id)}
                className={`entity-switch border px-3.5 py-2 font-mono text-[0.6875rem] uppercase tracking-[.13em]
                  transition-colors first:rounded-l-[3px] last:rounded-r-[3px] -ml-px first:ml-0 ${
                    active
                      ? 'z-10 border-ink bg-ink text-paper-raised'
                      : 'border-rule-strong bg-paper-raised text-ink-3 hover:text-ink'
                  }`}
              >
                {c.code}
              </button>
            )
          })}
          </div>
        </div>
      </div>

      {/* The double rule that closes a ledger's header block. */}
      <div className="mt-5 border-b-[3px] border-double border-rule-strong" />
    </header>
  )
}

/**
 * Sync lamp. Live means this device is receiving changes made anywhere else;
 * offline means it is showing a snapshot and may be stale.
 */
function SyncLamp() {
  const { sync, lastSyncAt, unsavedMarks, flushMarks } = useStore()

  const seen = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null

  /*
   * A queued mark outranks the socket's opinion. The connection can read
   * "Live" while a write is still waiting to be accepted, and the thing worth
   * knowing is always whether today's marks have actually landed — so the
   * backlog takes over the lamp until it drains, and stays put rather than
   * flashing past like a toast.
   */
  if (unsavedMarks > 0) {
    return (
      <button
        onClick={() => void flushMarks()}
        className="inline-flex items-center gap-1.5 font-mono text-[0.625rem] uppercase
                   tracking-[.13em] text-ochre transition-colors hover:text-ink"
        title={
          `${unsavedMarks} mark${unsavedMarks === 1 ? '' : 's'} not yet saved. ` +
          'They are held safely and retried automatically, and survive closing ' +
          'this tab. Click to retry now.'
        }
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ochre" />
        {unsavedMarks} unsaved
      </button>
    )
  }

  const { dot, text, label } = {
    live: { dot: 'bg-verdigris', text: 'text-ink-3', label: 'Live' },
    connecting: { dot: 'bg-ochre animate-pulse', text: 'text-ochre', label: 'Connecting' },
    offline: { dot: 'bg-vermillion', text: 'text-vermillion', label: 'Offline' },
  }[sync]

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[0.625rem] uppercase
                  tracking-[.13em] ${text}`}
      title={
        sync === 'live'
          ? `All marks saved${seen ? ` · last change ${seen}` : ''}`
          : 'Changes made elsewhere may not be showing'
      }
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="sticky top-0 z-20 border-b border-rule bg-paper/95 backdrop-blur-sm">
      {/*
        Six tabs do not fit across a phone. The strip scrolls within itself —
        `shrink-0` stops flexbox squeezing the labels into two lines — so the
        page body never picks up a horizontal scrollbar of its own. The bar is
        sticky, and a sideways-scrolling page under a sticky header is what
        made every screen drift off-centre on mobile.
      */}
      <div
        className="mx-auto flex max-w-[1440px] gap-5 overflow-x-auto px-6 sm:gap-7
                   [-ms-overflow-style:none] [scrollbar-width:none]
                   [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map(({ id, label, folio }) => {
          const active = tab === id
          return (
            <button
              key={id}
              onClick={() => onTab(id)}
              className={`tab-link group relative flex shrink-0 items-baseline gap-2 py-3 font-mono
                text-[0.6875rem] uppercase tracking-[.13em] transition-colors ${
                  active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
                }`}
            >
              <span className={active ? 'text-verdigris' : 'text-ink-4'}>{folio}</span>
              {label}
              <span
                className={`absolute inset-x-0 -bottom-px h-[2px] transition-transform duration-200 ${
                  active ? 'scale-x-100 bg-verdigris' : 'scale-x-0 bg-rule-strong'
                } group-hover:scale-x-100`}
              />
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function ErrorRule() {
  const { error } = useStore()
  if (!error) return null
  return (
    <div className="border-b border-vermillion/30 bg-vermillion-wash">
      <div className="mx-auto max-w-[1440px] px-6 py-2 font-mono text-[0.6875rem] text-vermillion-deep">
        {error}
      </div>
    </div>
  )
}

function Colophon() {
  return (
    <footer className="mx-auto max-w-[1440px] px-6 pb-10">
      <div className="border-t border-rule pt-3 font-mono text-[0.625rem] uppercase tracking-[.13em] text-ink-4">
        Calcutta Traders · M.K. Cycles (P) Ltd — Kolkata
      </div>
    </footer>
  )
}

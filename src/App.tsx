import { useEffect, useState } from 'react'

import { useStore } from './store/useStore.ts'
import { useToast } from './store/useToast.ts'
import AttendancePage from './pages/AttendancePage.tsx'
import BonusPage from './pages/BonusPage.tsx'
import EmployeesPage from './pages/EmployeesPage.tsx'
import HistoryPage from './pages/HistoryPage.tsx'
import RunPage from './pages/RunPage.tsx'
import SettingsPage from './pages/SettingsPage.tsx'

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
  const { ready, init } = useStore()
  const [tab, setTab] = useState<Tab>('attendance')

  useEffect(() => {
    void init()
  }, [init])

  if (!ready) return <Opening />

  return (
    <div className="min-h-screen">
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
                      text-[13px] shadow-lift transition-opacity hover:opacity-90 ${
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
        <div className="font-mono text-[10px] uppercase tracking-stamp text-ink-3">
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
    <header className="mx-auto max-w-[1440px] px-6 pt-7">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="rise">
          <div className="font-mono text-[10px] uppercase tracking-stamp text-verdigris">
            Salary&nbsp;Register
          </div>
          <h1 className="mt-1.5 font-display text-[2.6rem] leading-[1.05] tracking-[-0.015em]">
            {company?.name ?? '—'}
          </h1>
          <p className="mt-1.5 font-mono text-[11px] text-ink-3">
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
                className={`border px-3.5 py-2 font-mono text-[11px] uppercase tracking-[.13em]
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
  const { sync, lastSyncAt } = useStore()

  const { dot, text, label } = {
    live: { dot: 'bg-verdigris', text: 'text-ink-3', label: 'Live' },
    connecting: { dot: 'bg-ochre animate-pulse', text: 'text-ochre', label: 'Connecting' },
    offline: { dot: 'bg-vermillion', text: 'text-vermillion', label: 'Offline' },
  }[sync]

  const seen = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase
                  tracking-[.13em] ${text}`}
      title={
        sync === 'live'
          ? `Synced across devices${seen ? ` · last change ${seen}` : ''}`
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
      <div className="mx-auto flex max-w-[1440px] gap-7 px-6">
        {TABS.map(({ id, label, folio }) => {
          const active = tab === id
          return (
            <button
              key={id}
              onClick={() => onTab(id)}
              className={`group relative flex items-baseline gap-2 py-3 font-mono text-[11px]
                uppercase tracking-[.13em] transition-colors ${
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
      <div className="mx-auto max-w-[1440px] px-6 py-2 font-mono text-[11px] text-vermillion-deep">
        {error}
      </div>
    </div>
  )
}

function Colophon() {
  return (
    <footer className="mx-auto max-w-[1440px] px-6 pb-10">
      <div className="border-t border-rule pt-3 font-mono text-[10px] uppercase tracking-[.13em] text-ink-4">
        Calcutta Traders · M.K. Cycles (P) Ltd — Kolkata
      </div>
    </footer>
  )
}

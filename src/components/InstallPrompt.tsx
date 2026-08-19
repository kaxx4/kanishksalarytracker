import { useEffect, useState } from 'react'

const DISMISS_KEY = 'salary-install-dismissed-at'
const DISMISS_DAYS = 14

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own flag — it never fires display-mode: standalone.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function recentlyDismissed() {
  const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
  return at > 0 && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000
}

/**
 * A ledger-styled banner offering to install the app — the browser's own
 * `beforeinstallprompt` on desktop and Android, a plain instruction on iOS
 * Safari, which never fires that event. Silent once installed or dismissed.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIOS, setShowIOS] = useState(false)
  const [dismissed, setDismissed] = useState(recentlyDismissed())

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    if (isIOS()) setShowIOS(true)

    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDismissed(true)
  }

  if (dismissed || isStandalone() || (!deferred && !showIOS)) return null

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') setDeferred(null)
    dismiss()
  }

  return (
    <div className="border-b border-rule bg-paper-raised">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-6 py-2.5">
        <div className="flex items-center gap-2.5">
          <img src="/icon-192.png" alt="" className="h-6 w-6 rounded-[3px]" />
          <span className="font-mono text-[0.6875rem] uppercase tracking-[.1em] text-ink-2">
            {deferred
              ? 'Install Salary Tracker as an app'
              : 'Add to Home Screen: Share ⎋ then "Add to Home Screen"'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {deferred && (
            <button
              onClick={() => void install()}
              className="border border-ink bg-ink px-3 py-1 font-mono text-[0.625rem] uppercase
                         tracking-[.13em] text-paper-raised transition-colors hover:bg-ink/85"
            >
              Install
            </button>
          )}
          <button
            onClick={dismiss}
            className="font-mono text-[0.625rem] uppercase tracking-[.13em] text-ink-3 hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

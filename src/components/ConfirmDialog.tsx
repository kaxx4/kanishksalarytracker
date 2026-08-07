import { useEffect, useState } from 'react'

/**
 * A confirmation modal for actions that wipe or overwrite recorded data.
 *
 * The confirm button stays disabled for a few seconds and counts down out
 * loud, so a reflexive double-click on "Clear month" can't take effect before
 * the person has actually read what it does.
 */
export function ConfirmDialog({
  title, body, confirmLabel = 'Confirm', tone = 'vermillion', countdownSeconds = 3,
  onConfirm, onCancel,
}: {
  title: string
  body: string
  confirmLabel?: string
  tone?: 'vermillion' | 'ink'
  countdownSeconds?: number
  onConfirm: () => void
  onCancel: () => void
}) {
  const [remaining, setRemaining] = useState(countdownSeconds)

  useEffect(() => {
    if (remaining <= 0) return
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining])

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-ink/30 p-4 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <div
        className="rise leaf w-full max-w-sm p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-xl leading-tight">{title}</h3>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-2">{body}</p>

        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={tone === 'vermillion' ? 'btn-primary !bg-vermillion !border-vermillion' : 'btn-primary'}
            disabled={remaining > 0}
            onClick={onConfirm}
          >
            {remaining > 0 ? `Wait ${remaining}s…` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

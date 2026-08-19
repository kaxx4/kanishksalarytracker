/**
 * The autosave equivalent of the masthead's sync lamp: what state an edit is
 * in before it's safely on the server, so the quiet 900ms debounce window
 * isn't invisible. Editing -> Saving -> Saved, in the same order a keystroke
 * actually moves through.
 */
export function AutosaveStatus({
  dirty, saving, savedAt,
}: {
  dirty: boolean
  saving: boolean
  savedAt: string | null
}) {
  if (saving) {
    return (
      <span className="ml-auto inline-flex items-center gap-1.5 normal-case tracking-normal text-ochre">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ochre" />
        Saving…
      </span>
    )
  }
  if (dirty) {
    return (
      <span className="ml-auto inline-flex items-center gap-1.5 normal-case tracking-normal text-ink-3">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-4" />
        Editing — saves in a moment
      </span>
    )
  }
  if (savedAt) {
    return (
      <span className="ml-auto inline-flex items-center gap-1.5 normal-case tracking-normal text-verdigris">
        <span className="h-1.5 w-1.5 rounded-full bg-verdigris" />
        Saved {savedAt}
      </span>
    )
  }
  return null
}

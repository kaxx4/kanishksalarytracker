import { supabase } from './supabase.ts'

type Row = Record<string, unknown>

/** The bit of an inserted line row the NEFT rows need to point at. */
export type InsertedLine = { id: string; employee_id: string | null }

/**
 * Swap a run's line rows and NEFT rows for a freshly computed set.
 *
 * There is no unique key on (run_id, employee_id) — the roster can change
 * between saves — so the only way to replace a run's lines is to delete them
 * and insert the new ones. supabase-js has no client-side transaction, so a
 * failure between those two steps would leave the run with a header carrying
 * real totals and no lines behind it. On an approved month that is silent
 * data loss, and this app has already lost one real record to a careless
 * overwrite, so the old rows are snapshotted first and put back verbatim
 * (original ids and all, which keeps the NEFT rows' foreign keys valid) if
 * anything downstream fails.
 *
 * Throws on failure, having restored what was there before; the caller reports
 * it. A successful return means the new lines and NEFT rows are both committed.
 */
export async function replaceRunLines({
  linesTable,
  neftTable,
  runId,
  lines,
  neftRowsFor,
}: {
  linesTable: string
  neftTable: string
  runId: string
  lines: Row[]
  neftRowsFor: (inserted: InsertedLine[]) => Row[]
}): Promise<void> {
  const [oldLines, oldNeft] = await Promise.all([
    supabase.from(linesTable).select('*').eq('run_id', runId),
    supabase.from(neftTable).select('*').eq('run_id', runId),
  ])
  if (oldLines.error) throw oldLines.error
  if (oldNeft.error) throw oldNeft.error

  /** Put the previous rows back, lines first so the NEFT foreign keys resolve. */
  async function restore() {
    await supabase.from(linesTable).delete().eq('run_id', runId)
    if (oldLines.data?.length) await supabase.from(linesTable).insert(oldLines.data)
    if (oldNeft.data?.length) await supabase.from(neftTable).insert(oldNeft.data)
  }

  // NEFT rows cascade off the lines, but clearing them explicitly keeps the
  // order of operations obvious rather than relying on the foreign key.
  await supabase.from(neftTable).delete().eq('run_id', runId)
  const cleared = await supabase.from(linesTable).delete().eq('run_id', runId)
  if (cleared.error) {
    await restore()
    throw cleared.error
  }

  const inserted = await supabase.from(linesTable).insert(lines).select()
  if (inserted.error) {
    await restore()
    throw inserted.error
  }

  const neftPayload = neftRowsFor((inserted.data ?? []) as InsertedLine[])
  if (neftPayload.length) {
    const { error } = await supabase.from(neftTable).insert(neftPayload)
    if (error) {
      await restore()
      throw error
    }
  }
}

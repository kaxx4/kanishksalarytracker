/**
 * HDFC bulk-NEFT row builder.
 *
 * The bank's bulk upload needs at least MIN_NEFT_ROWS transactions in the file.
 * With only 7-9 people actually paid by transfer, the existing workbooks pad the
 * file by splitting somebody's payment across several rows to the same account —
 * e.g. Avijit Pal's 18,630 went out as 10,000 + 4,000 + 4,630.
 *
 * Which employee gets split is ad-hoc in the historical files (Surajit's 30,620
 * was left whole while smaller amounts were cut up), so there is no rule to
 * recover. This module applies a predictable default — work up from the bottom
 * of the list, peeling off 10,000 at a time — and the UI lets the split be
 * edited by hand before the file is generated. What the bank actually checks is
 * the row count and the total per account, both of which hold either way.
 */

export const MIN_NEFT_ROWS = 10
export const PREFERRED_CHUNK = 10000

export interface PaymentInput {
  employeeId: string
  beneficiaryName: string
  ifsc: string
  accountNo: string
  accountType: string
  amount: number
}

export interface NeftRow extends PaymentInput {
  /** Index of the source payment, so splits stay grouped in order. */
  paymentIndex: number
}

export interface SplitResult {
  rows: NeftRow[]
  /** True when the file still has fewer than minRows after splitting. */
  short: boolean
  warning?: string
}

/**
 * Decide how to cut a single amount into two rows.
 * Above the chunk size we peel off exactly one chunk; below it we halve and
 * round the first part down to a whole thousand, which is what the workbooks do
 * (8,630 became 4,000 + 4,630).
 *
 * `chunk` is a per-company setting (`neft_split_chunk`, default 10,000) rather
 * than a fixed constant, since a smaller company might prefer smaller cuts.
 */
export function splitAmount(amount: number, chunk: number = PREFERRED_CHUNK): [number, number] | null {
  if (amount > chunk) return [chunk, amount - chunk]
  const half = Math.floor(amount / 2 / 1000) * 1000
  if (half <= 0 || amount - half <= 0) return null
  return [half, amount - half]
}

export function buildNeftRows(
  payments: PaymentInput[],
  minRows: number = MIN_NEFT_ROWS,
  chunk: number = PREFERRED_CHUNK,
): SplitResult {
  const groups = payments.map((p) => ({ payment: p, chunks: [p.amount] }))
  let rowCount = groups.length

  // Walk the list bottom-up, splitting the largest chunk in each group, and
  // loop until the row count is met or nothing can be cut any further.
  let madeProgress = true
  while (rowCount < minRows && madeProgress) {
    madeProgress = false
    for (let i = groups.length - 1; i >= 0 && rowCount < minRows; i--) {
      const chunks = groups[i].chunks
      let largestIdx = 0
      for (let c = 1; c < chunks.length; c++) {
        if (chunks[c] > chunks[largestIdx]) largestIdx = c
      }
      const split = splitAmount(chunks[largestIdx], chunk)
      if (!split) continue
      chunks.splice(largestIdx, 1, split[0], split[1])
      rowCount++
      madeProgress = true
    }
  }

  const rows: NeftRow[] = []
  groups.forEach((group, paymentIndex) => {
    for (const amount of group.chunks) {
      rows.push({ ...group.payment, amount, paymentIndex })
    }
  })

  const short = rows.length < minRows
  return {
    rows,
    short,
    warning: short
      ? `Only ${rows.length} rows could be produced; HDFC needs at least ${minRows}. ` +
        `Add another beneficiary or split an amount manually.`
      : undefined,
  }
}

/** Sanity check: every beneficiary's split rows must still add up. */
export function verifyTotals(payments: PaymentInput[], rows: NeftRow[]): boolean {
  return payments.every((p, index) => {
    const total = rows
      .filter((r) => r.paymentIndex === index)
      .reduce((sum, r) => sum + r.amount, 0)
    return total === p.amount
  })
}

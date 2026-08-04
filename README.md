# Salary Tracker — Calcutta Traders / M.K. Cycles (P) Ltd

Attendance register → month-end salary calculation → bank letter, bulk NEFT file
and pay slips. Replaces `CT/MKCP SALARY CALCULATOR.xlsx`, `SALARY LETTERS.xlsx`
and the hand-built `Bulk NEFT_NON_HDFC_format.xls` files.

## Running it

```bash
npm run dev
```

Opens on <http://localhost:5183>. There is no login — the app loads straight
into the attendance register.

> **Before hosting this anywhere public, put auth back.** With no login the
> tables are open to the `anon` role, and the publishable key is embedded in the
> client bundle, so anyone holding that key can read and write pay figures and
> bank account numbers through the Supabase API. That is a narrow exposure while
> it runs on one machine and a serious one the moment it is deployed — including
> to Vercel, below.

## Deploying to Vercel

`vercel.json` is already set up (Vite framework preset, `dist` as the output
directory). Import the GitHub repo in Vercel, then add these two environment
variables in the project's Settings → Environment Variables — do **not** commit
a `.env` file; Vercel injects these at build time:

```
VITE_SUPABASE_URL=https://vmkytsytxlofjyeotmgb.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_XX7fJo6TWeYE_1bf6i7wRA_RD26SGRq
```

That key is Supabase's *publishable* key — designed to sit in client-side code,
not a secret in the way a service-role key is. The real exposure is the one
above: no login means anyone with that key can read and write through the
Supabase API, which is why auth should go back in before this is live on a
public URL.

## How the calculation works

Every rule below was recovered from the existing workbooks, not invented, and is
pinned by tests that reproduce the signed July-2026 bank letters to the rupee
(CT ₹1,10,785 · MKCP ₹1,20,269).

| Step | Rule |
| --- | --- |
| Working days | Calendar days less weekly offs and holidays (July 2026 → 27) |
| Tiffin | rate × (working days − absence × half-day weight), tiffin-eligible staff only |
| Gross | `monthly pay × (divisor days − absence + leave pay) ÷ divisor days + tiffin` |
| P-Tax | configurable slabs, charged on the **month's actual gross** |
| Net | gross − P-Tax − TDS |
| Payable | net − advance, then rounded per the company's rule and unit |
| Bank file | ≥ N rows (configurable minimum); larger payments split to reach it |

**Every one of those rules is a per-company setting under Settings, not a
constant in the code:**

- **Divisor basis** — calendar days or working days. Two different day counts
  are used on purpose by default: absence and tiffin run on working days while
  the salary divisor uses calendar days, because that is what the workbooks
  do. Switching the divisor to working days raises the per-day rate, so
  absence costs the employee more.
- **Tiffin rate** — rupees per day present, applied only to tiffin-eligible
  employees.
- **Half-day weight** — how much of a day a half-day mark counts against
  attendance (default 0.5: half absent, half present). A paid-leave day always
  counts as a full absence *and* is credited back through leave pay,
  independent of this setting, which is why it earns no tiffin (Shambhu: 5
  absent, 5 leave pay, full salary).
- **Weekly off** — which weekdays are non-working, per company.
- **Holidays** — festival/company holidays, added or removed from Settings.
  Each one removes a day from working days the same way a weekly off does.
- **P-Tax slabs** — bands are contiguous by construction: only the upper bound
  is entered and the lower bound is derived, with the last band always
  open-ended, so no level of gross can be left uncovered. Edits are staged and
  only written once they validate, and a warning (not a block) appears if the
  top band would exceed the ₹2,500/year Article 276 cap. *Restore W.B.
  schedule* puts the statutory table back.
- **Rounding** — rule (up / nearest / down) and unit (nearest rupee or nearest
  ten), applied to the final payable before it reaches the bank file. Up to
  the rupee is the historical default — the workbooks never shorted an
  employee by rounding down.
- **Minimum bank-file rows** and **split-chunk size** — how many transactions
  HDFC's bulk upload requires, and how large a chunk a bigger payment is
  peeled into to help reach that minimum.

None of this touches a month already approved. History reads the figures a run
was actually saved with, not a live recalculation — so changing a setting later
never rewrites a past month; it only changes what the *next* month you prepare
comes out to.

### Corrections applied

- The MKCP workbook's P-Tax formula was missing the top slab (above ₹40,000 →
  ₹200), under-deducting ₹50/month. Both companies now use the full WB schedule.
- Director TDS was being entered as a negative tiffin figure. It is now a
  separate TDS field; the net is unchanged.

## Syncing across devices

All seven tables are published to Supabase Realtime, so a change made on one
device appears on every other open device within about a second — no reload.
The lamp beside the company switch shows **Live**, **Connecting** or
**Offline**. Three layers make this hold up rather than just usually work:

1. **Live updates** — postgres_changes events, coalesced so that approving a
   month (one run, a dozen lines, ten bank rows) triggers one reload, not
   twenty-three.
2. **Reconnect with backoff** — if the socket errors, times out, or closes
   (phone locked, wifi dropped), a fresh channel opens automatically, backing
   off from 1s up to 30s. The moment it reconnects it does one full reload,
   because Realtime does not replay events missed while disconnected — this
   was verified by writing a change directly to the database while a test
   session was deliberately disconnected, and confirming it appeared the
   instant the socket came back, no page reload involved.
3. **A 45-second fallback poll**, independent of what the socket reports —
   the belt to the reconnect logic's suspenders, bounding staleness to under a
   minute even in failure modes the socket's own status never surfaces.

A device also resyncs the moment it comes back online or its tab becomes
visible again, so a laptop that slept catches up on wake.

## Daily use

**Attendance** — one row per employee, one column per day. Unmarked working days
count as present, so a clean month needs no clicking; you only record exceptions.
Click a cell to cycle Present → Absent → Half day → Paid leave.

**Month End** — pick the month, and absence and leave pay are pulled from the
register. Any figure can be overridden inline (edited cells turn amber). Enter
the cheque number, check the bank-file row count, then print the letter, the
summary and the pay slips, and download the `.xls` for net banking.

**History** — every past month with its lines and bank rows. Anything can be
reprinted. Jun 2026, Jul 2026 (CT) and Jul 2026 (MKCP) are already imported.

## Data

Supabase project `vmkytsytxlofjyeotmgb` (mkcycles-mobile), tables prefixed
`salary_`. RLS is enabled on all seven, with a policy open to `anon` because the
app has no login (see the warning above). Schema lives in
`supabase/migrations/`.

## Tests

```bash
npm test
```

26 tests across four files. `payroll.test.ts` reproduces both companies'
July-2026 runs and pins the configurable rounding rules and split-chunk sizes;
`attendance.test.ts` pins half-day weighting in isolation; `neftFile.test.ts`
compares the generated bank file cell-by-cell against the file actually
uploaded on 04.08.2026.

## Known gaps

- **Bonus runs are not handled** — out of scope by request. The Aug-2025 bonus
  files used a different account (`12428620000032`) and were not imported.
- **Jun 2026 has amounts only.** Only the bank file survives for that month, so
  there is no per-employee absence/tiffin breakdown behind it.
- **Split allocation differs from history.** The bank only checks the row count
  and the total per account, both of which hold; but where the historical files
  cut Avijit into 3 rows and Rahul into 2, the app spreads the same total over
  the bottom three payees. Use *Edit splits manually* to match exactly.
- **The `.xls` is written as BIFF8** via SheetJS. If net banking ever rejects it,
  the `.csv` fallback button produces the same rows.

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
> it runs on one machine and a serious one the moment it is deployed.

## How the calculation works

Every rule below was recovered from the existing workbooks, not invented, and is
pinned by tests that reproduce the signed July-2026 bank letters to the rupee
(CT ₹1,10,785 · MKCP ₹1,20,269).

| Step | Rule |
| --- | --- |
| Working days | Calendar days less Sundays and holidays (July 2026 → 27) |
| Tiffin | ₹10 × (working days − absence), only for tiffin-eligible staff |
| Gross | `monthly pay × (calendar days − absence + leave pay) ÷ calendar days + tiffin` |
| P-Tax | West Bengal slabs, charged on the **month's actual gross** |
| Net | gross − P-Tax − TDS |
| Payable | net − advance, then **rounded up** to the whole rupee |
| Bank file | ≥ 10 rows; larger payments are split to reach the minimum |

Two different day counts are used on purpose: absence and tiffin run on **working
days**, while the salary divisor uses **calendar days**. That is what the
workbooks do. The divisor can be switched to working days in Settings — it
raises the per-day rate, so absence costs the employee more. Approved months are
never recalculated.

A paid-leave day counts as an absence *and* is credited back through leave pay,
which is why it earns no tiffin (Shambhu: 5 absent, 5 leave pay, full salary).

P-Tax slabs are editable per company under Settings. Bands are contiguous by
construction — only the upper bound is entered and the lower bound is derived,
with the last band always open-ended, so no level of gross can be left
uncovered. Edits are staged and only written once they validate, and a warning
appears if the top band would exceed the ₹2,500/year Article 276 cap (a warning,
not a block). *Restore W.B. schedule* puts the statutory table back.

### Corrections applied

- The MKCP workbook's P-Tax formula was missing the top slab (above ₹40,000 →
  ₹200), under-deducting ₹50/month. Both companies now use the full WB schedule.
- Director TDS was being entered as a negative tiffin figure. It is now a
  separate TDS field; the net is unchanged.

## Syncing across devices

All seven tables are published to Supabase Realtime, so a change made on one
device appears on every other open device within about a second — no reload. The
lamp beside the company switch shows **Live**, **Connecting** or **Offline**;
when it reads Offline the screen is a snapshot and may be stale. A device also
re-reads when it comes back online or when its tab becomes visible again, so a
laptop that slept catches up on wake.

Bursts are coalesced: approving a month writes a run, a dozen run lines and ten
bank rows at once, which is one refresh rather than twenty-three.

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

15 tests. `payroll.test.ts` reproduces both companies' July-2026 runs;
`neftFile.test.ts` compares the generated bank file cell-by-cell against the file
actually uploaded on 04.08.2026.

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

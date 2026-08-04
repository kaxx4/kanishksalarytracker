# Session Handoff — Salary Tracker

## Update (next session, same day)

All items in "What's still open" below were implemented and committed:
- Bonus feature: schema (`0005_salary_bonus.sql`), engine (`src/calc/bonus.ts`,
  pinned against the FY2024-25 reference figures below), and a Bonus tab
  (`src/pages/BonusPage.tsx`). Verified end-to-end in the browser for both
  companies and via a real save/delete round-trip against the live DB.
  Deviation from the original per-month-grid idea: the UI shows one row per
  employee (months found / auto wage / manual add-on / annual wage / bonus)
  rather than 12 editable month columns — simpler to use, same auto-pull +
  manual-entry behaviour the plan asked for.
- CT May 2026 and MKCP June 2026 imported as historical runs, matching the
  register totals cited below exactly.
- Every calc setting (including the new bonus rate/round-rule) confirmed
  editable and synced — `salary_bonus_*` tables added to `SYNCED_TABLES`.
- UI softened: vermillion pulled back to real errors/destructive actions only
  (offline lamp, failed-save toasts, "Clear month"); verdigris now carries
  active-tab state, focus rings, selection, and routine totals.
- Form M pay register added (`renderFormM` in `documents.ts`, wired into
  Month End and History). Built from the textual spec below, not the actual
  WhatsApp photos — that zip wasn't present in `Downloads` this session
  (`BONUS CALCULATION.xls` was also missing; the bonus formula was instead
  pinned directly against the reference figures already written out below).
  Worth a visual check against the original photos if they turn up again.


Written mid-task so a fresh session (or agent) can pick up exactly where this
one stopped. Read this before touching anything — several items below aren't
in the code yet and would otherwise get silently dropped or re-derived badly.

## Where things stand

**Committed and pushed** (github.com/kaxx4/kanishksalarytracker, `main`):
everything through the ledger redesign, per-company round rule / round unit /
NEFT split chunk, and the resilient realtime sync (reconnect + backoff +
45s fallback poll). That work is done and verified.

**Uncommitted, done and verified this session** (`git status` shows these
modified/new — do not revert):
- Half-day removed completely. Attendance is present/absent/paid-leave only.
  `half_day_weight` column dropped, `deriveAttendance` no longer takes a
  weight argument, DB check constraint tightened. Confirmed zero `half_day`
  rows existed before dropping, so no data was lost.
- App now defaults to the **current calendar month** on open (Attendance and
  Month End both), not the previous month. `currentMonth()` in `lib/month.ts`.
- Toast system: `src/store/useToast.ts` + `<Toaster/>` in `App.tsx`. Every
  write in `useStore.ts` (marks, employee save, company settings, holidays,
  run save/approve, run delete) now reports success or failure through it.
  `setMark`/`bulkMark` also roll back their optimistic update on failure so
  the screen never shows a mark that didn't actually save.
- Drag-to-paint multi-select in the attendance grid. Mousedown on a cell picks
  the next status (same cycle rule as a single click), dragging over further
  cells (same row or across rows) paints them the same status, mouseup fires
  **one** `bulkMark` for everything touched. Verified with synthetic
  mousedown/mouseover/mouseup events (native `mouseenter` doesn't bubble and
  won't trigger React's synthetic `onMouseEnter` — had to use `mouseover`),
  confirmed the Abs/Lv totals update live during the drag, confirmed it
  survives a reload. Test data cleaned up afterwards — DB is clean.
- Clear-month button now opens `src/components/ConfirmDialog.tsx`, a reusable
  confirm modal whose confirm button is disabled for a 3-second countdown.
- Fixed a real data bug found while checking on all this: MKCP July 2026 had
  been silently overwritten to a draft (₹1,01,936, no cheque no.) by earlier
  scratch testing of the Month End screen, clobbering the real approved run
  (cheque 000614, ₹1,20,269 — matches the signed letter). Restored it exactly.
  **Lesson for later work**: `RunPage.save()` upserts on
  `(company_id, year, month)`, so opening Month End on an already-approved
  month and clicking Save/Approve again will overwrite it. Consider a
  confirmation step there too, similar to Clear Month, before this bites again.

All 24 tests pass, `tsc --noEmit` is clean, `npm run build` succeeds.

## What's still open, in the order I'd do them

### 1. Bonus feature (the big one)

**The formula, reverse-engineered and confirmed exact against real payouts —
do not re-derive this, it's already verified:**

```
monthly bonus wage = payable + ptax − tiffin   (for a month with a saved run)
annual bonus wage   = sum of that figure for the 12 FY months, April→March
bonus                = annual bonus wage × rate, rounded to nearest rupee
```

This matches the "salary with P.Tax added back and tiffin minused" the user
asked for, and it is the Payment of Bonus Act's actual definition of
bonus-eligible wage (excludes special allowances like tiffin, includes what
P.Tax would otherwise have deducted). Verified two ways:
- `payable + ptax − tiffin` reduces to `gross − tiffin` when TDS/advance are
  zero, which is just the prorated base pay before the tiffin allowance.
- Checked against `BONUS CALCULATION.xls` (original at
  `C:\Users\kanis\Downloads\BONUS CALCULATION.xls`, sheets `19-20` through
  `24-25`, one per financial year): **every single year uses a flat 16.5%
  rate**, and the FY2024-25 sheet's bonus figures match the actual Aug-2025
  bonus NEFT payouts already in this app's `salary_neft_rows` to the rupee
  (e.g. Surajit Pal 60,996.87 → paid 60,997; Sukumar Sardar 24,939.585 → paid
  24,940). Rounding observed is **nearest**, not the monthly-payroll default
  of always-up (e.g. Ranjit Rajbanshi 27,226.32 was paid 27,226, not 27,227).

Make rate and round-rule per-company, per-financial-year settings — don't
hardcode 16.5%, just default new bonus runs to it.

There's also a `LOCKDOWN` sheet (FY2020-21 only) that recomputes April+May as
a flat lockdown figure and tracks PAID vs DUE against the normal bonus. That's
a one-off historical adjustment, not a recurring rule — don't build it as a
feature, just know it exists if the user ever asks about that specific year.

**Not yet built**: schema (`salary_bonus_runs`, `salary_bonus_lines`,
`salary_bonus_neft_rows` — mirror the existing `salary_runs` family, RLS open
+ realtime published like the rest), the payroll-engine function (pure,
tested, before touching UI — same pattern as `payroll.ts`), and a Bonus tab:
pick a financial year, auto-pull the wage figure from each month's saved
`salary_run_lines` where a run exists, let the user type the figure by hand
for months with no saved run, show the per-month grid + annual total + bonus,
then reuse the existing NEFT-file/letter/summary export machinery.

Six years of real reference data (all in `BONUS CALCULATION.xls`) for
validation once the engine exists — re-open that file rather than re-typing
these, but for quick reference, FY2024-25 CT: Dinesh Ram gross 138,530 → bonus
22,857.45 (paid 22,857); Surajit Pal gross 369,678 → bonus 60,996.87 (paid
60,997). FY2024-25 MKCP: Satinder Rajbanshi gross 157,580 → bonus 26,000.7
(paid 26,001).

### 2. Historical months from the WhatsApp photos

Original zip: `C:\Users\kanis\Downloads\WhatsApp Unknown 2026-08-04 at
11.01.19 AM.zip` — 7 photos of the statutory Form M pay registers. These are
**not** the bonus data; they corroborate monthly salary figures already in
the calculator, and reveal two months not yet imported:

- **CT May 2026** (amounts-only, same pattern as the existing CT Jun 2026
  import): Dinesh Ram 3,096 · Sukumar Sardar 14,844 · Surajit Pal 35,590 ·
  Birender Kr Shaw 15,600 · Bapi Mondal 12,053 · Avijit Pal 18,600 · Vikash
  Kumar Rao 14,847 · Rahul Sarkar 14,870 · Abhishek Kumar 3,371. Salary total
  132,871 + P.Tax 850 = grand total 133,721 (matches the register's own sum).
  No cheque number legible in the photo.
- **MKCP June 2026** (amounts-only): Satinder Rajbanshi 15,520 · Ranjit
  Rajbanshi 15,520 · Shambhu Prasad Singh 15,520 · Mahesh Ram 15,520 ·
  Shatrudahan 15,520 · Bharat Ram 15,520 · Ramnaresh Bhagat 11,224 · Sunil
  Kumar Tiwari 15,600. Salary total 119,944 + P.Tax 1,020 = grand total
  120,964. No cheque number legible.

Import both the same way the existing `salary_runs`/`salary_run_lines` rows
for CT Jun 2026 were seeded (`is_historical = true`, `status = 'approved'`,
notes citing the Form M register as source, no per-employee absence/tiffin
breakdown since the photo doesn't show it — amounts only).

**Correction**: I initially thought there was an MKCP April 2026 photo too —
there isn't. Only one MKCP month (June 2026) is in the photo set. Don't go
looking for April data that isn't there.

### 3. Remaining tasks from this batch, not yet started

- **Audit every calc setting is actually editable + synced.** Round rule/unit,
  split chunk, and the rest were made editable earlier this session — but
  once the bonus rate/round-rule settings exist, re-audit the full list and
  actually test cross-device sync with a simulated second device (direct SQL
  write, confirm the open browser updates without reload — this session did
  that successfully for `monthly_pay` earlier; repeat for whatever's new).
- **Soften the UI toward "pleasing and soothing."** The user explicitly asked
  for this and it hasn't been touched — the ledger redesign leans hard on
  vermillion for structure (tab underline, active states, sync-offline dot),
  which reads as more alarming than the intended "reserved for real errors."
  Before touching CSS, load these three skills (the user named them
  explicitly): `make-interfaces-feel-better`, `interface-details`,
  `agency-agents:design-ui-designer`. Likely direction: keep the paper/ink/
  serif ledger identity, but pull vermillion back to true errors/destructive
  actions only, introduce a calmer accent for normal active/selected states
  (the existing verdigris green is already used for "approved"/"live" and
  could absorb more of that role), soften shadows and motion.
- **Form M (Rule 30) pay register export.** The user wants this generated as
  a proper document — bilingual Bengali/English header block exactly like the
  photographed template (Form M, See Rule 30 / ফরম এম, ৩০ বিধি দ্রষ্টব্য),
  "PAY REGISTER / বেতনের হিসাব বহি" title, the columns Name of Persons
  employed / Rate of wages / Additional wages for overtime / Deductions if any
  and reasons therefor / Total amount paid as wages / Signature of the
  persons employee / Remarks, and the certification + witness + date +
  employer-signature block at the bottom. **Leave the revenue-stamp cell and
  both signature areas blank** — those get filled in by hand/physically
  stamped after printing, never render anything there. Build as
  `renderFormM()` in `src/export/documents.ts` alongside `renderLetter` /
  `renderSummary` / `renderPayslip`, wire a print button into Month End and
  History next to the existing ones. The photos (in the zip above) are the
  exact reference for spacing/column order if anything here is ambiguous.
- **Full regression pass** once all the above lands: `npm test`, `npm run
  build`, then drive it in the browser for both companies — this session's
  verification pattern (real DOM events, not just reading code, and always
  cleaning up whatever test data gets written to the live DB afterward) is
  the right one to keep using.

## Things to not re-litigate

- Pay divisor is calendar days, absence/tiffin run on working days — this was
  reverse-engineered and pinned by tests early on, don't second-guess it.
- No auth — the app runs open to `anon` deliberately, documented risk in
  `README.md`. Don't add a login screen back without being asked.
- The two original source files (`BONUS CALCULATION.xls`, the WhatsApp zip)
  are still in `C:\Users\kanis\Downloads\` — stable paths, not temp — so
  re-reading them for exact figures is always possible; the numbers
  transcribed above are for quick reference, not a replacement for the source.

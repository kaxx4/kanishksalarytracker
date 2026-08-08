# Paper-register import — status

Source: `Photos-1-001/`, 50 phone photographs of the two paper books,
taken 2026-08-08. Gitignored (159 MB); the figures live in the database.

## Rules (agreed with the operator)

- `A` = absent. `S` is a Sunday stroke drawn down the column, not a mark, and
  is skipped — the app derives weekly offs from company settings.
- Staff no longer on any roster get real employee rows, marked **inactive**, so
  months reconcile and nobody is orphaned.
- People who moved between companies keep **one** record, so their history and
  bonus stay continuous. A run line may therefore point at an employee whose
  `company_id` is the other company. This is deliberate.
- Months already stored are **never overwritten**; they are compared and any
  difference is reported.
- Each month is checked against the two totals its register prints for itself
  before anything is written. One wrong digit breaks the sum — this is what
  makes eye-transcription trustworthy, and it has caught eight misreads so far.
- Where the certification block and the column feet disagree, the column feet
  win.
- `FAB` beside a name with no amount means no payment that month: no line.

## The fourth column is not one thing

It has carried tiffin, arrears from an ad-hoc increment, and leave pay ("LP"),
and sometimes two of them stacked in one cell. All sit inside `payable`, so all
count toward the bonus-eligible wage on their own. `salary_run_lines.arrears`
holds whichever the page shows so Form M can still print that cell. Filing any
of them as tiffin would be wrong: the bonus engine subtracts tiffin.

## Done — pay registers, both companies complete

Photos 1-27. **CT and MKCP each hold 16 consecutive months, April 2025 to
July 2026, with no run missing its lines.** FY2025-26 is complete for both, so
that bonus year can be computed rather than estimated.

Photo 26 (CT May 2026) is a re-photograph of a month already held; it matches
the stored figures exactly, line for line — an independent check on the
earlier backfill.

Photo 27 is CT June 2026, which had been imported amounts-only because no
photograph of it existed in the earlier set. Its totals match what was stored
exactly, so the per-person detail was filled in behind figures that were
already right. It also introduced overtime ("OT-500" beside Vikash Kumar Rao's
tiffin) — another addition that sits inside payable and counts toward the
bonus.

New employees created inactive: Upender Kumar, Satyajit Dey Adhicary, Sonu Das,
Arun Kr Sah, Ankit Kumar.

## Remaining

- **Photos 28-33** — expected to be further re-photographs of 2026 months
  already held (CT Jul, MKCP Apr-Jul). To be read and compared, not imported,
  unless one carries detail a month is still missing, as photo 27 did.
- **Photos 34-50** — the Monthly Attendance Register, April 2025 to August
  2026, seventeen months of day-by-day P/A marks. Not yet imported. These can
  be cross-checked against the absence counts the pay registers already imply,
  which is a second independent verification.

## Resuming

Say "continue the register import" — the rules above and the per-batch notes in
migrations 0009-0016 carry everything needed.

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

## Resolved — July 2026, both companies

The import found one real conflict, appearing **twice**: the same month, the
same 5,000 to the rupee, in both companies.

| Month | Person | Register | Reached the bank | Difference |
|---|---|---|---|---|
| CT July 2026 | Surajit Pal | 35,620 | 30,620 | 5,000 |
| MKCP July 2026 | Sunil Kr Tiwari | 18,000 | 13,000 | 5,000 |

**Both were advances**, confirmed by the operator. The register records what
each man earned; the bank letter records what still had to be transferred after
an advance already paid was recovered. Nothing was wrong with either book, and
nothing was wrong with the stored data either — both rows already carried
`advance = 5000`, so the comparison above was reading an entitlement against a
payment and calling the difference a gap.

The stored month total of 1,10,785 remains the figure on the signed bank letter
and stays pinned by `payroll.test.ts`. The register's staff subtotal of
1,15,785 is the entitlement. Both are correct; they are answers to different
questions.

### What this did expose

The bonus engine was computing each month's eligible wage as
`payable + P.Tax - tiffin`, and `payable` is net of advance and TDS. So a
recovered advance quietly docked the bonus of the person who took it — Sunil's
July wage counted as 13,000 rather than the 18,000 he earned. Fixed in
`src/calc/bonus.ts`: TDS and advance are now added back alongside P.Tax, since
all three are withheld from an earned wage rather than reducing it.

Four lines in the database were affected, all in July 2026 — the two advances
above and 60,000 of TDS each against Mita Agarwal and Vandita More. All fall in
FY2026-27, whose bonus has not been run, so no saved bonus changed.

## The attendance register independently confirms the pay import

Photos 34-50 are the Monthly Attendance Register. Each month's **Remarks**
column carries that person's absence count for the month — the same figure the
pay register's "AS" cell uses to dock pay.

Checked for MKCP May 2025, from the attendance book against what was imported
from the pay book:

| Person | Attendance remarks | Imported absence |
|---|---|---|
| Satinder Rajbanshi | (10) | 10 |
| Ranjit Rajbanshi | (19) | 19 |
| Shambhu Prasad Singh | NIL | 0 |
| Upender Kumar | NIL | 0 |
| Mahesh Ram | NIL | 0 |
| Shatrudahan | NIL | 0 |
| Ramnaresh Bhagat | (18) | 18 |
| Sonu Das | (1) | 1 |

Eight for eight, from a book that was never used to produce the import. That is
the strongest check the paper can give: two independently kept records agreeing
on every figure that moves money.

## Why the daily cells are not imported (tried, and blocked)

The individual day marks are **not** transcribed. This was attempted and
abandoned on evidence, not preference.

The method was sound: each row's Remarks cell gives that person's absence count,
so a transcribed row can be checked by counting the A marks against it — the
same self-check that made the pay registers trustworthy.

It failed on the first row tried. Satinder Rajbanshi, April 2025: the daily
cells read as 14 absences, the Remarks cell says 16. Worse, the two cannot be
reconciled by re-reading. April 2025 has 26 non-Sunday days, 13 of them in the
first half of the month, and the second half shows one clear absence — so 16
absences cannot be distributed across the marks as they appear. Either the
reading is wrong in a way the check cannot locate, or the register's own daily
marks do not sum to its own Remarks.

Raising the resolution was then solved, and the constraint turned out to be
throughput rather than legibility. Rendering the photograph to a canvas,
cropping to a few day-columns and magnifying about 3x makes the cells plainly
readable — day 16 a red A, 17 to 19 blue P, 20 the red Sunday stroke, where the
flat photograph showed only ambiguous strokes.

The limit is the preview pane. It stops compositing above roughly 1600x600 and
returns screenshots at half the viewport, so one capture holds about six
day-columns across a few rows. A month of nine people and thirty-one days needs
on the order of a dozen captures, and seventeen months needs something like two
hundred. That is not a judgement about accuracy any more — it is simply more
round trips than a session has.

There are roughly 4,000 of them across seventeen months. Writing them at the
accuracy actually achievable would put on the order of two hundred wrong marks
into the register — marks that would change no pay, because every historical
month is already stored, approved and reconciled and the app recomputes nothing
for a saved run, but that would sit in the attendance grid looking
authoritative.

What those cells actually determine — each person's absence count per month —
is already captured exactly, from the pay register, and now independently
confirmed against this second book.

Two ways to get the daily detail if it is wanted:

1. **Re-photograph the attendance pages closer** — one page per shot rather
   than a two-page spread, and square to the page. This is the cheap fix: it
   collapses the job from roughly two hundred browser captures to seventeen
   ordinary reads, because the cells become legible in the file itself. Ten
   minutes with the phone replaces several sessions of grinding.
2. **Enter a month by hand in the app**, where the Abs column on the same
   screen checks the work as it is typed.

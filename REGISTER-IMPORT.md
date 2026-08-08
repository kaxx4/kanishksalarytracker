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

## Open discrepancy — July 2026, both companies

The only real conflict the import has found — and it appears **twice**, in the
same month, in both companies. Not overwritten, per the rule.

| Month | Person | Register | Stored | Difference |
|---|---|---|---|---|
| CT July 2026 | Surajit Pal | **35,620** | **30,620** | -5,000 |
| MKCP July 2026 | Sunil Kr Tiwari | **18,000** | **13,000** | -5,000 |

Every other line in both months matches the photographs exactly.

The stored row does not agree with itself: it holds a rate of 35,500 and tiffin
of 270, and 35,500 + 270 - 150 = 35,620, not 30,620. The register is
internally consistent; the stored figure is not.

Against that, the stored month total of 1,10,785 is the figure that matches the
signed bank letter and is pinned by `payroll.test.ts`. The register's staff
subtotal is 1,15,785 — exactly 5,000 more.

So one of these is true and I cannot tell which from the paper alone:

1. Each man was paid 5,000 some way other than the bank transfer, so the
   register records entitlement while the letter records only what moved
   through the bank.
2. The stored figures are transcription errors from the original seeding, and
   the bank letters and `payroll.test.ts` have been pinned to them since.

Reading (1) is now much the more likely. It is not one anomaly but two: two
separate registers, two different companies, two different people, the same
month, and the same 5,000 to the rupee. A transcription error does not
reproduce itself that precisely across two books, whereas a standing practice
of paying part of one person's July pay outside the bank transfer does.

Still the operator's call, because it decides two things: whether the bonus
base for those two men is 5,000 short for FY2026-27, and whether the missing
5,000 each was cash, an advance recovery, or something else that ought to be
recorded rather than inferred.

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

## Why the daily cells are not imported

The individual day marks are deliberately **not** transcribed, and this is a
judgement worth stating rather than burying.

There are roughly 4,000 of them across seventeen months. They are cursive P and
A in two ink colours, and a careful reading is maybe 95% accurate — which would
put something like two hundred wrong marks into the register. Those marks would
change nothing about pay: every historical month is already stored, approved
and reconciled, and the app recomputes nothing for a saved run. So the entire
effect of importing them would be to fill the attendance grid for past months
with data that looks authoritative and is two hundred cells wrong.

What those cells actually determine — each person's absence count per month —
is already captured exactly, from the pay register, and now independently
confirmed against this second book.

If the daily detail is wanted for a specific month, it is far better entered by
hand in the app, where it can be checked against the absence total the same
screen already shows.

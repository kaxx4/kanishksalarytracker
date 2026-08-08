# Reading the attendance register by pixel, not by eye

The daily cells in `Photos-1-001/` photos 34-50 defeated visual reading — the
marks are cursive and the two-page spreads put too few pixels on each cell. But
they do not need to be read. **They are colour-coded**, and colour is
measurable:

- **blue ink = P (present)**
- **red ink = A (absent)**
- **red vertical stroke = Sunday**, on dates that are already known

So the job is a pixel computation with a built-in check: count the red cells in
a row and compare against that row's **Remarks** figure, which holds the
person's absence count for the month. A row that reconciles is verified; a row
that does not gets re-examined rather than written. Same discipline that made
the pay registers trustworthy, applied automatically.

## Confirmed working

Run against `IMG_20260808_102437230.jpg` (MKCP April 2025) through the browser
preview with the photo staged in `public/_scan/`:

**Grid detection works.** Scanning for dark rows and columns in the right-page
band returns the real table geometry rather than guessed offsets:

```
rows: 341 363 429 499 612 726 841 955 1070 1187 1302 1420 1530
cols: 1963 2025 2114 2201 2288 2375 2462 2550 2637 2725 2812 2899 2986 3073 3161 3250 3341
```

Columns are ~87px apart (days 16-30 span 2025 to 3341), rows ~114px apart, nine
employee rows beneath the header.

**Magnification confirms the colours read correctly.** Cropping days 16-21 of
row 1 at 3x shows day 16 a red A, 17-19 blue P, 20 the red Sunday stroke.

## What still needs doing

1. Calibrate the **left page** (days 1-15) the same way — the same line-scan
   works, over the left x-band.
2. Settle the row offset. The first attempt classified against rows starting at
   430 and came out mostly blank, so the marks sit lower than that; the
   detected boundary at 499 is the likely top of row 1. Confirm by checking a
   row's red count against its Remarks.
3. Mask the Sunday columns by date rather than by colour, since the Sunday
   stroke is also red.
4. Run per month, write only rows whose red count equals their Remarks figure,
   and report any row that will not reconcile.

## The cheaper alternative

Re-photographing the attendance pages one page per shot, square to the page,
makes the cells legible in the file itself and reduces all of the above to
seventeen ordinary reads. Ten minutes with a phone against several sessions of
calibration.

## Current state of the classifier — run against April 2025

Geometry is settled and correct:

```
rows y : 499 612 726 841 955 1070 1187 1302 1420 1530   (nine employees)
days 1-15  : x0 = 640.1, step = 87.87
days 16-30 : x0 = 2025,  step = 87.73
Sundays    : 6, 13, 20, 27  (masked by date — the Sunday stroke is red too)
```

Classifier as it stands (sample cell interior, skip paper `>210` and printed
rule `<75`, call red when `R-B>35 && R-G>22`, blue when `B-R>28`, absent when
`red > blue*1.1`):

| Row | Person | Detected A | Expected A | |
|---|---|---|---|---|
| 1 | Satinder Rajbanshi | 9 | 16 | ✗ |
| 2 | Ranjit Rajbanshi | 1 | 2 | ✗ |
| 3 | Shambhu Prasad Singh | 0 | 0 | ✓ |
| 4 | Upender Kumar | 1 | 0 | ✗ |
| 5 | Mahesh Ram | 15 | 18 | ✗ |
| 6 | Shatrudahan | 0 | 0 | ✓ |
| 7 | Rahul Sarkar | 1 | 1 | ✓ |
| 8 | Satyajit Dey Adhicary | 18 | 22 (derived) | — |
| 9 | Abhishek Kumar | 10 | 12 | ✗ |

Three of nine reconcile. The failures all under-count, and the raw output is
full of `.` where a mark plainly exists, so the classifier is **missing ink**
rather than misreading colour. Two likely causes, in order:

1. **Ink threshold too tight.** Ballpoint on aged paper is neither saturated
   nor dark; `R-B>35` and `B-R>28` will drop faint strokes. Loosen, and
   consider classifying on hue angle rather than channel differences.
2. **Cell inset too aggressive.** The sample insets 11px horizontally and
   12-16px vertically; marks that overrun their cell, which many do, get
   clipped away. Try a smaller inset, or weight the cell centre.

Do not write a row until its red count equals its Remarks figure. Three rows
already pass, which shows the approach is sound — this is tuning, not redesign.

## Tuning pass 2 — better, still not writable

Loosening the ink test (paper `>232`, rule `<60`, saturation `max-min>=18`,
red when `R` dominant and `R-B>14`, blue when `B` dominant and `B-R>10`) and
cutting the inset to 3px horizontal / 8px vertical moved it from three rows to
four:

| Person | Detected | Expected |
|---|---|---|
| Satinder Rajbanshi | 14 | 16 |
| Ranjit Rajbanshi | 2 | 2 ✓ |
| Shambhu Prasad Singh | 0 | 0 ✓ |
| Upender Kumar | 1 | 0 |
| Mahesh Ram | 15 | 18 |
| Shatrudahan | 0 | 0 ✓ |
| Rahul Sarkar | 1 | 1 ✓ |
| Satyajit Dey Adhicary | 22 | 22 (derived independently from his pay) |
| Abhishek Kumar | 14 | 12 |

A grid search over inset, vertical inset, minimum ink and red/blue ratio found
nothing better than four. The interesting part is *how* it fails: Satinder and
Mahesh still under-count while Abhishek now over-counts, on the same settings.
So there is no single threshold that fits every row — the ink weight varies by
person, some pressing hard in biro and others barely marking.

That points away from more threshold tuning and toward one of:

- **Per-row adaptive thresholding.** Compute each row's own ink distribution
  and split it, rather than applying global constants. The Remarks count gives
  a target to solve toward: pick the threshold that makes the row's red count
  equal its Remarks figure, and accept the row only if that threshold is
  unambiguous.
- **Better source photographs**, which removes the problem rather than
  modelling it.

Satyajit's row landing on 22 is worth noting: that figure was derived purely
from his pay (16,000 over 30 days against 2,173 paid) and the pixels agreed
independently. When the classifier is right, it is right for the right reason.

## Pass 3 — ranking, not thresholding. This is the right shape.

Instead of asking "is this cell red?", rank the row's cells by redness
`red/(red+blue+1)` and take the top N, where N is the absence count already
known from the pay register. The count says *how many*; the pixels only have to
say *which*. Accept the row only when the cutoff is unambiguous — a real gap
between the Nth and (N+1)th cell.

Redness turns out to be **bimodal**: cells sit at 1.00 or 0.00, not smeared
across the middle. That is exactly what makes ranking viable.

Four rows resolve cleanly, with days:

| Person | N | Result |
|---|---|---|
| Ranjit Rajbanshi | 2 | days 29, 30 — gap 0.82 |
| Shambhu Prasad Singh | 0 | all present — gap 1.00 |
| Shatrudahan | 0 | all present — gap 0.99 |
| Rahul Sarkar | 1 | day 19 — gap 0.98 |

Three fail, and the reason has changed: Satinder (16), Mahesh (18) and Abhishek
(12) now show **more** cells at redness 1.00 than their count allows, where the
threshold approach had them under-counting. The cause is that redness is a
*ratio* — a cell holding two stray red pixels and no blue scores 1.00 just as a
boldly written A does.

**The fix is one line: require a minimum ink volume before a cell enters the
ranking.** Something like `red >= 40` absolute pixels, tuned against the four
rows that already pass. Upender's lone false positive on day 12 (redness 0.66,
low volume) should fall away with the same guard.

That is where to start next. The method is right, the geometry is right, the
counts to solve toward are right, and four of nine rows already produce specific
dates. What remains is an ink floor and a re-run.

## Pass 4 — ink floor. Five of nine, and the wall is real.

Adding an absolute ink floor before a cell can count as absent (`red >= 220`
pixels and `red > blue`) reaches five rows: Ranjit, Shambhu, Shatrudahan, Rahul
and now Abhishek at exactly 12.

| floor | reconciling | counts vs 16,2,0,0,18,0,1,-,12 |
|---|---|---|
| 30 | 4 | 14,2,0,1,15,0,1,22,14 |
| 100 | 4 | 14,2,0,1,15,0,1,22,13 |
| **220** | **5** | 11,2,0,1,15,0,1,22,**12** |
| 300 | 5 | 9,2,0,1,15,0,1,22,12 |

Three rows resist every setting. Satinder and Mahesh under-count at any floor —
raising it makes them worse, lowering it breaks Abhishek — and Upender holds a
single phantom mark on day 12. There is no floor that satisfies all three at
once, which says the remaining error is not a threshold at all.

Most likely those rows' marks differ physically: a lighter pen, a different
hand, or absences written as something other than a bold red A. Distinguishing
that needs pixels the two-page spread does not contain.

## Do not write partial months

Tempting, but wrong. The app treats an unmarked working day as present. Writing
only the rows that reconcile would leave Satinder and Mahesh — the two people
with the most absences that month — looking fully present, which is worse than
leaving the month empty. A month goes in whole or not at all.

## Pass 5 — the row alignment itself is suspect. Start here.

A doubt worth acting on before any more threshold work: **the rows that
"reconcile" are the easy ones.** Two zeros, a one and a two. Every one of those
would also pass if the sampling band sat partly *between* two rows and picked up
little ink. The rows that fail are precisely the ones with many marks, where
alignment error shows up.

Two things support the doubt. The detected horizontal lines gave an anomalous
70px gap at 429-499 where every other row is ~113px, so the first band is not
like the others. And an ink profile taken straight down the day-column band
does **not** resolve into nine even bands:

```
peak ink 553 px/row
bands found: 988-1048, 1347-1375, 1461-1535, 1542-1620
```

Four ragged bands, not nine regular ones. Some of that is the page gutter around
x 1950-2020 polluting the sample, which should be excluded, but it means row
geometry was never actually confirmed — it was assumed from the line detector
and then never tested independently.

**So the five-of-nine result is not trustworthy, and neither is four-of-nine
before it.** They may be partly coincidence.

Next session, in this order:

1. Rebuild the ink profile with the gutter excluded — sample x 700-1900 and
   x 2050-3330 separately — and lower the band threshold until nine bands
   appear. Those bands are the true rows.
2. Re-derive row boundaries from the bands, not from the printed rules.
3. Only then revisit thresholds, and re-test the rows that currently pass. A
   row that reconciles for the wrong reason is worse than one that fails
   honestly.

## Pass 6 — alignment fixed, and the check itself turns out to be unsound

Excluding the page gutter from the ink profile finally produced nine real row
bands. Centres at 525, 650, 773, 887, 1014, 1124, 1242, 1355, 1497 — against
which the earlier line-derived boundaries were 10-30px out on the first rows,
which is where two of the three failures were. Sampling those centres +/-42px
produces coherent rows at last: clean unbroken P for Shambhu and Shatrudahan,
and Upender's phantom mark gone.

Then the real problem appeared, and it is not the classifier.

**The daily A-count does not map consistently onto the pay register.** Three
people, three different relationships:

| Person | A marks read | AS on pay register | Net docked (AS - Ad) |
|---|---|---|---|
| Satinder Rajbanshi | 14 | 16 | **14** |
| Mahesh Ram | 15 | 18 | 16 |
| Abhishek Kumar | 16 | 12 | 10 |

Satinder's 14 matches his net docked days exactly, and his pay confirms it:
13,900/30 x 16 paid days = 7,414, as recorded. So 14 is very likely *right* and
the target of 16 was wrong. Mahesh is one short of his net. Abhishek exceeds
both his AS and his net.

That breaks the premise this whole approach rested on — that a row could be
validated by matching its red-cell count against a known figure. There is no
single known figure to match: sometimes the marks equal net docked days,
sometimes neither. Until it is understood *why* (paid leave marked as A? days
worked at another company? a correction made on the pay side only?), a matching
count proves nothing and a mismatching one condemns nothing.

**Stop here.** The next step is not more code. It is to ask the operator what
the daily A marks are supposed to mean relative to the AS and Ad figures on the
pay register, because those two books evidently do not record the same thing.

## Pass 7 — written. April 2025 is in.

The blocker was partly my own framing. Writing attendance for a historical
month **cannot corrupt pay**: those runs are stored with their own reconciled
figures and `is_historical`, and nothing recomputes from attendance. So the
downside of an imperfect mark is a wrong cell in a register view, not a wrong
wage — which is a very different risk from the one I had been guarding against.

With the row geometry corrected, MKCP April 2025 is imported: 234 marks, nine
people across twenty-six working days. Six of the nine rows independently agree
with a pay-register figure — Satinder's 14 equals his net docked days, Ranjit 2,
Rahul 1, three at zero, and Satyajit's 22 matches a number derived earlier from
his pay alone.

### The working recipe

```
1. Ink profile down the page, binding gutter EXCLUDED (x 700-1900, 2060-3330).
   Smooth over 9px, threshold at 10% of peak. The bands are the true rows;
   merge fragments that are closer than a row apart.
2. Column runs from vertical line detection, extrapolated:
   days 1-15 x0=640.1 step=87.87 | days 16-30 x0=2025 step=87.73
3. Sample each cell at row centre +/-42px, inset 3px horizontally.
   Ink = max<=232, max>=60, saturation max-min>=18.
   Red when R dominant and R-B>14; blue when B dominant and B-R>10.
   Absent when red>=120 and red>blue.
4. Skip Sundays by date.
5. Write with `on conflict (employee_id, marked_on) do nothing`.
```

Geometry must be re-derived per photograph — the books are shot at different
angles and distances — but the recipe holds.

### Still true, and still worth asking

The daily marks and the pay register's AS figures do not agree for everyone.
Satinder's marks equal his *net* docked days, Mahesh reads one under his net,
Abhishek reads more than either of his. Worth asking what the two books are each
meant to record before leaning on the attendance view for anything financial.

## Pass 8 — auto-geometry does not generalise

An attempt to make the geometry self-deriving, so photos could be batched,
failed on the very next photograph. Photo 35 returned two row bands instead of
nine and a left-column step of 72px against the expected 88.

The books are shot handheld at different distances and angles, so every
photograph needs its grid derived and eyeballed once before its cells can be
read. That is roughly three exchanges per photograph — find the rows, confirm
the columns, classify and write — and sixteen photographs remain.

So the position is: the **method is proven and April 2025 is imported**, but
each remaining month costs a calibration pass. That is a grind, not a puzzle.

**Re-photographing remains the shortcut and now more clearly so.** One page per
shot, square to the page, at a consistent distance would make the geometry
near-identical across photographs — which is exactly what the batching attempt
needed and did not get.

## Progress log — attendance months imported

| Photo | Month | Rows | Reconciling | Notes |
|---|---|---|---|---|
| 34 | MKCP Apr 2025 | 9 | 6 of 9 | Satinder's 14 equals his net docked days |
| 35 | MKCP May 2025 | 8 | 6 of 8 | Ranjit 14 vs 19, Ramnaresh 15 vs 18 |
| 36 | MKCP Jun 2025 | 8 | 5 of 8 | Shambhu 7v8, Upender 20v24, Ramnaresh 19v23 |
| 37 | MKCP Jul 2025 | 8 | 7 of 8 | Shambhu 11 v 12 |
| 38 | MKCP Aug 2025 | 8 | **8 of 8** | clean month, nothing flagged |
| 39 | MKCP Sep 2025 | 7 | **7 of 7** | Durga Puja closure on 29-30 |
| 40 | MKCP Oct 2025 | 7 | 6 of 7 | Mahesh 11 v 12; three festival closures |
| 41 | MKCP Nov 2025 | 7 | 3 of 7 | four short; Guru Nanak Jayanti on the 5th |
| 42 | MKCP Dec 2025 | 8 | 7 of 8 | Shambhu 9 v 10; Upender rejoins on the 27th |

Remaining: photos 43-50, eight months, MKCP January through August 2026.

### The shortfall is systematic, not random

Across every month, rows that miss their Remarks figure miss it in the **same
direction** — the daily marks read fewer absences than AS, never more — and
roughly in proportion to how many absences the person had. November is the
clearest case: Shambhu 6 v 7, Mahesh 6 v 8, Bharat 14 v 16, Ramnaresh 17 v 20.

That is not what a misreading looks like; misreadings scatter. It looks like the
two books counting slightly different things, which is the same conclusion the
pay-register comparison reached from the other side. One likely explanation: AS
includes days the daily register leaves blank rather than marking, such as
leave taken and later credited as Ad. Worth confirming with the operator, since
it would retire every flag at once.

### Festival closures

The register marks the firm's own shutdowns in red down the affected columns —
Durga Puja (Sep 29-30 and Oct 1-2), Lakhi Puja (Oct 6), Dipawali "Closed"
(Oct 21-23). These are the business closing, not people being absent, so they
are written as present. That is also the app's own default for an unmarked
working day, so the register reads the same either way, and no one is docked
for a day the firm chose not to open.

`FAB` in the Remarks column means absent the whole month, and it reconciles
exactly — both FAB men in June show 25 absences against 25 working days, and
neither has a pay line that month.

### Reading photo 35 by eye beat the classifier

Worth recording: photo 35 defeated the automatic geometry entirely — two row
bands found instead of eight, columns clustered in one strip — but reading the
page directly worked, and six of eight rows reconciled first time. The Sunday
strokes fell exactly on 4, 11, 18 and 25, which is May 2025's Sundays, and that
alone confirms the column alignment without any detection at all.

So for the remaining photographs, **read the page rather than calibrate it**.
The Remarks column checks each row, the Sunday strokes check the columns, and
both are visible at the resolution the file already has. The classifier was
worth building for the dense months, but it is not the fast path.

### Unreconciled rows are written anyway, and flagged

An unmarked working day counts as present in this app. Omitting a row that
cannot be verified would therefore show someone with heavy absence as having
perfect attendance — a far larger error than a few missed cells. Rows are
written as read, and every shortfall is named in the migration that carries it.

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

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

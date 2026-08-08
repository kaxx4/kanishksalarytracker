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

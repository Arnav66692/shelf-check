# Shelf Check, narrowed claim, fresh test (Stage 1b)

Written Sat Nov 21 2026, about 1:15 PM PT, before any of these 100 labels was read by any model.

## Why this exists

Stage 1 failed. Reader B (qwen3-vl:8b) got 17 of 20, one short of the bar. It was 16 of 16 on drug labels and 1 of 4 on supplements. Arnav chose to narrow the claim to drugs. A claim changed after seeing results needs new data, so this is a fresh test with its own bar.

## Narrowed claim

Shelf Check reads the label of a US prescription or over-the-counter medicine taken by mouth as a tablet or capsule, and lands on the right active ingredients and strengths. Supplements are out of the claim. In the app they are marked unverified and the user confirms them.

## Test set

- Pool: the 3,588 products extracted from the October 2026 DailyMed archive.
- Keep products with exactly one product entry in the record, taken by mouth, whose form contains TABLET or CAPSULE, and whose every active ingredient has a numeric strength per one unit. One entry means the pictured strength is not in doubt.
- Drop any product used in Stage 1.
- Sample 50 prescription and 50 over-the-counter with random seed 1121, sorted by set id first.
- Image: the first package label image of the record.
- Ground truth: ingredient names and strengths from the structured part of the record.

## Pipeline (unchanged from Stage 1)

Reader B with the same prompt, then the same matcher code. One setting changed before this run and is not a tuning change: the model's context size is set to 8,192 tokens so it uses 6 GB instead of 45 GB.

## Metrics

1. Fully right: ingredient set equal to ground truth and every strength equal (value and unit).
2. Confidently wrong: the pipeline returned an answer and it is not fully right.
3. No answer: the pipeline returned nothing.
4. Median read time per label.

## Pass bar (fixed now)

- Fully right on at least 90 of 100.
- Confidently wrong on at most 3 of 100.

Both must hold. If either fails, Shelf Check stops and the build moves to another idea. No second narrowing.

## Known limits, stated before results

- The images are flat official artwork, not phone photos of curved bottles. No public US photo set with answers exists, so this test cannot support a claim about real photos.
- Products with several strengths in one record are excluded, and those are where picking the right strength is hardest.
- Liquids are excluded here. Stage 1 had three (NyQuil, Benadryl, amoxicillin suspension) and all three were right.
- When the pipeline reads the printed drug code and looks it up, the answer and the ground truth come from the same official record. That route tests whether the code was read right, not whether the record is right.
- Official records sometimes state strength as the salt and labels as the base. A correct reading can then count as wrong. Those cases will be listed separately and will not change the verdict.
- 100 labels gives wide error bars. 90 of 100 has a 95 percent interval of roughly 82 to 95 percent.

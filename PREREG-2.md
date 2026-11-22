# Shelf Check, agreement check on fresh labels (Stage 2)

Written Sat Nov 21 2026, about 2:50 PM PT, before any of these 100 labels was read by any model.

## What changed since Stage 1b

Stage 1b failed: 82 of 100 fully right, 5 confidently wrong. The reader is the same. What is new is a rule that decides when a reading may be shown as "verified" and when it must be shown as "check this yourself".

The rule (in `verify.py`, frozen now):

1. Code and text agree. The reader's printed drug code is found in the full FDA drug-code table (138,569 products, downloaded today), and the ingredients and strengths the reader read from the label text are exactly that record's ingredients and strengths.
2. Or name and text agree. No usable code, but every FDA record carrying the product name the reader read has the same ingredients and strengths, and the reader's own reading equals it.
3. Anything else is "check" (the app shows it as a suggestion) or "unreadable".

The rule was designed and adjusted on the 100 Stage 1b labels, which makes those development data. On them it marked 60 verified with 0 wrong. That number is not a result, because the rule was fitted there.

## Test set

100 new labels from the same pool and filter as Stage 1b (prescription and over-the-counter tablets and capsules taken by mouth, one product per record), 50 and 50, random seed 2211, excluding every Stage 1 and Stage 1b label. Ground truth from the structured record.

## Metrics

- Verified: how many of 100 the rule marks verified.
- Verified and wrong: verified answers whose ingredients or strengths differ from ground truth.

## Pass bar (fixed now)

- At least 50 of 100 verified.
- At most 1 verified answer wrong.

Pass means the app may show a "matches the official record" mark on verified readings. Fail means the mark is not shown and every photo reading stays a plain suggestion. Either way the user confirms every product, and warnings come only from the rules engine.

## Known limits, stated before results

- With about 60 verified answers and none wrong, the true error rate could still be as high as about 5 percent (95 percent bound). This test cannot show the mark is safe to trust blindly.
- Flat official artwork, not phone photos.
- Records with several strengths are still excluded.
- The code route compares the reading with the record the code points to. A label whose printed text and official record disagree would be marked "check", which is the intended behaviour.

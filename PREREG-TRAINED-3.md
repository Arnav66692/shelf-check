# Shelf Check trained matcher, run 3, preregistration

Written Sun Nov 22 2026, about 12:40 AM PT, before run 3 was started.

## Why a third run

Run 2 (PREREG-TRAINED-2.md) failed: 69.8 percent product top-1 and 84.1 percent recall at 5 on 2,169 test photos, against bars of 90 and 97. It trained for only one epoch, because its 100 minute cap counted validation time and the larger DINOv2 base model was slow. So run 2 did not test whether its changes help. Run 3 tests them with the time spent on training.

## What changes from run 2

1. Backbone back to DINOv2 small, the run 1 model, which trains about 4 times faster.
2. The 75 minute cap counts training time only. Validation time is not counted.
3. During training, validation scores the gallery with the clean view only, to keep each check short. The final test uses the same 4 extra synthetic views per gallery image as run 2.
4. A new product split (salt "run3"), so the test products are chosen fresh again.

Everything else is the same as run 2: the class token joined with the mean of the patch tokens, the validation split of 10 percent of training products, the epoch with the best validation top-1 is kept, the test set is scored once at the end, same data, renderer, loss, batch, learning rate and temperature.

## Pass bar (same as runs 1 and 2, fixed now)

- Product top-1 at least 90 percent, and at least 10 points above the untrained model on the same test queries.
- Product recall at 5 at least 97 percent.

All three runs are reported, whatever the result.

## Known limits

- Synthetic photos only, made by the same renderer used in training. Nothing here is about real phone photos.
- This is a third attempt on the same 3,588 products after seeing two results.

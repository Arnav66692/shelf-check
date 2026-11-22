# Shelf Check trained matcher, run 2, preregistration

Written Sat Nov 21 2026, about 9:55 PM PT, before any run 2 code was executed.

## Why a second run

Run 1 (PREREG-TRAINED.md) fine-tuned DINOv2 small and reached 78.0 percent product top-1 and 91.3 percent recall at 5 on 2,175 synthetic test photos. It missed both bars (90 and 97). Its per-epoch scores were already 75.2 percent after the first epoch and moved between 73 and 79 after that, so more epochs of the same setup are unlikely to help. Run 1 also scored the test set after every epoch, which is a mild form of looking at the test set. Run 2 fixes that.

## What changes

1. Backbone: DINOv2 base instead of small.
2. Embedding: the class token joined with the mean of the patch tokens, then normalized, instead of the class token alone, to keep more fine detail.
3. Gallery prototypes: each official image in the gallery is embedded as the mean of its clean view and 4 synthetic photo views made with a fixed seed that is different from every query seed. Official images are available to the app at run time, so this is a fair test-time step.
4. New product split, using a different salt, so test products are chosen fresh.
5. A validation split: 10 percent of the training products are held out from training. After each epoch, only the validation set is scored. The epoch with the best validation product top-1 is kept.
6. The test set is scored exactly once, with the kept epoch, after training ends.

Everything else stays the same as run 1: the same 3,588 DailyMed products and images, the same synthetic photo renderer (render.py), 3 queries per test product, the same contrastive loss, batch 48, learning rate 2e-5, temperature 0.05. Training time is capped at 100 minutes.

## Metrics

Product top-1, product recall at 5, exact image top-1, on the test queries, with the whole 3,588 product gallery.

## Pass bar (same as run 1, fixed now)

- Product top-1 at least 90 percent, and at least 10 points above the untrained base model on the same test queries.
- Product recall at 5 at least 97 percent.

If it fails, the matcher stays out of the app and the write-up says so. If it passes, it can be offered in the app only as a suggestion that the person must confirm, the same as the photo reader.

## Known limits, stated before results

- The queries are synthetic photos made by the same renderer used in training. This says nothing about real phone photos.
- Run 2 is a second attempt on the same data after seeing run 1's result. Both runs are reported, not only the better one.
- 3,588 products is about 2 percent of DailyMed. A bigger gallery would lower accuracy.

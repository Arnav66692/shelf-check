# Shelf Check trained matcher pilot, preregistration

Written Sat Nov 21 2026, about 11:10 AM PT, before any training data was pulled and before any embedding model was run on any label.

## Idea

Every US drug label is public. So recognition is "find the nearest official label", not "read tiny print". Train an image embedding so a phone photo lands next to its official label artwork. Then accept a match only when independent channels agree, and say "not sure" otherwise.

Closest earlier work found today: DLI-IT (Liu et al., BMC Med Inform Decis Mak, 2020), which retrieved DailyMed labels from OCR text and reported Precision@1 of 0.88 on opioid labels and 0.80 on a mixed set. That is the number to beat, on a different test set, so the comparison is indicative only.

## Data

- Official label images and structured records (drug code, ingredients, strengths) from DailyMed. Target at least 3,000 products. Use whatever count is pulled by 1:00 PM PT and report it.
- Split by product, 80 percent train, 20 percent test. No test product's images are seen in training.
- Gallery at test time: every official image, train and test products together.
- Queries: synthetic phone photos of test products, made by a renderer (wrap on a cylinder, perspective tilt, glare, blur, partial crop, background clutter). Renderer settings for test queries use a different random seed and are fixed before training.
- 3 queries per test product.

## Models

- Baseline: DINOv2 small, no training, class token embedding, cosine nearest neighbor.
- Trained: the same model fine-tuned with a contrastive loss on (official image, synthetic photo) pairs from train products only.
- Training time is capped at 90 minutes on the M5 Max. Checkpoint every epoch.

## Agreement check (plain code, fixed before scoring)

For the top 5 retrieved products, read the photo with the label reader and accept the best-ranked product whose official ingredient names all appear in the reading and whose strength number appears too. If none of the 5 agree, abstain.

The label reader for this step is whichever reader passed Stage 1. If no reader passed Stage 1, this step is skipped and reported as not run.

## Metrics

1. Product top-1: the nearest gallery image belongs to the right product (same DailyMed set).
2. Product recall at 5.
3. Exact top-1: right product and right strength variant.
4. With the agreement check: coverage (share answered) and confident-wrong rate (share of all queries answered with the wrong ingredient or strength).

## Pass bar (fixed now)

- Trained product top-1 at least 90 percent, and at least 10 points above the untrained baseline.
- Trained product recall at 5 at least 97 percent.
- If the agreement check runs: confident-wrong at most 2 percent with coverage at least 70 percent.

If the first two fail, the trained matcher is dropped from the build and the write-up says so. The app then ships on the reader alone, if a reader passed.

## Known limits, stated before results

- Queries are synthetic. This pilot cannot support any claim about real phone photos. A real-photo test needs a separate set with checked ground truth.
- Many generic labels from one maker differ only by a strength number and a colour band. Exact top-1 is expected to be much lower than product top-1, which is why the agreement check exists.
- Label artwork on file can differ from the box on a shelf.
- 3,000 products is about 2 percent of DailyMed. Accuracy will fall as the gallery grows, and this pilot does not measure by how much.

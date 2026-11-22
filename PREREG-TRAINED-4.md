# Shelf Check matcher, run 4 (hybrid), preregistration

Written Sun Nov 22 2026, about 3:00 AM PT, after all tuning on the run 3 validation queries and before the run 4 system has scored any test query.

## Why a fourth run

Runs 1 to 3 used image embeddings alone. They reached 78.0, 69.8 and 78.3 percent product top-1 on their test sets, against a bar of 90. The misses are mostly look-alike labels from the same maker that differ in printed text. Run 4 adds two channels that look at that detail, reading the text and matching local keypoints, and fuses them with the run 3 image model. No model is trained in run 4.

## The exact system

Everything below is fixed in `results/matcher4/config.json` and `results/matcher4/score.py`.

1. Image channel. The run 3 checkpoint (`results/matcher3/best.pt`, DINOv2 small, epoch 16, chosen by run 3 on validation). Embedding is the class token joined with the mean patch token, as in run 3. Gallery side: the clean view of each official image. Query side: the 336 pixel photo and a crop around the visible label with 10 percent padding (`crop.py`), and the higher of the two cosine scores is kept. A product's score is its best image.
2. Text channel. Each query photo is upscaled 2 times with sharpening and read with Apple Vision (VNRecognizeTextRequest, accurate, no language correction, `ocr_tool/vision_ocr`). The original photo is also read with Florence-2 base (`florence-community/Florence-2-base-ft`, already cached, OCR task). The two readings are joined. Each gallery product has a text document made of the Vision reading of all its official images plus its record from index.jsonl (product names, active ingredient names, strengths and units). The score is the idf weighted share of the query's character 3, 4 and 5 grams found in the product document, minus 0.03 times the log of the document's idf mass. Queries with no text get 0 for every product.
3. Keypoint channel. OpenCV SIFT, 500 features on the query and on each official image scaled to 512 pixels on the long side, ratio test 0.75, RANSAC homography at 5 pixels. Two numbers per image: log(1 + inliers), and the number of cells in a 4 by 4 grid on the gallery image that hold an inlier. A product takes its best image. Every query is matched against all 6,096 gallery images.
4. Candidates. The union of the top 50 products by image score, by text score and by keypoint score.
5. Fused score, for candidates only: 1.0 times image + 0.2 times text + 0.05 times log(1 + inliers) + 0.01 times cells. The highest fused score is the answer.

## How it was chosen, all on run 3 validation only

Validation is the run 3 validation split (salt "run3", 356 products held out of training, 1,068 queries made with VAL_SEED 20261123), against the full gallery of 3,588 products and 6,096 images. Results with ties broken by gallery order:

| System | Top-1 | Recall at 5 |
|---|---|---|
| Image only (run 3 best.pt, this pipeline) | 79.6 | 91.9 |
| Text only (Vision plus Florence) | 21.9 | 34.7 |
| Keypoints only | 41.6 | 53.8 |
| Hybrid, chosen weights | 87.5 | 95.3 |

The weights were picked by grid search for validation top-1. A 5 fold cross validation of that search, folds split by product, gave 86.9 top-1 and 95.1 recall at 5, so the fit is not much inflated. The candidate union held the right product for 99.7 percent of validation queries. Things tried on validation and dropped because they did not help: averaging the 4 synthetic gallery views into the prototype or taking the best 2 views, a softmax reranker over 12 features, DINO patch mutual nearest neighbours on the top 10, a 2 times upscaled query and 1,000 features for SIFT, a separate strength number match, and Vision with language correction.

## Test set and metric

The test set is run 3's test split: 761 products, 2,283 queries made with QUERY_SEED 20261122 by `render.synthetic_photo`, saved losslessly by `results/matcher4/render_queries.py`. Gallery is all 3,588 products. It is scored once with `score.py test`, which refuses to run before this file's hash is in PREREG.sha256 and refuses to run a second time.

Primary metric: product top-1 and product recall at 5, ties broken by gallery order, which matches how the earlier runs counted. The same numbers with ties counted against the system are reported too.

## Pass bar (same as runs 1 to 3)

- Product top-1 at least 90 percent, and at least 10 points above the untrained model on the same test queries. The untrained DINOv2 small scored 14.2 percent on these queries in run 3.
- Product recall at 5 at least 97 percent.

Validation is already below both bars, so the expected result is a fail. It is reported whatever it is.

## Known limits and contamination

- Run 3's own image only test score (78.3 top-1, 91.7 recall at 5) was printed once in results/matcher3/run.log before the fusion weights were chosen. That is a small look at the test set. No test query was used for any choice.
- While run 3 was training, this work's rendering, OCR and SIFT jobs shared the CPU. Run 3's training cap counted wall clock training time, and its epochs 7 and 8 took about 2 to 3 times longer than the others, so run 3 got fewer training steps than it would have alone. Its checkpoint choice used validation only.
- Queries are synthetic photos from the same renderer used to train run 3. This says nothing about real phone photos.
- 13 of the 137 validation misses are products whose artwork is nearly identical (embedding cosine above 0.99) to the right product's. No image method can separate those.
- Florence-2 and Apple Vision are fixed pretrained readers. Vision behaviour can change with macOS updates.
- This is the fourth attempt on the same 3,588 products.

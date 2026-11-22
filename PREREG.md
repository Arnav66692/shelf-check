# Shelf Check recognition pilot, preregistration

Written Sat Nov 21 2026, about 10:55 AM PT, before any label image was read by any model.

## Question

Can the app read a medicine label image and land on the right official record, well enough to build on?

## Two stages

Stage 1 uses public label images, so it can run now. Stage 2 uses Arnav's own phone photos of real bottles and is the real gate. Stage 1 passing only means Stage 2 is worth running.

## Stage 1 test set

20 products, fixed in `testset/products.json` before any model runs:

- 8 over-the-counter, including Tylenol Extra Strength, NyQuil, Benadryl, Tylenol PM, Bayer aspirin, Advil.
- 8 prescription, including warfarin, lisinopril, sertraline, metformin.
- 4 supplements from the NIH supplement label database.

Each product's image is the package label image from its DailyMed or NIH record. Ground truth (active ingredients and strengths) comes from the structured part of the same record, not from the image. If a product has several label images, take the first one whose file is at least 30 KB. These are flat label artwork, so they are easier than a photo of a curved bottle.

## Readers (each scored on its own)

- Reader A, the kind that can run in the browser: Florence-2 base (fine-tuned), OCR task. Free and private.
- Reader B, a local vision language model through Ollama, standing in for a hosted vision model. It is asked for JSON with product name, active ingredients and strengths. It gets the image only.

## Matcher (the same for both readers, plain code)

Reader output goes to RxNorm approximate match and the openFDA label search. The pipeline's answer is a set of active ingredients with strengths. No model output is trusted as fact. A product counts only if the official lookup returns it.

## Metrics

1. Ingredients right: the ingredient set equals the ground truth set exactly, after mapping both to RxNorm ingredient names.
2. Strength right: every ingredient's strength and unit match ground truth. Scored only on the 16 drug products.
3. Planted pairs caught: Tylenol Extra Strength with NyQuil (acetaminophen twice), Benadryl with Tylenol PM (diphenhydramine twice), warfarin with Bayer aspirin (interaction named in the warfarin label). A pair is caught only if both products were recognized from their images and the plain-code check fires.
4. False alarms: the same check run on 5 preset safe pairs must fire on none.

## Stage 1 pass bar (fixed now)

A reader passes if: ingredients right on at least 18 of 20, strength right on at least 14 of 16, all 3 planted pairs caught, 0 false alarms on the 5 safe pairs.

- Reader A passes: build with in-browser reading.
- Only Reader B passes: the build needs a hosted vision model. That has a cost, so Arnav decides.
- Neither passes: Shelf Check stops and the build moves to the best idea from the research agents.

## Stage 2 bar (unchanged from what Arnav was told)

On 12 of his own phone photos: ingredient and strength right on at least 11, at least 10 matched to an official record, all 3 planted pairs caught.

## Not tested here

Barcode scanning, loose pills, non-US products, compounded vials, and the unit math for injections. Unit math is plain arithmetic and gets its own tests.

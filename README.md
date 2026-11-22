# Shelf Check

Check every medicine you own against its official label. Shelf Check reads the official FDA labels of everything in your cabinet together and shows the same drug hiding in two products, labels that warn about each other, and warnings written for people like you. Every warning quotes the line on the label it came from.

**Live:** https://shelf-check-nu.vercel.app

Built for EvoHacks 2 (Projects for Social Good), November 21 to 22, 2026.

> Shelf Check is a safety check, not medical advice. No warning does not mean safe, because a label can be silent about a real risk. In an emergency call 911. For a possible poisoning call Poison Help at 1-800-222-1222.

## Features

- **Cabinet check.** Add prescriptions, over the counter medicines, supplements and peptides. Shelf Check reads all of their labels together and flags doubled ingredients with the daily total at each label's maximum, labels that name another product or drug class you own, supplements a drug label warns about, and warnings that apply to your age, conditions, pregnancy, alcohol use and allergies.
- **Zephyr.** Our own image model. Show it a box and it finds the 5 closest official labels, or scan a whole shelf from one photo. It runs on your device, so the photo is never uploaded.
- **Scan your whole cabinet.** A shelf photo read by Zephyr, or barcodes one after another with the camera left on. You tick what is right and add everything at once.
- **Learning center.** What each medicine is for, when it starts working, how to take it, food and drink, side effects, rest and driving, and who should not take it. Every line is quoted word for word from the FDA label.
- **Find care.** Pharmacies, urgent care and emergency rooms near you, sorted by how you feel, with a call button to ask a pharmacy whether it has your medicine in stock.
- **Symptoms, pill finder and dose check.** What you already own that is labelled for a symptom, with emergency phrases sent to 911, 988 or Poison Help. A pill finder by imprint, colour and shape. An injection dose check that shows where the plunger stops.
- **For the whole family.** Separate cabinets for people you care for, a printable list for the pharmacist, read aloud, larger text and a pre-built example cabinet to try.

## How it works

Every warning comes from rules over official label text, never from a model. The rules engine reads:

- FDA drug labels, the NDC directory and recalls through openFDA and DailyMed
- NIH RxNorm and RxClass to resolve names and drug classes
- The NIH Dietary Supplement Label Database
- The NLM Pillbox archive for the pill finder

Zephyr only helps you find a product. You confirm every match against the official record before it is added.

## Repository layout

| Path | Contents |
|---|---|
| `web/` | The Next.js app |
| `engine/` | The rules engine in TypeScript, 764 tests |
| `lookup/` | Product lookup by name, NDC or barcode across openFDA, DailyMed, RxNorm and the NIH supplement database, 113 tests |
| `web/src/server/learn/` | The learning center, 17 tests |
| `web/public/matcher/` | Zephyr: the ONNX model, the gallery of official label images and the web worker that runs it |
| `train_matcher.py`, `train_matcher_v2.py`, `render.py`, `extract_labels.py` | Training the image model on generated photos of official label images |
| `tools/` | Model export and evaluation scripts |
| `reader_service.py`, `readers.py`, `verify.py` | The local label reader and its cross-check, from the earlier prototype |
| `benchmark/` | The interaction benchmark and its results |
| `PREREG*.md` | Pass bars, written and hashed before each test ran |
| `results/` | Test results |
| `qa/` | Accessibility and phone layout checks |

## Run it

Web app (Node 20 or newer):

```bash
cd web && npm install && npm run dev
```

Then open http://localhost:3000. Everything works without setup. An optional free openFDA key raises the daily lookup limit:

```bash
export OPENFDA_API_KEY=your-key
```

Tests:

```bash
cd engine && npm install && npm test
```

```bash
cd lookup && npm install && npm test
```

```bash
node --test web/src/server/learn/lesson.test.ts
```

## Results

Every bar below was written and hashed before the test ran. Failed results are reported as failed.

### Interaction benchmark

Bars in `benchmark/PREREG.md` and `benchmark/PREREG-B2.md`.

| Test | Result | Bar | Verdict |
|---|---|---|---|
| Acetaminophen doubled, 40 random products each with Tylenol | 40 of 40 | 38 of 40 | Passed |
| 40 pairs with no listed interaction, false alarms | 1 of 40 | at most 4 | Passed |
| 40 major interactions from DDInter, first version | 8 of 40, then 4 of 40 after safety fixes | none set | Weak |
| 40 new major interactions from DDInter, with drug class matching | 10 of 40 (five reruns: 10, 10, 9, 9, 10) | at least 10 | Passed, at the bar |
| 40 more pairs with no listed interaction, false alarms | 0 of 40 | at most 4 | Passed |

Most missed interactions are described on the labels by drug type or effect rather than by name, which the engine does not yet turn into drug names.

### Zephyr

| Test | Result | Bar | Verdict |
|---|---|---|---|
| Single product, 2,283 held out photos (`results/matcher-web/result.json`) | 76.2% first guess, 91.1% in the top 5 | 90% first guess | Failed, ships as a suggestion that shows 5 choices |
| Shelf photo, 300 test shelves of 3 or 4 products (`PREREG-SHELF.md`, `results/shelf-scan/`) | 62.8% of products found, 0.93 wrong per shelf | at least 60% found, at most 1 wrong | Passed |

Training runs 1 to 4 all missed the 90 percent bar. They and the photo reader prototype are recorded in the `PREREG-TRAINED*.md` files and `results/`. A hybrid that adds text reading and keypoint matching reached 85.7% first guess, but it needs macOS frameworks and does not run in a browser, so it is not in the app.

All Zephyr test photos are generated from official label images, not taken on a phone, so real photos will likely score lower. That is why every match is confirmed by the person before it is added.

## Data sources

- FDA: openFDA drug labels, NDC directory and recalls (https://open.fda.gov), DailyMed labels and images (https://dailymed.nlm.nih.gov), the FDA flush list
- NIH: RxNorm and RxClass (https://lhncbc.nlm.nih.gov/RxNav), Dietary Supplement Label Database (https://dsld.od.nih.gov)
- NLM Pillbox archive
- WADA 2026 Prohibited List
- OpenStreetMap: Nominatim, Overpass and map tiles

## Credits

Image model: DINOv2 (Meta). Earlier prototype readers: Qwen3-VL 8B and Florence-2. Libraries: Next.js, React, Tailwind CSS, ONNX Runtime Web, Leaflet, ZXing, PyTorch, Transformers, FastAPI, Vitest. Fonts: Telma from Fontshare and Nunito Sans. Map data from OpenStreetMap contributors. The visual design is an original rebuild inspired by the Orano innovation experience. No code, images or models were copied.

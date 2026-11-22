# Shelf Check

Check every medicine you own against its official label. Shelf Check reads the official labels of everything in your cabinet together and shows double doses, labels that warn about each other, and warnings written for people like you, each one quoted from the label.

Live: https://shelf-check-nu.vercel.app

Built for EvoHacks 2 (Projects for Social Good), November 21 to 22, 2026.

A safety check, not medical advice. No warning does not mean safe, because a label can be silent about a real risk.

## What is in the repo

| Folder or file | What it is |
|---|---|
| `engine/` | The rules engine in TypeScript. Duplicates, daily totals, interactions, health profile warnings, supplements, label tags, recalls, disposal, peptides, injection math, pill matching. No AI model decides any warning. 566 tests. |
| `lookup/` | Finds the official record for a product by name, drug code (NDC) or barcode, across openFDA, DailyMed, RxNorm and the NIH supplement database. 75 tests. |
| `web/` | The Next.js app. |
| `reader_service.py`, `readers.py`, `verify.py` | The local photo reader and the cross-check that decides when a reading counts as matched. |
| `train_matcher.py`, `render.py`, `extract_labels.py` | Training our own label matcher (DINOv2) on made up phone photos of official label images. |
| `PREREG*.md`, `PREREG.sha256` | The pass bars, written and hashed before each test ran. |
| `results/` | Test results. |
| `submission/` | The video script, code walkthrough and Devpost text. |

## Run it

Web app (needs Node 20 or newer):

```bash
cd web && npm install && npm run dev
```

Then open http://localhost:3000. Search, warnings, peptides, the pill finder and the dose check all work with no setup. An optional free openFDA key raises the daily lookup limit:

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

Photo reader and possible causes (optional, run on a Mac with Ollama):

```bash
ollama pull qwen3-vl:8b
```

```bash
uvicorn reader_service:app --host 127.0.0.1 --port 8787
```

The web app finds the reader at `http://127.0.0.1:8787`, or at `READER_URL` if set.

## Does it catch real problems?

Run on the live app with the bars written and hashed first (`benchmark/PREREG.md`, results in `benchmark/RESULTS.md`).

| Test | Result | Bar | Verdict |
|---|---|---|---|
| Acetaminophen doubled: 40 random products, each with Tylenol | 40 of 40 | 38 of 40 | Passed |
| Same pairs: daily total in mg | 27 of 40 | none | Measured |
| 40 major interactions from DDInter | 8 of 40 (95% interval 10 to 35%) | none | Weak |
| 40 pairs DDInter does not list: false alarms | 1 of 40 | at most 4 | Passed |

Shelf Check only flags what a label states. Most missed interactions are described on the labels by drug type or effect rather than by name.

## How we tested the photo reader

Each bar was written down before the test ran (see the `PREREG` files).

| Test | Result | Bar | Verdict |
|---|---|---|---|
| Florence-2 base on 20 public label images | 8 of 20 right | 18 | Failed |
| Qwen3-VL 8B on the same 20 | 17 of 20 right | 18 | Failed |
| Qwen3-VL 8B on 100 new tablet and capsule labels | 82 fully right, 5 confidently wrong | 90, at most 3 wrong | Failed |
| Cross-check on 100 more new labels | 61 marked matched, 0 of those wrong | 50, at most 1 wrong | Passed |
| Our trained DINOv2 matcher, 2,175 held out photos | 78.0% first guess, 91.3% top five (untrained 4.1%) | 90%, 97% | Failed, not used in the app |

The test images are official label artwork, not phone photos of real bottles, so real photos would likely score lower. With 61 matched and none wrong, the true error rate could still be about 5 percent, which is why the app always asks you to confirm.

## Data sources

- FDA: openFDA drug labels, NDC directory and recalls (https://open.fda.gov), DailyMed labels and images (https://dailymed.nlm.nih.gov), the FDA flush list, recall definitions, compounding and GLP-1 pages
- NIH: RxNorm and RxClass (https://lhncbc.nlm.nih.gov/RxNav), Dietary Supplement Label Database (https://dsld.od.nih.gov)
- NLM Pillbox archive, frozen in 2020
- WADA 2026 Prohibited List

## Credits

Open weight models Qwen3-VL 8B, Florence-2 and DINOv2. Libraries: Next.js, React, Tailwind CSS, ZXing, PyTorch, Transformers, FastAPI, Vitest. Built with an AI coding agent (Claude Code).

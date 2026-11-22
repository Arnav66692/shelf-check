# Shelf Check benchmark preregistration

Written 2026-11-21 20:21 PST, before any benchmark request to the live app, before downloading DDInter, and before sampling anything. The SHA-256 of this file goes in PREREG.sha256 right after it is written. Nothing below changes after that. Any change to the harness made after the first run is listed in RESULTS.md under "Harness changes", with the reason.

## System under test

Shelf Check at https://shelf-check-nu.vercel.app, through two endpoints:

- `GET /api/search?q=<text>` returns `{ products, note? }`.
- `POST /api/check` with `{ items: [productA, productB], profile: {} }` returns `{ flags, unchecked }`.

The app is not changed or tuned in any way for this benchmark. Engine source was read only to learn what each flag type means.

## Request rules

- One request at a time, a 400 ms pause before every network request, User-Agent `shelf-check-benchmark/0.1`.
- Hard cap of 700 network requests in total across all runs. The harness counts every network request, retries included, in `benchmark/cache/request-log.jsonl` and refuses to send request 701. Anything not run because of the cap is reported as not run.
- Every successful (2xx) response is cached to disk under `benchmark/cache/`, keyed by method, path and body. A rerun reads the cache and sends nothing for cached calls.
- Timeout 90 s per request. On a network error, timeout, 429 or 5xx, one retry after 5 s. A response that still fails is recorded as an error, not cached.

## Randomness

One seeded generator, mulberry32, seed `20261121`, a fresh instance per test (A, B, C), so each test's sample does not depend on the others. Candidate lists are sorted before shuffling (Fisher-Yates) so the order is fixed by the data and the seed alone.

## Test A, double dose coverage

Source: `data/drug-ndc.json.zip` (openFDA NDC directory), read in place.

Candidate products: every record with `finished == true`, `product_type == "HUMAN OTC DRUG"`, `route` containing `"ORAL"`, an active ingredient whose name is exactly `ACETAMINOPHEN`, and a `labeler_name` that does not contain "kenvue" (case-insensitive). Sorted by `product_ndc`, shuffled, first 40 taken. No replacement: a product the app cannot find or cannot check stays in the sample and counts as a miss.

Reference product: the first product returned by `/api/search?q=50580-590` (TYLENOL Extra Strength).

For each sampled product: `/api/search?q=<its product_ndc>`, take the first result whose `productNdc` equals the sampled `product_ndc` (if none, the first result; if no results, the pair is "not found"). Then `/api/check` with `[sampled product, TYLENOL]`.

- **A1**: share of the 40 pairs with a flag of type `duplicate_ingredient` whose title names acetaminophen (case-insensitive) and whose `itemIds` include both product ids. **Bar: at least 38 of 40. PASS or FAIL.**
- **A2**: share of the 40 pairs with a flag of type `daily_total` whose title names acetaminophen and whose `explain` states a numeric daily amount, matched by the regex `/\d[\d,]*(\.\d+)?\s*mg of acetaminophen a day/i`. **No bar, REPORTED.** It measures how often labels word their limits in a way the app can read.

## Test B, known major interactions

Reference: DDInter (https://ddinter.scbdd.com/download/, CC BY-NC-SA 4.0). Download the per-ATC-group interaction CSV files listed on the download page, all of them if their total is under 30 MB, since Test C needs the full list to say a pair is absent. Files are saved as downloaded under `benchmark/ddinter/` and never edited. Drug names are compared lowercased and trimmed. A pair is unordered. A pair's level is the most severe level it gets in any file (Major over Moderate over Minor over Unknown).

Pool of common oral drugs: a DDInter drug name is in the pool when the NDC directory has at least one record with `finished == true`, `product_type` of `HUMAN PRESCRIPTION DRUG` or `HUMAN OTC DRUG`, `route` containing `ORAL`, `dosage_form` containing `TABLET` or `CAPSULE`, exactly one active ingredient, and that ingredient's name matches the DDInter name. Match means equal after lowercasing, either as written or after removing trailing salt or hydrate words from this fixed list, while keeping at least one word: hydrochloride, hcl, dihydrochloride, hydrobromide, sodium, potassium, calcium, magnesium, maleate, tartrate, bitartrate, succinate, besylate, mesylate, dimesylate, citrate, sulfate, phosphate, acetate, fumarate, hemifumarate, bromide, chloride, nitrate, lactate, gluconate, disodium, dipotassium, monohydrate, dihydrate, trihydrate, hemihydrate, sesquihydrate, anhydrous, hyclate, malate, mandelate, napsylate, pamoate, tosylate, valerate, propionate, oxalate, benzoate, embonate, xinafoate, camsylate.

Sampling: all unordered DDInter pairs whose level is Major and whose two drugs are both in the pool, sorted by `"a|b"`, shuffled. The harness walks this order and keeps a pair when both drugs resolve to a product and the check runs with both labels read (empty `unchecked`). It stops at 40 kept pairs or after 120 candidates, whichever comes first. Skipped pairs and their reasons are recorded.

Resolving a drug to a product: `/api/search?q=<DDInter name>`, take the first result that has a `productNdc`, is not a supplement, and has exactly one ingredient whose name matches the drug by the same salt rule. If none qualifies, the drug is "not found" and the pair is skipped. The resolved product for a drug is reused in every pair that drug appears in.

- **B1**: share of kept pairs where `/api/check` returns a flag of type `interaction` whose `itemIds` include both product ids. **No bar, REPORTED with a 95 percent Wilson interval.** The point is to measure how often FDA labels themselves state a known major interaction. A low number is a real finding and the write-up must report it.

## Test C, false alarms

Same pool. Sampling: draw two pool drugs at a time with the seeded generator (pool sorted by name), reject a draw if both are the same drug, if the pair was already drawn, or if the pair appears in DDInter at any level. Same resolve-and-check walk as B, same stop rule (40 kept pairs or 120 candidates).

- **C1**: share of kept pairs with any `interaction` flag between the two products. **Bar: at most 4 of 40. PASS or FAIL.** Every fired flag's quotes are recorded so a person can judge whether the label really says it. The bar is judged on the raw count, before any human review of the quotes.

## Outputs

- `benchmark/run.mjs`: the harness, Node 20 or newer, no dependencies.
- `benchmark/results.json`: every sampled product or pair, every search choice, every flag and every quote, plus request counts.
- `benchmark/RESULTS.md`: the table of A1, A2, B1 (with interval), C1 against these bars, five example rows per test, and the failure reasons seen.

## What will not happen

No change to the bars, the sampling, the matching rules or the flag criteria after seeing any result. If the harness breaks mid-run, only the harness is fixed, the run resumes from the cache, and the change is reported.

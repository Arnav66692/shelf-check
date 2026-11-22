# Shelf Check interaction benchmark B2

Registered 2026-11-22 before drawing the B2 samples or sending a B2 request. This run uses the method in [PREREG.md](PREREG.md), tests B and C, with the reference coverage described in [PREREG-ADDENDUM.md](PREREG-ADDENDUM.md).

Use the saved NDC directory and eight DDInter files, the same single-ingredient oral drug pool, salt matching, product resolution, and label-read criteria. Start a separate mulberry32 generator at seed `20261122` for each test. Exclude the unordered pairs kept in the previous run, recorded in `results-rerun2.json`, before evaluating new candidates.

- **Test B** draws 40 new DDInter Major pairs by shuffling the sorted eligible pairs. Pass if at least 10 of 40 have an interaction flag linking both resolved products. The previous run caught 4 of 40. Ten catches is the preregistered threshold for meaningful improvement.
- **Test C** draws 40 new unordered pairs from the sorted pool, rejecting self-pairs, repeats and pairs listed at any severity in the downloaded files. Pass if at most 4 of 40 have an interaction flag linking both resolved products. Score the raw count before reviewing quotes. An unlisted pair can still interact, so this count is an upper bound on false alarms.

In each test, keep pairs only when both products resolve and the check reads both labels. Stop at 40 kept pairs or 120 eligible candidates. A test with fewer than 40 kept pairs cannot pass. Record skipped pairs and reasons, exact counts, 95% Wilson intervals, and the quotes for every flagged pair.

The server address comes from `BASE_URL`. Use a fresh `benchmark/cache-b2/` and the original request pacing, retry rules, timeout, and 700-request cap across B2 attempts. Write the machine-readable results to `benchmark/results-b2.json` and the report to `benchmark/RESULTS-B2.md`. The SHA-256 fingerprint of this registration is recorded in `benchmark/PREREG.sha256`.

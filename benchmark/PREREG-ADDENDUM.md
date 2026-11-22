# Preregistration addendum 1

Written 2026-11-21 20:24 PST, after downloading DDInter and before any sampling or any request to the live app. PREREG.md is unchanged (its hash is in PREREG.sha256). This addendum changes no procedure, bar or rule. It records a fact about the reference that affects how Test C must be read.

1. The DDInter download page offers 8 files, one per ATC group: A, B, D, H, L, P, R, V. All 8 were downloaded, 15 MB in total, under the 30 MB limit. The page HTML is saved as `ddinter/download-page.html`.
2. There is no file for groups C (cardiovascular), G, J (anti-infectives), M, N (nervous system) or S. A pair whose two drugs both sit only in those groups, such as two nervous system drugs, cannot appear in the download even if DDInter rates it on its website. So in Test C, "not in DDInter" means "not in these 8 files". Some Test C pairs may be real interactions. This makes C1 a ceiling on the false alarm rate, not an exact one, and RESULTS.md will say so. The quotes for every C flag are recorded for human review as planned.
3. Some CSV fields hold commas inside quotes (for example drug names like "Thyroid, porcine"). The harness parses quoted fields. Levels seen in the files are Major, Moderate, Minor and Unknown, matching the rule in PREREG.md.

# Judge A review of Shelf Check

Reviewer stance. The harshest judge on a 60 entry panel, looking for reasons to mark this entry down.

What I tested. The live site https://shelf-check-nu.vercel.app, driven with Playwright in Chrome at 1440x900 and at 390x844 (phone, touch), on Nov 21 2026 between about 9:35 and 10:00 PM PT. I also read the repo, the Devpost text, the benchmark, the video script and the code walkthrough, and ran the engine and lookup tests. Screenshots are in `reviews/judge-a/`. File names are cited next to each finding.

Important context. The live deploy is the cream paper look. The working tree has an unreleased "Flora night-sky" restyle committed at 9:47 PM (commit 0d21ca6, not live when I checked) and 32 uncommitted changed files in `engine/` and `lookup/`. Everything below is about the live site unless I say the repo.

## Scores

| Criterion | Score |
|---|---|
| Fit to Prompt | 7 |
| Problem and Impact | 6 |
| Functionality and Technical Execution | 6 |
| Usability and Accessibility | 6 |
| Appropriate Use of Technology | 8 |
| Video/Demonstration (script) | 5 |
| Total | 38 of 60 |

## Things that would make a judge distrust this entry

These are ranked by how much damage each would do if a judge found it in their 10 minutes.

1. A fish oil supplement next to warfarin gives a scary and wrong warning. Shelf Check shows an "ASK FIRST" card titled "Warfarin Sodium and Fish Oil" that quotes "( 5.4 ) Systemic atheroemboli and cholesterol microemboli: Some cases have progressed to necrosis or death." That warfarin line has nothing to do with fish oil. The match comes from the supplement's nutrition rows. The app lists "Cholesterol 15 mg per 2 Softgel(s)" as an active ingredient, and "cholesterol" then matches the warfarin label. A health app quoting "necrosis or death" for the wrong reason is the single worst thing a judge could find. Screenshot `16-warfarin-fishoil-false-match.png`.
2. Supplements show nutrition facts as active ingredients. The Nature's Bounty Fish Oil card lists "Calories", "Calories From Fat", "Total Fat", "Saturated Fat", "Cholesterol" under "Active ingredients". Search results show raw template text, "Calories 10 {Calories} per Softgel(s)". Screenshot `10-search-fish_oil.png`, `13-real-cabinet-1440-full.png`.
3. Ozempic is not checked in the cabinet. After adding Ozempic the page says, in small grey text below all the warnings, "Not checked, because no official label text was found: Ozempic." The Peptides page quotes the Ozempic label in full, so the data exists. One of the most talked about drugs in the US silently drops out of the main check.
4. A prescribed blood thinner still gets the red badge. Eliquis plus Advil PM shows a red "CHECK NOW" card. The Devpost says a red stop sign on a prescribed blood thinner was found in review and "I fixed those", and commit 8b4b5d6 says "Prescribed medicines never get a stop badge". Both are contradicted on the live site. Screenshot `15-eliquis-advilpm-checknow.png`. An expired warfarin bottle also shows "CHECK NOW".
5. A warning that quotes a different drug. With Tylenol PM and Eliquis, the card "Tylenol PM and ELIQUIS" quotes only "taking the blood thinning drug warfarin". The label names warfarin, not apixaban. The class match is defensible, but the user sees a quote that does not name their drug, and the Devpost promises every warning "points to a real sentence on a real label".
6. The photo button is broken on the live site. "Use a photo of the label" is a primary link on the Add page. On the live site it returns HTTP 503 and the message "The photo reader is not running here. Type the name or the code printed on the label." Barcode scan falls back to the same photo reader. A judge clicking the most impressive sounding button gets an error. Screenshot `54-photo-live.png`, `55-barcode.png`.
7. The dose check shows a dose that does not fit the syringe, with no warning. Vial 1 mg per mL, dose 5 mg, gives "Units on a U-100 insulin syringe 500 units" while the drawing stops at 100. There is no STOP. For a feature sold as catching dosing errors, this is a safety gap. Screenshot `30-dose-overfull.png`.
8. Stale or wrong numbers in the write-up. The Devpost and README say the engine has "567 tests" and lookup "75 more". Running them in the repo now gives engine 574 tests with 7 failing (all in `engine/test/dailyTotal.test.ts`, the headline feature, inside uncommitted changes) and lookup 86 tests. The numbers should match what a judge gets on `npm test`.
9. Unsourced claims in the copy. Home page says "most people never notice". The video hook says "Most people would take both when they're sick, and most people don't know they're both acetaminophen." The cited study supports 45.6 percent saying they would double up in at least one scenario, which is not "most people never notice".
10. Symptoms suggests risky options without an inline warning. With the example cabinet (which includes warfarin), typing "headache" lists Tylenol, NyQuil, Bayer Genuine Aspirin and Advil Liqui-Gels as products "In your cabinet for this". The aspirin and Advil cards carry no warning on the card. The warfarin plus aspirin warning is about 4,000 characters further down under "Before you take one". Screenshot `21b-symptom-headache-viewport.png`.
11. The peptide screen does vial math for unapproved products. For BPC-157 it shows "No approved use. No approved dose" and then computes "10 units" for "the dose your prescriber gave you". Some judges will read this as harm reduction. Others will read it as a how-to for injecting research peptides, which is a bad look under "Projects for Social Good". Screenshot `42-peptide-bpc-math.png`.
12. Small credibility leaks. The confirm panel says "Over the counter. Confirmed against the FDA record." before the user has confirmed anything. The lisinopril 5 mg confirm panel shows a 2.5 mg label picture first (`65-phone-confirm.png`). The pill finder says "GUESS 1, IMPRINT MATCHES" when the imprint box was left blank, and shows "Photo from the NLM Pillbox archive, product code 0406-0367" above "Product code (NDC) 0406-0125". Only 2,830 of the 83,912 pill records are current DailyMed records, the rest are from an archive frozen in 2020.

## Fit to Prompt, 7 of 10

Biggest reason it is not a 10. The entry never names who it serves beyond "anyone keeping track of medicines" and has no evidence anyone in that group used it. Social good judges reward a named community and a reason this group is underserved (older adults on many medicines, caregivers, people without a regular pharmacist, low literacy readers). Instead, a third of the nav ("Peptides", "Dose check", WADA lists, BPC-157 recalls) reads like a biohacker tool, which dilutes the social good story.

Fixes, ranked.
1. Devpost "Inspiration" and home page hero, name the group in one sentence, for example adult children managing a parent's medicines, and add one line on why they are underserved. About 20 minutes. Plus 0.5.
2. Run the hashed `submission/USER-TEST.md` with 2 or 3 people tonight and put the one line result on the Devpost and on `/tested`. About 2 hours. Plus 0.5 here, plus more under Impact.
3. Move Peptides out of the main story. Keep the page, drop it from the video and the Devpost "What it does" list, or reframe it as "checks what the FDA has said about peptides sold online" without the vial math for unapproved peptides. About 30 minutes. Plus 0.3.

## Problem and Impact, 6 of 10

Biggest reason it is not a 10. Impact is asserted, not shown. No real person has used it ("No real users have tested it yet" in the Devpost), and the benchmark shows the interaction check catches 8 of 40 major interactions (20 percent). The thing it does reliably, acetaminophen hiding in two products, is real but narrow, and the existing free tools a judge knows (pharmacist, Drugs.com checker, the labels themselves) already cover it. The honesty is good. It also hands a harsh judge the number to mark you down with.

Fixes, ranked.
1. Run the user test and report it, even if small, for example "2 of 3 people said both boxes were fine before the app, 3 of 3 caught it with the app". About 2 hours. Plus 1.0.
2. Lead the Devpost and video with the 40 of 40 duplicate result and the 1 of 40 false alarm result, and frame the 8 of 40 as a known limit with the planned fix. It is already in `benchmark/RESULTS.md`, it is just not in the video. About 15 minutes. Plus 0.3.
3. Remove "most people never notice" and "most people don't know" or replace with the sourced 45.6 percent figure. About 10 minutes. Plus 0.2, and it removes a distrust point.

## Functionality and Technical Execution, 6 of 10

Biggest reason it is not a 10. The core flows work and the data plumbing is real (openFDA, DailyMed, RxNorm, NIH DSLD, Pillbox, FDA recalls), but in 10 minutes I hit a false fatal-sounding warning, a dropped headline drug, a broken button, a broken phone menu, and an unsafe dose display. Each is small to fix. Together they say "not finished".

What worked. Search for Tylenol, NyQuil, Advil, warfarin, lisinopril, St. John's Wort, Ozempic, Eliquis, Zoloft, metformin, an NDC code (00093-1720) all returned records in 0.3 to 1.7 seconds. "Coumadin" correctly says "Coumadin is a brand name for warfarin." Empty and one letter searches say "Type a medicine name first, like warfarin or Tylenol." The acetaminophen daily total of 5,600 mg is correct (6 x 500 mg plus 4 x 650 mg). Warfarin with St. John's Wort is caught with a quoted label line. The diphenhydramine triple (Tylenol PM, Benadryl, Advil PM), Zoloft with tramadol, and Zoloft with Eliquis are all caught. Reload keeps the cabinet. Emergency symptom phrases ("chest pain and my left arm is numb", "I can't breathe") go to a "Call 911" screen. The dose mismatch check (0.25 mg written as 50 units) correctly says "That is 10 times more than the prescribed dose." No console errors except the expected 404 and the 503 from the photo reader.

Fixes, ranked by points.
1. Filter nutrition rows out of supplement ingredients, both for display and for matching. Drop calories, calories from fat, total fat, saturated, trans, mono and polyunsaturated fat, cholesterol, sodium, total carbohydrate, sugars, protein, dietary fiber, and strip `{...}` template text. Look in `lookup/src/dsld.ts` and `engine/src/supplement.ts`. Add a regression test with the Nature's Bounty Fish Oil record and warfarin. About 45 minutes. Plus 1.0 (also helps Usability).
2. Hide or relabel the photo button on production when `READER_URL` is not set, for example "Photo reading runs on the local version, shown in the video". In `web/src/components/AddView.tsx`, and route barcode photo fallback the same way in `BarcodeScanner.tsx`. About 20 minutes. Plus 0.4.
3. Dose check, add a STOP when the dose is over 100 units or over 1 mL ("This dose does not fit on a 1 mL insulin syringe. Check the vial strength and the dose with a pharmacist."), and a plausibility check on very large vial strengths. In `engine/src/flags/units.ts` and `web/src/components/DoseView.tsx`. About 30 minutes. Plus 0.4.
4. Ozempic in the cabinet. When openFDA has no label text for an NDC, fall back to the DailyMed SPL the peptide page already uses, and move the "Not checked" line into the top summary box in plain words. In `web/src/server/cabinet.ts`. About 1 to 1.5 hours. Plus 0.5.
5. Get `engine` tests green before any deploy. The 7 failures are in uncommitted changes to the daily total code, which is the feature the video explains on camera. Either finish them or stash them. Then update the test counts in `README.md` and `submission/DEVPOST.md`. About 30 minutes. Plus 0.3, and it removes a distrust point.
6. Search ranking. "Tylenol" returns "Infants TYLENOL" first and "TYLENOL Extra Strength" seventh. Rank adult single ingredient products and exact brand matches above Infants, Children's and Kit unless the query asks for them. In `lookup/src/ranking.ts`. About 1 hour. Plus 0.3.
7. Pill finder copy. Do not say "IMPRINT MATCHES" when no imprint was typed, and make the photo caption name the same product code as the card. In `web/src/components/PillFinder.tsx`. About 20 minutes. Plus 0.1.

## Usability and Accessibility, 6 of 10

Biggest reason it is not a 10. Alert fatigue, plus a broken phone nav. My 8 product test cabinet produced 16 cards ("2 things to check with a pharmacist before the next dose. 11 to ask a pharmacist about, 3 notes to read."). The example cabinet on a phone is 10,828 pixels tall, and the "Your cabinet" list starts 8,182 pixels down, so a phone user scrolls about ten screens to see what they added. On a phone the "More tools" menu opens off the left edge of the screen (menu box from x = -94 to x = 96 on a 390 wide screen), so "Pill finder", "Dose check" and "Peptides" are cut off. Screenshot `63-phone-moretools.png`.

What is good. The type is large and clear, buttons are big, the confirm button now sits above the pictures and is visible after picking a result on a phone, there is a larger text switch and read aloud, every card has a bold "What to do" line, and no page scrolls sideways on a phone except the `/tested` table, which scrolls inside its own box.

Fixes, ranked.
1. Phone "More tools" menu. In `web/src/components/SiteHeader.tsx` the menu uses `absolute right-0` inside a `details` that sits at the left edge on a phone. Use `left-0 sm:left-auto sm:right-0`, or show all seven links inline below 640 px. Add a phone check that asserts every nav link is inside the viewport. About 15 minutes. Plus 0.6.
2. Cut the noise. Fold the NOTE cards (Alcohol, Drowsiness, Grapefruit, Sun) into one collapsed "Also on your labels" block, merge the "Daily alcohol" profile card with the "Alcohol" note (they quote the same lines), and drop daily total cards that only say "the labels do not give enough to add up a daily amount". In `web/src/components/CabinetView.tsx`. About 1.5 hours. Plus 0.5.
3. On phones, show a short "Your cabinet (8)" list or a jump link at the top of the warnings. About 30 minutes. Plus 0.2.
4. NOTE badges are dark green (`--ok`, #17603f). Green reads as "safe" next to "Alcohol" and "Grapefruit". Use a neutral grey or blue. In `web/src/components/FlagRow.tsx`. About 5 minutes. Plus 0.15.
5. Add "Clear this cabinet" or "Leave the example". Right now leaving the example takes six separate "Remove" clicks, and the example button disappears once anything is in the cabinet. About 15 minutes. Plus 0.2.
6. Titles with three products read badly, for example "Bayer Genuine Aspirin and Lisinopril and Hydrochlorothiazide". Write "Bayer Genuine Aspirin with Lisinopril and Hydrochlorothiazide". About 10 minutes. Plus 0.1.
7. The 1440 wide home page leaves the right half empty. Put one real warning card (the acetaminophen daily total) in that space so a judge sees the product in the first 5 seconds. About 30 minutes. Plus 0.2.
8. The questionnaire asks a 72 year old "Pregnant or could be". Hide it above an age cutoff. About 10 minutes. Plus 0.05.

## Appropriate Use of Technology, 8 of 10

Biggest reason it is not a 10. The "AI reads, the official data decides" story is right for a health app, and the preregistered bars with failures reported are the best part of this entry. But the AI half is not in the live product. The vision reader and the trained DINOv2 matcher only run on the laptop, and the matcher failed its bar. What judges can use is a keyword and drug class matcher, and its false positives (cholesterol, a warfarin line shown for Eliquis) are exactly the failures a deterministic system should not have.

Fixes, ranked.
1. Show the matched term and why in each class based card, for example "Matched because Eliquis is a blood thinner, the label names warfarin". In `engine/src/flags/interactions.ts` and `FlagRow.tsx`. About 1 hour. Plus 0.4.
2. Make severity follow the drug pair class, not which label section the line sits in. Today warfarin plus Advil is "ASK FIRST" while Eliquis plus Advil PM is "CHECK NOW", because one quote happens to come from a boxed warning. Pick one rule and state it on `/tested`. In `engine/src/flags/severity.ts`. Then make the Devpost sentence about the red badge match the code. About 1.5 hours. Plus 0.4.
3. On `/tested` and in the Devpost, say in one sentence that the live app uses no AI model, and the photo reader is a tested local prototype. About 10 minutes. Plus 0.2.

## Video/Demonstration (script), 5 of 10

Biggest reason it is not a 10. The script does not match the live app, so a judge who tries what they just watched will see something different. Section 1 says "the red Stop card", the app says "CHECK NOW". Section 3 adds Tylenol to an empty cabinet, then section 4 shows "the cabinet with the sample products", but the example button only shows on an empty cabinet, so the flow cannot be done by clicking. Section 4 says "point at ... the high blood pressure card", and the example cabinet has no such card unless a profile is set first. Section 6 says to point at "line 146 (resolveLimit)", and `resolveLimit` no longer exists in the working tree `engine/src/flags/dailyTotal.ts`. The script spends about 30 seconds on camera reader test tables for a feature the live site cannot run, and never says the strongest honest numbers (40 of 40 doubled acetaminophen caught, 1 of 40 false alarms).

Fixes, ranked.
1. Rewrite `submission/VIDEO-SCRIPT.md` against the live UI. Say "Check now". Show the example cabinet first, then use "Add a person" to make "Mom" and add Tylenol there, so both steps are clickable. Either set high blood pressure before opening the example or drop that card. Re-pick code lines after the daily total code is final. About 45 minutes. Plus 1.0.
2. Replace about 20 seconds of camera tests with the benchmark, "40 random acetaminophen products, caught 40 of 40, 1 false alarm in 40 pairs, and it catches only 8 of 40 major interactions, here is why". About 15 minutes. Plus 0.7.
3. If you show the photo reader, put "Local prototype, not on the live site" on screen. Cut the "Most people" hook line or replace it with "In one study almost half of adults said they would double up". About 10 minutes. Plus 0.3.
4. End on who it is for and one next step, not on a disclaimer. About 5 minutes. Plus 0.2.

## Overall top 10 fixes, ranked by points per hour

Assumes about 12 hours left. Points are my estimate of total rubric gain across criteria.

| Rank | Fix | Where | Time | Points | Points per hour |
|---|---|---|---|---|---|
| 1 | Fix the phone "More tools" menu that opens off screen, add a viewport check for nav links | `web/src/components/SiteHeader.tsx`, `qa/phone-check.mjs` | 15 min | +0.6 | 2.4 |
| 2 | Correct the write-up. Real test counts, remove "most people never notice", make the red badge claim match the app | `submission/DEVPOST.md`, `README.md`, `CabinetView.tsx` hero copy | 20 min | +0.5 | 1.5 |
| 3 | Filter nutrition rows from supplements so fish oil stops matching "cholesterol microemboli ... necrosis or death" | `lookup/src/dsld.ts`, `engine/src/supplement.ts`, new test | 45 min | +1.0 | 1.3 |
| 4 | Rewrite the video script to match the live UI and add the 40 of 40 and 1 of 40 benchmark | `submission/VIDEO-SCRIPT.md` | 1 hour | +1.5 | 1.5 |
| 5 | Hide or relabel the photo button and barcode photo fallback on production | `AddView.tsx`, `BarcodeScanner.tsx` | 20 min | +0.4 | 1.2 |
| 6 | NOTE badge to neutral colour, plus a "Clear this cabinet" button | `FlagRow.tsx`, `CabinetView.tsx` | 20 min | +0.35 | 1.0 |
| 7 | Dose check STOP when the dose is over 100 units or 1 mL | `engine/src/flags/units.ts`, `DoseView.tsx` | 30 min | +0.4 | 0.8 |
| 8 | Run the hashed user test with 2 or 3 people and report it on Devpost and `/tested` | `submission/USER-TEST.md` | 2 hours | +1.5 | 0.75 |
| 9 | Ozempic and other NDCs with no openFDA text, fall back to DailyMed and surface "Not checked" in the summary | `web/src/server/cabinet.ts`, `CabinetView.tsx` | 1.25 hours | +0.5 | 0.4 |
| 10 | Severity by drug pair class and "matched because" lines on class based cards | `engine/src/flags/severity.ts`, `interactions.ts`, `FlagRow.tsx` | 2.5 hours | +0.8 | 0.3 |

Next after these, if time remains. Fold NOTE cards and duplicate alcohol cards (1.5 hours, plus 0.5), search ranking for adult products (1 hour, plus 0.3), inline warnings on Symptoms product cards (45 minutes, plus 0.3), phone jump link to "Your cabinet" (30 minutes, plus 0.2).

All ten together are about 9 hours for roughly plus 7.5 points, which would move this from 38 to about 45 of 60.

Two warnings about the remaining hours. First, do not deploy the uncommitted engine and lookup changes until `npx vitest run` is green, because the 7 failing tests are in the daily total code that the whole demo is built around. Second, the "Flora night-sky" restyle in commit 0d21ca6 earns no rubric points by itself and can break the phone layout that currently passes. If it ships, rerun the phone checks on every page first.

## Screenshot index

- Home, cold, 1440. `01-home-cold-1440.png`
- Every nav page, 1440. `02-*.png`
- Example cabinet, 1440. `03-example-cabinet-1440.png`, `03b-example-cabinet-viewport.png`
- Onboarding steps. `04` to `07`
- Searches, real and silly. `10-search-*.png`
- Confirm panel. `11-confirm-panel-1440.png`
- My 8 product cabinet as a 72 year old with liver disease and high blood pressure. `13-real-cabinet-1440-*.png`
- Second cabinet with Eliquis, Zoloft, tramadol, Tylenol PM, Benadryl, Advil PM, vitamin D. `14-second-cabinet.png`
- Red badge on a prescribed blood thinner. `15-eliquis-advilpm-checknow.png`
- Fish oil false match. `16-warfarin-fishoil-false-match.png`
- Symptoms. `21-*.png`
- Dose check, including the 500 units case. `30-dose-*.png`
- Pill finder. `31-pill-*.png`
- Peptides. `40` to `42`
- Expired bottle, larger text, print, add a person. `50` to `53`
- Photo and barcode on the live site. `54-photo-live.png`, `55-barcode.png`
- Phone, 390x844. `60` to `67`, including the off screen menu in `63-phone-moretools.png`

# Shelf Check: hostile pharmacist review

Reviewer stance: a community pharmacist deciding whether this app can be shown to patients.
Date: 2026-11-21, against the live site https://shelf-check-nu.vercel.app and the repo at this folder.
Method: 21 cabinets sent to POST /api/check (products picked from /api/search), 14 symptom phrasings sent to /api/symptoms, 8 imprints sent to /api/pills, and Playwright runs of the cabinet page, /dose, /symptoms and /peptides in Chrome. Raw responses and screenshots are in the session scratchpad (`pharm/cab_*.json`, `pharm/ui_*.txt`, `pharm/ui_*.png`). No project files were edited.

Note: `web/src/components/CabinetView.tsx` changed on disk during this review (21:43 PT), so line numbers in that file may have moved. Function names are given with every line number.

## Verdict

Not ready to show to patients. The label quoting is honest and several high-risk combinations are caught well (MAOI with pseudoephedrine or dextromethorphan, apixaban with NSAIDs, potassium with spironolactone, duplicate acetaminophen, cold medicine under age 6). But four failures could directly hurt someone:

1. The emergency screen missed 12 of 13 plain-language emergencies I typed, including a toddler who swallowed pills.
2. A penicillin allergy with amoxicillin in the cabinet produced no flag at all.
3. The dose page tells a U-500 insulin user to draw 100 units, which is 5 times the dose, and shows a full syringe with no warning for a 200-unit draw.
4. Severity comes from which label section a word appears in, not from how dangerous the combination is. Opioid plus zolpidem plus diphenhydramine came back as "Nothing urgent".

## Ranked problems (by patient harm)

### 1. Emergency screen misses most emergencies and offers medicine instead
- Seen: these all returned `emergency: false` with no 911 screen: "my 2 year old swallowed some of grandma's pills", "I think I'm having a stroke", "chest tightness and my left arm is numb", "I took too much tylenol", "my lips and tongue are swelling", "I want to die", "short of breath", "having a seizure", "vomiting blood", "heart attack", "severe headache and stiff neck", "baby has a fever and is 6 weeks old". On screen for the toddler: "In your cabinet for this. Your cabinet is empty. Add what you own first."
- Worse: for "severe headache and stiff neck" with warfarin in the cabinet, the app listed TYLENOL Extra Strength and Advil as products "for this". A sudden severe headache on warfarin needs emergency care for a possible bleed.
- Cause: `engine/src/symptoms.ts` lines 17 to 38 (`RED_FLAG_SYMPTOMS`) is a short list of exact phrases, and `isEmergency` (lines 70 to 73) needs an exact phrase match. "stroke", "seizure", "swallowed", "too much", "short of breath", "chest tightness", "want to die", "heart attack", "vomiting blood" and any swelling words are not in the list.
- Fix: replace the phrase list with stem and pair rules that lean toward emergency: any of `stroke|seizure|convuls|unresponsive|not breathing|blue lips|heart attack|suicid|want to die|end my life|kill myself|overdos|too much|too many|swallow|ate (some|a|the) pill`; `chest` with `pain|tight|pressure`; `breath` with `short|can't|cannot|hard|trouble`; `swell` with `lips|tongue|throat|face`; `blood` with `vomit|cough|stool|black`; `worst|sudden|severe` headache, and headache with `stiff neck`; fever with profile age under 3 months. For ingestion and "too much" text, lead with Poison Help 1-800-222-1222 as well as 911. Add a unit test file with all 13 phrasings above.

### 2. Penicillin allergy plus amoxicillin is not flagged
- Seen: profile allergies `["penicillin","aspirin"]`, cabinet Amoxicillin 500 mg (ndc:57237-031) plus Advil. The only allergy flag was "Advil and an allergy to aspirin" (Ask first). Nothing about amoxicillin. Headline: "Nothing urgent. Some things to ask a pharmacist about."
- Cause: `engine/src/flags/profile.ts` `allergyFlags` (lines 327 to 331) only looks for the literal allergen word in ingredient lists, or in sentences that contain "allerg" (`ALLERGY_WORDING`, line 100) inside `ALLERGY_WARNING_SECTIONS` (line 95: boxed warning, contraindications, do not use, warnings). Prescription labels say "serious hypersensitivity reaction ... to amoxicillin or to other beta-lactam antibacterial drugs (e.g., penicillins or cephalosporins)" in Contraindications. "hypersensitivity" is not matched and the ingredient name "amoxicillin" is never compared to the allergen "penicillin".
- Fix: (a) match the allergen against each ingredient's RxClass classes (EPC "Penicillin-class Antibacterial", ATC J01C) using the classes already resolved in `engine/src/cabinet.ts` `resolveIdentity`; (b) accept `hypersensitiv|anaphyla` as allergy wording and add `warnings_and_cautions` to the sections; (c) add a short reviewed cross-reactivity table for the commonest patient-reported allergies (penicillin to all J01C, sulfa to sulfonamide antibiotics, aspirin to all M01A NSAIDs and salicylates). Any hit is `stop` with the text "Do not take this. Your profile lists an allergy that this medicine can trigger. Call the pharmacy before the next dose."
- Related: the aspirin allergy with Advil is labelled "Ask first". The Advil label's "Do not use if you have ever had an allergic reaction to any other pain reliever/fever reducer" is in Do not use and should drive `stop`.

### 3. Dose page gives a 5 times overdose for U-500 insulin and stays silent past 100 units
- Seen on /dose:
  - Strength 500, dose 100 units: "Milligrams 500 mg. Millilitres 1 mL. Units on a U-100 insulin syringe 100 units." 100 units of U-500 insulin is 0.2 mL, which is the 20 mark on a U-100 syringe. Drawing to 100 is 5 times the dose.
  - Strength 100, dose 10 units: "Milligrams 10 mg". Insulin is not measured in mg, so this line is false.
  - Strength 2.5 mg/mL, dose 5 mg: "Millilitres 2 mL. Units on a U-100 insulin syringe 200 units." The drawn syringe is full at 100 and no warning appears.
- Cause: `web/src/components/DoseView.tsx` (lines 30 to 36) calls `checkInjectionDose` in `engine/src/flags/units.ts` (lines 114 to 126), which has no too-large or too-small check. The peptide page uses `checkReconstitutedDose`, which does have `tooLargeFlag` and `tooSmallFlag` (`engine/src/flags/reconstitution.ts` lines 139 to 170). `web/src/components/Syringe.tsx` line 4 clamps the drawing at 100. The "units" option treats syringe tick marks and insulin units as the same thing, which is only true for U-100.
- Fix: move `tooLargeFlag` and `tooSmallFlag` into `units.ts` and call them from `checkInjectionDose`. In `Syringe.tsx`, when `fillUnits > 100`, draw no plunger and show "This does not fit in one syringe. Do not inject." Add a first question on /dose: "Is this insulin?" If yes, ask for the U number on the box, drop the mg row, and for anything other than U-100 show: "U-500 and other concentrated insulins must not be drawn with a U-100 syringe by unit marks. Use the pen or syringe your pharmacy gave you."

### 4. Severity depends on the label section, so deadly combinations read as routine
- Seen:
  - Oxycodone/acetaminophen plus Ambien plus ZzzQuil: three "Ask first" cards and the headline "Nothing urgent. Some things to ask a pharmacist about." The oxycodone boxed warning says concomitant CNS depressants "may result in profound sedation, respiratory depression, coma, and death."
  - Warfarin plus Advil: "Ask first". Eliquis plus Aleve: "Check now". Same bleeding risk class, opposite labels, only because apixaban's boxed warning names NSAIDs and warfarin's does not.
  - Clopidogrel plus omeprazole: label says "Avoid concomitant use of clopidogrel with omeprazole or esomeprazole." Shown as "Ask first".
  - Sertraline plus St. John's Wort, tramadol plus sertraline (serotonin syndrome): "Ask first", the same level as warfarin plus atorvastatin, which only appears in a CYP3A4 list.
  - Elderly cabinet: "Kidney disease" (metformin, eGFR under 30, which the app cannot know) is the only "Check now" card and sits above warfarin plus Advil.
- Cause: `engine/src/flags/severity.ts` lines 3 to 8 make severity `stop` only for boxed warning, contraindications or do not use. `engine/src/flags/interactions.ts` line 133 uses that for every interaction. Zolpidem never matches the boxed warning because `engine/src/classPhrases.ts` has no "CNS depressant" phrase rule.
- Fix: in `interactions.ts` raise to `stop` when the matched sentence also contains `avoid (concomitant|co-?administration|use)|contraindicated|should not be (used|taken|given)|do not (use|take)|fatal|death|life-threatening|respiratory depression|serotonin syndrome|bleeding`. In `classPhrases.ts` add a rule with phrases `CNS depressant`, `central nervous system depressant`, `sedative/hypnotic`, `hypnotic` for ATC N05C, N02A, N03AX12/16 (gabapentinoids), R06AA/AB/AD. In `web/src/components/CabinetView.tsx` (`stops > 0` headline, near line 131) remove "Nothing urgent". Say "N things to ask a pharmacist about before the next dose" for any `ask`.

### 5. "What to do" for interactions can make people skip insulin, antibiotics or thyroid pills
- Seen: every interaction card says "Ask a pharmacist before taking these on the same day. Show them the quoted line." Then, if any item is prescription, "Do not stop a prescribed medicine on your own. Call the prescriber or pharmacist first."
  - Lantus plus Ozempic, both prescribed together on purpose: told not to take them the same day, then told not to stop. A patient who reads the first line holds insulin.
  - Levothyroxine plus TUMS and Ciprofloxacin plus TUMS: the right advice is to space them by hours (the cipro quote itself says "at least two hours before or six hours after"). "Same day" tells them to skip a dose of an antibiotic or thyroid pill.
  - Phenelzine plus Sudafed: the danger lasts 2 weeks after stopping the MAOI, not a day.
- Cause: `web/src/lib/nextStep.ts` lines 27 to 28 (`case "interaction"`) and line 14 (`PRESCRIBED_LINE`), appended at line 18.
- Fix: branch on the items. Both prescribed: "Keep taking both as prescribed. Tell the prescriber or pharmacist you take both, they may adjust a dose or check levels." One prescribed and one OTC or supplement: "Keep taking {Rx}. Do not take {OTC} until a pharmacist says it is safe with {Rx}." Quote contains `hours? (before|after)`: "Your label says to take these hours apart. Read the quoted line for how many hours, and keep taking both." Quote or match is MAOI: "Do not take {OTC} while on {Rx} or for 2 weeks after stopping it."

### 6. Pregnancy boxed warning "discontinue as soon as possible" is softened to "Ask first"
- Seen: pregnant profile with lisinopril, warfarin, atorvastatin. One merged card "Pregnancy", badge "Ask first", first quote "WARNING: FETAL TOXICITY When pregnancy is detected, discontinue lisinopril as soon as possible". What to do: "Ask a doctor or pharmacist before using this, and tell them about the health detail it mentions. Do not stop a prescribed medicine on your own. Call the prescriber or pharmacist first." Warfarin's pregnancy contraindication is folded into the same card.
- Cause: `web/src/server/cabinet.ts` `softenForPrescribed` (lines 147 to 150) turns every all-prescription profile `stop` into `ask`. `mergeGroup` merges all pregnancy hits into one card.
- Fix: do not soften when the top quote is a boxed warning or contraindication for pregnancy. Use `stop` and the line "Call your prescriber today. The label says this medicine should be stopped or changed in pregnancy. Do not wait for your next visit." Keep pregnancy cards one per product so warfarin and lisinopril are not hidden behind each other.

### 7. Pill finder names street look-alikes as real oxycodone and Xanax with no counterfeit warning
- Seen: imprint "M30" returned "OXYCODONE HYDROCHLORIDE 30 mg ... BLUE ROUND", match `exact_imprint`, score 100. "K9" returned oxycodone 30 mg and clonazepam 2 mg. "XANAX 2" returned Xanax 2 mg. The only caution is "Educated guess from the imprint, colour and shape. Pills that look alike can be different medicines."
- Harm: blue "M30" is the most common counterfeit pill sold on the street, and DEA says these often contain fentanyl. A parent who finds one is told it is oxycodone.
- Cause: `engine/src/pills.ts` (`PILL_GUESS_NOTICE`, line 11) and `web/src/components/PillFinder.tsx` (`GUESS_LINE`, line 59) have no controlled-substance handling.
- Fix: when any candidate is an opioid, benzodiazepine or amphetamine (match on name, or on the DEA schedule from the NDC record), show at the top: "Pills sold as {name} outside a pharmacy are often fake and can contain fentanyl. If this pill did not come from a pharmacy, do not take it. If someone took it and is very sleepy or breathing slowly, call 911 and give naloxone if you have it." Quote the DEA "One Pill Can Kill" page as the source. Show `POISON_HELP` above the results, not below.

### 8. Acetaminophen daily totals are not compared to the 4,000 mg limit
- Seen: NyQuil Cold and Flu, DayQuil Cold and Flu, Excedrin Migraine. Card "Acetaminophen daily total across 3 products", badge "Ask first", text "Taken at the most each label allows, these products add up to 5700 mg of acetaminophen a day." The math is right (2600 + 2600 + 500) but nothing says this is over 4,000 mg. Tylenol Extra Strength plus ZzzQuil Night Pain for a daily drinker: "These products share acetaminophen, but the labels do not give enough to add up a daily amount."
- Cause: `engine/src/flags/dailyTotal.ts` `labelledCeiling` (lines 236 to 250) only finds "more than X mg of acetaminophen in 24 hours", and NyQuil, DayQuil and Excedrin labels now say "more than 4 doses" instead. `severityFor` (lines 307 to 310) gives `ask` whenever no ceiling is found. ZzzQuil Night Pain states its limit in Warnings, but `findLimits` (lines 117 to 126) only reads Directions.
- Fix: search the ceiling across every label in the cabinet that contains the ingredient (Tylenol Extra Strength has the 4,000 mg sentence). When none has it, attach the FDA OTC acetaminophen statement as an `OfficialStatement` source, the same way peptides do. Read `do not exceed` lines from Warnings too. Over the ceiling is `stop` with "This adds up to more than the 4,000 mg a day the label warns about. Use only one of these."

### 9. Quotes that change meaning or cut off the consequence
- Mucinex DM, shown as a Do not use quote: "Do not use for children under 12 years of age if you are now taking a prescription monoamine oxidase inhibitor (MAOI)...". On the box these are two separate bullets. As quoted, an adult on phenelzine reads that the MAOI warning is only for children.
- Glaucoma card for Tylenol PM: the whole quote is the single word "glaucoma".
- Oxycodone interaction cards cut the sentence before "profound sedation, respiratory depression, coma, and death". The visible excerpt ends at "...antipsychotics, gabapentinoids…".
- Sertraline plus Delsym quotes a CYP2D6 substrate list that runs into "Phenytoin Clinical Impact: Phenytoin is a narrow therapeutic index drug." The real reason (serotonin syndrome) is not shown.
- Warfarin plus atorvastatin quotes "…phenobarbital, phenytoin, cigarette smoking CYP3A4 alprazolam, amiodarone, amlodipine...": a table fragment with no meaning for a patient.
- Causes: `engine/src/text.ts` `SENTENCE_BOUNDARY` (line 1) cannot see Drug Facts bullets once openFDA flattens them. `excerptAround` (lines 81 to 93) centres on the matched word with a 240 character cap (`MAX_EXCERPT_LENGTH`, line 56).
- Fix: in `splitSentences`, split Drug Facts sections before known bullet starts (`for children under`, `if you are (now )?taking`, `if you have`, `with any other`, `to make a child sleepy`, `glaucoma`, `trouble urinating`). For boxed warnings and contraindications, show the whole sentence. When the sentence is longer than the cap, keep the end of the sentence (the consequence) and trim the middle of a list instead of the end.

### 10. Missed bleeding risk with Pepto-Bismol and salicylate doubling
- Seen: Eliquis, aspirin 81, Aleve and Pepto-Bismol. Eliquis plus aspirin and Eliquis plus Aleve were caught. Pepto was only flagged for the ulcer profile. Pepto's own line "Ask a doctor or pharmacist before use if you are taking any drug for anticoagulation (thinning the blood)" did not match apixaban. Its line "taking other salicylate products" did not match aspirin.
- Causes: `engine/src/classPhrases.ts` line 20 phrases are "anti-coagulant", "blood thinner", "blood thinning". "anticoagulation" and "thinning the blood" are not matched. The salicylate sentence is dropped whole by `ALLERGY_SENTENCE` in `engine/src/flags/interactions.ts` line 34 and line 79, because openFDA merged it with "allergic to salicylates (including aspirin)".
- Fix: add "anticoagulation" and "thinning the blood" to the anticoagulant rule. Apply the allergy filter to the bullet clause after the split in item 9, not the whole merged sentence. Give bismuth subsalicylate the common name "salicylate" so it also counts as a duplicate with aspirin.

### 11. Ozempic often cannot be checked and the notice is easy to miss
- Seen: Ozempic ndc:0169-4772 and ndc:0169-4130 both came back in `unchecked`. The Ozempic boxed warning (thyroid C-cell tumours, MTC and MEN 2) and its hypoglycemia warning with insulin were never read. On screen the notice is small grey text placed after all the cards: "Not checked, because no official label text was found: Ozempic."
- Cause: `web/src/server/cabinet.ts` `buildCabinet` marks items with no `label`. `engine/src/sources/openfda.ts` looks the label up by product NDC only. Newer pen NDCs are not in openFDA label records yet.
- Fix: fall back to the label for the same brand or SPL set id (openFDA `openfda.brand_name` or DailyMed set id). In `CabinetView.tsx` move the unchecked line into the top summary in bold: "1 product could not be checked: Ozempic. Its warnings are not included below."

### 12. False alarms on the patient's own condition medicine
- Metformin with diabetes in profile: "The Metformin label has a warning for people with diabetes, which is in your profile." The match is "diabetic ketoacidosis" in Contraindications. Telling a diabetic to ask before using metformin because they have diabetes erodes trust, and some will stop it.
- Lisinopril with diabetes: quote "Do not co-administer aliskiren with lisinopril tablets in patients with diabetes". The patient does not take aliskiren.
- Humalog "Sun" note from "pump housing ... exposed to sunlight", followed by "Limit time in the sun and ask a pharmacist about sun protection while taking these."
- Lantus "Drowsiness" note from a hypoglycemia sentence, followed by "Do not drive or use machinery until you know how these affect you."
- Advil and age 78: "The Advil label has a limit for people age 60 or older". The label says the bleeding chance is higher, not that use is limited.
- Causes: `engine/src/flags/profile.ts` `conditionFlags` (lines 203 to 216) and `CONDITION_RULES.diabetes` (line 57). `engine/src/flags/labelTags.ts` `SUN_PATTERN` (line 34). `ageFlags` explain text (line 296) uses "limit" for the `or_older` kind.
- Fix: skip a condition flag when the product's Uses section names that condition. Exclude "diabetic ketoacidosis". Skip contraindication sentences that name a drug not in the cabinet (co-administer/with X). Narrow the sun rule to `photosensitiv|sunburn|sunlamp|tanning|ultraviolet` and drop bare "sunlight". For `or_older`, say "The Advil label says the risk is higher for people age 60 or older."

### 13. Symptom page recommends adult products for babies
- Seen: "baby has a fever and is 6 weeks old" with no age in the profile listed TYLENOL Extra Strength and Advil as products "for this". Fever under 3 months needs a doctor the same day, and ibuprofen is not for infants under 6 months.
- Cause: `web/src/app/api/symptoms/route.ts` matches only Uses text. Age gating only happens through the profile age, and only through flags.
- Fix: if the text mentions `baby|infant|newborn|toddler|child|son|daughter|kid` or a weeks or months age, ask who it is for and the age before listing products. Hide products whose Directions say "adults and children 12 years and over" for a younger child. For fever under 3 months, show "Call your child's doctor now" instead of products.

### 14. A falsely reassuring pregnancy quote and a weak NSAID pregnancy severity
- Seen: pregnant profile with Advil and Rx ibuprofen 800 mg (PharmPak ndc:54348-825). The "Pregnancy" card is "Ask first" and its supporting quotes include "PREGNANCY Teratogenic effects – Pregnancy Category C Reproductive studies conducted in rats and rabbits have not demonstrated evidence of developmental abnormalities." That label is from before the 2020 NSAID 20 week update. The Advil line "It is especially important not to use ibuprofen at 20 weeks or later in pregnancy" is the second quote. The "Do not stop a prescribed medicine" line is also appended because one ibuprofen is Rx.
- Cause: `engine/src/flags/profile.ts` `pregnancyFlags` (lines 228 to 236) takes every sentence with "pregnan" in it. `PREGNANCY_SECTIONS` includes the old `pregnancy` section.
- Fix: drop sentences that say `not demonstrated|no evidence|Category [AB]` from warning flags. When pregnant and the item is an NSAID, lead with the 20 week sentence and use `stop` with "Do not take this at 20 weeks or later unless your doctor said to." Add pregnancy weeks to the profile.

### 15. Peptide page gives injection volumes for unapproved peptides and defaults to the wrong unit
- Seen on /peptides for BPC-157: "No approved use. No approved dose." directly followed by a plunger drawing and "On a U-100 insulin syringe 10 units", plus "Add to my cabinet". For semaglutide the label shown says "Start at 0.25 mg once weekly", but the dose box defaults to mcg. Typing 0.25 gives "0.25 mcg is too small to measure" under a red "Stop" badge while the engine severity is `ask`.
- Cause: `web/src/components/PeptideView.tsx` line 50 (`useState<MassUnit>("mcg")`) and the calculator render, which runs for every peptide. Line 187 hard-codes the "Stop" badge.
- Fix: for peptides with no approved product, do not draw a plunger mark. Show the math only after the user confirms the dose came from a prescriber, and say "Ask the dispensing pharmacist which diluent to use and confirm this mark before injecting." Default the dose unit to the unit in the quoted approved label (mg for semaglutide and tirzepatide). Use the flag's own severity for the badge.

## Cabinet by cabinet

Scores: M = missed serious problems, F = false alarms, N = wrong numbers or units, Q = cut off or misleading quotes, W = wrong or dangerous What to do, S = severity too high or too low.

| # | Cabinet and profile | Pharmacist expects | App flagged | M | F | N | Q | W | S |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Age 78, CKD, HTN, diabetes: warfarin, lisinopril, metformin, atorvastatin, Advil, fish oil | Warfarin plus Advil top. Advil with CKD plus ACE inhibitor. Fish oil plus warfarin (minor). Advil at 78. | Kidney disease (Check now), Diabetes (aliskiren and DKA lines), warfarin plus atorvastatin, warfarin plus Advil, lisinopril plus Advil, Advil and HTN, Advil and age, grapefruit, alcohol | 1 (fish oil) | 2 (diabetes, aliskiren) | 0 | 1 (CYP list) | 0 | 2 (warfarin plus Advil only Ask first, ranked below metformin CKD) |
| 2 | Age 3: Children's Tylenol, Children's Motrin, Children's Mucinex Cold and Flu | Duplicate acetaminophen. Mucinex not under 6. | Both, correctly as Check now. Daily total "not enough to add up". | 0 | 0 | 0 | 0 | 1 (under-6 card says "Ask a doctor" when label says do not use) | 0 |
| 3 | Age 20: NyQuil, DayQuil, Excedrin Migraine, Benadryl | Acetaminophen over 4 g. DXM over 120 mg. Two sedating antihistamines. | Duplicate acetaminophen (Check now), totals 5700 mg and 200 mg (Ask first), NyQuil plus Benadryl via "sedatives" | 0 | 0 | 1 (no 4 g comparison) | 0 | 0 | 1 |
| 4 | Sertraline, St. John's Wort, Delsym | Serotonin syndrome on all three pairs | Sertraline plus SJW (Ask), sertraline plus Delsym (Ask, wrong reason) | 1 (SJW plus DXM) | 0 | 0 | 1 | 0 | 1 |
| 5 | Pregnant: Advil, Rx ibuprofen 800 | Avoid at 20 weeks or later. Duplicate NSAID. | Pregnancy (Ask) with a reassuring Category C quote, duplicate (Ask), total not computed | 0 | 0 | 0 | 1 | 1 (prescribed line on an NSAID in pregnancy) | 1 |
| 6 | Liver disease: Tylenol Extra Strength | Ask a doctor, lower daily max | Liver disease (Ask) | 0 | 0 | 0 | 0 | 0 | 0 |
| 7 | 3+ drinks daily: Tylenol ES, ZzzQuil Night Pain | Duplicate acetaminophen, alcohol and liver, alcohol plus diphenhydramine | Duplicate (Check now), daily alcohol (Ask), total not computed | 0 | 0 | 1 | 0 | 0 | 0 |
| 8 | Diabetes: Ozempic, Lantus, Humalog, metformin | Hypoglycemia with GLP-1 plus insulin. Ozempic boxed warning. | Lantus plus Ozempic, metformin and diabetes, sun, drowsiness, alcohol, past recall. Ozempic unchecked. | 1 (Ozempic label) | 3 | 0 | 0 | 1 ("same day" on insulin) | 0 |
| 9 | Oxycodone/APAP, ZzzQuil, Ambien | Boxed warning respiratory depression, top priority | Three Ask cards, headline "Nothing urgent" | 0 | 0 | 0 | 1 (consequence cut) | 0 | 3 |
| 10 | Tramadol, sertraline | Serotonin syndrome and seizure risk | Ask | 0 | 0 | 0 | 0 | 0 | 1 |
| 11 | Phenelzine, Sudafed, Mucinex DM | Do not use | Both Check now | 0 | 0 | 0 | 1 (children under 12 merge) | 1 ("same day" vs 2 weeks) | 0 |
| 12 | Age 70, ulcer: Eliquis, aspirin 81, Aleve, Pepto-Bismol | All bleeding pairs, salicylate doubling | Eliquis pairs Check now, ulcer Check now, aspirin plus Aleve | 2 (Pepto with Eliquis and aspirin) | 0 | 0 | 0 | 0 | 0 |
| 13 | Hypothyroid: levothyroxine, cipro, TUMS, calcium | Space doses apart | Four Ask cards | 0 | 0 | 0 | 0 | 4 ("same day") | 0 |
| 14 | Three Ozempic NDCs | Refills, not a problem | Two unchecked, "semaglutide daily total" for a weekly drug | 0 | 1 | 1 | 0 | 0 | 0 |
| 15 | Age 72, CKD, heart: spironolactone, KCl, lisinopril | Hyperkalemia | KCl plus spironolactone Check now, others Ask, CKD | 0 | 0 | 0 | 1 (thiazide quote not relevant) | 0 | 0 |
| 16 | Methotrexate, Advil | NSAID with methotrexate | Ask | 0 | 0 | 0 | 0 | 0 | 0 |
| 17 | Age 84, glaucoma, BPH: Tylenol PM, Benadryl | Duplicate diphenhydramine, glaucoma, BPH, falls in the elderly | All except falls | 1 (elderly anticholinergic, label silent) | 0 | 0 | 1 (one-word quote) | 0 | 0 |
| 18 | Penicillin and aspirin allergy: amoxicillin, Advil | Amoxicillin contraindicated, NSAID avoid | Only Advil (Ask) | 1 | 0 | 0 | 0 | 0 | 1 |
| 19 | Clopidogrel, omeprazole | Avoid | Ask | 0 | 0 | 0 | 0 | 0 | 1 |
| 20 | Pregnant: lisinopril, warfarin, atorvastatin | Lisinopril and warfarin stop now, call prescriber | One merged Pregnancy card, Ask | 0 | 0 | 0 | 0 | 1 | 1 |
| 21 | Age 0: Children's Tylenol, Children's Motrin, Benadryl liquid | Under 2 ask a doctor, Benadryl do not use | Merged Age 0 card, Check now | 0 | 0 | 0 | 0 | 1 (merged card says "Ask" for a do not use) | 0 |

## Other screens

- **Symptoms and 911 screen.** See items 1 and 13. When it does trigger, the screen text is good: "This can be an emergency. Call 911 or your local emergency number now. For a possible poisoning or overdose in the United States, Poison Control is 1-800-222-1222." The footer in `web/src/app/layout.tsx` (line 57) also carries Poison Help on every page, which helps. The "Possible causes" list uses a local model (`web/src/server/causes.ts` line 1 defaults to 127.0.0.1). On the live site it answers "The language model is not running here", so it is harmless there. If it is ever turned on, it only sits behind the same weak `isEmergency` gate.
- **Pill finder.** See item 7. Close-imprint results ("M357 is one character away") are shown for a typed "M367" with a different acetaminophen strength (500 mg vs 325 mg). Keep these, but label them "different pill, shown in case you misread a character."
- **Dose check.** See item 3.
- **Peptides.** The standing notice is good and honest ("No flag here means no official statement was found. It does not mean safe."). FDA risk text is quoted verbatim with dates. Recalls are shown with a clear "Name match, not a match to your vial" caveat. Problems are item 15.

## What works and should be kept

- Every flag shows a verbatim label quote with its section. This is the right model for trust.
- MAOI with pseudoephedrine and with dextromethorphan: Check now, with the right quotes.
- Apixaban with aspirin and with naproxen: Check now from the boxed warning.
- Potassium chloride with spironolactone: Check now from the contraindication.
- Duplicate acetaminophen and duplicate diphenhydramine: Check now from "Do not use with any other drug containing ...".
- Children's cold medicine under age 6: Check now.
- The cabinet page states "A label can stay silent about a real risk, so this is not proof they are safe together."

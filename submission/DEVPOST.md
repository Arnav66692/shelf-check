# Devpost write-up for Shelf Check

Paste each section into the matching Devpost field. It is a draft in your voice, so change anything that does not sound like you. Every number here comes from a file in the repo or a source linked below.

---

## Project name

Shelf Check

## Tagline (105 characters, check the limit shown in the form)

Check every medicine you own against its official label. Double doses and bad mixes, quoted from the box.

## Inspiration

Tylenol and NyQuil both contain acetaminophen. Each box warns you not to take it with other acetaminophen products, but neither one tells you the other box has it. Taken at the most each label allows, the two come to 5,600 milligrams a day, and the Tylenol label itself warns about going over 4,000. In a study of 500 adults, 45.6 percent said they would double up on two acetaminophen products in at least one scenario, and the CDC counts more than 1.5 million emergency visits a year from bad reactions to medicines. About 13.5 percent of people in the US use five or more prescription drugs in a month, before counting anything over the counter.

Shelf Check is for anyone keeping track of medicines, for themselves or for a parent or a child. Today that person either asks a pharmacist, who may not see the cold medicine and supplements bought somewhere else, or types drugs one by one into an interaction checker. I wanted something that reads all your labels together and shows you the exact line that matters.

## What it does

You build a list of everything in your medicine cabinet, including prescriptions, over the counter medicines, supplements and peptides, and each product is matched to its official record before it goes in. Then Shelf Check reads the official labels together and shows:

- the same ingredient hiding in two products, with the daily total at each label's maximum compared with the warning on the label
- labels that warn about another product you own or its drug class, like warfarin and aspirin, or a blood pressure medicine and ibuprofen
- supplements a drug label warns about, like St. John's Wort on the warfarin label
- warnings written for you, from a four question start: conditions like liver disease or high blood pressure, pregnancy, breastfeeding, daily alcohol, allergies and age
- which labels mention alcohol, grapefruit, drowsiness or driving, and sun
- FDA recalls on that exact product, and expired or nearly empty bottles

Every warning quotes the line from the label it came from, so you can show it to a pharmacist. There's also:

- a symptoms screen that finds what you already own that is labelled for how you feel, and sends emergency symptoms straight to a call 911 screen
- a peptide screen that quotes the FDA label for approved peptides like Ozempic and Mounjaro, says plainly when a peptide has no approved use or dose, shows FDA recalls that name it, and does the vial and syringe math
- a pill finder for a pill you can't identify, by imprint, colour and shape, with Poison Help at the top
- an injection dose check that catches the 5 units versus 50 units mix-up the FDA has warned about
- family profiles, a printable list for your doctor, read aloud, barcode scanning, and safe disposal from the FDA flush list

It is a safety check and not medical advice. It never says anything is safe, because a label can be silent about a real risk.

## How I built it

The part that decides the warnings is a rules engine in TypeScript, and no AI model decides any warning. It reads official data:

- FDA drug records and label text through openFDA and DailyMed, including the full drug code table of 138,569 products and 18,166 recall records
- the NIH Dietary Supplement Label Database for supplements
- NIH RxNorm and RxClass to turn label names into one ingredient name and find drug classes, so "NSAIDs" on a lisinopril label matches the ibuprofen you own
- the FDA's published statements and the WADA 2026 Prohibited List for peptides, quoted word for word and checked against saved copies by tests
- the NLM Pillbox archive and DailyMed product data for the pill finder, 83,912 records

The engine has 566 tests that run on saved real label records, and the product lookup has 75 more. The app is Next.js and TypeScript, deployed on Vercel.

For reading a photo of a label I tested before building, with the pass bar written down before every test:

| What I tested | Result | Bar | Verdict |
|---|---|---|---|
| Small in-browser reader (Florence-2) on 20 labels | 8 of 20 right | 18 | Failed |
| Larger local vision model (Qwen3-VL 8B) on the same 20 | 17 of 20 right | 18 | Failed by one |
| Same model on 100 new tablet and capsule labels | 82 right, 5 confidently wrong | 90, at most 3 | Failed |
| Cross-check on 100 more new labels | 61 marked matched, 0 of those wrong | 50, at most 1 | Passed |

The cross-check only marks a reading as matched when the drug code it read points to an FDA record and the ingredients and strengths it read from the printed text are exactly that record's. Everything else goes back to you to check by eye.

I also trained my own image model. I fine-tuned DINOv2 on 3,588 products from the FDA label archive, using made up phone photos of each official label, and scored it on 2,175 photos of products it had never seen. It went from 4.1 percent to 78.0 percent right on the first guess, and 91.3 percent in the top five. That missed the 90 percent bar I set before training, so it is not in the app.

## Does it catch real problems?

I ran the live app on random real products and pairs, with the bars written down and hashed before the run:

| Test | Result | Bar | Verdict |
|---|---|---|---|
| Acetaminophen doubled: 40 random products, each paired with Tylenol | 40 of 40 caught | 38 of 40 | Passed |
| Same 40 pairs: a daily total worked out in mg | 27 of 40 | none | Measured, most misses are children's liquids |
| 40 major interactions from the DDInter database | 8 of 40 caught (95 percent interval 10 to 35 percent) | none | Weak |
| 40 pairs DDInter does not list: false alarms | 1 of 40 | at most 4 | Passed |

So Shelf Check is reliable at the problem it was built for, the same drug hiding in two products, and its warnings come from real label sentences. It is weak at drug interactions in general. For most of those major pairs, neither FDA label names the other drug, and the labels describe the risk by drug type or effect instead, which the app does not turn into drug names yet. The app says plainly that a label can be silent about a real risk, and every result page tells you to have a pharmacist review the list.

## Usability

A cold read of the live site by a reviewer playing a caregiver on a phone found things like a confirm button that was off screen after picking a product, empty searches that did nothing, and brand names like Coumadin that found nothing. I fixed those. Every warning now has a plain "What to do" line, the warnings start with a one line summary, there is a larger text switch and a read aloud button, and an automated accessibility check (axe, WCAG 2.1 AA) finds no problems on any page at laptop or phone size.

## Challenges I ran into

The camera was the hard part. Reading tiny print on a medicine label is easy to get mostly right and hard to get safely right, and a wrong strength on a medicine is worse than no answer. Three readers failed their bars before the cross-check passed. The other challenge was keeping every claim honest, like making sure the peptide screen quotes the FDA instead of repeating what people say online.

## Accomplishments that I'm proud of

Every warning in the app points to a real sentence on a real label, and every number in this write-up comes from a test result in the repo or a source linked below. I'm also proud that I reported the tests that failed instead of hiding them.

## What I learned

Set the bar before you test, because it stops you from moving it after. And for anything about health, the AI should read and the official data should decide.

## What's next

No real users have tested it yet, so that comes first: people who manage medicines for a parent or a kid, with a pharmacist checking the answers. Then turning label warnings that name a drug type or effect into the drugs they cover, which is where most missed interactions come from, and testing the photo reader on real phone photos of real bottles.

## Built with

typescript, next.js, react, tailwind css, node.js, python, pytorch, fastapi, ollama, qwen3-vl, dinov2, zxing, vitest, vercel, openfda, dailymed, rxnorm, nih-dsld, nlm-pillbox

## Try it out

- Live site: https://shelf-check-nu.vercel.app
- Code: https://github.com/Arnav66692/shelf-check (private right now, make it public before you submit, or give the judges access)

The live site runs everything except the photo reader and the possible causes list, which need the local vision model on my laptop. The video shows those from my laptop.

## Built during the event, and what was not

All of the code, the tests, the data processing and the trained model were made during EvoHacks 2, on November 21 and 22, 2026. Nothing from my earlier projects was reused.

Not made by me: the open weight models Qwen3-VL 8B, Florence-2 and DINOv2, the open source libraries listed above, and the public data from the FDA, NIH, NLM and WADA.

## AI use

I built this with an AI coding agent (Claude Code), which wrote much of the code with me. The engine and lookup have automated tests, and I can explain the code, which the video shows.

## Sponsor tools

None used.

## Sources for the numbers above

- 45.6 percent of 500 adults: Wolf et al., Journal of General Internal Medicine, 2012, https://pmc.ncbi.nlm.nih.gov/articles/PMC3509295
- 1.5 million emergency visits a year: CDC medication safety facts, https://www.cdc.gov/medication-safety/data-research/facts-stats/index.html
- 13.5 percent using five or more prescription drugs: CDC FastStats, therapeutic drug use, 2017 to March 2020, https://www.cdc.gov/nchs/fastats/drug-use-therapeutic.htm
- Interaction reference: DDInter, https://ddinter.scbdd.com
- 5 units versus 50 units: FDA alert on compounded semaglutide dosing errors, https://www.fda.gov/drugs/human-drug-compounding/fda-alerts-health-care-providers-compounders-and-patients-dosing-errors-associated-compounded
- Test results: the results and benchmark folders and the preregistration files in the repo

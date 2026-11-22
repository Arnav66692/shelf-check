# Devpost write-up for Shelf Check

Paste each section into the matching Devpost field. It is a draft in your voice, so change anything that does not sound like you. Every number here comes from a file in the repo or a source linked below.

---

## Project name

Shelf Check

## Tagline (110 characters, check the limit shown in the form)

Check every medicine you own against its official label. Double doses and label warnings, quoted from the box.

## Inspiration

Tylenol and NyQuil both contain acetaminophen. Each box warns you not to take it with other acetaminophen products, but neither one tells you the other box has it. Taken at the most each label allows, the two come to 5,600 milligrams a day, and the Tylenol label itself warns about going over 4,000. In a study of 500 adults, 45.6 percent said they would double up on two acetaminophen products in at least one scenario, and the CDC counts more than 1.5 million emergency visits a year from bad reactions to medicines. About 13.5 percent of people in the US use five or more prescription drugs in a month, before counting anything over the counter.

Shelf Check is for the person who keeps the medicines straight for a family. A parent managing their kids' cold medicine. Someone caring for a mother on six prescriptions. They are easy to miss, because the pharmacist only sees what was filled at that pharmacy, not the cold medicine and supplements bought somewhere else, and the free interaction checkers make you type drugs one at a time and never read the box you are holding. I wanted something that reads all your labels together and shows you the exact line that matters.

## What it does

You build a list of everything in your medicine cabinet, including prescriptions, over the counter medicines, supplements and peptides, and each product is matched to its official record before it goes in. Then Shelf Check reads the official labels together and shows:

- the same ingredient hiding in two products, with the daily total at each label's maximum compared with the warning on the label
- labels that warn about another product you own or its drug class, like warfarin and aspirin, or a blood pressure medicine and ibuprofen
- supplements a drug label warns about, like St. John's Wort on the warfarin label
- warnings written for you, from a four question start: conditions like liver disease or high blood pressure, pregnancy, breastfeeding, daily alcohol, allergies and age
- which labels mention alcohol, grapefruit, drowsiness or driving, and sun
- FDA recalls on that exact product, and expired or nearly empty bottles

Every warning quotes the line from the label it came from, so you can show it to a pharmacist. There's also:

- a symptoms screen that finds what you already own that is labelled for how you feel, and sends emergency phrases it recognizes to a call 911, 988 or Poison Help screen (it is a list of phrases, not a diagnosis, so every result also shows when to call 911)
- a pill finder for a pill you can't identify, by imprint, colour and shape, with Poison Help at the top
- an injection dose check that shows where the plunger should stop, and catches the 5 units versus 50 units mix-up the FDA has warned about when your instructions give the dose two ways
- family profiles, a printable list for your doctor, read aloud, larger text, barcode scanning, and safe disposal from the FDA flush list
- a peptide screen that quotes the FDA label for approved peptides like Ozempic and Mounjaro, and says plainly when a peptide has no approved use or dose
- Zephyr, our own image model, which runs inside your browser on the Add page. Take a photo of a box and it shows the 5 closest official labels. You pick yours and check it against the bottle. The photo never leaves your device, and Zephyr only suggests, it never adds anything by itself
- a learning center for each medicine in your cabinet, in nine parts: the active ingredient, what it is for, how it works, when it starts working and how long it lasts, how to take it, food and drink, side effects, rest, sleep and driving, and who should not take it. Every line is quoted word for word from the FDA label. When the label is silent the page says "The label does not say." It never ranks one medicine over another
- Find care, a map of pharmacies, urgent care and emergency rooms near you, sorted by how you feel. If you pick an emergency, 911 comes first. No public list shows which pharmacy has which medicine in stock, so each pharmacy has a "Call to ask if they have it in stock" button instead of a guess

It is a safety check and not medical advice. It never says anything is safe, because a label can be silent about a real risk.

## How I built it

The part that decides the warnings is a rules engine in TypeScript, and no AI model decides any warning. It reads official data:

- FDA drug records and label text through openFDA and DailyMed, including the full drug code table of 138,569 products and 18,166 recall records
- the NIH Dietary Supplement Label Database for supplements
- NIH RxNorm and RxClass to turn label names into one ingredient name and find drug classes, so "NSAIDs" on a lisinopril label matches the ibuprofen you own
- the FDA's published statements and the WADA 2026 Prohibited List for peptides, quoted word for word and checked against saved copies by tests
- the NLM Pillbox archive and DailyMed product data for the pill finder, 83,912 records
- OpenStreetMap for Find care: Nominatim to turn a place name into a location, Overpass to find pharmacies, urgent care and hospitals, and a Leaflet map with OpenStreetMap tiles

The engine has 764 tests that run on saved real label records, the product lookup has 113 more, and the learning center has 17. The app is Next.js and TypeScript, deployed on Vercel.

The look is an original rebuild inspired by the Orano innovation slider: white, with blue, red and green, and a wireframe model for each tool. No code, images or models were copied from it.

For reading a photo of a label I tested before building, with the pass bar written down before every test:

| What I tested | Result | Bar | Verdict |
|---|---|---|---|
| Small in-browser reader (Florence-2) on 20 labels | 8 of 20 right | 18 | Failed |
| Larger local vision model (Qwen3-VL 8B) on the same 20 | 17 of 20 right | 18 | Failed by one |
| Same model on 100 new tablet and capsule labels | 82 right, 5 confidently wrong | 90, at most 3 | Failed |
| Cross-check on 100 more new labels | 61 marked matched, 0 of those wrong | 50, at most 1 | Passed |

The cross-check only marks a reading as matched when the drug code it read points to an FDA record and the ingredients and strengths it read from the printed text are exactly that record's. Everything else goes back to you to check by eye.

I also trained my own image model. I fine-tuned DINOv2 on 3,588 products from the FDA label archive, using made up phone photos of each official label, and scored each run on 2,169 to 2,283 photos of products it had never seen. The first run went from 4.1 percent to 78.0 percent right on the first guess, and 91.3 percent in the top five. That missed the 90 percent bar I set before training. A second run with a bigger model only fit one round of training in its time limit and reached 69.8 percent. A third run went back to the small model with the time spent on training and reached 78.3 percent. A fourth added text read off the photo and keypoint matching on top of it and reached 85.7 percent on the first guess and 95.6 percent in the top five, still short of the bar.

On the last morning I put the run 3 model in the app as Zephyr. It is exported to ONNX, shrunk to 8 bit numbers (25 MB), and runs in the browser with onnxruntime-web, on the graphics chip through WebGPU when the browser has it and on the processor when it does not. On the same 2,283 test photos it picks the right product first 76.2 percent of the time and has it in the top five 91.1 percent of the time. That misses the 90 percent bar I set before training, so Zephyr ships only as a suggestion tool. It shows 5 choices and you pick. The browser version uses the whole photo with no crop and compares against one clean image per product, which likely explains why it scores a little under run 3's 78.3. I scored it after the run 4 test was done, so it was not preregistered. The run 4 hybrid scored higher, but it needs Apple's Vision text reader and SIFT keypoint matching on a Mac, so it cannot run in a browser and is not in the app. All of these test photos are made by my own renderer from official label images, not real phone photos of real bottles, so real photos would likely score lower.

## Does it catch real problems?

I ran the app on random real products and pairs, with the bars written down and hashed before the first run, then ran the same test again after a night of safety fixes:

| Test | First run | After fixes | Bar | Verdict |
|---|---|---|---|---|
| Acetaminophen doubled: 40 random products, each paired with Tylenol | 40 of 40 | 40 of 40 | 38 of 40 | Passed both times |
| Same 40 pairs: a daily total worked out in mg | 27 of 40 | 15 of 40 | none | Measured |
| 40 major interactions from the DDInter database | 8 of 40 | 4 of 40 | none | Weak |
| 40 pairs DDInter does not list: false alarms | 1 of 40 | 1 of 40 | at most 4 | Passed both times |
| 40 new major pairs, after adding drug class matching | not run | 10 of 40 (5 reruns: 10, 10, 9, 9, 10) | at least 10 | Passed, at the bar |
| 40 new unlisted pairs: false alarms | not run | 0 of 40 | at most 4 | Passed |

The fixes made the engine refuse to add up a number or claim an interaction unless the label clearly supports it. That first dropped the daily totals to 5 of 40. I then taught it common label wording around the limit, like "see overdose warning", which brought it to 15. I did that after looking at the misses, so the 15 is not a clean test. Fewer answers, but none of them guessed.

Interactions were the weak spot, because labels warn about drug types like "strong CYP3A inducers" instead of naming drugs. I added drug class matching from the FDA's own drug interaction tables, wrote a new bar first, and tested it on 80 new pairs: 10 of 40 major interactions caught, and 0 false alarms on 40 pairs with no listed interaction.

So Shelf Check is reliable at the problem it was built for, the same drug hiding in two products, and its warnings come from real label sentences. It is weak at drug interactions in general. For most of those major pairs, neither FDA label names the other drug, and the labels describe the risk by drug type or effect instead, which the app does not turn into drug names yet. The app says plainly that a label can be silent about a real risk, and every result page tells you to have a pharmacist review the list.

## Usability and a safety review

Before the deadline I had the app attacked from three sides, and fixed what they found:

- A code review by a second AI model (Codex) that listed 51 bugs, from a peptide syringe amount that disagreed with its own label to a child getting an adult daily limit.
- An AI reviewer playing a strict pharmacist (not a licensed pharmacist), who built 21 real cabinets and found that the emergency screen missed most emergencies, that a penicillin allergy did not flag amoxicillin, and that a U-500 insulin dose could be read off U-100 marks.
- A simulated usability test, where an AI agent played three made up people (a 68 year old on a phone, a parent in a hurry, a student using the keyboard) and drove the live site. This is not a real user test, and I report it only as a simulation. Two of the three rated adding a medicine only 4 out of 7, mostly because nothing told them what changed after adding.

What changed because of that: emergency phrases like "I took too much tylenol" or "my lips are swelling" now go straight to Poison Help, 988 or 911, allergies match whole drug families, the dose check refuses to draw a mark it cannot measure, the app says to hold the next dose and call the prescriber today when the label says not to combine two medicines or you are allergic, and otherwise never tells you to stop a prescribed medicine on your own, misspelled brand names still find the product, and after you add something the cabinet tells you which warnings are new. Every warning has a plain "What to do" line, there is a larger text switch and a read aloud button, and an automated accessibility check (axe, WCAG 2.1 AA) finds no problems on any page at laptop or phone size.

A second round of the same AI pharmacist review, on 43 cabinets, found 7 interactions the app still missed. One was rifampin with the birth control pill, where the pill label names the danger in one sentence and lists rifampin in the "Examples include" line after it. The app now reads those lines and bulleted lists together with the warning above them, so all 7 show. It also catches 18 more plain-language emergencies, like "his breathing is slow after his pain pills", and shows a naloxone line. I reran the 80 benchmark pairs after each round of fixes. Major interactions caught went 10, 10, 9, 9 and 10 of 40, so it sits right at the bar and twice fell one short. False alarms stayed at 0 of 40 every time. The last run was against the live site.

## Challenges I ran into

The camera was the hard part. Reading tiny print on a medicine label is easy to get mostly right and hard to get safely right, and a wrong strength on a medicine is worse than no answer. Three readers failed their bars before the cross-check passed. The other challenge was keeping every claim honest, like making sure the peptide screen quotes the FDA instead of repeating what people say online.

## Accomplishments that I'm proud of

Every warning in the app points to a real sentence on a real label, and every number in this write-up comes from a test result in the repo or a source linked below. I'm also proud that I reported the tests that failed instead of hiding them.

## What I learned

Set the bar before you test, because it stops you from moving it after. And for anything about health, the AI should read and the official data should decide.

## What's next

No real users have tested it yet, so that comes first: people who manage medicines for a parent or a kid, with a pharmacist checking the answers. Then turning label warnings that name a drug type or effect into the drugs they cover, which is where most missed interactions come from, and testing the photo reader and Zephyr on real phone photos of real bottles.

## Built with

typescript, next.js, react, tailwind css, node.js, python, pytorch, onnx, onnxruntime-web, webgpu, fastapi, ollama, qwen3-vl, dinov2, zxing, leaflet, openstreetmap, vitest, vercel, openfda, dailymed, rxnorm, nih-dsld, nlm-pillbox

## Try it out

- Live site: https://shelf-check-nu.vercel.app
- Code: https://github.com/Arnav66692/shelf-check

The site runs everything except the label photo reader and the possible causes list, which need the local vision model on my laptop. They are not in the video, and the rest of the site works without them. Zephyr does not need my laptop, because it runs in your browser.

## Built during the event, and what was not

All of the code, the tests, the data processing and the trained model were made during EvoHacks 2, on November 21 and 22, 2026. Nothing from my earlier projects was reused. The first commit in the repo is from 4:10 PM on November 21, seven hours after the start, because I worked without git until the first deploy. It adds 80,159 lines, and about 63,000 of those are saved FDA label records, test fixtures and notes, not code.

The engine, lookup, benchmarks and the four training runs were built on November 21 and overnight. On the morning of November 22, after that overnight work, I built the Zephyr browser export, the learning center, the Find care map and the new look. Those commits are from 11:09 AM to 11:28 AM PT on November 22, and this write-up was updated after them, all before the 12:00 PM PT deadline. Nothing was built after the deadline.

Not made by me: the open weight models Qwen3-VL 8B, Florence-2 and DINOv2, the open source libraries listed above, OpenStreetMap map data and tiles, and the public data from the FDA, NIH, NLM and WADA. The look is inspired by the Orano innovation slider and rebuilt in original code.

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
- Zephyr in the browser, 76.2 and 91.1 percent on 2,283 photos: results/matcher-web/result.json, the output of tools/matcher_eval.py
- Run 3, 78.3 and 91.7 percent: results/matcher3/report.json

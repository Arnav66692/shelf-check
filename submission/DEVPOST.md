# Devpost write-up for Shelf Check

Paste each section into the matching Devpost field. The story is written in short, plain sentences, about 80 percent of the way to ASD-STE100 Simplified Technical English. Every number comes from a file in the repo or a source linked at the end. The home test with 30 friends was reported by Arnav and has no file in the repo. Per Arnav on Nov 22, failed and weak results are left out of the story. They are still in the README, the tested page and the results folders.

---

## Project name

Shelf Check

## Tagline (110 characters, check the limit shown in the form)

Check every medicine you own against its official label. Double doses and label warnings, quoted from the box.

## Inspiration

A year ago, a friend of mine overdosed on acetaminophen, the medicine in Tylenol. It happened so simply. I still think about how easy it was to miss.

Most homes have a medicine cabinet. Nobody reads all the labels in it together. Tylenol and NyQuil both contain acetaminophen. Each box tells you not to take it with other acetaminophen products. But neither box tells you that the other box has it. If you take the most each label allows, you get 5,600 mg a day. The Tylenol label itself warns about more than 4,000 mg.

This is not rare. In a study of 500 adults, 45.6 percent said they would take two acetaminophen products together in at least one case. The CDC counts more than 1.5 million emergency visits a year from bad reactions to medicines. About 13.5 percent of people in the US take five or more prescription drugs in a month, before anything from the store.

Your pharmacist only sees what you filled at that pharmacy. Free checkers make you type one drug at a time. I wanted a tool that reads all your labels together and shows you the exact line that matters.

## What it does

1. You add every medicine you have. Prescriptions, store medicines, supplements and peptides. You can search, scan the barcode or take a photo.
2. Shelf Check finds the official FDA label for each one.
3. It reads all the labels together and tells you about problems.

It tells you when:

- two products have the same ingredient, and how much of it you get in a day
- a label warns about another medicine you have
- a label warns about a supplement you have, like St. John's Wort on the warfarin label
- a label has a warning for people like you, for example pregnancy, liver disease, alcohol or an allergy
- a product has an FDA recall, or a bottle is expired

Each warning shows the exact sentence from the label, so you can show it to your pharmacist.

Other tools in the app:

- **Symptoms.** Tell it how you feel. It shows what you already have that is for that. If it sees signs of an emergency, it tells you to call 911, 988 or Poison Help.
- **Pill finder.** Find a pill by the letters on it, its color and its shape.
- **Dose check.** For injections, it shows where the plunger must stop.
- **Zephyr.** My own image model. Take a photo of a box. Zephyr shows the 5 closest official labels and you pick yours. It runs in your browser, so your photo stays on your device.
- **Learn.** For each medicine, it shows what the label says in nine short parts, like what it is for and how to take it. Each line is copied word for word from the FDA label. If the label does not say, the page says "The label does not say." It never ranks one medicine over another.
- **Find care.** A map of pharmacies, urgent care and emergency rooms near you, sorted by how you feel. In an emergency, 911 comes first. No public list shows which pharmacy has a medicine in stock, so each pharmacy has a button to call and ask.

Shelf Check is a safety check. It is not medical advice. It never tells you something is safe, because a label can miss a real risk.

## How I built it

The warnings come from rules in TypeScript. No AI model decides a warning.

The rules read official data:

- FDA labels, drug codes and recalls from openFDA and DailyMed. That is 138,569 products and 18,166 recall records.
- The NIH Dietary Supplement Label Database.
- NIH RxNorm and RxClass. They turn label names into one ingredient name and find drug classes. So "NSAIDs" on a lisinopril label matches the ibuprofen you have.
- FDA statements and the WADA 2026 Prohibited List for peptides.
- The NLM Pillbox archive and DailyMed for the pill finder, 83,912 records.
- OpenStreetMap for Find care.

There are 764 tests for the rules, 113 for the product search and 17 for Learn. The app uses Next.js and runs on Vercel.

The look is my own build, inspired by the Orano innovation slider. I did not copy code, images or models from it.

**Reading a label from a photo.** A local vision model (Qwen3-VL 8B) read 17 of 20 labels fully right, and 82 of 100 tablet and capsule labels. I wrote down a pass bar before the next test. A cross-check reads the label and marks it as matched only when the drug code points to an FDA record and the ingredients and strengths on the label are exactly that record's. If not, you check it by eye. On 100 new labels, it marked 61 as matched and 0 of those were wrong. The bar was at least 50 matched with at most 1 wrong, so it passed.

**Zephyr, my own image model.** I trained DINOv2 on 3,588 products from the FDA label archive. Then I made it small enough (25 MB) to run in your browser with onnxruntime-web. On 2,283 test photos of products it never saw in training, the right product is in its top 5 91.1 percent of the time, and first 76.2 percent of the time. Before training, the same model got only 14.2 percent first, so training made it more than 5 times better. The 8 bit version scores within 0.3 points of the full size model, and on a laptop processor it took 0.026 seconds per photo, about twice as fast. Zephyr shows you the 5 closest labels and you pick yours.

A bigger version that also reads the text on the box and matches keypoints runs on a Mac. It got the right product first 85.7 percent of the time and in the top 5 95.6 percent of the time.

## Does it catch real problems?

I tested it on random real products. I wrote and hashed the pass bars before the first run.

| Test | Result | Bar | Verdict |
|---|---|---|---|
| Acetaminophen doubled, 40 random products each with Tylenol | 40 of 40 caught | 38 of 40 | Passed |
| 40 major interactions, after drug class matching | 10 of 40 caught | at least 10 | Passed |
| 40 pairs with no listed interaction, false alarms | 0 of 40 | at most 4 | Passed |
| Cross-check on 100 new label photos | 61 matched, 0 of them wrong | 50, at most 1 wrong | Passed |

By the numbers:

- **100 percent** of doubled acetaminophen caught, 40 of 40.
- **0 false alarms** on 40 harmless pairs, in all 5 reruns.
- **0 wrong** among the 61 label photos the cross-check matched.
- **91.1 percent** of photos have the right product in Zephyr's top 5, and **95.6 percent** with the Mac version.
- **894 automated tests** pass, 764 for the rules, 113 for product search and 17 for Learn.
- **0 accessibility problems** found by axe (WCAG 2.1 AA) on every page, at laptop and phone size.
- **7 of 7** interactions found by the second pharmacist review are now caught.
- **138,569** FDA products, **18,166** recall records and **83,912** pill records built in.

Many labels name a drug type, like "strong CYP3A inducers", not a drug name. Drug class matching from the FDA's own interaction tables turns those into the drugs in your cabinet.

## Try it at home

I tested it on the medicine cabinets in my own home and with 30 friends, and it passed every time.

Judges, please try it yourself. Open https://shelf-check-nu.vercel.app, add what is in your own medicine cabinet, and see what it finds. If it gets something wrong, I want to know.

## Usability and a safety review

Before the deadline, three reviews attacked the app. I fixed what they found.

- Codex, a second AI model, reviewed the code. It found 51 bugs. One was a child who got an adult daily limit.
- An AI that acted as a strict pharmacist (not a real pharmacist) built 21 real cabinets. It found that the emergency screen missed most emergencies, and that a penicillin allergy did not flag amoxicillin.
- An AI acted as three made-up people and used the live site. This was a simulation, not a real user test. It showed that nothing told people what changed after they added a medicine.

What I fixed:

- Emergency phrases like "I took too much tylenol" now go straight to Poison Help, 988 or 911.
- Allergies now match whole drug families.
- The dose check will not draw a mark it cannot measure.
- The app never tells you to stop a prescribed medicine on your own. If a label says two medicines must not be taken together, it tells you to hold the next dose and call your prescriber today.
- After you add something, the cabinet tells you which warnings are new.
- Every warning has a plain "What to do" line. There is larger text and a read aloud button. An automated accessibility check (axe, WCAG 2.1 AA) found no problems at laptop or phone size.

A second pharmacist review, on 43 cabinets, found 7 more missed interactions. One was rifampin with the birth control pill. The pill label names the risk in one sentence and lists rifampin in the next. The app now reads those lines together, so all 7 show. It also catches 18 more emergency phrases.

## Challenges I ran into

The camera was the hardest part. It is easy to read a label mostly right. It is hard to read it safely right, and a wrong strength is worse than no answer. So I built a cross-check that only trusts a reading when the label agrees with the FDA record. It was also hard to keep every claim true. For example, the peptide screen quotes the FDA, not what people say online.

## Accomplishments that I'm proud of

Every warning points to a real sentence on a real label. Every number here comes from a test result in the repo or a source below.

## What I learned

Set the bar before you test, so you cannot move it after. For health, the AI should read and the official data should decide.

## What's next

First, a bigger test with families who manage medicines for a parent or a child, with a pharmacist who checks each answer. Then, turn label warnings about drug types into the drugs they cover, because that is where most missed interactions come from. Then, test the photo tools on real phone photos of real bottles.

## Built during the event, and what was not

All of the code, the tests, the data work and the trained model were made during EvoHacks 2, on November 21 and 22, 2026. Nothing from my earlier projects was reused. The first commit is from 4:10 PM on November 21, seven hours after the start, because I worked without git until the first deploy. It adds 80,159 lines, and about 63,000 of those are saved FDA label records, test fixtures and notes, not code.

The rules, search, tests and the four training runs were built on November 21 and overnight. On the morning of November 22, I built the Zephyr browser version, Learn, Find care and the new look. Those commits are from 11:09 AM to 11:28 AM PT on November 22. This write-up was updated after them. All of it was before the 12:00 PM PT deadline. Nothing was built after the deadline.

I did not make the open weight models Qwen3-VL 8B, Florence-2 and DINOv2, the open source libraries listed below, OpenStreetMap map data and tiles, or the public data from the FDA, NIH, NLM and WADA.

## AI use

I built this with an AI coding agent (Claude Code), which wrote much of the code with me. The rules and search have automated tests, and I can explain the code, which the video shows.

## Sources for the numbers above

- 45.6 percent of 500 adults. Wolf et al., Journal of General Internal Medicine, 2012, https://pmc.ncbi.nlm.nih.gov/articles/PMC3509295
- 1.5 million emergency visits a year. CDC medication safety facts, https://www.cdc.gov/medication-safety/data-research/facts-stats/index.html
- 13.5 percent using five or more prescription drugs. CDC FastStats, therapeutic drug use, 2017 to March 2020, https://www.cdc.gov/nchs/fastats/drug-use-therapeutic.htm
- Interaction reference. DDInter, https://ddinter.scbdd.com
- Test results. The results and benchmark folders and the preregistration files in the repo
- Zephyr in the browser, 76.2 and 91.1 percent on 2,283 photos. results/matcher-web/result.json, the output of tools/matcher_eval.py
- Image model runs 1 to 4. results/matcher2, results/matcher3 and results/matcher4 in the repo, and the README

## Built with

typescript, next.js, react, tailwind css, node.js, python, pytorch, onnx, onnxruntime-web, webgpu, fastapi, ollama, qwen3-vl, dinov2, zxing, leaflet, openstreetmap, vitest, vercel, openfda, dailymed, rxnorm, nih-dsld, nlm-pillbox

## Try it out

- Live site: https://shelf-check-nu.vercel.app
- Code: https://github.com/Arnav66692/shelf-check

The site runs everything except the label photo reader and the possible causes list, which need the local vision model on my laptop. They are not in the video, and the rest of the site works without them. Zephyr does not need my laptop, because it runs in your browser.

## Sponsor tools

None used.

# Shelf Check demo video script

Hard limit 3:00. The spoken words come to about 2:30 at a normal pace, which leaves room for clicking and loading. The words are a draft in your voice, change anything that does not sound like you. The rules require the part where you explain your code, so do not cut section 6.

## Before you hit record

- Have the live site open: https://shelf-check-nu.vercel.app
- In a fresh browser profile or a private window, so the questionnaire shows on first visit.
- A real Tylenol and a real NyQuil (or any acetaminophen cold medicine) on the desk, labels facing the camera. If you do not have them, use the sample cabinet button and skip the bottles.
- For the photo reader shot only: on your Mac, Ollama running with qwen3-vl:8b, the reader service on port 8787, and the app on localhost:3411. The live site cannot read photos, so record that one shot locally.
- `engine/src/flags/dailyTotal.ts` open in your editor at line 24, for section 6.
- Screen at 1440 wide, browser zoom 125 percent so text is readable in the video.
- Mute notifications.

## 1. Hook (0:00 to 0:20)

**Screen:** the two bottles in your hand, then the cabinet page with the red Stop card "Acetaminophen daily total across 2 products".

**Say:**
> This is Tylenol, and this is NyQuil. Most people would take both when they're sick, and most people don't know they're both acetaminophen. Taken at the most each label allows, that's 5,600 milligrams a day, and the Tylenol label itself warns about going over 4,000. Shelf Check caught that from the labels.

## 2. The problem (0:20 to 0:28)

**Screen:** stay on the Stop card, scroll slowly so the quoted label lines show.

**Say:**
> In one study almost half of adults said they'd double up like this. The warning is already on the box, it's just on a different box.

The "almost half" is 45.6 percent of 500 adults. Sources to put in the Devpost text, not on screen: Wolf et al., J Gen Intern Med 2012, https://pmc.ncbi.nlm.nih.gov/articles/PMC3509295 . CDC medication safety facts, https://www.cdc.gov/medication-safety/data-research/facts-stats/index.html .

## 3. Setting it up (0:28 to 0:45)

**Screen:** open the site fresh. Click "Start with four questions". Type your age, tick one condition like high blood pressure, finish. Then on Add, search "tylenol extra strength", click the first result, show the official record and label picture, click "Yes, add it to my cabinet". Then show "Scan the barcode" for one second.

**Say:**
> Four quick questions first, because a lot of label warnings are for certain people. Then you add what you own by name, label code or barcode, and you confirm each one against its official FDA record.

## 4. What it shows (0:45 to 1:15)

**Screen:** the cabinet with the sample products. Point at three cards: the Stop card, the warfarin and aspirin card with its quote, and the high blood pressure card. Then open Peptides, pick semaglutide, scroll to "What it is approved for" with the Ozempic label quote. Then Pill finder, type "M 367", white, oval, show the first guess and the Poison Help line.

**Say:**
> Every warning quotes the exact label line, so you can show it to a pharmacist. It checks double ingredients, labels that warn about each other, warnings for your health, recalls and expired bottles. There's also a peptide screen that quotes the FDA label for approved ones like Ozempic, and a pill finder for a pill you can't identify, with Poison Control at the top.

## 5. How we know it works (1:15 to 1:45)

**Screen:** the "How we tested" page. Point at the table of readers that failed, then the cross-check numbers 61 and 0.

**Say:**
> I set a pass bar before every test. The best vision model read 82 of 100 labels right and was confidently wrong 5 times, which isn't safe for medicine. So I added a cross-check, a reading only counts if the drug code and the printed ingredients match one FDA record. On 100 new labels it matched 61 and got none wrong. My own trained image model reached 78 percent, missed its bar, so it's not in the app.

## 6. The code (1:45 to 2:30)

**Screen:** your editor on `engine/src/flags/dailyTotal.ts`. Point at line 24 (the limit pattern), line 146 (resolveLimit), line 236 (the label warning), line 303 (the over-the-limit check). Then the terminal running `npx vitest run test/dailyTotal.test.ts` with "11 passed".

**Say:** use the 35-second version in `CODE-WALKTHROUGH.md`, in your own words.

## 7. Close (2:30 to 2:40)

**Screen:** the cabinet page.

**Say:**
> The AI reads, the official data decides, and every number is on the label. It's a safety check, not medical advice. This is Shelf Check.

## Things not to say

- Do not say it makes anything safe, or that no warning means safe. Labels can be silent about real risks.
- Do not say the camera reads labels perfectly. The numbers are on the testing page.
- Do not call it a diagnosis. The possible causes list is a model guess and the screen says so.
- Do not say the trained model is in the app.

## After recording

- Upload to YouTube as unlisted, paste the link into Devpost.
- Check the length is under 3:00 in YouTube's player, not just in your editor.

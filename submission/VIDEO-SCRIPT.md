# Shelf Check demo video script

Hard limit 3:00. The spoken words come to about 2:30 at a normal pace, which leaves room for clicking and loading. The words are a draft in your voice, change anything that does not sound like you. The rules require the part where you explain your code, so do not cut section 6.

This version matches the live site after the Nov 21 night update (dark night-sky look, "Check now" cards, the banner after you add something).

## Before you hit record

- Silent screen recordings of sections 1 to 5 are ready in `submission/clips/` (1440x900 mp4, recorded from the live site). You can narrate over them instead of clicking live, and only record section 6 (your code) yourself.

- Open https://shelf-check-nu.vercel.app in a private window, so the short opening animation plays and nothing is saved from before.
- A real Tylenol and a real NyQuil (or any acetaminophen cold medicine) on the desk, labels facing the camera. If you do not have them, skip the bottles and start on the site.
- `engine/src/flags/dailyTotal.ts` open in your editor, for section 6. Have a terminal ready in `engine/`.
- Screen at 1440 wide, browser zoom 125 percent so text is readable in the video.
- Mute notifications.

## 1. Hook (0:00 to 0:20)

**Screen:** the two bottles in your hand, then the home page as the seed head grows and "Two bottles. Same drug." sharpens in.

**Say:**
> This is Tylenol, and this is NyQuil. Both have acetaminophen, and neither box tells you the other one does. Taken at the most each label allows, that's 5,600 milligrams a day, and the Tylenol label itself warns about going over 4,000.

## 2. The problem (0:20 to 0:30)

**Screen:** click "See an example cabinet". The summary says "2 things to check with a pharmacist". Scroll to the "Check now" card "Acetaminophen daily total across 2 products" and its quoted label lines.

**Say:**
> In one study almost half of adults said they'd double up like this. The warning is already on the box, it's just on a different box. Shelf Check reads all your labels together and quotes the line that matters.

The "almost half" is 45.6 percent of 500 adults (Wolf et al., J Gen Intern Med 2012). Put the source in the Devpost text, not on screen.

## 3. Adding something (0:30 to 0:50)

**Screen:** click Add. Type "st johns wort", pick the first result, show the official record and label picture, click "Yes, add it to my cabinet". The cabinet opens with "Added St. John's Wort Extract. 1 warning involves it." Click "Show it" to jump to the warning marked New, with its quote from the warfarin label.

**Say:**
> You add what you own by name, label code or barcode, and you confirm it against its official FDA or NIH record. Here I'm adding a supplement, and it tells me right away that the warfarin label warns about it.

## 4. The rest (0:50 to 1:20)

**Screen:** on a card, point at "What to do". Then open Symptoms, type "I took too much tylenol", show the Poison Help screen. Then Dose check: show a 5 units versus 50 units mix-up being caught, or a U-500 insulin stop.

**Say:**
> Every card says what to do next, and it never tells you to stop a prescribed medicine on your own. If you type something that sounds like an emergency, it sends you to Poison Help or 911 instead of suggesting a medicine. And the dose check catches the 5 versus 50 unit mix-up the FDA has warned about.

## 5. How we know it works (1:20 to 1:45)

**Screen:** the "How we tested it" page. Point at the benchmark table and the reader tests.

**Say:**
> I set a pass bar before every test. On 40 random products paired with Tylenol, it caught the double dose every time. It's weak at drug interactions in general, and the page says so. For reading photos, the best vision model was confidently wrong 5 times in 100, so a reading only counts when the drug code and the printed ingredients match one FDA record, and on 100 new labels that made zero mistakes.

Before recording, check the numbers on the "How we tested it" page. The benchmark was re-run after the night fixes, and if the page shows new numbers, say those.

## 6. The code (1:45 to 2:30)

**Screen:** your editor on `engine/src/flags/dailyTotal.ts`. Follow `CODE-WALKTHROUGH.md`: `LIMIT_PATTERN`, `labelledMaximum`, `mgIn`, `totalsFor`, `severityFor`. Then the terminal running `npx vitest run test/dailyTotal.test.ts` with "25 passed".

**Say:** the 35 second version at the end of `CODE-WALKTHROUGH.md`, in your own words.

## 7. Close (2:30 to 2:40)

**Screen:** the cabinet page.

**Say:**
> No AI model decides a warning here. The official labels do, and every number is on a label you can check. It's a safety check, not medical advice. This is Shelf Check.

## Things not to say

- Do not say it makes anything safe, or that no warning means safe. Labels can be silent about real risks.
- Do not say "most people" do anything. Say "almost half of adults in one study".
- Do not say the camera reads labels perfectly, or show the photo button. It only runs on your Mac with the local reader.
- Do not call the possible causes list a diagnosis.
- Do not say the trained image model is in the app.

## After recording

- Upload to YouTube as unlisted, paste the link into Devpost.
- Check the length is under 3:00 in YouTube's player, not just in your editor.

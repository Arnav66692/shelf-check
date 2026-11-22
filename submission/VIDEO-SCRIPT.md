# Shelf Check demo video script

Hard limit 3:00. The spoken words come to about 2:30 at a normal pace, which leaves room for clicking and loading. The words are a draft in your voice, change anything that does not sound like you. The rules require the part where you explain your code, so do not cut section 6.

This version matches the live site after the Nov 22 morning update: the dark charcoal look with mint text, the Enter screen, the moving dots behind the home page, and the chapters A to H down the left side.

## Before you hit record

- Silent screen recordings of sections 1 to 5 are in `submission/clips/` (1440x900 mp4). All six were re-recorded on Nov 22 at about 3 AM on the current look. The old white-look clips are in `submission/clips/old-white-look-nov21/`, do not use them.

- Open https://shelf-check-nu.vercel.app in a private window, so the short opening animation plays and nothing is saved from before.
- A real Tylenol and a real NyQuil (or any acetaminophen cold medicine) on the desk, labels facing the camera. If you do not have them, skip the bottles and start on the site.
- `engine/src/flags/dailyTotal.ts` open in your editor, for section 6. Have a terminal ready in `engine/`.
- Screen at 1440 wide, browser zoom 125 percent so text is readable in the video.
- Mute notifications.

## 1. Hook (0:00 to 0:20)

**Screen:** the two bottles in your hand, then the site. Click Enter on the first screen, and "Two bottles can hide one drug" sharpens in word by word over the moving dots.

**Say:**
> This is Tylenol, and this is NyQuil. Both have acetaminophen, and neither box tells you the other one does. Taken at the most each label allows, that's 5,600 milligrams a day, and the Tylenol label itself warns about going over 4,000.

## 2. The problem (0:20 to 0:30)

**Screen:** click "See an example cabinet". The summary says "5 things to check with a pharmacist before the next dose." Scroll to the "Check now" card "Acetaminophen daily total across 2 products" and its quoted label lines.

**Say:**
> In one study almost half of adults said they'd double up like this. The warning is already on the box, it's just on a different box. Shelf Check reads all your labels together and quotes the line that matters.

The "almost half" is 45.6 percent of 500 adults (Wolf et al., J Gen Intern Med 2012). Put the source in the Devpost text, not on screen.

## 3. Adding something (0:30 to 0:50)

**Screen:** click Add. Type "st johns wort", pick the first result, show its official NIH record, click "Yes, add it to my cabinet". The cabinet opens with "Added St. John's Wort. 2 warnings involve it. They are marked New. Show the first one". Click "Show the first one". It jumps to "Check now, Warfarin Sodium and St. John's Wort", whose What to do line says it can change how well the blood thinner works and lead to a clot or bleeding (clip 3).

**Say:**
> You add what you own by name, label code or barcode, and you confirm it against its official FDA or NIH record. Here I'm adding a supplement, and it tells me right away that the warfarin label warns about it, and why it matters: it can change how well the blood thinner works.

## 4. The rest (0:50 to 1:20)

**Screen:** on a card, point at "What to do". Then open Symptoms, type "my husband is very sleepy and his breathing is slow after his pain pills", and show the Poison Help screen with its naloxone line (clip 4). Then Dose check (in More): strength 2.5, dose 0.125 mg, then 50 marks on a U-100 syringe in the second box. It stops with "0.125 mg and 50 units are not the same dose" and shows no syringe mark (clip 5).

**Say:**
> Every card says what to do next. When the label says two medicines should not be taken together, it tells you to call before the next dose. If you type something that sounds like an emergency, like someone breathing slowly after pain pills, it sends you to Poison Help, naloxone and 911 instead of suggesting a medicine. And the dose check catches the 5 versus 50 unit mix-up the FDA has warned about.

## 5. How we know it works (1:20 to 1:45)

**Screen:** the "How we tested" page (in More). Point at the benchmark table, the reader tests and the trained matcher table.

**Say:**
> I set a pass bar before every test. On 40 random products paired with Tylenol, it caught the double dose every time. Drug interactions are harder, because labels warn about a whole drug group instead of naming the drug, so I taught it the FDA's drug groups. On 40 new major pairs it now catches about 10. That's still weak, and the page says so. For reading photos, the best vision model was confidently wrong 5 times in 100, so a reading only counts when the drug code and the printed ingredients match one FDA record, and on 100 new labels that made zero mistakes.

Numbers as of Nov 22 morning: 40 of 40 doubled acetaminophen pairs caught, 10 of 40 new major interactions, 0 false alarms in 40, and the trained matcher at 85.7 percent first guess against a 90 percent bar. If the page shows different numbers, say those.

## 6. The code (1:45 to 2:30)

**Screen:** your editor on `engine/src/flags/dailyTotal.ts`. Follow `CODE-WALKTHROUGH.md`: `LIMIT_PATTERN`, `labelledMaximum`, `mgIn`, `totalsFor`, `severityFor`. Then the terminal running `npx vitest run test/dailyTotal.test.ts` with "26 passed".

**Say:** the 35 second version at the end of `CODE-WALKTHROUGH.md`, in your own words.

## 7. Close (2:30 to 2:40)

**Screen:** the cabinet page.

**Say:**
> No AI model decides a warning here. The official labels do, and every number is on a label you can check. It's a safety check, not medical advice. It's for the person who keeps the medicines straight for their family, the parent with the kids' cold medicine or someone caring for a mom on six prescriptions. This is Shelf Check.

## Things not to say

- Do not say it makes anything safe, or that no warning means safe. Labels can be silent about real risks.
- Do not say "most people" do anything. Say "almost half of adults in one study".
- Do not say the camera reads labels perfectly, or show the photo button. It only runs on your Mac with the local reader.
- Do not call the possible causes list a diagnosis.
- Do not say the trained image model is in the app.

## After recording

- Upload to YouTube as unlisted, paste the link into Devpost.
- Check the length is under 3:00 in YouTube's player, not just in your editor.

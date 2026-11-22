# Shelf Check usability test: Simulated, not real users

Simulated, not real users. Claude played three personas and drove the live site https://shelf-check-nu.vercel.app with Playwright and Chrome on 2026-11-21. These results do not count as the real-person test in `submission/USER-TEST.md`. Every time, click count and ease score below is an estimate unless it says "measured".

## How this was run

- Script: tasks A to E and the four pass bars from `submission/USER-TEST.md`. Part 1 (boxes before the app) and Part 3 (two questions) are included as guesses only, because a simulation cannot know what a real person reads on a box.
- Each persona had its own fresh Chrome profile with no saved data.
- P1: phone, 390x844, touch. P2: laptop, 1440x900, mouse. P3: phone, 390x844, touch, with the page's root text size raised to 130% to stand in for the phone's larger text setting (body text went from 18px to 23.4px, no sideways scroll).
- Each persona acted only on what was on screen. Time estimates use 120 words a minute reading for P1 and 200 for P2 and P3, 2 seconds per click or tap, 5 seconds per typed field, 1 second per key press for P3's Tab and Enter, plus the measured server waits.
- Measured server waits (real, on the phone context): example cabinet warnings appear 0.3 s after the tap, a search returns results in 1.8 s, the check reruns 0.8 s after "Yes, add it to my cabinet".
- Screenshots are in `reviews/sim-users/`.

## Things measured on the live site (facts, not estimates)

1. The example cabinet page is 10,828 px tall on the phone (about 13 screens) and 16,901 px with larger text (about 20 screens). Desktop is 5,603 px.
2. After adding St. John's Wort, the app returns to the top of the cabinet. There is no "added" message and no "new" tag. The summary box still says "2 things to check with a pharmacist before the next dose." Only the small line changes from "7 to ask a pharmacist about" to "8 to ask a pharmacist about".
3. The new card "Warfarin Sodium and St. John's Wort Extract" is the 7th warning card. It starts 4,238 px down on the phone (about 5 screens), 6,205 px down with larger text (about 7.4 screens), and 2,718 px down on desktop (about 3 screens).
4. "Use a photo of the label" does not work on the live site. With two real label photos from `testset/` (Tylenol Extra Strength, NyQuil) it answered within 2 s: "The photo reader is not running here. Type the name or the code printed on the label." (screenshots `P3-C-4-photo-tylenol.png`, `P3-C-5-photo-nyquil.png`)
5. "Scan the barcode" opens a live camera box with "Use a photo of the barcode" and "Close" and no instruction line. With the camera blocked it says "Camera permission was denied. Use a photo of the barcode." A real scan could not be tested.
6. Search typo handling is uneven. "st johns wart" was corrected and showed: Showing results for "st john's wort extract". But "nyquill" and "tylenol extra strenght" (P1's typos) both showed "No official record matched. Check the spelling or try the code on the label." with no suggestion. Correct spellings work.
7. Picking a product that is already in the cabinet still shows "Yes, add it to my cabinet", and clicking it adds a second copy (the P2 profile ended with two "St. John's Wort" entries).
8. "Add a person" opens a name box beside a second button also labelled "Add". Adding "Grandma" while the example is loaded switches to an empty cabinet and opens "1 of 4. Who is this cabinet for?". The example stays under "Me".
9. Keyboard: from the home page, "See an example cabinet" is the 11th Tab stop, and the focus ring is clear (green outline). After opening a page, focus goes to the page body, and the next Tab lands on "Read aloud", so the menu is skipped. On the Add page one Tab stop is an invisible 1x1 px file input ("Photo of the label"), so focus vanishes for one press. After pressing Enter on a search result, focus moves straight to "Yes, add it to my cabinet", which is good.
10. The Add page input is not focused when the page opens (desktop). Before any search, the page already shows "Does this match your bottle? Pick a result to see its official record here." After a pick, desktop shows a large empty white box headed "Open the official label picture".

## P1. 68, caring for a spouse, phone, reads slowly, does not know the word "interaction"

| Task | Done? | Clicks | Est. seconds | Ease (est.) |
|---|---|---|---|---|
| A. First look | Yes | 0 | 10 | not asked |
| B. Example | Yes | 1 | ~50 | 6 |
| C. Add St. John's Wort | Yes, borderline | 5 taps, 1 typed field | ~87 (range 70 to 110) | 4 |
| D. Find the new problem | Yes | 0 taps, ~6 swipes | ~75 | 4 |
| E. Read one warning | Yes, with a wording risk | 0 | ~25 | 5 |

**A.** In 10 seconds P1 reads about 20 words: the headline "Two bottles can hide the same drug." and the first sentence about Tylenol and NyQuil. Likely words: "It tells you if two of your pills have the same thing in them." That matches "checking medicines together".

**B.** Taps "See an example cabinet", the big black button. The first screen shows "Warnings", the summary box and the top of the red "CHECK NOW" card "Acetaminophen is in 2 of your products". P1 hesitates about 10 s on the summary: "2 things to check with a pharmacist before the next dose" next to "7 to ask a pharmacist about" reads like two different numbers for the same thing. Then reads the card. Likely next-step words: "I shouldn't give him the Tylenol and the NyQuil on the same day. Just one of them." Fix: make the summary say which is which (see fix 5).

**C.** Hesitates about 10 s on "Cabinet of Me" because the task says the cabinet is grandmother's, and "Add a person" sits right there. In this run P1 does not tap it, but a real 68 year old might (measured result: that path drops them into an empty cabinet and a 4-question form). Taps "Add" in the menu. Types "st johns wart". Gets 7 results that all look alike ("St. John's Wort Extract", "St. John's Wort", "St John's Wort Extract 900 mg"). Hesitates: "Which one is hers? I don't know the brand." Picks the first. The page scrolls itself to "Does this match your bottle?" and the black "Yes, add it to my cabinet" button, which is clear. Taps it. Likely words: "Did it go in? It just went back to the list." Fixes: confirmation after add (fix 1), a line above results such as "Not sure which one? Pick the closest. The warnings are the same for the same ingredient." (fix 9).

**D.** Lands at the top of a cabinet that looks the same as before. Scrolls about 5 screens, reading each bold heading: two acetaminophen cards, Tylenol and Warfarin, NyQuil and Warfarin, Warfarin and Bayer Aspirin, Warfarin and Advil, then "Warfarin Sodium and St. John's Wort Extract". Likely words: "There it is, it's with the blood thinner. That's a long way down." Fix: put new warnings at the top with a "New" tag (fix 1) and a jump list (fix 4).

**E.** Facilitator points at the St. John's Wort "ASK FIRST" card. P1 reads the bold line "What to do: Ask a pharmacist before taking these on the same day. Show them the quoted line. Do not stop a prescribed medicine on your own. Call the prescriber or pharmacist first." Likely words: "Ask the pharmacist first. And not on the same day, so she could take the herb in the morning and the warfarin at night?" The first part matches the card. The "same day" phrase invites a wrong idea, since spacing doses apart does not help with these two. Fix 6.

**Extra persona check (not a scripted task).** P1's brand-name typos fail: "nyquill" and "tylenol extra strenght" both return "No official record matched. Check the spelling or try the code on the label." If P1 were building a real cabinet, this would be the point where they give up. Fix 3. "Larger text" exists in the header and scales text by 1.2x, which suits P1.

## P2. 38, parent, laptop, in a hurry, skims, clicks the first thing that looks right, uses Back

| Task | Done? | Clicks | Est. seconds | Ease (est.) |
|---|---|---|---|---|
| A. First look | Yes | 0 | 10 | not asked |
| B. Example | Yes | 1 | ~25 | 7 |
| C. Add St. John's Wort | Yes | 4 clicks, 1 typed field, Enter | ~25 | 6 |
| D. Find the new problem | Yes, after a wrong turn | 2 (Back, Cabinet) plus scrolling | ~35 | 5 |
| E. Read one warning | Yes | 0 | ~8 | 6 |

**A.** Reads the headline and first sentence, glances at the two buttons. Likely words: "Checks if your meds double up."

**B.** Clicks "See an example cabinet". Desktop puts warnings on the left and "Your cabinet" on the right, and the red "CHECK NOW" acetaminophen card is in the first screen. Likely next-step words: "Don't take Tylenol and NyQuil together, pick one."

**C.** Clicks "Add another" (in view at the top right of the cabinet). The search box is not focused, so P2 has to click it. Types "st johns wort", presses Enter, clicks the first result. "Yes, add it to my cabinet" appears at the top of the right column, in line with the search box. Clicks it. Small snag: the empty white box headed "Open the official label picture" looks like a broken image. Likely words: "Easy. That blank box looks broken though."

**D.** The cabinet top looks identical, and the summary still says "2 things to check". P2 thinks the add failed and presses Back. The Add page shows the same results, now with "In your cabinet" on the first one, which reassures him. Risk seen in the probe: the big "Yes, add it to my cabinet" button is still there, and clicking it again adds a duplicate. P2 clicks "Cabinet", scrolls about 3 screens and spots "Warfarin Sodium and St. John's Wort" by its bold heading. Likely words: "Oh, it did add it. It should just tell me." Fixes 1 and 7.

**E.** Reads the bold "What to do" line. Likely words: "Ask a pharmacist before taking both." Matches.

## P3. 21, student, phone, larger text on, keyboard for part, tries barcode and photo

| Task | Done? | Actions | Est. seconds | Ease (est.) |
|---|---|---|---|---|
| A. First look | Yes | 0 | 10 | not asked |
| B. Example | Yes | 11 Tab + 1 Enter, 1 swipe | ~37 | 6 |
| C. Add St. John's Wort | Yes, after two dead ends | 5 taps, 1 typed field, 5 Tab, 2 Enter | ~65 | 4 |
| D. Find the new problem | Yes | ~8 swipes | ~55 | 4 |
| E. Read one warning | Yes | 0 | ~12 | 6 |

**A.** With larger text the headline and first sentence fill the screen. Likely words: "It checks your meds against each other's labels."

**B.** Tabs 11 times to "See an example cabinet" (clear green focus ring) and presses Enter. With larger text, the first warning heading starts at the very bottom of the first screen, under the menu, the "Cabinet of" row, "Larger text" on its own line, and the summary box. One swipe shows the acetaminophen card. Likely next-step words: "Only take one of the acetaminophen ones."

**C.** Switches to touch for the menu, since Tab after the page change starts at "Read aloud" and the menu is behind it. Taps "Add". Tries "Scan the barcode" first: a camera box opens with no hint about what to do, and P3 has no St. John's Wort bottle, so taps "Close". Tries "Use a photo of the label", picks a label photo, and gets "The photo reader is not running here. Type the name or the code printed on the label." Likely words: "So why is the button there?" Types "St John's Wort", presses Enter, then Tabs: Search, Scan the barcode, Use a photo of the label, then an invisible stop where the focus ring disappears (hesitates), then the first result. Enter moves focus straight to "Yes, add it to my cabinet". Enter again. Fixes 2 and 10.

**D.** Back at the top with no message. With larger text the new card is about 7.4 screens down. P3 swipes and skims headings. Likely words: "I had to scroll forever. A 'new' label would help." Fixes 1 and 4.

**E.** Reads the bold line. Likely words: "Ask a pharmacist before taking both, show them the quote." Matches.

## Pass bars, SIMULATED

These use the estimates above with N = 3. SIMULATED. They do not replace the real-person test.

| Bar | Rule | Simulated result | Verdict (SIMULATED) |
|---|---|---|---|
| 1. People find the problem | All 3 find acetaminophen in Task B within 120 s | P1 ~50 s, P2 ~25 s, P3 ~37 s. 3 of 3 | PASSED (SIMULATED) |
| 2. Adding works without help | At least 2 of 3 add St. John's Wort within 90 s, no prompt | P1 ~87 s (borderline), P2 ~25 s, P3 ~65 s. 3 of 3 | PASSED (SIMULATED), with P1 a coin flip. It becomes 2 of 3 if P1 takes the "Add a person" detour, which still passes |
| 3. The next step is clear | At least 2 of 3 state the card's next step | 3 of 3. P1 adds the wrong "different days" idea | PASSED (SIMULATED) |
| 4. Easy enough | Median ease across tasks B to E and people is 5 or higher | Scores 6,4,4,5 / 7,6,5,6 / 6,4,4,6. Median 5.5 | PASSED (SIMULATED), but Task C and Task D sit at 4 for two of three people |

No-bar item, guesses only: in Part 1 (boxes, no app), P3 would likely spot acetaminophen on both boxes, while P1 ("not sure") and P2 ("yes, fine") would likely miss it. Both who missed it then found it in Task B. Treat this as the weakest guess in the report.

Part 3 likely words (simulated, good and bad):
- P1, would use: "Yes, for my husband's pills, if I could find them. It couldn't find NyQuil when I typed it." Most confusing: "It didn't say it added the herb, and the list is very long."
- P2, would use: "Probably, before I give the kids cold medicine." Most confusing: "Nothing told me what changed after I added something."
- P3, would use: "Maybe for my parents." Most confusing: "The photo button doesn't work, and with big text it's a lot of scrolling."

Honest reading: the bars pass in simulation because the core path is sound. The example opens instantly, the acetaminophen card is first, search is fast, and the confirm step is clear. The weak spots are what happens after adding (no feedback, new card buried) and two broken or brittle inputs (photo reader off, brand typos).

## Top 10 fixes, ranked by how much they would help

1. **Cabinet page, right after "Yes, add it to my cabinet".** Show a banner at the top: "Added St. John's Wort Extract. 1 new warning." with a "Show it" link that scrolls to the new card. Tag new cards "New" and list them first until the next visit. This fixes the hesitation in Task D for all three personas and the Back-button wrong turn.
2. **Add page, "Use a photo of the label".** Turn the photo reader on in production, or hide the button until it works. Right now it always says "The photo reader is not running here. Type the name or the code printed on the label."
3. **Add page search, typo handling for brands.** When there is no exact match, retry with fuzzy matching and show "Did you mean NyQuil?" or "Did you mean Tylenol Extra Strength?" instead of "No official record matched. Check the spelling or try the code on the label." "nyquill" and "tylenol extra strenght" both fail today while "st johns wart" works.
4. **Cabinet page length.** Add a short jump list under the summary box with each warning heading as a link, grouped "Check now (2)", "Ask first (8)", "Notes (4)". Fold the four NOTE cards (Alcohol, Drowsiness, Grapefruit, Sun) into one closed "4 notes to read" section, and show quoted label lines only when tapped. The phone page is 10,828 px now and 16,901 px with larger text.
5. **Summary box wording.** Change "2 things to check with a pharmacist before the next dose. 7 to ask a pharmacist about, 4 notes to read." to "2 to check before the next dose (red). 7 more to ask a pharmacist about (orange). 4 notes." Add a one-line key for CHECK NOW, ASK FIRST and NOTE.
6. **Every "Ask first" card, "What to do" line.** Change "Ask a pharmacist before taking these on the same day." to "Ask a pharmacist before taking these together. Taking them at different times of day does not make it safe." This removes the "take them on different days" reading.
7. **Add page, product already in the cabinet.** When the picked result shows "In your cabinet", replace "Yes, add it to my cabinet" with a disabled "Already in your cabinet" and a "Go to cabinet" link. Today a second click adds a duplicate.
8. **Header, example cabinet and "Add a person".** While the example is loaded, show "Example cabinet. Pretend it is yours or someone you care for." in place of "Cabinet of Me". Rename "Add a person" to "Add someone you care for" and rename its confirm button from "Add" to "Create cabinet", so it is not confused with the "Add" menu item.
9. **Add page layout.** Focus the search box when the page opens on desktop. Hide "Does this match your bottle? Pick a result to see its official record here." until a result is picked. Replace the empty white "Open the official label picture" box with a thumbnail or a plain link. Above the results add "Not sure which one? Pick the closest match. Warnings depend on the ingredient, not the brand."
10. **Keyboard and scanner details.** Give the hidden "Photo of the label" file input tabindex -1 so focus never disappears. After a page change, move focus to the page heading so Tab starts in the content and Shift+Tab reaches the menu. In the scanner box add "Hold the barcode inside the box. It reads by itself."

## Limits of this simulation

- Claude knows what a medicine label says and what "acetaminophen" means, so it cannot truly forget like P1. Expect real P1 times to be longer.
- Ease scores and spoken words are guesses about people, not observations.
- Camera scanning could not be tested with a real barcode. The phone "larger text" setting was approximated by raising the page's root text size.
- No project files were edited. The only state changed was on the live site's browser storage in throwaway Chrome profiles.

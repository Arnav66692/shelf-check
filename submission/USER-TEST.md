# Shelf Check real-person test

About 15 minutes per person. Run it with 2 or 3 people tonight, one at a time, before you record the video. The bars below were written and hashed before anyone was tested (hash in `submission/USER-TEST.sha256`). Do not change them after you start.

## What you need

- A laptop or phone with https://shelf-check-nu.vercel.app open in a private window, so it starts fresh.
- Two real boxes: Tylenol Extra Strength and NyQuil Cold and Flu (or any cold medicine with acetaminophen). If you do not have them, open these two label pictures on a second screen instead: search each product in the app's Add screen and use its official pictures, but do not let the tester see the app's warnings yet.
- A timer (your phone).
- This page printed or open, to write answers on.

## Rules for you, the person running it

- Tell them: "I'm testing the app, not you. Think out loud. There are no wrong answers."
- Do not help, point, or explain. If they are stuck for 60 seconds, say "what would you try next?" once. If still stuck after another 60 seconds, mark the task "not done" and move on.
- Do not use their real medicines or health details. Everyone uses the same example cabinet. Write down no names, only P1, P2, P3.
- Get a yes before you start: "Is it okay if I time you and write down what you say? I won't record your name."

## Part 1. Before the app (2 minutes)

Hand them the two boxes (or show the two label pictures).

Say: "Imagine you have a cold. Is it okay to take both of these on the same day? Take as long as you want, you can read the boxes."

Write down:
- Their answer (yes, no, not sure).
- Whether they said that both contain acetaminophen (yes or no).
- Seconds until they answered.

## Part 2. With the app (8 minutes)

Clear the browser (private window). Hand them the laptop or phone on the home page.

**Task A. First look.** Say: "You've never seen this. In your own words, what is it for?" Stop the timer at 10 seconds. Write down whether they said something like "checking medicines together" or "finding problems with medicines I take" (yes or no).

**Task B. The example.** Say: "Show me what this app thinks about the example cabinet, and tell me the most important thing it says." Start the timer.
Done when they say, in any words, that Tylenol and NyQuil both have acetaminophen, or that together they go over the label limit. Write down seconds, and the exact words they use for what they would do next.

**Task C. Add a medicine.** Say: "This cabinet belongs to your grandmother. She also takes a St. John's Wort supplement. Add it." Start the timer.
Done when a St. John's Wort product is in the cabinet. Write down seconds, and anything that confused them.

**Task D. Find the new problem.** Say: "Is there anything she should ask about now that she takes St. John's Wort?" Done when they point to a warning that involves St. John's Wort. Write down seconds.

**Task E. Read one warning.** Point at any "Ask first" card. Say: "What does this one tell you to do?" Write down whether their answer matches the card's "What to do" line (yes or no).

After each task, ask: "How easy was that, from 1, very hard, to 7, very easy?" Write the number.

## Part 3. Two questions (2 minutes)

1. "Would you use this for yourself or someone in your family? Why or why not?"
2. "What was the most confusing part?"

Write their words down as close to exactly as you can.

## Pass bars (fixed before testing)

With N people tested (2 or 3):

1. **People find the problem with the app.** In Part 2 Task B, all N people find the acetaminophen problem within 120 seconds.
2. **Adding works without help.** In Task C, at least N minus 1 people add St. John's Wort within 90 seconds without your prompt.
3. **The next step is clear.** In Task E, at least N minus 1 people state the card's next step correctly.
4. **Easy enough.** The median ease score across all tasks and people is 5 or higher.

Also report, with no bar, how many people noticed acetaminophen in both boxes in Part 1, without the app, and how many of the people who missed it then found it with the app.

Report every bar as passed or failed, with the counts. If a bar fails, the write-up says so. Report all quotes from Part 3, good and bad, and do not choose only the nice ones.

## What this test can and cannot show

- It shows whether real people, with no help, can find the problem the app was built for. It cannot show the app prevents harm.
- 2 or 3 people, likely family, is a small and friendly sample. Say so in the write-up.
- Everyone uses the example cabinet, so it does not test adding a whole real cabinet.

## Results sheet

| | P1 | P2 | P3 |
|---|---|---|---|
| Rough age (under 30, 30 to 59, 60 or older) | | | |
| Part 1: okay to take both? (yes, no, not sure) | | | |
| Part 1: mentioned acetaminophen in both? | | | |
| Part 1: seconds | | | |
| Task A: said what it is for? | | | |
| Task B: seconds to find the problem | | | |
| Task B: what they would do next, in their words | | | |
| Task B: ease 1 to 7 | | | |
| Task C: seconds to add St. John's Wort | | | |
| Task C: needed a prompt? | | | |
| Task C: ease 1 to 7 | | | |
| Task D: seconds to find the St. John's Wort warning | | | |
| Task D: ease 1 to 7 | | | |
| Task E: next step matches the card? | | | |
| Task E: ease 1 to 7 | | | |
| Would use it? Their words | | | |
| Most confusing part, their words | | | |

When you're done, send me the filled sheet (a photo is fine) and I'll score it against the bars and add the result to the write-up and the "How we tested" page.

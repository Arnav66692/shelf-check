# Shelf Check morning report, Sun Nov 22

Live: https://shelf-check-nu.vercel.app. Repo: github.com/Arnav66692/shelf-check (public). Devpost is due today at 12:00 PM PT.

## Where it stands

The site is finished and live in the byotone look. Everything below was checked on the live site this morning.

AI judge scores on the EvoHacks rubric, out of 60, each from a fresh simulated judge:

| Round | Score |
|---|---|
| Round 3 | 38 |
| Round 4 | 41 |
| Round 5 | 43 |
| Rounds 6 and 7 | 44 |
| Fresh judge, never saw the earlier rounds | 46 |
| Final judge | 47 (Fit 9, Impact 7, Function 8, Usability 7, Tech 9, Video plan 7) |

These are AI judges, not real people. The Impact and Video scores cannot go higher until you run the real-person test and record the video. Those are the biggest open points left.

## What changed overnight

- Nine rounds of an AI pharmacist review on real cabinets, plus a final safety sweep. Every dangerous item it found is fixed and live:
  - Low-dose aspirin with a blood thinner no longer says to stop the aspirin. If a doctor told you to take it, it says keep taking it and tell the pharmacist. If you started it yourself, it says ask the prescriber before the next dose.
  - The emergency screen now catches far more ways people describe chest pain, stroke signs, breathing trouble, overdose, self-harm and children swallowing pills. The red 911 line names chest pain, a drooping face, sudden trouble seeing or speaking, and trouble breathing.
  - A "do not take together" card can no longer make someone skip a seizure, heart, blood thinner or insulin dose. Space-apart pairs say to space them, not to stop.
  - Child ages typed as "2yo", "one year old" or "5 months" are read. DayQuil is no longer suggested for ages 6 to 11.
  - A product with its own Check now card is left out of symptom suggestions, with the reason shown.
  - The furosemide sulfa card is Ask, not Stop, because the label only says "may be allergic".
  - An insulin dose over 100 units now says call the pharmacist now and do not skip insulin, instead of "do not inject".
  - The dose check says the two doses are "10 times apart" without guessing which one was prescribed.
- Many fewer false alarms and better matches across 30 saved real cabinets (NyQuil with Benadryl, Zyrtec with Benadryl, alcohol lines, NSAID class, niacin, calcium channel blockers).
- Search fixes: "baby aspirin", "children's", "infant", "vitamin d" and common misspellings.
- Phone layout, the Enter screen keeps keyboard focus, read aloud skips the menus.
- Tests: engine 764 passing, lookup 113 passing.

## Honest results

- Benchmark, 40 doubled acetaminophen pairs: 40 of 40 caught.
- Benchmark, 40 new major interactions: 10 of 40 in the final run against the live site, which meets the bar of 10. The same frozen pairs over the night: 10, 10, 9, 9, 10, so it sits right at the bar. False alarms on 40 harmless pairs: 0 every time.
- Trained photo matcher: best 85.7 percent first guess against a 90 percent bar. Failed, not used in the app. The page and README say so.
- Known gaps: some QT-prolonging pairs, levothyroxine with iron, losartan with potassium supplements, some search misses for rare products, and some Eliquis plus supplement pairs that the labels do not name.

## What only you can do (in this order)

1. **Real-person test** (about 30 minutes). Follow `submission/USER-TEST.md` with two people, using the notes in `submission/USER-TEST-NOTES.md`. Write down the numbers. Then fill in the one Devpost line about it with only those numbers.
2. **Record the video.** Follow `submission/VIDEO-SCRIPT.md`. Clips of every screen are in `submission/clips/` if you want to use them. Upload to YouTube.
3. **Devpost.** The story is pasted into the draft and saved, but not submitted. Read it, add the video link and the user-test line, tick the terms box, and press Submit before 12:00 PM PT. I cannot tick the terms box or submit.
4. **Reddit posts** in `submission/REDDIT-POSTS.md`, if you want real feedback before judging.

## The other looks

- Flora look: https://shelf-check-iu21uh1z3-getengine.vercel.app (branch flora-look)
- Heartbeat look: https://shelf-check-pad0paoot-getengine.vercel.app (branch heartbeat-look)
- Current byotone look: https://shelf-check-nu.vercel.app (branch main)

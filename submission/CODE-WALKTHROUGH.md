# Your code walkthrough: the daily total rule

The rules say the video has to show you explaining your code. This is the one piece to learn. It is the strongest moment in the demo (Tylenol plus NyQuil adds up to 5,600 mg of acetaminophen a day), it is plain code with no AI in it, and it fits in about 35 seconds.

The file is `engine/src/flags/dailyTotal.ts`. You do not need all 405 lines. You need the path below, which is about 60 of them.

## The idea in one breath

If two products in your cabinet share an ingredient, read each label's own daily limit, turn each limit into milligrams, add them up, and compare the sum with the highest daily amount any of the labels warns about. Every number comes from a sentence on a real label, and that sentence is shown to the user.

## Follow one real example through the code

Cabinet: Tylenol Extra Strength (acetaminophen 500 mg per tablet) and Vicks NyQuil Cold and Flu (acetaminophen 650 mg per 30 mL).

### Step 1. Find the shared ingredient

`dailyTotalFlags` (line 403) calls `findDuplicatedIngredients` in `duplicates.ts` (line 32). That function lists every ingredient of every product, groups them by name, and keeps the groups with two or more products. Here it finds one group, acetaminophen, with Tylenol and NyQuil in it.

Why the names match: when a product is added, its ingredient names go through the NIH RxNorm service, which turns "ACETAMINOPHEN" and salt forms like "DIPHENHYDRAMINE HYDROCHLORIDE" into one base name. So two labels that spell it differently still group together.

### Step 2. Read each label's daily limit

`totalsFor` (line 285) calls `labelledMaximum` (line 207) once per product.

`labelledMaximum` looks in the Directions section for a sentence that matches `LIMIT_PATTERN` (lines 24 to 29). In plain words the pattern means: a phrase like "do not take more than" or "do not exceed", then a number, then a unit like tablets or doses, then "in 24 hours" or "per day".

- Tylenol's label says "do not take more than 6 tablets in 24 hours". The pattern captures 6 and tablets.
- NyQuil's label says "do not exceed 4 doses per 24 hrs". The pattern captures 4 and doses.

### Step 3. Turn each limit into milligrams

`resolveLimit` (line 146) does this.

- Tylenol counts tablets, so `mgIn` (line 100) does 6 times 500 mg. That is 3,000 mg a day.
- NyQuil counts doses, which is not a unit you can multiply yet. So the code looks for how big one dose is with `PER_DOSE_PATTERN` (line 30) and finds "30 mL per dose". Then `mgIn` converts 30 mL at 650 mg per 30 mL into 650 mg per dose, and 4 doses makes 2,600 mg a day.

If any of this cannot be read, the function returns `not_parsed` with a reason, and the flag says no total could be worked out. It never guesses a number. That choice is on purpose: a wrong total on a medicine is worse than no total.

### Step 4. Find the warning to compare against

`labelledCeiling` (line 236) searches the Warnings and Directions sections for "more than N mg of acetaminophen in 24 hours". Tylenol's label has "more than 4,000 mg of acetaminophen in 24 hours". NyQuil's has none.

### Step 5. Add up and decide

Back in `totalsFor`: 3,000 plus 2,600 is 5,600 mg. That is more than 4,000, so `isOverCeiling` (line 303) is true, and `severityFor` (line 307) returns "stop". The flag carries all three label sentences as quotes, so the screen shows exactly where every number came from.

## Proof it works

`engine/test/dailyTotal.test.ts` runs this on the saved real labels. These two tests are the example above:

- line 20, "Tylenol Extra Strength: 6 tablets of 500 mg is 3000 mg"
- line 27, "NyQuil: 4 doses of 30 mL at 650 mg per 30 mL is 2600 mg"

Run it yourself before recording, so you have seen it pass:

```bash
cd ~/Desktop/Competitions/evohacks-2/shelf-check/engine && npx vitest run test/dailyTotal.test.ts
```

It printed `Tests 11 passed (11)` when I ran it at 7:20 PM.

## What to say on camera (about 35 seconds)

Have `dailyTotal.ts` open, scrolled to line 24, and point at each part as you say it. Put it in your own words, this is only a guide.

> This is the part that caught Tylenol and NyQuil, and there's no AI in it. It groups products that share an ingredient, then reads each label's own limit with this pattern. Tylenol says 6 tablets in 24 hours, so 6 times 500 is 3,000 milligrams. NyQuil says 4 doses of 30 mL, which is 2,600. Then it finds the 4,000 milligram warning on the label, adds them to 5,600, and marks it stop. If it can't read a number it says so instead of guessing.

## Questions a judge might ask, with honest answers

- **Why not ask an AI model to add it up?** A model can misread a number and sound sure about it. Here every number comes from a label sentence that is shown to you, and the same input gives the same answer every time, so it can be tested.
- **What if a label words its limit differently?** Then the pattern misses it and the app says it could not read a limit. It does not guess. The tests cover the wordings in the saved labels, and new wordings are the main weak point.
- **Is taking each product at its maximum realistic?** It is the worst case, and it is the case that hurts people: someone taking full doses of a cold medicine and a pain reliever on the same day. The flag says it is the total at each label's maximum.
- **How do you know the 5,600 is right?** Two tests check 3,000 and 2,600 on the real saved labels, and one checks the combined total.

## How this was built

The rules ask you to credit AI help. This code was written with an AI coding agent, which the rules allow as long as you can explain it. Read the five steps until you can say them without the notes. If a judge asks something you do not know, "I would have to check the code" is a fine answer.

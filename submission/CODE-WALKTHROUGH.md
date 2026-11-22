# Your code walkthrough: the daily total rule

The rules say the video has to show you explaining your code. This is the one piece to learn. It is the strongest moment in the demo (Tylenol plus NyQuil adds up to 5,600 mg of acetaminophen a day), it is plain code with no AI in it, and it fits in about 35 seconds.

The file is `engine/src/flags/dailyTotal.ts`. You do not need all 615 lines. You need the path below. Line numbers are as of the last commit on Nov 22 at about 3:15 AM. If they move, search for the function name.

## The idea in one breath

If two products in your cabinet share an ingredient, read each label's own daily limit, turn each limit into milligrams, add them up, and compare the sum with the daily amount a label warns about. Every number comes from a sentence on a real label, and that sentence is shown to the user. If any number cannot be read for sure, the code says so instead of guessing.

## Follow one real example through the code

Cabinet: Tylenol Extra Strength (acetaminophen 500 mg per tablet) and Vicks NyQuil Cold and Flu (acetaminophen 650 mg per 30 mL).

### Step 1. Find the shared ingredient

`dailyTotalFlags` (line 613) calls `findDuplicatedIngredients` in `duplicates.ts` (line 32). It lists every ingredient of every product, groups them by name, and keeps groups with two or more products. Here it finds acetaminophen, in Tylenol and NyQuil.

The names match because each ingredient goes through the NIH RxNorm service when the product is added, which turns different spellings and salt forms into one base name.

### Step 2. Pick the right directions for the person

`toFlag` (line 595) calls `totalsFor` (line 466), which calls `labelledMaximum` (line 348) once per product.

Labels often have rows like "adults and children 12 years and over" and "children 6 to 11 years". `applicableDirections` (line 152) picks the row that matches the person's age. If no age is set, `toFlag` uses the adult row and the card says so, because a child's row has a lower limit.

### Step 3. Read each label's daily limit

`limitsIn` (line 198) looks for a sentence that matches `LIMIT_PATTERN` (line 29). In plain words: "do not take more than" or "do not exceed", then a number, then a unit like tablets or doses, then "in 24 hours" or "per day".

- Tylenol says "do not take more than 6 caplets in 24 hours". The pattern captures 6 caplets.
- NyQuil says "do not exceed 4 doses per 24 hrs". The pattern captures 4 doses.

### Step 4. Turn each limit into milligrams

Still in `labelledMaximum`:

- Tylenol counts caplets, so `mgIn` (line 109) does 6 times 500 mg, which is 3,000 mg a day.
- NyQuil counts doses, so `doseIn` (line 246) finds how big one dose is, "30 mL". Then `mgIn` turns 30 mL at 650 mg per 30 mL into 650 mg, and 4 doses makes 2,600 mg a day.

If the limits disagree, a dose size is missing, or a unit cannot be converted, it returns `not_parsed` with a reason. It never guesses. A wrong total on a medicine is worse than no total.

### Step 5. Add up and compare with the warning

Back in `totalsFor`: 3,000 plus 2,600 is 5,600 mg. It only adds amounts that use the same strength basis, so two different salt forms are never added as if they were the same thing. `labelledCeiling` (line 393) finds "more than 4,000 mg of acetaminophen in 24 hours" on the Tylenol label. 5,600 is more than 4,000, so `severityFor` (line 506) returns stop, and the card shows "Check now" with all three label sentences quoted.

## Proof it works

`engine/test/dailyTotal.test.ts` runs this on saved real labels. These are the example above:

- "Tylenol Extra Strength: 6 tablets of 500 mg is 3000 mg"
- "NyQuil: 4 doses of 30 mL at 650 mg per 30 mL is 2600 mg"
- "with no age set, uses the adult row and says so"

Run it yourself before recording, so you have seen it pass:

```bash
cd ~/Desktop/Competitions/evohacks-2/shelf-check/engine && npx vitest run test/dailyTotal.test.ts
```

It printed `Tests 26 passed (26)` at 3:15 AM on Nov 22. The whole engine suite has 741 tests.

## The 35 second version to say on camera

"This is the rule that caught Tylenol and NyQuil. First it finds an ingredient two products share. Then for each label it picks the directions for your age and reads the daily limit with this pattern, do not take more than six caplets in 24 hours. It turns that into milligrams, six times 500 is 3,000, and NyQuil's four doses of 650 is 2,600. It adds them, 5,600, and compares with the 4,000 milligram warning on the Tylenol label. If any number can't be read for sure, it says so instead of guessing. And these tests run it on the real saved labels."

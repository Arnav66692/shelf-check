const READERS = [
  { name: "Small reader that runs in a browser (Florence-2 base)", set: "20 labels", right: "8 of 20", wrong: "not counted", verdict: "Failed" },
  { name: "Larger local vision model (qwen3-vl 8B)", set: "20 labels", right: "17 of 20", wrong: "not counted", verdict: "Failed by one" },
  { name: "Same model, tablets and capsules only", set: "100 new labels", right: "82 of 100", wrong: "5 of 100", verdict: "Failed" },
] as const;

const IMPACT = [
  { test: "Acetaminophen doubled: 40 random products, each with Tylenol", first: "40 of 40", now: "40 of 40", bar: "38 of 40", verdict: "Passed both times" },
  { test: "Same 40 pairs: a daily total worked out in mg", first: "27 of 40", now: "15 of 40", bar: "none set", verdict: "Measured. Now refuses numbers it cannot read for sure" },
  { test: "40 major interactions from an independent database", first: "8 of 40", now: "4 of 40", bar: "none set", verdict: "Weak. See below" },
  { test: "40 pairs with no listed interaction: false alarms", first: "1 of 40", now: "1 of 40", bar: "at most 4", verdict: "Passed both times" },
  { test: "40 new major interactions, after adding drug class matching", first: "10 of 40", now: "10 of 40", bar: "at least 10", verdict: "Passed in the last run, at the bar. Two of five reruns got 9" },
  { test: "40 new pairs with no listed interaction: false alarms", first: "0 of 40", now: "0 of 40", bar: "at most 4", verdict: "Passed, and again after the Nov 22 fixes" },
] as const;

const MATCHER = [
  { name: "Run 1: untrained small model", top1: "4.1%", top5: "8.3%" },
  { name: "Run 1: trained small model, 12 rounds", top1: "78.0%", top5: "91.3%" },
  { name: "Run 2: untrained base model", top1: "15.2%", top5: "26.4%" },
  { name: "Run 2: trained base model, 1 round", top1: "69.8%", top5: "84.1%" },
  { name: "Run 3: untrained small model", top1: "14.2%", top5: "25.7%" },
  { name: "Run 3: trained small model, best of 20 rounds", top1: "78.3%", top5: "91.7%" },
  { name: "Run 4: run 3 plus read text and keypoint matching", top1: "85.7%", top5: "95.6%" },
  { name: "Zephyr: run 3 in your browser, 8 bit", top1: "76.2%", top5: "91.1%" },
  { name: "Bar we set before each run", top1: "90%", top5: "97%" },
] as const;

export default function TestedPage() {
  return (
    <div className="pt-6 max-w-[900px]">
      <h1 className="text-3xl font-medium narrow">How we tested</h1>
      <p className="mt-3 text-lg">
        We wanted a camera that reads a label and can be trusted. We wrote the pass bar down before each test. Every
        reader missed it alone. So the camera only suggests, you confirm against the official record, and the warnings
        come from plain code reading the label text. Then we added a cross-check, and that passed. We also measured
        how well the warnings catch real problems, including where they fall short.
      </p>

      <h2 className="mt-8 text-2xl font-medium narrow">Does it catch real problems?</h2>
      <p className="mt-2">
        We ran the app on random real products and pairs, with the bars written down before the first run. We ran
        the same test again after a night of safety fixes.
      </p>
      <div className="facts mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Impact test results">
        <table className="w-full text-left min-w-[720px]">
          <thead>
            <tr className="border-b border-[var(--rule)]">
              <th className="py-2 pr-4">Test</th>
              <th className="py-2 pr-4">First run</th>
              <th className="py-2 pr-4">After fixes</th>
              <th className="py-2 pr-4">Bar</th>
              <th className="py-2">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {IMPACT.map((row) => (
              <tr key={row.test} className="border-b border-hair align-top">
                <td className="py-2 pr-4">{row.test}</td>
                <td className="py-2 pr-4">{row.first}</td>
                <td className="py-2 pr-4 font-bold">{row.now}</td>
                <td className="py-2 pr-4">{row.bar}</td>
                <td className="py-2">{row.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2">
        Why the numbers moved: the fixes made the engine refuse to add up a daily amount or claim an interaction
        unless the label text clearly supports it, which dropped the daily totals to 5 of 40. We then taught it
        common label wording around the limit, like &quot;see overdose warning&quot;, which brought it to 15. We
        did that after looking at the misses, so the 15 is not a clean test. The interaction rule now needs the
        label sentence to actually warn about the pair, so it flags fewer pairs. Then we taught it drug classes from the
        FDA&apos;s own drug interaction tables, so a label that warns about &quot;strong CYP3A inducers&quot; now matches the
        drug in your cabinet that is one. We wrote a new bar first and tested it on 40 new pairs it had never seen.
        On Nov 22 we also taught it to read a warning together with the &quot;Examples include&quot; line or bulleted
        list under it, which is how labels name rifampin with the birth control pill or aspirin with methotrexate.
        We reran the same 80 new pairs four more times as we fixed things on Nov 22. Major interactions caught went
        10, 10, 9, 9 and 10 of 40, so it sits right at the bar and twice fell one short. False alarms stayed at 0 of
        40 every time. The last run, at 6 AM PT on Nov 22, called this website.
      </p>
      <p className="mt-2">
        What this means: Shelf Check is reliable at the problem it was built for, the same drug hiding in two
        products. It is weak at drug interactions in general. For most major interactions in the reference database,
        neither FDA label names the other drug, and the labels describe the risk by drug type or effect instead.
        Shelf Check only flags what a label states, so it misses those. Ask a pharmacist to review your full list.
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Reference: the DDInter database. The interaction pairs lean toward specialty drugs, and the no-interaction
        pairs come from an incomplete reference, so the false alarm figure is an upper bound. Full method and every
        pair are in the benchmark folder of the code.
      </p>

      <h2 className="mt-8 text-2xl font-medium narrow">Reading labels from a picture</h2>
      <div className="facts mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Reader test results">
        <table className="w-full text-left min-w-[720px]">
          <thead>
            <tr className="border-b border-[var(--rule)]">
              <th className="py-2 pr-4">Reader</th>
              <th className="py-2 pr-4">Test set</th>
              <th className="py-2 pr-4">Fully right</th>
              <th className="py-2 pr-4">Confidently wrong</th>
              <th className="py-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {READERS.map((row) => (
              <tr key={row.name} className="border-b border-hair align-top">
                <td className="py-2 pr-4">{row.name}</td>
                <td className="py-2 pr-4">{row.set}</td>
                <td className="py-2 pr-4 font-bold">{row.right}</td>
                <td className="py-2 pr-4 font-bold">{row.wrong}</td>
                <td className="py-2">{row.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        Bars: 18 of 20 on the first set. 90 of 100 fully right and at most 3 confidently wrong on the second. Labels
        are official FDA label artwork, not phone photos, so real photos would likely score lower.
      </p>

      <h2 className="mt-8 text-2xl font-medium narrow">The cross-check that passed</h2>
      <p className="mt-2">
        A label states the same facts more than once. The app marks a photo reading as matched only when the drug code
        it read points to an FDA record, and the ingredients and strengths it read from the printed text are exactly
        that record&apos;s. If they disagree, it says so and you check by eye.
      </p>
      <div className="facts mt-3">
        <div className="facts-row">
          <span>New labels tested</span>
          <span className="font-bold">100</span>
        </div>
        <div className="facts-row">
          <span>Marked as matched</span>
          <span className="font-bold">61</span>
        </div>
        <div className="facts-row">
          <span>Marked as matched and wrong</span>
          <span className="font-bold">0</span>
        </div>
        <div className="facts-row">
          <span>Sent to you to check by eye</span>
          <span className="font-bold">29, of which 4 were wrong</span>
        </div>
        <div className="facts-row">
          <span>Could not be read</span>
          <span className="font-bold">10</span>
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        Bar set before the run: at least 50 matched, at most 1 of those wrong. With 61 matched and none wrong, the
        true error rate could still be as high as about 5 percent, so you confirm every product anyway.
      </p>

      <h2 className="mt-8 text-2xl font-medium narrow">Matching a photo to the official label</h2>
      <p className="mt-2">
        We trained our own image model, Zephyr, on 3,588 products from the FDA label archive, using made-up phone photos of
        each official label, and scored each run on 2,169 to 2,283 photos of products it had never seen. Each run picked its
        own unseen products.
      </p>
      <div className="facts mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Trained matcher results">
        <table className="w-full text-left min-w-[480px]">
          <thead>
            <tr className="border-b border-[var(--rule)]">
              <th className="py-2 pr-4">Model</th>
              <th className="py-2 pr-4">Right product first</th>
              <th className="py-2">Right product in top 5</th>
            </tr>
          </thead>
          <tbody>
            {MATCHER.map((row) => (
              <tr key={row.name} className="border-b border-hair">
                <td className="py-2 pr-4">{row.name}</td>
                <td className="py-2 pr-4 font-bold">{row.top1}</td>
                <td className="py-2 font-bold">{row.top5}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        Training helped a lot, but no run reached the bar. Run 2 used a bigger model and only finished one round in
        its time limit, so it scored lower than run 1. Run 3 went back to the small model. Run 4 added text read off
        the photo and keypoint matching on top of run 3, and came closest, 4.3 points short of the first guess bar.
      </p>
      <p className="mt-2">
        Zephyr, on the Add page, is the run 3 model running inside your browser. Your photo is not uploaded. It scored
        76.2% first guess on the same 2,283 photos, short of the 90% bar, so it only shows the 5 closest official
        labels and you pick yours. It uses the whole photo with no crop, which likely explains why it scores a little under run 3. We
        scored it after the run 4 test, so that score was not set up in advance. Run 4 scored higher, but it needs
        tools that only run on a Mac, so it cannot run in a browser and is not in the app.
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Every test photo was made by our own renderer from official label images, not taken with a phone, so real
        photos would likely score lower.
      </p>

      <h2 className="mt-8 text-2xl font-medium narrow">What the warnings are built on</h2>
      <ul className="mt-2 grid gap-2">
        <li>Drug records and label text come from the FDA through openFDA and DailyMed.</li>
        <li>Supplement labels come from the NIH Dietary Supplement Label Database.</li>
        <li>Drug names and drug classes come from the NIH RxNorm service.</li>
        <li>A warning appears only when a label states it. Each one quotes the label line.</li>
        <li>A label can be silent about a real risk. No warning is not proof of safety.</li>
      </ul>
    </div>
  );
}

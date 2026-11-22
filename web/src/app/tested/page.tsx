const READERS = [
  { name: "Small reader that runs in a browser (Florence-2 base)", set: "20 labels", right: "8 of 20", wrong: "not counted", verdict: "Failed" },
  { name: "Larger local vision model (qwen3-vl 8B)", set: "20 labels", right: "17 of 20", wrong: "not counted", verdict: "Failed by one" },
  { name: "Same model, tablets and capsules only", set: "100 new labels", right: "82 of 100", wrong: "5 of 100", verdict: "Failed" },
] as const;

const MATCHER = [
  { name: "Untrained image model", top1: "4.1%", top5: "8.3%" },
  { name: "Our trained matcher, 12 rounds", top1: "78.0%", top5: "91.3%" },
  { name: "Bar we set before training", top1: "90%", top5: "97%" },
] as const;

export default function TestedPage() {
  return (
    <div className="pt-6 max-w-[900px]">
      <h1 className="text-3xl font-extrabold narrow">How we tested</h1>
      <p className="mt-3 text-lg">
        We wanted a camera that reads a label and can be trusted. We wrote the pass bar down before each test. Every
        reader missed it alone. So the camera only suggests, you confirm against the official record, and the warnings
        come from plain code reading the label text. Then we added a cross-check, and that passed.
      </p>

      <h2 className="mt-8 text-2xl font-extrabold narrow">Reading labels from a picture</h2>
      <div className="facts mt-3 overflow-x-auto">
        <table className="w-full text-left min-w-[640px]">
          <thead>
            <tr className="border-b-[3px] border-ink">
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

      <h2 className="mt-8 text-2xl font-extrabold narrow">The cross-check that passed</h2>
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

      <h2 className="mt-8 text-2xl font-extrabold narrow">Matching a photo to the official label</h2>
      <p className="mt-2">
        We trained our own image model on 3,588 products from the FDA label archive, using made-up phone photos of
        each official label, and scored it on 2,175 photos of products it had never seen.
      </p>
      <div className="facts mt-3 overflow-x-auto">
        <table className="w-full text-left min-w-[480px]">
          <thead>
            <tr className="border-b-[3px] border-ink">
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
        Training took it from 4 percent to 78 percent. That missed the bar, so it is not in the app.
      </p>

      <h2 className="mt-8 text-2xl font-extrabold narrow">What the warnings are built on</h2>
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

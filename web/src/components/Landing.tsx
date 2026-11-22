import Link from "next/link";
import { GrowingHeadline } from "./GrowingHeadline";
import { HeroTitle } from "./HeroTitle";
import { Rings } from "./Rings";

const CHIPS = [
  { label: "prescriptions", shape: "chip chip-round" },
  { label: "over the counter", shape: "chip chip-pill" },
  { label: "supplements", shape: "chip" },
  { label: "peptides", shape: "chip chip-hex" },
] as const;

const SOURCES = ["FDA openFDA", "DailyMed", "NIH RxNorm", "NIH supplement labels", "NLM Pillbox", "WADA 2026 list"] as const;

const PROBLEMS = [
  {
    title: "Same drug, two boxes",
    text: "Tylenol and NyQuil both contain acetaminophen. Taken at the most each label allows, that is 5,600 mg a day. The Tylenol label warns about going over 4,000.",
  },
  {
    title: "Labels that warn about each other",
    text: "The warfarin label names aspirin and St. John's Wort. You only see it if you read the warfarin label while holding the other bottle.",
  },
  {
    title: "Warnings meant for you",
    text: "Some lines are only for people with high blood pressure, liver disease, a pregnancy or an allergy. Four questions tell Shelf Check which ones apply.",
  },
] as const;

const PROOF = [
  { title: "40 of 40", sub: "Doubled acetaminophen caught", text: "40 random products, each paired with Tylenol. The bar, set before the run, was 38.", tags: ["preregistered", "live app", "re-run after fixes"] },
  { title: "0 of 61", sub: "Wrong photo matches", text: "A photo reading only counts when the drug code and the printed ingredients match one FDA record.", tags: ["100 new labels", "local vision model"] },
  { title: "1 of 40", sub: "False alarms", text: "Pairs an independent interaction database does not list. Bar: at most 4. It is weak at interactions in general, and says so.", tags: ["DDInter", "honest misses"] },
] as const;

export function Landing() {
  return (
    <div className="-mx-[var(--space-1)] px-[var(--space-1)] overflow-x-clip">
      <section aria-labelledby="hero-title" className="grid gap-[clamp(32px,4vw,80px)]">
        <h1 id="hero-title" className="display text-[length:var(--fs-hero)] lg:max-w-[70%]">
          <HeroTitle before="Check every medicine you own against its" swap="official" after="label" />
        </h1>
        <div className="flex flex-col 2xl:flex-row 2xl:items-start">
          <p className="max-w-[775px] border border-[var(--rule)] px-6 py-4 lg:px-10 lg:py-6 text-[length:var(--fs-body-xl)] leading-[1.88]">
            For anyone who keeps track of medicines for a parent, a child or themselves. Two bottles can hide the same
            drug, and neither box tells you about the other. Shelf Check reads the official labels of everything you
            take together, and quotes the line that matters.
          </p>
          <ul className="chips mt-[-1px] 2xl:mt-0 2xl:ml-[-1px] max-sm:grid max-sm:grid-cols-2" aria-label="What it covers">
            {CHIPS.map((chip) => (
              <li key={chip.label} className={chip.shape}>
                <span>{chip.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/add?sample=1" className="btn">
            <span>See an example cabinet</span>
          </Link>
          <Link href="/start" className="btn">
            <span>Start my own</span>
          </Link>
        </div>
        <ul
          aria-label="Data sources"
          className="flex gap-x-12 xl:gap-x-14 gap-y-3 overflow-x-auto text-[13px] uppercase tracking-[0.02em] text-ink whitespace-nowrap [scrollbar-width:none]"
        >
          {SOURCES.map((source) => (
            <li key={source} className="italic font-[900]">
              {source}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="problem-title" className="mt-[clamp(88px,8vw,200px)]">
        <h2 id="problem-title" className="display text-[length:var(--fs-h1)] [word-spacing:-0.18em] max-w-[1380px]">
          What the boxes do not tell you
        </h2>
        <p className="mt-8 mb-10 max-w-[920px] text-ink-soft">
          Every warning on this site is a real sentence from an official label. The trouble is that the sentence you
          need is usually on a different box.
        </p>
        <div className="table3">
          {PROBLEMS.map((problem) => (
            <article key={problem.title}>
              <h3 className="display text-[length:var(--fs-h3)]">{problem.title}</h3>
              <p className="mt-8 text-ink-soft">{problem.text}</p>
            </article>
          ))}
        </div>
      </section>

      <GrowingHeadline lines={["A label can be", "silent about", "a real risk"]}>
        <p className="max-w-[700px] text-ink-soft">
          So Shelf Check never says anything is safe. It shows what the labels say, and asks you to have a pharmacist
          look at the whole list.
        </p>
      </GrowingHeadline>

      <section aria-labelledby="check-title" className="relative mt-[clamp(120px,40vw,620px)] max-[999px]:mt-24">
        <Rings className="relative mx-auto w-full max-w-[1440px] aspect-square max-[999px]:max-w-[390px]" />
        <div className="absolute inset-x-0 top-[38%] max-[999px]:static max-[999px]:mt-8 grid gap-10 justify-items-start">
          <h2 id="check-title" className="display text-[length:var(--fs-h2)] lg:w-[65.5%]">
            The check
          </h2>
          <p className="max-w-[700px] text-ink-soft">
            Your list stays in this browser. Each product is matched to its official record first. Then plain code, no
            AI, reads every label together for double doses, labels that name each other, warnings for your health,
            and recalls. Every result quotes its line.
          </p>
          <Link href="/tested" className="btn">
            <span>How we tested it</span>
          </Link>
        </div>
      </section>

      <section aria-labelledby="proof-title" className="mt-[clamp(56px,4.688vw,120px)]">
        <h2 id="proof-title" className="display text-[clamp(24px,calc(24px+12*(100vw-500px)/2060),36px)] mb-8">
          What it caught in testing
        </h2>
        <div className="table3">
          {PROOF.map((card) => (
            <article key={card.title} className="flex flex-col">
              <h3 className="display text-[length:var(--fs-h3)]">{card.title}</h3>
              <p className="mt-2 text-ink">{card.sub}</p>
              <p className="mt-4 text-ink-soft">{card.text}</p>
              <ul className="tags mt-auto pt-4">
                {card.tags.map((tag) => (
                  <li key={tag} className="tag">
                    {tag}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { EnterGate } from "./EnterGate";
import { HeroWords } from "./HeroWords";
import { setFieldShape, type FieldShape } from "./ParticleField";
import { TypeLabel } from "./TypeLabel";

type Chapter = { id: string; letter: string; name: string; shape: FieldShape; tags: readonly string[] };

const CHAPTERS: readonly Chapter[] = [
  { id: "intro", letter: "A", name: "Intro", shape: "ring", tags: ["Acetaminophen", "Tylenol", "NyQuil"] },
  { id: "problem", letter: "B", name: "Problem", shape: "pair", tags: ["5,600 mg", "4,000 mg limit"] },
  { id: "checks", letter: "C", name: "Checks", shape: "band", tags: ["Warfarin", "St. John's Wort", "Recall"] },
  { id: "decides", letter: "D", name: "How", shape: "wave", tags: ["openFDA", "DailyMed", "RxNorm"] },
  { id: "proof", letter: "E", name: "Proof", shape: "orbits", tags: ["40 of 40", "0 false alarms"] },
  { id: "who", letter: "F", name: "Who", shape: "cone", tags: ["Parents", "Kids", "You"] },
  { id: "faq", letter: "G", name: "FAQ", shape: "stream", tags: ["Not medical advice"] },
  { id: "start", letter: "H", name: "Start", shape: "ring", tags: ["Poison Help 1-800-222-1222"] },
] as const;

const TAG_SPOTS = [
  "left-[9%] top-[22%]",
  "right-[12%] top-[16%]",
  "left-[38%] bottom-[22%]",
  "right-[24%] bottom-[34%]",
] as const;

const FAQ = [
  {
    q: "Is this medical advice?",
    a: "No. It shows you what the official labels already say, and quotes the line. It never says anything is safe, because a label can be silent about a real risk. Show the list to your pharmacist or doctor.",
  },
  {
    q: "Where do the warnings come from?",
    a: "From the FDA drug labels on openFDA and DailyMed, the NIH supplement label database, and NIH RxNorm for drug names and classes. Plain code reads them. No AI model decides a warning.",
  },
  {
    q: "Is my list private?",
    a: "Your list is saved in this browser only, with no account. It is sent to the server only to run the check, and it is not stored there.",
  },
  {
    q: "What if it finds nothing?",
    a: "That means no label here warns about another product you added. It does not prove they are safe together, so it still asks you to have a pharmacist look at the whole list.",
  },
  {
    q: "Does it work for supplements and peptides?",
    a: "Yes. Supplements come from the NIH label database. For peptides it quotes the FDA label for approved ones like Ozempic, and says plainly when a peptide has no approved use or dose.",
  },
  {
    q: "What about an emergency?",
    a: "If someone swallowed too much or something they should not have, call Poison Help at 1-800-222-1222. If they collapse, have a seizure or trouble breathing, call 911.",
  },
] as const;

function ChapterLetter({ letter }: { letter: string }) {
  return (
    <span className="grid place-items-center h-7 w-7 shrink-0 rounded-full border border-dashed border-[var(--accent)] font-[family-name:var(--font-courier)] text-accent text-[15px]">
      {letter}
    </span>
  );
}

function Rail({ active, onGo }: { active: number; onGo: (index: number) => void }) {
  return (
    <nav aria-label="Chapters" className="fixed z-20 left-1/2 -translate-x-1/2 top-[calc(var(--margin)+56px)] hidden lg:block">
      <ol className="relative flex items-start gap-2">
        {CHAPTERS.map((chapter, index) => {
          const current = index === active;
          return (
            <li key={chapter.id} className={`flex flex-col items-center ${index % 2 ? "translate-y-3" : ""}`}>
              <button
                type="button"
                onClick={() => onGo(index)}
                aria-label={`Chapter ${chapter.letter}, ${chapter.name}`}
                aria-current={current ? "step" : undefined}
                className={`grid place-items-center h-7 w-7 rounded-full border border-dashed font-[family-name:var(--font-courier)] text-[13px] transition-colors duration-500 ${current ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--on-accent)]" : "border-[var(--rule)] text-ink hover:border-[var(--accent)]"}`}
              >
                {chapter.letter}
              </button>
              <span className={`mt-1.5 font-[family-name:var(--font-space)] text-[10px] font-bold uppercase text-accent transition-opacity duration-500 ${current ? "opacity-100" : "opacity-0"}`}>
                {chapter.name}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Tags({ tags, active }: { tags: readonly string[]; active: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none max-sm:hidden">
      {tags.map((tag, index) => (
        <TypeLabel
          key={tag}
          text={tag}
          active={active}
          delay={800 + index * 260}
          className={`absolute ${TAG_SPOTS[index % TAG_SPOTS.length]}`}
          style={{ animationDelay: `${index * -4}s` }}
        />
      ))}
    </div>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <ul className="border-t border-dashed border-[var(--rule)]">
      {FAQ.map((item, index) => {
        const isOpen = open === index;
        return (
          <li key={item.q} className="border-b border-dashed border-[var(--rule)]">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : index)}
              className="w-full flex items-center justify-between gap-6 py-4 text-left font-[family-name:var(--font-courier)] uppercase text-[length:var(--fs-h3)] leading-[1.1] text-ink hover:text-accent"
            >
              <span className={isOpen ? "text-accent" : ""}>{item.q}</span>
              <span
                aria-hidden="true"
                className={`grid place-items-center h-8 w-8 shrink-0 rounded-full border border-dashed border-[var(--rule)] text-[18px] transition-transform duration-500 ${isOpen ? "rotate-180" : ""}`}
              >
                {isOpen ? "−" : "+"}
              </span>
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-[750ms] ease-[cubic-bezier(.22,1,.36,1)] ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <p className="overflow-hidden text-ink-soft max-w-[560px]">
                <span className="block pb-5">{item.a}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ChapterBody({ chapter }: { chapter: Chapter }) {
  switch (chapter.id) {
    case "intro":
      return (
        <div className="grid h-full content-center max-sm:content-start max-sm:pt-4 justify-items-center text-center gap-6 sm:gap-10">
          <h1 className="title text-[length:var(--fs-hero)] w-full max-w-[1200px]">
            <HeroWords />
          </h1>
          <div className="grid justify-items-center gap-5 max-w-[440px]">
            <p className="text-[15px] leading-[1.45] text-ink">
              For anyone who keeps track of medicines for a parent, a child or themselves. Shelf Check reads the
              official labels of everything you take together, and quotes the line that matters.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/add?sample=1" className="btn">
                See an example cabinet
              </Link>
              <Link href="/start" className="btn btn-quiet">
                Start my own
              </Link>
            </div>
          </div>
        </div>
      );
    case "problem":
      return (
        <Split chapter={chapter} title="The warning is on a different box">
          Tylenol and NyQuil both contain acetaminophen, and neither box tells you about the other. Taken at the most each
          label allows, that is 5,600 mg a day. The Tylenol label warns about going over 4,000. In one study, 45.6 percent
          of 500 adults said they would double up like this.
        </Split>
      );
    case "checks":
      return (
        <Split chapter={chapter} title="Every label, read together">
          <span className="block">The same drug hiding in two products, with the daily total. Labels that warn about something else you own, like warfarin and St. John&apos;s Wort. Warnings for your health, from four questions. FDA recalls on that exact product. Expired or nearly empty bottles.</span>
        </Split>
      );
    case "decides":
      return (
        <Split chapter={chapter} title="No AI decides a warning" cta={{ href: "/tested", label: "See how we tested it" }}>
          Each product is matched to its official FDA or NIH record before it goes in. Then plain code reads the label text,
          and drug classes come from the FDA&apos;s own interaction tables. Every warning quotes its sentence, so you can show
          it to a pharmacist.
        </Split>
      );
    case "proof":
      return (
        <div className="grid h-full content-center gap-10 max-w-[1144px] mx-auto w-full">
          <div className="flex items-start gap-4">
            <ChapterLetter letter={chapter.letter} />
            <h2 className="title text-[length:var(--fs-h1)]">Tested, with the bar set first</h2>
          </div>
          <dl className="grid gap-6 sm:grid-cols-3">
            {[
              ["40 of 40", "Doubled acetaminophen caught, 40 random products"],
              ["10 of 40", "New major interactions caught, with 0 false alarms in 40 more pairs"],
              ["0 of 61", "Wrong photo matches when code and printed text had to agree. Photo reading runs on a local computer, not this site"],
            ].map(([number, text]) => (
              <div key={number} className="facts">
                <dt className="title text-[length:var(--fs-h1)]">{number}</dt>
                <dd className="mt-3 text-ink-soft">{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    case "who":
      return (
        <Split chapter={chapter} title="For the person who keeps the list">
          A parent managing their kids&apos; cold medicine. Someone caring for a mother on six prescriptions. Anyone who
          takes more than one thing. Add each person in their own cabinet, print the list for the pharmacist, or have it
          read aloud.
        </Split>
      );
    case "faq":
      return (
        <div className="grid h-full content-center gap-10 lg:grid-cols-2 max-w-[1300px] mx-auto w-full">
          <div className="flex items-start gap-4 lg:self-center">
            <ChapterLetter letter={chapter.letter} />
            <div>
              <h2 className="title text-[length:var(--fs-h1)]">Questions, answered</h2>
              <p className="mt-4 max-w-[400px] text-ink-soft">What it is, where the warnings come from, and what it cannot tell you.</p>
            </div>
          </div>
          <Faq />
        </div>
      );
    default:
      return (
        <div className="grid h-full content-center justify-items-center text-center gap-8">
          <h2 className="title text-[length:var(--fs-hero)]">Start your cabinet</h2>
          <p className="max-w-[440px] text-ink-soft">About two minutes, four questions. Your list stays in this browser.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/start" className="btn">
              Start my own
            </Link>
            <Link href="/add?sample=1" className="btn btn-quiet">
              See an example cabinet
            </Link>
          </div>
        </div>
      );
  }
}

function Split({
  chapter,
  title,
  children,
  cta,
}: {
  chapter: Chapter;
  title: string;
  children: React.ReactNode;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="grid h-full content-center max-w-[1144px] mx-auto w-full">
      <div className="flex items-start gap-4 lg:ml-[30%] max-w-[640px]">
        <ChapterLetter letter={chapter.letter} />
        <div>
          <h2 className="title text-[length:var(--fs-h1)]">{title}</h2>
          <p className="mt-4 text-[15px] leading-[1.5] text-ink">{children}</p>
          {cta && (
            <Link href={cta.href} className="btn btn-quiet mt-6">
              {cta.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  const [active, setActive] = useState(0);
  const spacers = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    let frame = 0;
    function update() {
      frame = 0;
      const middle = window.innerHeight / 2;
      let next = 0;
      spacers.current.forEach((element, index) => {
        if (element && element.getBoundingClientRect().top <= middle) next = index;
      });
      setActive((current) => (current === next ? current : next));
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  useEffect(() => {
    setFieldShape(CHAPTERS[active].shape);
  }, [active]);

  useEffect(() => () => setFieldShape("cloud"), []);

  function go(index: number) {
    spacers.current[index]?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="-mx-[var(--margin)]">
      <EnterGate />
      <Rail active={active} onGo={go} />
      {CHAPTERS.map((chapter, index) => {
        const isActive = index === active;
        return (
          <section
            key={chapter.id}
            id={chapter.id}
            aria-label={`${chapter.letter}. ${chapter.name}`}
            ref={(element) => {
              spacers.current[index] = element;
            }}
            className={`relative ${chapter.id === "faq" ? "min-h-[160vh]" : "h-[150vh] max-sm:h-[130vh]"}`}
          >
            <div
              className={`sticky top-0 h-[100svh] px-[var(--margin)] pt-28 pb-28 max-sm:pt-6 transition-[opacity,filter] ${isActive ? "opacity-100 blur-0 duration-[700ms] delay-150 ease-[cubic-bezier(.33,1,.68,1)]" : "opacity-0 blur-[6px] duration-[400ms] delay-0 ease-[cubic-bezier(.33,1,.68,1)] pointer-events-none"}`}
            >
              <Tags tags={chapter.tags} active={isActive} />
              <ChapterBody chapter={chapter} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

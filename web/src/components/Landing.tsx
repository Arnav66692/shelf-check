"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EnterGate } from "./EnterGate";
import { WireModel, type ModelName } from "./WireModel";

type Slide = {
  id: string;
  title: string;
  model: ModelName;
  body: string;
  href: string;
  cta: string;
  callouts: readonly { label: string; spot: string }[];
};

const SLIDES: readonly Slide[] = [
  {
    id: "check",
    title: "Check",
    model: "bottle",
    body: "Tylenol and NyQuil both contain acetaminophen, and neither box tells you the other one has it. Add what is in your cabinet and Shelf Check reads every official FDA label together, then quotes the line that matters.",
    href: "/add",
    cta: "Enter",
    callouts: [
      { label: "Active ingredient", spot: "left-[39%] top-[40%] w-[22%] h-[13%]" },
      { label: "Label warning", spot: "left-[43%] top-[57%] w-[14%] h-[8%]" },
    ],
  },
  {
    id: "proof",
    title: "Prove",
    model: "molecule",
    body: "Acetaminophen hidden in two products was caught 40 of 40 times on random real products. On 40 harmless pairs it raised 0 false alarms. Every warning points to a real sentence on a real label.",
    href: "/tested",
    cta: "See the tests",
    callouts: [{ label: "C8H9NO2", spot: "left-[36%] top-[30%] w-[28%] h-[40%]" }],
  },
  {
    id: "learn",
    title: "Learn",
    model: "flask",
    body: "What each medicine is for, when it starts working, what to eat or avoid with it, and its side effects. Every line is quoted from its FDA label.",
    href: "/learn",
    cta: "Enter",
    callouts: [{ label: "FDA label", spot: "left-[40%] top-[48%] w-[20%] h-[14%]" }],
  },
  {
    id: "care",
    title: "Find care",
    model: "pin",
    body: "Pharmacies, urgent care and emergency rooms near you, sorted by how you feel. Call ahead, because pharmacies stock different medicines.",
    href: "/care",
    cta: "Enter",
    callouts: [{ label: "Near you", spot: "left-[42%] top-[26%] w-[16%] h-[24%]" }],
  },
  {
    id: "symptoms",
    title: "Symptoms",
    model: "kit",
    body: "Type how you feel. It finds what you already own that is labelled for it, and sends emergency words straight to 911, 988 or Poison Help.",
    href: "/symptoms",
    cta: "Enter",
    callouts: [{ label: "Emergency first", spot: "left-[42%] top-[38%] w-[16%] h-[22%]" }],
  },
  {
    id: "pills",
    title: "Identify",
    model: "capsule",
    body: "Found a pill you cannot name. Search 83,912 FDA and NLM pill records by imprint, colour and shape, with Poison Help at the top.",
    href: "/pills",
    cta: "Enter",
    callouts: [{ label: "Imprint", spot: "left-[44%] top-[46%] w-[12%] h-[9%]" }],
  },
  {
    id: "dose",
    title: "Measure",
    model: "syringe",
    body: "Shows where the plunger should stop on a U-100 syringe, and catches the 5 units versus 50 units mix-up the FDA has warned about.",
    href: "/dose",
    cta: "Enter",
    callouts: [{ label: "Draw to mark", spot: "left-[46%] top-[34%] w-[9%] h-[28%]" }],
  },
  {
    id: "peptides",
    title: "Peptides",
    model: "helix",
    body: "Quotes the FDA label for approved peptides like Ozempic and Mounjaro, and says plainly when a peptide has no approved use or dose.",
    href: "/peptides",
    cta: "Enter",
    callouts: [{ label: "FDA label", spot: "left-[42%] top-[24%] w-[16%] h-[50%]" }],
  },
] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function Arrow({ flip }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 24 8" width="22" height="8" aria-hidden="true" className={flip ? "rotate-180" : ""}>
      <path d="M0 4h22M18 1l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function Callouts({ slide }: { slide: Slide }) {
  return (
    <div aria-hidden="true" className="absolute inset-0 pointer-events-none max-md:hidden">
      {slide.callouts.map((callout, index) => (
        <div
          key={callout.label}
          className={`absolute border border-[var(--accent)] rise ${callout.spot}`}
          style={{ animationDelay: `${900 + index * 250}ms` }}
        >
          <span className="absolute -top-px left-full ml-2 whitespace-nowrap bg-[var(--accent)] px-2 py-0.5 font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.15em] text-[var(--on-accent)]">
            {callout.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Landing() {
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const slide = SLIDES[index];
  const next = (index + 1) % SLIDES.length;

  const go = useCallback((step: number) => {
    setIndex((current) => (current + step + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Shelf Check tools"
      className="relative -mx-[var(--margin)] h-[calc(100svh-140px)] min-h-[560px] max-sm:h-auto max-sm:min-h-0"
      onTouchStart={(event) => {
        touchX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchX.current;
        const end = event.changedTouches[0]?.clientX;
        if (start === null || end === undefined || Math.abs(end - start) < 50) return;
        go(end < start ? 1 : -1);
      }}
    >
      <EnterGate />
      <div key={slide.id} className="absolute inset-y-0 left-0 w-[60%] max-sm:relative max-sm:w-full max-sm:h-[300px] rise">
        <WireModel name={slide.model} />
        <Callouts slide={slide} />
      </div>

      <div className="absolute left-1/2 top-2 -translate-x-1/2 flex items-center gap-3 font-[family-name:var(--font-display)] text-[13px] font-medium tracking-[0.15em] max-sm:hidden" aria-hidden="true">
        <span className="text-accent blink">{pad(index + 1)}</span>
        <span className="h-px w-8 bg-[var(--rule)]" />
        <span className="text-muted">{pad(next + 1)}</span>
      </div>

      <div
        role="group"
        aria-roledescription="slide"
        aria-label={`${index + 1} of ${SLIDES.length}, ${slide.title}`}
        className="absolute left-[55%] right-[9%] top-[24%] max-w-[520px] max-sm:static max-sm:px-[var(--margin)] max-sm:pt-4 max-sm:max-w-none"
      >
        <h1 key={`t-${slide.id}`} aria-live="polite" className="title rgb-title text-[clamp(40px,4.2vw,72px)] tracking-[0.2em]" data-text={slide.title}>
          {slide.title}
        </h1>
        <p key={`b-${slide.id}`} className="mt-6 text-[var(--ink-soft)] rise">
          {slide.body}
        </p>
        <div key={`c-${slide.id}`} className="mt-10 flex flex-wrap items-center gap-3 rise" style={{ animationDelay: "300ms" }}>
          <Link href={slide.href} className="btn min-w-[194px] justify-start">
            {slide.cta}
          </Link>
          {slide.id === "check" && (
            <Link href="/add?sample=1" className="btn btn-quiet">
              Try a sample cabinet
            </Link>
          )}
        </div>
        <p className="mt-8 hud-bar label">Poison Help 1-800-222-1222. Emergency, call 911.</p>
      </div>

      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous tool"
        className="absolute left-[var(--margin)] top-1/2 -translate-y-1/2 grid place-items-center h-14 w-14 rounded-full border border-[var(--rule)] text-ink hover:border-[var(--accent)] hover:text-accent transition-colors max-sm:top-[150px]"
      >
        <Arrow flip />
      </button>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next tool"
        className="absolute right-[var(--margin)] top-1/2 -translate-y-1/2 grid place-items-center h-14 w-14 rounded-full border border-[var(--rule)] text-ink hover:border-[var(--accent)] hover:text-accent transition-colors max-sm:top-[150px]"
      >
        <Arrow />
      </button>

      <ol className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-2 max-sm:static max-sm:translate-x-0 max-sm:justify-center max-sm:py-6" aria-label="Choose a tool">
        {SLIDES.map((item, itemIndex) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setIndex(itemIndex)}
              aria-label={item.title}
              aria-current={itemIndex === index ? "true" : undefined}
              className="grid h-11 w-8 place-items-center"
            >
              <span className={`block h-[2px] transition-all duration-500 ${itemIndex === index ? "w-8 bg-[var(--accent)]" : "w-4 bg-[var(--rule)]"}`} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

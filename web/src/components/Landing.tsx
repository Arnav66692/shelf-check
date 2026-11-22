"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EnterGate } from "./EnterGate";
import { HOLD_MS, SQUASH_MS, World, type WorldModel } from "./World";

type Slide = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly cta: string;
  readonly model: WorldModel;
};

const SLIDES: readonly Slide[] = [
  {
    id: "check",
    title: "Check",
    body: "Tylenol and NyQuil both contain acetaminophen, and neither box tells you the other one has it. Add what is in your cabinet and Shelf Check reads every official FDA label together, then quotes the line that matters.",
    href: "/add",
    cta: "Enter",
    model: { name: "bottle", callouts: [{ label: "Active ingredient", at: [0, -0.1, 1.05], half: [0.75, 0.5] }] },
  },
  {
    id: "zephyr",
    title: "Zephyr",
    body: "Zephyr is our own image model. Show it the box and it finds the 5 closest official labels, right on your device. Your photo is never uploaded, and you confirm the match yourself.",
    href: "/add",
    cta: "Try Zephyr",
    model: { name: "capsule", callouts: [{ label: "3,588 labels", at: [0, 0, 0.75], half: [0.55, 0.35] }] },
  },
  {
    id: "learn",
    title: "Learn",
    body: "What each medicine is for, when it starts working, what to eat or avoid with it, and its side effects. Every line is quoted from its FDA label.",
    href: "/learn",
    cta: "Enter",
    model: { name: "flask", callouts: [{ label: "FDA label", at: [0, -0.75, 1.1], half: [0.8, 0.3] }] },
  },
  {
    id: "care",
    title: "Find care",
    body: "Pharmacies, urgent care and emergency rooms near you, sorted by how you feel. Call ahead, because pharmacies stock different medicines.",
    href: "/care",
    cta: "Enter",
    model: { name: "pin", callouts: [{ label: "Near you", at: [0, 0.9, 0.9], half: [0.6, 0.6] }] },
  },
  {
    id: "symptoms",
    title: "Symptoms",
    body: "Type how you feel. It finds what you already own that is labelled for it, and sends emergency words straight to 911, 988 or Poison Help.",
    href: "/symptoms",
    cta: "Enter",
    model: { name: "kit", callouts: [{ label: "Emergency first", at: [0, 0, 0.7], half: [0.6, 0.6] }] },
  },
  {
    id: "dose",
    title: "Measure",
    body: "Shows where the plunger should stop on a U-100 syringe, and catches the 5 units versus 50 units mix-up the FDA has warned about.",
    href: "/dose",
    cta: "Enter",
    model: { name: "syringe", callouts: [{ label: "Draw to mark", at: [0, -0.4, 0.5], half: [0.45, 1.1] }] },
  },
  {
    id: "peptides",
    title: "Peptides",
    body: "Quotes the FDA label for approved peptides like Ozempic and Mounjaro, and says plainly when a peptide has no approved use or dose.",
    href: "/peptides",
    cta: "Enter",
    model: { name: "helix", callouts: [{ label: "FDA label", at: [0, 0.4, 1], half: [0.6, 1.3] }] },
  },
  {
    id: "proof",
    title: "Prove",
    body: "Acetaminophen hidden in two products was caught 40 of 40 times on random real products. On 40 harmless pairs it raised 0 false alarms. Every warning points to a real sentence on a real label.",
    href: "/tested",
    cta: "See the tests",
    model: { name: "molecule", callouts: [{ label: "C8H9NO2", at: [0, 0, 0.3], half: [1.4, 1.6] }] },
  },
];

const SWITCH_MS = SQUASH_MS + HOLD_MS;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function letterDelays(length: number, seed: number): number[] {
  return Array.from({ length }, (_, i) => ((i * 7919 + seed * 104729) % 97) / 97);
}

function ScrambleTitle({ text, visible, seed }: { text: string; visible: boolean; seed: number }) {
  const delays = useMemo(() => letterDelays(text.length, seed), [text, seed]);
  return (
    <h1 aria-label={text} className="title text-[clamp(40px,4.2vw,72px)] tracking-[0.2em] whitespace-nowrap">
      {[...text].map((letter, i) => (
        <span
          key={`${seed}-${i}`}
          aria-hidden="true"
          className={`letter ${visible ? "letter-in" : "letter-out"}`}
          style={{ animationDelay: `${Math.round(delays[i] * (visible ? 520 : 260))}ms` }}
          data-letter={letter}
        >
          {letter === " " ? " " : letter}
        </span>
      ))}
    </h1>
  );
}

function Counter({ index, total }: { index: number; total: number }) {
  const next = (index + 1) % total;
  return (
    <div className="hatch flex items-center gap-3 px-3 h-7 font-[family-name:var(--font-display)] text-[13px] font-medium tracking-[0.15em]" aria-hidden="true">
      <span key={`a-${index}`} className="text-accent blink count-in">{pad(index + 1)}</span>
      <span className="h-px w-8 bg-[var(--rule)]" />
      <span key={`b-${index}`} className="text-muted count-in">{pad(next + 1)}</span>
    </div>
  );
}

function RingButton({ label, flip, onClick }: { label: string; flip?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="ring-button group relative grid place-items-center h-[70px] w-[70px] text-ink">
      <svg viewBox="0 0 70 70" className="absolute inset-0" aria-hidden="true">
        <circle cx="35" cy="35" r="27" fill="none" stroke="var(--rule)" strokeWidth="1" />
        <circle cx="35" cy="35" r="27" fill="none" stroke="var(--accent)" strokeWidth="1.2" className="ring-draw" transform="rotate(-90 35 35)" />
      </svg>
      <svg viewBox="0 0 24 8" width="22" height="8" aria-hidden="true" className={`relative transition-transform duration-500 ${flip ? "rotate-180 group-hover:-translate-x-1" : "group-hover:translate-x-1"}`}>
        <path d="M0 4h22M18 1l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
    </button>
  );
}

export function Landing() {
  const [target, setTarget] = useState(0);
  const [shown, setShown] = useState(0);
  const [visible, setVisible] = useState(true);
  const [pinched, setPinched] = useState(false);
  const busy = useRef(false);
  const touchX = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const slide = SLIDES[shown];
  const models = useMemo(() => SLIDES.map((item) => item.model), []);

  const goTo = useCallback(
    (next: number) => {
      if (busy.current || next === target) return;
      busy.current = true;
      setVisible(false);
      setPinched(true);
      setTarget(next);
      timers.current.push(
        window.setTimeout(() => {
          setShown(next);
          setVisible(true);
        }, SWITCH_MS),
        window.setTimeout(() => setPinched(false), SWITCH_MS + 250),
        window.setTimeout(() => {
          busy.current = false;
        }, SWITCH_MS + 700),
      );
    },
    [target],
  );

  const go = useCallback((step: number) => goTo((target + step + SLIDES.length) % SLIDES.length), [goTo, target]);

  useEffect(() => {
    document.body.classList.add("no-hgrid");
    const pending = timers.current;
    return () => {
      document.body.classList.remove("no-hgrid");
      pending.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const element = event.target as HTMLElement | null;
      if (element && /INPUT|TEXTAREA|SELECT/.test(element.tagName)) return;
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
      <div className="fixed inset-0 -z-[1] max-sm:absolute max-sm:inset-x-0 max-sm:top-0 max-sm:h-[340px] max-sm:z-0" aria-hidden="true">
        <World models={models} index={target} />
      </div>
      <div aria-hidden="true" className="pinch-line max-sm:hidden" style={{ top: pinched ? "53%" : "31%" }} />
      <div aria-hidden="true" className="pinch-line max-sm:hidden" style={{ top: pinched ? "53%" : "69%" }} />

      <div className="absolute left-1/2 top-2 -translate-x-1/2 max-sm:hidden">
        <Counter index={target} total={SLIDES.length} />
      </div>

      <div
        role="group"
        aria-roledescription="slide"
        aria-label={`${shown + 1} of ${SLIDES.length}, ${slide.title}`}
        className="absolute left-[55%] right-[9%] top-[22%] max-w-[520px] max-sm:static max-sm:px-[var(--margin)] max-sm:pt-[360px] max-sm:max-w-none"
      >
        <ScrambleTitle text={slide.title} visible={visible} seed={shown + 1} />
        <p
          className={`mt-6 text-[var(--ink-soft)] transition-[opacity,transform,filter] duration-500 ${visible ? "opacity-100 translate-y-0 blur-0 delay-200" : "opacity-0 translate-y-2 blur-[3px]"}`}
        >
          {slide.body}
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link href={slide.href} className={`btn btn-grow min-w-[194px] justify-start ${visible ? "is-in" : "is-out"}`}>
            <span className="btn-label">{slide.cta}</span>
          </Link>
          {slide.id === "check" && (
            <Link href="/add?sample=1" className={`btn btn-quiet transition-opacity duration-500 ${visible ? "opacity-100 delay-500" : "opacity-0"}`}>
              Try a sample cabinet
            </Link>
          )}
        </div>
        <p className="mt-8 hud-bar label">Poison Help 1-800-222-1222. Emergency, call 911.</p>
      </div>

      <div className="absolute left-[var(--margin)] top-1/2 -translate-y-1/2 max-sm:top-[170px]">
        <RingButton label="Previous tool" flip onClick={() => go(-1)} />
      </div>
      <div className="absolute right-[var(--margin)] top-1/2 -translate-y-1/2 max-sm:top-[170px]">
        <RingButton label="Next tool" onClick={() => go(1)} />
      </div>

      <ol className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-2 max-sm:static max-sm:translate-x-0 max-sm:justify-center max-sm:py-6" aria-label="Choose a tool">
        {SLIDES.map((item, itemIndex) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => goTo(itemIndex)}
              aria-label={item.title}
              aria-current={itemIndex === target ? "true" : undefined}
              className="grid h-11 w-8 place-items-center"
            >
              <span className={`block h-[2px] transition-all duration-500 ${itemIndex === target ? "w-8 bg-[var(--accent)]" : "w-4 bg-[var(--rule)]"}`} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

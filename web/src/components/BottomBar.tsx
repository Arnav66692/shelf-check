"use client";

import { useSyncExternalStore } from "react";
import { useCabinet } from "@/lib/store";

const KEY = "shelf-check.text-size";
const EVENT = "shelf-check:text-size";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

function isLarge(): boolean {
  return document.documentElement.dataset.text === "large";
}

function setLarge(next: boolean) {
  if (next) document.documentElement.dataset.text = "large";
  else delete document.documentElement.dataset.text;
  try {
    window.localStorage.setItem(KEY, next ? "large" : "normal");
  } catch {
    return;
  } finally {
    window.dispatchEvent(new Event(EVENT));
  }
}

function subscribeSpeech(onChange: () => void): () => void {
  const id = window.setInterval(onChange, 400);
  return () => window.clearInterval(id);
}

function isSpeaking(): boolean {
  return typeof window !== "undefined" && !!window.speechSynthesis?.speaking;
}

function readPage() {
  const synth = window.speechSynthesis;
  if (!synth) return;
  if (synth.speaking) {
    synth.cancel();
    return;
  }
  const main = document.getElementById("main");
  // Read the page's content, not the person switcher or the chapter buttons.
  const skipped = [...(main?.querySelectorAll<HTMLElement>("[data-skip-read]") ?? [])].map((element) => element.innerText);
  const text = skipped.reduce((all, part) => (part ? all.replace(part, " ") : all), main?.innerText ?? "").replace(/\s+/g, " ").slice(0, 4000);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  synth.speak(utterance);
}

function Wave({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 12" width="18" height="10" aria-hidden="true">
      <path
        d={active ? "M1 6c2-5 4-5 5.5 0s3.5 5 5.5 0 3.5-5 5.5 0 3.5 5 5.5 0" : "M1 6h22"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BottomBar() {
  const { items } = useCabinet();
  const large = useSyncExternalStore(subscribe, isLarge, () => false);
  const speaking = useSyncExternalStore(subscribeSpeech, isSpeaking, () => false);
  return (
    <aside aria-label="Page tools" className="fixed z-30 inset-x-0 bottom-0 px-[var(--margin)] pb-[var(--margin)] flex items-end justify-between max-sm:justify-end gap-3 pointer-events-none print:hidden">
      <p className="max-sm:hidden pointer-events-auto flex items-center gap-2 h-8 px-3 rounded-full border border-solid border-[var(--rule)] bg-[rgba(5,7,15,0.7)] backdrop-blur-[8px] font-[family-name:var(--font-display)] text-[11px] font-medium tracking-[0.12em] uppercase">
        <span className="h-[5px] w-[5px] bg-[var(--accent)]" aria-hidden="true" />
        {items.length === 0 ? "Checks against FDA labels" : `${items.length} ${items.length === 1 ? "product" : "products"} in your cabinet`}
      </p>
      <div className="pointer-events-auto flex items-center gap-3 font-[family-name:var(--font-display)] text-[11px] font-medium tracking-[0.12em] uppercase">
        <span className="text-ink-soft flex items-center gap-1 h-8 px-3 rounded-full bg-[rgba(5,7,15,0.7)] backdrop-blur-[8px]" aria-hidden="true">
          {large ? "Large" : "Bigger text"}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={large}
          aria-label="Larger text"
          onClick={() => setLarge(!large)}
          className="relative h-8 w-[72px] rounded-full border border-solid border-[var(--rule)] bg-[rgba(5,7,15,0.7)] backdrop-blur-[8px]"
        >
          <span className="absolute left-3 right-3 top-1/2 h-px bg-[var(--rule)]" aria-hidden="true" />
          <span
            className={`absolute top-1/2 -translate-y-1/2 h-4 w-[11px] rounded-full border border-[var(--accent)] bg-[var(--paper)] transition-[left] duration-500 ${large ? "left-[calc(100%-22px)]" : "left-[11px]"}`}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          aria-pressed={speaking}
          aria-label={speaking ? "Stop reading this page aloud" : "Read this page aloud"}
          onClick={readPage}
          className={`grid place-items-center h-8 w-8 rounded-full border border-solid ${speaking ? "border-[var(--accent)] text-accent" : "border-[var(--rule)] text-ink"} bg-[rgba(5,7,15,0.7)] backdrop-blur-[8px]`}
        >
          <Wave active={speaking} />
        </button>
      </div>
    </aside>
  );
}

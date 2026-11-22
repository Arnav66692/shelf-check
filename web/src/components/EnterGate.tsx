"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Mark } from "./SiteHeader";

const KEY = "shelf-check.entered";

function subscribe(): () => void {
  return () => undefined;
}

function needsGate(): boolean {
  try {
    return !window.sessionStorage.getItem(KEY);
  } catch {
    return false;
  }
}

function speak(text: string) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  synth.speak(utterance);
}

export function EnterGate() {
  const initial = useSyncExternalStore(subscribe, needsGate, () => false);
  const [closed, setClosed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const open = initial && !closed;

  // Keyboard and screen reader focus stay on this screen until it closes.
  useEffect(() => {
    if (!open) return;
    const others = [...document.body.children].filter((element) => element !== root.current && !element.contains(root.current));
    others.forEach((element) => element.setAttribute("inert", ""));
    return () => others.forEach((element) => element.removeAttribute("inert"));
  }, [open]);

  if (!open) return null;

  function enter(withVoice: boolean) {
    try {
      window.sessionStorage.setItem(KEY, "1");
    } catch {
      return;
    } finally {
      setClosed(true);
      if (withVoice) {
        speak(
          "Shelf Check. Two bottles can hide one drug. Add what you take, and Shelf Check reads the official labels together and quotes the line that matters. Use the wave button at the bottom right to hear any page read aloud.",
        );
      }
    }
  }

  return createPortal(
    <div ref={root} role="dialog" aria-modal="true" aria-labelledby="gate-title" className="fixed inset-0 z-50 grid place-items-center bg-[var(--paper)] px-6">
      <div className="grid justify-items-center text-center gap-4 max-w-[340px]">
        <span className="text-ink">
          <Mark size={48} />
        </span>
        <span className="wordmark text-[14px]">Shelf Check</span>
        <h2 id="gate-title" className="title mt-6 text-[20px] leading-[1.15]">
          Check every medicine you own
        </h2>
        <p className="text-[14px] text-ink">Read aloud can speak each page for you. You can turn it on or off at any time.</p>
        <button type="button" className="btn mt-4" onClick={() => enter(false)} autoFocus>
          Enter
        </button>
        <button type="button" className="font-[family-name:var(--font-display)] text-[11px] font-medium tracking-[0.12em] uppercase text-ink-soft hover:text-accent py-2" onClick={() => enter(true)}>
          Enter with read aloud
        </button>
      </div>
    </div>,
    document.body,
  );
}

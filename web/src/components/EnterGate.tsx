"use client";

import { useState, useSyncExternalStore } from "react";
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
  if (!initial || closed) return null;

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

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="gate-title" className="fixed inset-0 z-50 grid place-items-center bg-[var(--paper)] px-6">
      <div className="grid justify-items-center text-center gap-4 max-w-[340px]">
        <span className="text-ink">
          <Mark size={48} />
        </span>
        <span className="wordmark text-[14px]">Shelf Check</span>
        <h2 id="gate-title" className="title mt-6 text-[20px] leading-[1.15]">
          Check every medicine you own
        </h2>
        <p className="text-[14px] text-ink">Read aloud can speak each page for you. You can turn it on or off at any time.</p>
        <button type="button" className="btn mt-4" onClick={() => enter(true)} autoFocus>
          Enter with read aloud
        </button>
        <button type="button" className="font-[family-name:var(--font-space)] text-[11px] font-bold uppercase text-ink-soft hover:text-accent py-2" onClick={() => enter(false)}>
          Enter quietly
        </button>
      </div>
    </div>
  );
}

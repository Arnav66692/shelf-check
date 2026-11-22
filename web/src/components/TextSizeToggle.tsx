"use client";

import { useSyncExternalStore } from "react";

const KEY = "shelf-check.text-size";
const EVENT = "shelf-check:text-size";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

function isLarge(): boolean {
  return document.documentElement.dataset.text === "large";
}

export function TextSizeToggle() {
  const large = useSyncExternalStore(subscribe, isLarge, () => false);

  function toggle() {
    const next = !isLarge();
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

  return (
    <button type="button" className="underline font-bold" onClick={toggle} aria-pressed={large}>
      {large ? "Normal text" : "Larger text"}
    </button>
  );
}

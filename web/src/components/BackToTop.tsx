"use client";

import { useSyncExternalStore } from "react";

const SHOW_AFTER_PX = 2000;

function subscribe(onChange: () => void): () => void {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

function farDown(): boolean {
  return window.scrollY > SHOW_AFTER_PX;
}

export function BackToTop() {
  const shown = useSyncExternalStore(subscribe, farDown, () => false);
  return (
    <button
      type="button"
      aria-label="Back to top"
      tabIndex={shown ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`group fixed z-30 right-[var(--space-1)] bottom-[var(--space-1)] w-[clamp(40px,3.203vw,82px)] mix-blend-difference text-[#e9e5e0] transition-opacity duration-300 ease-out print:hidden ${shown ? "opacity-100" : "opacity-0 pointer-events-none"}`}
    >
      <svg viewBox="0 0 164 400" className="block w-full overflow-visible" aria-hidden="true">
        <path
          d="M82 0 L164 82 L114 82 L114 400 L50 400 L50 82 L0 82 Z"
          fill="currentColor"
          className="origin-bottom transition-transform duration-500 ease-[cubic-bezier(.09,.68,.33,.91)] group-hover:scale-y-[1.18]"
        />
      </svg>
      <span className="absolute left-1/2 -translate-x-1/2 -top-7 font-[family-name:var(--font-display)] text-[11px] font-medium uppercase tracking-[0.15em] opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
        Go up
      </span>
    </button>
  );
}

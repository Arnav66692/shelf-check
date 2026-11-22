"use client";

import { useEffect, useState } from "react";

const SETS = [
  [["Two", "bottles", "can"], ["hide", "one", "drug"]],
  [["Shelf", "Check"], ["reads", "them", "together"]],
] as const;

const SWAP_MS = 9500;
const WORD_MS = 100;

export function HeroWords() {
  const [set, setSet] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setSet((value) => (value + 1) % SETS.length), SWAP_MS);
    return () => window.clearInterval(id);
  }, []);

  let index = 0;
  return (
    <span className="relative block">
      <span className="sr-only">Two bottles can hide one drug. Shelf Check reads them together.</span>
      {SETS[set].map((line, lineIndex) => (
        <span key={`${set}-${lineIndex}`} className="flex flex-wrap justify-center gap-x-[0.6em]" aria-hidden="true">
          {line.map((word) => (
            <span key={`${set}-${word}`} className="word-in" style={{ animationDelay: `${index++ * WORD_MS}ms` }}>
              {word}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

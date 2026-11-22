"use client";

import { useEffect, useState } from "react";

const LETTER_MS = 55;

export function TypeLabel({ text, active, delay = 0, className = "", style }: { text: string; active: boolean; delay?: number; className?: string; style?: React.CSSProperties }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = window.setTimeout(() => setShown(text.length), 0);
      return () => window.clearTimeout(id);
    }
    let count = 0;
    let timer = 0;
    const start = window.setTimeout(function tick() {
      count += 1;
      setShown(count);
      if (count < text.length) timer = window.setTimeout(tick, LETTER_MS);
    }, delay);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(timer);
      setShown(0);
    };
  }, [active, delay, text]);

  return (
    <span className={`chip-label drift ${className}`} style={style}>
      {text.slice(0, shown)}
      <span className="opacity-0">{text.slice(shown)}</span>
    </span>
  );
}

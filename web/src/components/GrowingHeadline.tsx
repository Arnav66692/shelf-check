"use client";

import { useEffect, useRef } from "react";

const LINE_TWO_START = 0.578;
const LINE_THREE_START = 0.439;
const GROW_VIEWPORTS = 1.5;
const SPRING_RATE = 10.5;

export function GrowingHeadline({ lines, children }: { lines: readonly [string, string, string]; children?: React.ReactNode }) {
  const block = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = block.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.style.setProperty("--p", "1");
      return;
    }
    let frame = 0;
    let shown = 0;
    let last = performance.now();
    function target(): number {
      if (!element) return 0;
      const top = element.getBoundingClientRect().top;
      const travelled = window.innerHeight - top;
      return Math.min(1, Math.max(0, travelled / (window.innerHeight * GROW_VIEWPORTS)));
    }
    function update(now: number) {
      frame = 0;
      if (!element) return;
      const goal = target();
      const step = 1 - Math.exp(-SPRING_RATE * Math.min(0.1, (now - last) / 1000));
      last = now;
      shown += (goal - shown) * step;
      if (Math.abs(goal - shown) < 0.0005) shown = goal;
      element.style.setProperty("--p", shown.toFixed(4));
      if (shown !== goal) frame = requestAnimationFrame(update);
    }
    function schedule() {
      last = performance.now();
      if (!frame) frame = requestAnimationFrame(update);
    }
    shown = target();
    element.style.setProperty("--p", shown.toFixed(4));
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <div className="h-[200vh] flex flex-col justify-end mt-[min(12.5%,320px)] -mb-[36%] max-[999px]:h-auto max-[999px]:mb-0">
      <div ref={block} className="sticky bottom-0 overflow-hidden grid gap-4 pb-8" style={{ ["--p" as string]: "0" }}>
        <h2 className="display">
          <span className="block text-[var(--fs-h2)]">{lines[0]}</span>
          <span
            className="block"
            style={{ fontSize: `calc(min(12.5vw, 240px) * min(1, ${LINE_TWO_START} + ${1 - LINE_TWO_START} * var(--p)))` }}
          >
            {lines[1]}
          </span>
          <span
            className="block"
            style={{ fontSize: `calc(min(18.6vw, 358px) * min(1, ${LINE_THREE_START} + ${1 - LINE_THREE_START} * var(--p)))` }}
          >
            {lines[2]}
          </span>
        </h2>
        {children}
      </div>
    </div>
  );
}

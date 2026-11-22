"use client";

import { useEffect, useRef } from "react";

const RADII = [316, 411, 526, 641, 759, 881, 1002] as const;
const CENTER = 1228;
const SPRING_RATE = 5.1;
const END_ROTATION = [633.8, 567.1, 500.4, 433.7, 366.9, 300.2, 233.5] as const;

function arcs(radius: number): string {
  const point = (degrees: number) => {
    const angle = (degrees * Math.PI) / 180;
    return `${(CENTER + radius * Math.cos(angle)).toFixed(1)} ${(CENTER + radius * Math.sin(angle)).toFixed(1)}`;
  };
  return `M ${point(-135)} A ${radius} ${radius} 0 0 1 ${point(-45)} M ${point(45)} A ${radius} ${radius} 0 0 1 ${point(135)}`;
}

export function Rings({ className = "" }: { className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = wrap.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const paths = [...element.querySelectorAll<SVGPathElement>("path")];
    let frame = 0;
    let shown = 0;
    let last = performance.now();
    function target(): number {
      if (!element) return 0;
      const box = element.getBoundingClientRect();
      const span = box.height + window.innerHeight;
      return Math.min(1, Math.max(0, (window.innerHeight - box.top) / span));
    }
    function draw() {
      paths.forEach((path, index) => {
        const sign = index % 2 === 0 ? 1 : -1;
        path.style.transform = `rotate(${(sign * END_ROTATION[index] * shown).toFixed(2)}deg)`;
      });
    }
    function update(now: number) {
      frame = 0;
      const goal = target();
      const step = 1 - Math.exp(-SPRING_RATE * Math.min(0.1, (now - last) / 1000));
      last = now;
      shown += (goal - shown) * step;
      if (Math.abs(goal - shown) < 0.0002) shown = goal;
      draw();
      if (shown !== goal) frame = requestAnimationFrame(update);
    }
    function schedule() {
      last = performance.now();
      if (!frame) frame = requestAnimationFrame(update);
    }
    shown = target();
    draw();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
    };
  }, []);

  return (
    <div ref={wrap} className={className} aria-hidden="true">
      <svg viewBox="0 0 2456 2456" className="w-full h-full">
        <defs>
          <linearGradient id="ring-fade" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4d4d4d" />
            <stop offset="1" stopColor="#4d4d4d" stopOpacity="0" />
          </linearGradient>
        </defs>
        {RADII.map((radius) => (
          <path
            key={radius}
            d={arcs(radius)}
            fill="none"
            stroke="url(#ring-fade)"
            strokeWidth="1.6"
            style={{ transformOrigin: `${CENTER}px ${CENTER}px`, transformBox: "view-box" }}
          />
        ))}
      </svg>
    </div>
  );
}

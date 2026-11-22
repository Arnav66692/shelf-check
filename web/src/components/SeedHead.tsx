"use client";

import { useEffect, useRef } from "react";

const SEED_COUNT = 700;
const STALK_POINTS = 4;
const TUFT_POINTS = 6;

type Point = { angle: number; tilt: number; reach: number; spread: number; drift: number; size: number; tuft: boolean };

function makePoints(): Point[] {
  const points: Point[] = [];
  for (let seed = 0; seed < SEED_COUNT; seed++) {
    const angle = Math.random() * Math.PI * 2;
    const tilt = Math.acos(Math.random() * 2 - 1);
    const drift = Math.random();
    const length = 0.86 + Math.random() * 0.16;
    for (let step = 0; step < STALK_POINTS; step++) {
      points.push({ angle, tilt, reach: 0.12 + ((step + 1) / STALK_POINTS) * 0.62 * length, spread: 0.01, drift, size: 0.7, tuft: false });
    }
    for (let step = 0; step < TUFT_POINTS; step++) {
      points.push({ angle, tilt, reach: length * 0.82, spread: 0, drift, size: Math.random() < 0.2 ? 1.6 : 1, tuft: true });
    }
  }
  return points;
}

export function SeedHead({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const points = makePoints();
    const jitter = points.map(() => [Math.random() - 0.5, Math.random() - 0.5]);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let visible = true;
    const growFrom = performance.now() + (document.documentElement.dataset.nointro ? 0 : 1250);

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !still) frame = requestAnimationFrame(draw);
    });
    observer.observe(canvas);

    function draw(time: number) {
      if (!canvas || !context) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const linear = still ? 1 : Math.min(1, Math.max(0, (time - growFrom) / 1300));
      const grow = 1 - (1 - linear) ** 3;
      const radius = Math.min(width, height) * 0.36 * (0.08 + 0.92 * grow);
      const sway = still ? 0 : Math.sin(time * 0.00045) * 0.05;
      const cx = width * 0.5 + Math.sin(sway) * radius * 0.25;
      const cy = height * (0.42 + (1 - grow) * 0.3);
      const release = still ? 0 : Math.min(1, window.scrollY / 700);
      const spin = still ? 0 : time * 0.00004;

      context.strokeStyle = "rgba(156, 222, 140, 0.55)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(cx, cy);
      context.quadraticCurveTo(cx + radius * 0.08, cy + radius * 1.1, width * 0.5 + radius * 0.2, height);
      context.stroke();

      const core = context.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.32);
      core.addColorStop(0, "rgba(255, 226, 160, 1)");
      core.addColorStop(0.35, "rgba(255, 214, 150, 0.35)");
      core.addColorStop(1, "rgba(255, 214, 150, 0)");
      context.fillStyle = core;
      context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

      const halo = context.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.25);
      halo.addColorStop(0, "rgba(170, 196, 255, 0.16)");
      halo.addColorStop(1, "rgba(170, 196, 255, 0)");
      context.fillStyle = halo;
      context.fillRect(cx - radius * 1.3, cy - radius * 1.3, radius * 2.6, radius * 2.6);

      context.globalCompositeOperation = "lighter";
      context.fillStyle = "#dfe8ff";
      context.strokeStyle = "#dfe8ff";
      context.lineWidth = 0.55;
      points.forEach((point, index) => {
        const angle = point.angle + spin;
        const flying = point.drift < release ? (release - point.drift) * 2.2 : 0;
        const reach = radius * point.reach * (1 + flying);
        const sinTilt = Math.sin(point.tilt);
        const depth = (Math.cos(point.tilt) + 1) * 0.5;
        const dx = Math.cos(angle) * sinTilt;
        const dy = Math.sin(angle) * sinTilt * 0.96;
        const x = cx + dx * reach + flying * radius * 0.6;
        const y = cy + dy * reach - flying * radius * 0.5;
        const fade = Math.max(0, 1 - flying * 0.7);
        if (point.tuft) {
          const fan = jitter[index][0] * 1.4;
          const length = radius * (0.07 + 0.08 * (jitter[index][1] + 0.5));
          const ox = Math.cos(angle + fan) * sinTilt + jitter[index][1] * 0.3;
          const oy = Math.sin(angle + fan) * sinTilt + jitter[index][0] * 0.3;
          context.globalAlpha = (0.1 + 0.28 * depth) * fade;
          context.beginPath();
          context.moveTo(x, y);
          context.lineTo(x + ox * length, y + oy * length);
          context.stroke();
          context.globalAlpha = (0.25 + 0.5 * depth) * fade;
          context.fillRect(x + ox * length, y + oy * length, point.size, point.size);
        } else {
          context.globalAlpha = (0.08 + 0.16 * depth) * fade;
          context.fillRect(x, y, point.size, point.size);
        }
      });
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      if (visible && !still) frame = requestAnimationFrame(draw);
    }

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

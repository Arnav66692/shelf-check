"use client";

import { useEffect, useRef } from "react";

const COUNT = 3600;
const EASE = 0.035;

export type FieldShape = "ring" | "band" | "stream" | "orbits" | "cloud" | "cone" | "wave" | "pair";

const SHAPE_EVENT = "shelf-check:field-shape";

export function setFieldShape(shape: FieldShape): void {
  window.dispatchEvent(new CustomEvent<FieldShape>(SHAPE_EVENT, { detail: shape }));
}

function gaussian(): number {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

function target(shape: FieldShape, index: number, width: number, height: number): [number, number] {
  const u = index / COUNT;
  const r = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  switch (shape) {
    case "ring": {
      const angle = u * Math.PI * 2 * 7.3;
      const radius = r * (0.34 + gaussian() * 0.035);
      return [cx + Math.cos(angle) * radius * 1.05, cy + Math.sin(angle) * radius * 0.92];
    }
    case "band": {
      const x = (u * 1.3 - 0.15) * width;
      return [x, cy + Math.sin(u * 9) * r * 0.08 + gaussian() * r * 0.05];
    }
    case "stream": {
      const t = u * 1.4 - 0.2;
      return [t * width + gaussian() * r * 0.03, (1 - t) * height * 0.9 + gaussian() * r * 0.04];
    }
    case "orbits": {
      const ring = index % 4;
      const angle = u * Math.PI * 2 * 11;
      const radius = r * (0.16 + ring * 0.09);
      return [cx + Math.cos(angle) * radius * 1.6, cy + Math.sin(angle) * radius * 0.55 + gaussian() * 3];
    }
    case "cone": {
      const t = Math.pow(u, 0.7);
      return [cx + gaussian() * r * 0.42 * (1 - t), height * 0.05 + t * height * 0.95];
    }
    case "wave": {
      const x = (u * 1.2 - 0.1) * width;
      const lane = index % 3;
      return [x, cy + Math.sin(u * 14 + lane) * r * (0.1 + lane * 0.04) + gaussian() * 6];
    }
    case "pair": {
      const side = index % 2 === 0 ? -1 : 1;
      const angle = u * Math.PI * 2 * 9;
      const radius = r * (0.2 + gaussian() * 0.03);
      return [cx + side * r * 0.22 + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
    }
    default:
      return [cx + gaussian() * width * 0.45, cy + gaussian() * height * 0.45];
  }
}

export function ParticleField({ initial = "cloud" }: { initial?: FieldShape }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let shape: FieldShape = initial;
    const px = new Float32Array(COUNT);
    const py = new Float32Array(COUNT);
    const tx = new Float32Array(COUNT);
    const ty = new Float32Array(COUNT);
    const size = new Float32Array(COUNT);
    const alpha = new Float32Array(COUNT);
    const phase = new Float32Array(COUNT);
    let pointerX = -9999;
    let pointerY = -9999;
    let frame = 0;

    function retarget() {
      for (let i = 0; i < COUNT; i++) {
        const [x, y] = target(shape, i, width, height);
        tx[i] = x;
        ty[i] = y;
      }
    }

    function resize() {
      if (!canvas || !context) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      retarget();
    }

    for (let i = 0; i < COUNT; i++) {
      px[i] = Math.random() * window.innerWidth;
      py[i] = Math.random() * window.innerHeight;
      size[i] = Math.random() < 0.08 ? 1.8 : Math.random() < 0.4 ? 1.2 : 0.8;
      alpha[i] = 0.25 + Math.random() * 0.6;
      phase[i] = Math.random() * Math.PI * 2;
    }
    resize();
    if (still) {
      for (let i = 0; i < COUNT; i++) {
        px[i] = tx[i];
        py[i] = ty[i];
      }
    }

    function draw(time: number) {
      if (!context) return;
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#a6a298";
      for (let i = 0; i < COUNT; i++) {
        if (!still) {
          const wobble = Math.sin(time * 0.0006 + phase[i]) * 3;
          px[i] += (tx[i] + wobble - px[i]) * EASE;
          py[i] += (ty[i] + Math.cos(time * 0.0005 + phase[i]) * 3 - py[i]) * EASE;
          const dx = px[i] - pointerX;
          const dy = py[i] - pointerY;
          const d2 = dx * dx + dy * dy;
          if (d2 < 9000) {
            const push = (9000 - d2) / 9000;
            px[i] += dx * push * 0.06;
            py[i] += dy * push * 0.06;
          }
        }
        context.globalAlpha = alpha[i];
        context.fillRect(px[i], py[i], size[i], size[i]);
      }
      context.globalAlpha = 1;
      if (!still) frame = requestAnimationFrame(draw);
    }

    function onShape(event: Event) {
      shape = (event as CustomEvent<FieldShape>).detail;
      retarget();
      if (still) {
        for (let i = 0; i < COUNT; i++) {
          px[i] = tx[i];
          py[i] = ty[i];
        }
        frame = requestAnimationFrame(draw);
      }
    }

    function onPointer(event: PointerEvent) {
      pointerX = event.clientX;
      pointerY = event.clientY;
    }

    window.addEventListener("resize", resize);
    window.addEventListener(SHAPE_EVENT, onShape);
    window.addEventListener("pointermove", onPointer, { passive: true });
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener(SHAPE_EVENT, onShape);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [initial]);

  return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 -z-10 pointer-events-none print:hidden" />;
}

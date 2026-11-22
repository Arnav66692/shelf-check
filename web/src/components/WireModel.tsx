"use client";

import { useEffect, useRef } from "react";

export type ModelName = "bottle" | "kit" | "capsule" | "syringe" | "helix" | "molecule" | "flask" | "pin";

export type Point = readonly [number, number, number];
export type Segment = readonly [Point, Point, boolean];

const TAU = Math.PI * 2;

function ring(segments: Segment[], radius: number, y: number, sides: number, hot = false): void {
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU;
    const b = ((i + 1) / sides) * TAU;
    segments.push([[Math.cos(a) * radius, y, Math.sin(a) * radius], [Math.cos(b) * radius, y, Math.sin(b) * radius], hot]);
  }
}

function cylinder(segments: Segment[], radius: number, y0: number, y1: number, sides: number, rings: number, hot = false): void {
  for (let r = 0; r <= rings; r++) ring(segments, radius, y0 + ((y1 - y0) * r) / rings, sides, hot);
  for (let i = 0; i < sides; i += 2) {
    const a = (i / sides) * TAU;
    segments.push([[Math.cos(a) * radius, y0, Math.sin(a) * radius], [Math.cos(a) * radius, y1, Math.sin(a) * radius], hot]);
  }
}

function box(segments: Segment[], w: number, h: number, d: number, hot = false): void {
  const xs = [-w, w];
  const ys = [-h, h];
  const zs = [-d, d];
  for (const y of ys) for (const z of zs) segments.push([[-w, y, z], [w, y, z], hot]);
  for (const x of xs) for (const z of zs) segments.push([[x, -h, z], [x, h, z], hot]);
  for (const x of xs) for (const y of ys) segments.push([[x, y, -d], [x, y, d], hot]);
}

function sphere(segments: Segment[], cx: number, cy: number, cz: number, radius: number, hot: boolean): void {
  for (let lat = 1; lat < 4; lat++) {
    const y = Math.cos((lat / 4) * Math.PI) * radius;
    const r = Math.sin((lat / 4) * Math.PI) * radius;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const b = ((i + 1) / 12) * TAU;
      segments.push([[cx + Math.cos(a) * r, cy + y, cz + Math.sin(a) * r], [cx + Math.cos(b) * r, cy + y, cz + Math.sin(b) * r], hot]);
    }
  }
}

export function build(name: ModelName): Segment[] {
  const s: Segment[] = [];
  switch (name) {
    case "bottle": {
      cylinder(s, 1, -1.4, 0.9, 32, 9);
      cylinder(s, 1.0, -0.6, 0.4, 32, 1, true);
      ring(s, 0.62, 1.15, 28);
      for (let i = 0; i < 28; i += 2) {
        const a = (i / 28) * TAU;
        s.push([[Math.cos(a), 0.9, Math.sin(a)], [Math.cos(a) * 0.62, 1.15, Math.sin(a) * 0.62], false]);
      }
      cylinder(s, 0.72, 1.15, 1.7, 36, 3);
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * TAU;
        s.push([[Math.cos(a) * 0.74, 1.2, Math.sin(a) * 0.74], [Math.cos(a) * 0.74, 1.65, Math.sin(a) * 0.74], false]);
      }
      break;
    }
    case "kit": {
      box(s, 1.5, 1, 0.6);
      box(s, 1.5, 0.12, 0.62, false);
      box(s, 0.18, 0.55, 0.64, true);
      box(s, 0.55, 0.18, 0.64, true);
      box(s, 0.45, 0.12, 0.2);
      for (let i = -3; i <= 3; i++) s.push([[i * 0.4, -1, 0.6], [i * 0.4, -1, -0.6], false]);
      break;
    }
    case "capsule": {
      const sides = 28;
      for (let r = 0; r <= 6; r++) ring(s, 0.7, -1.2 + r * 0.4, sides, r < 3);
      for (let i = 0; i < sides; i += 2) {
        const a = (i / sides) * TAU;
        s.push([[Math.cos(a) * 0.7, -1.2, Math.sin(a) * 0.7], [Math.cos(a) * 0.7, 1.2, Math.sin(a) * 0.7], false]);
      }
      for (let lat = 1; lat <= 5; lat++) {
        const t = (lat / 6) * (Math.PI / 2);
        ring(s, Math.cos(t) * 0.7, 1.2 + Math.sin(t) * 0.7, sides);
        ring(s, Math.cos(t) * 0.7, -1.2 - Math.sin(t) * 0.7, sides, true);
      }
      ring(s, 0.73, 0, sides, true);
      break;
    }
    case "syringe": {
      cylinder(s, 0.42, -1.6, 1.0, 24, 2);
      for (let i = 0; i <= 10; i++) {
        const y = -1.5 + i * 0.22;
        s.push([[0.42, y, 0], [0.42, y, i % 5 === 0 ? 0.3 : 0.16], i % 5 === 0]);
      }
      cylinder(s, 0.36, -0.2, 0.0, 24, 1, true);
      s.push([[0, 0, 0], [0, 1.9, 0], false]);
      s.push([[0.05, 0, 0], [0.05, 1.9, 0], false]);
      ring(s, 0.38, 1.9, 24);
      ring(s, 0.38, 1.98, 24);
      box(s, 0.9, 0.04, 0.22);
      cylinder(s, 0.12, -1.9, -1.6, 10, 1);
      s.push([[0, -1.9, 0], [0, -2.6, 0], true]);
      break;
    }
    case "helix": {
      const steps = 72;
      let last: [Point, Point] | null = null;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const a = t * TAU * 2.2;
        const y = -2 + t * 4;
        const p: Point = [Math.cos(a) * 0.9, y, Math.sin(a) * 0.9];
        const q: Point = [Math.cos(a + Math.PI) * 0.9, y, Math.sin(a + Math.PI) * 0.9];
        if (last) {
          s.push([last[0], p, false]);
          s.push([last[1], q, false]);
        }
        if (i % 3 === 0) s.push([p, q, i % 9 === 0]);
        last = [p, q];
      }
      break;
    }
    case "molecule": {
      const ring6: Point[] = Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * TAU + Math.PI / 6;
        return [Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0] as const;
      });
      ring6.forEach((p, i) => {
        s.push([p, ring6[(i + 1) % 6], false]);
        sphere(s, p[0], p[1], p[2], 0.16, false);
      });
      const top = ring6[1];
      const bottom = ring6[4];
      const o: Point = [top[0], top[1] + 0.75, 0];
      const n: Point = [bottom[0], bottom[1] - 0.75, 0];
      const c: Point = [n[0] + 0.65, n[1] - 0.4, 0];
      const o2: Point = [c[0], c[1] - 0.7, 0];
      const me: Point = [c[0] + 0.65, c[1] + 0.35, 0];
      s.push([top, o, true], [bottom, n, true], [n, c, false], [c, o2, false], [c, me, false]);
      sphere(s, ...o, 0.22, true);
      sphere(s, ...n, 0.2, true);
      sphere(s, ...c, 0.16, false);
      sphere(s, ...o2, 0.22, true);
      sphere(s, ...me, 0.16, false);
      break;
    }
    case "flask": {
      const sides = 28;
      for (let r = 0; r <= 7; r++) {
        const t = r / 7;
        ring(s, 1.3 - t * 0.95, -1.6 + t * 2.0, sides, r === 2);
      }
      for (let i = 0; i < sides; i += 2) {
        const a = (i / sides) * TAU;
        s.push([[Math.cos(a) * 1.3, -1.6, Math.sin(a) * 1.3], [Math.cos(a) * 0.35, 0.4, Math.sin(a) * 0.35], false]);
      }
      cylinder(s, 0.35, 0.4, 1.6, sides, 4);
      ring(s, 0.45, 1.6, sides);
      ring(s, 1.05, -0.9, sides, true);
      ring(s, 0.9, -0.6, sides, true);
      break;
    }
    case "pin": {
      const sides = 24;
      for (let lat = 1; lat < 8; lat++) {
        const phi = (lat / 8) * Math.PI;
        ring(s, Math.sin(phi) * 0.9, 0.9 + Math.cos(phi) * 0.9, sides);
      }
      for (let m = 0; m < 8; m++) {
        const a = (m / 8) * TAU;
        for (let k = 0; k < 12; k++) {
          const p0 = (k / 12) * Math.PI;
          const p1 = ((k + 1) / 12) * Math.PI;
          s.push([[Math.cos(a) * Math.sin(p0) * 0.9, 0.9 + Math.cos(p0) * 0.9, Math.sin(a) * Math.sin(p0) * 0.9], [Math.cos(a) * Math.sin(p1) * 0.9, 0.9 + Math.cos(p1) * 0.9, Math.sin(a) * Math.sin(p1) * 0.9], false]);
        }
      }
      ring(s, 0.35, 0.9, sides, true);
      for (let i = 0; i < sides; i += 2) {
        const a = (i / sides) * TAU;
        s.push([[Math.cos(a) * 0.78, 0.45, Math.sin(a) * 0.78], [0, -1.5, 0], false]);
      }
      ring(s, 0.9, -1.55, 36, true);
      ring(s, 1.4, -1.55, 36, false);
      break;
    }
  }
  return s;
}

const FLOOR_Y = -2.4;

function floor(): Segment[] {
  const s: Segment[] = [];
  for (let i = -4; i <= 4; i++) {
    s.push([[i, FLOOR_Y, -4], [i, FLOOR_Y, 4], false]);
    s.push([[-4, FLOOR_Y, i], [4, FLOOR_Y, i], false]);
  }
  return s;
}

const FLOOR = floor();

export function WireModel({ name, className = "" }: { name: ModelName; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const model = build(name);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let frame = 0;
    let width = 0;
    let height = 0;

    function resize() {
      if (!canvas || !context) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function draw(now: number) {
      if (!context) return;
      const elapsed = still ? 4000 : now - start;
      const reveal = Math.min(1, elapsed / 1600);
      const yaw = 0.6 + elapsed * 0.00022;
      const pitch = 0.28;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const scale = Math.min(width, height) * 0.16;
      const cx = width / 2;
      const cy = height * 0.52;

      const project = ([x, y, z]: Point, spin: boolean): [number, number, number] => {
        const rx = spin ? x * cosY - z * sinY : x * Math.cos(0.6) - z * Math.sin(0.6);
        const rz = spin ? x * sinY + z * cosY : x * Math.sin(0.6) + z * Math.cos(0.6);
        const ry = y * cosP - rz * sinP;
        const depth = y * sinP + rz * cosP + 7;
        const f = 7 / depth;
        return [cx + rx * scale * f, cy - ry * scale * f, depth];
      };

      context.clearRect(0, 0, width, height);
      context.lineWidth = 0.7;
      context.strokeStyle = "rgba(255,255,255,0.1)";
      context.beginPath();
      for (const [a, b] of FLOOR) {
        const [ax, ay] = project(a, false);
        const [bx, by] = project(b, false);
        context.moveTo(ax, ay);
        context.lineTo(bx, by);
      }
      context.stroke();

      const shown = Math.floor(model.length * reveal);
      for (let pass = 0; pass < 2; pass++) {
        const hotPass = pass === 1;
        context.lineWidth = hotPass ? 1.1 : 0.8;
        context.strokeStyle = hotPass ? "rgba(74,168,255,0.95)" : "rgba(235,242,255,0.55)";
        context.beginPath();
        for (let i = 0; i < shown; i++) {
          const [a, b, hot] = model[i];
          if (hot !== hotPass) continue;
          const [ax, ay] = project(a, true);
          const [bx, by] = project(b, true);
          context.moveTo(ax, ay);
          context.lineTo(bx, by);
        }
        context.stroke();
      }
      if (!still) frame = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [name]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`block w-full h-full ${className}`} />;
}

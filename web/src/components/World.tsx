"use client";

import { useEffect, useRef } from "react";
import { build, type ModelName, type Point, type Segment } from "./WireModel";

export const SQUASH_MS = 650;
export const HOLD_MS = 120;
export const OPEN_MS = 950;

export type WorldCallout = { readonly label: string; readonly at: Point; readonly half: readonly [number, number] };
export type WorldModel = { readonly name: ModelName; readonly callouts: readonly WorldCallout[] };

const SPACING = 11;
const FLOOR_Y = -2.4;
const WALL_Z = -9;
const CAMERA_Z = 9.5;
const CAMERA_Y = 0.9;
const ACCENT = "74,168,255";
const LIFE = "61,220,151";

type Line = readonly [Point, Point];

function room(count: number): Line[] {
  const lines: Line[] = [];
  const minX = -SPACING;
  const maxX = (count - 1) * SPACING + SPACING;
  for (let x = Math.floor(minX); x <= maxX; x += 1.5) lines.push([[x, FLOOR_Y, WALL_Z], [x, FLOOR_Y, 6]]);
  for (let z = WALL_Z; z <= 6; z += 1.5) lines.push([[minX, FLOOR_Y, z], [maxX, FLOOR_Y, z]]);
  for (let x = Math.floor(minX); x <= maxX; x += 3) lines.push([[x, FLOOR_Y, WALL_Z], [x, 7, WALL_Z]]);
  for (let y = FLOOR_Y; y <= 7; y += 2.2) lines.push([[minX, y, WALL_Z], [maxX, y, WALL_Z]]);
  return lines;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

export function World({ models, index, onArrive }: { models: readonly WorldModel[]; index: number; onArrive?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const indexRef = useRef(index);
  const arriveRef = useRef(onArrive);

  useEffect(() => {
    arriveRef.current = onArrive;
  }, [onArrive]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const geometry: Segment[][] = models.map((model) => build(model.name));
    const walls = room(models.length);
    const displayFont = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "sans-serif";
    let width = 0;
    let height = 0;
    let frame = 0;
    let shown = indexRef.current;
    let transitionStart = -1;
    let arrivedAt = performance.now();
    let pointerX = 0;
    let pointerY = 0;
    let smoothX = 0;
    let smoothY = 0;

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

    function onPointer(event: PointerEvent) {
      pointerX = event.clientX / window.innerWidth - 0.5;
      pointerY = event.clientY / window.innerHeight - 0.5;
    }

    function draw(now: number) {
      if (!context) return;
      const wanted = indexRef.current;
      if (wanted !== shown && transitionStart < 0) transitionStart = still ? now - SQUASH_MS - HOLD_MS : now;

      let squash = 1;
      let flash = 0;
      if (transitionStart >= 0) {
        const elapsed = now - transitionStart;
        if (elapsed < SQUASH_MS) {
          const t = easeInOut(elapsed / SQUASH_MS);
          squash = 1 - t * 0.985;
          flash = t;
        } else if (elapsed < SQUASH_MS + HOLD_MS) {
          squash = 0.015;
          flash = 1;
          if (shown !== wanted) {
            shown = wanted;
          }
        } else {
          if (shown !== wanted) shown = wanted;
          const t = Math.min(1, (elapsed - SQUASH_MS - HOLD_MS) / OPEN_MS);
          squash = 0.015 + easeOut(t) * 0.985;
          flash = 1 - t;
          if (t >= 1) {
            transitionStart = -1;
            arrivedAt = now;
            arriveRef.current?.();
          }
        }
      }

      smoothX += (pointerX - smoothX) * 0.04;
      smoothY += (pointerY - smoothY) * 0.04;
      const camX = shown * SPACING + smoothX * 0.9;
      const camY = CAMERA_Y - smoothY * 0.5;
      const focal = Math.min(width * 0.9, height) * 0.82;
      const cx = width * (width < 700 ? 0.5 : 0.3);
      const horizon = height * (width < 700 ? 0.5 : 0.53);

      const project = (point: Point): [number, number, number] | null => {
        const x = point[0] - camX;
        const y = point[1] - camY;
        const z = CAMERA_Z - point[2];
        if (z < 0.6) return null;
        const sx = cx + (x * focal) / z;
        const sy = horizon - ((y * focal) / z) * squash;
        return [sx, sy, z];
      };

      context.clearRect(0, 0, width, height);

      context.lineWidth = 0.7;
      context.strokeStyle = `rgba(150,190,255,${0.09 + flash * 0.05})`;
      context.beginPath();
      for (const [a, b] of walls) {
        const pa = project(a);
        const pb = project(b);
        if (!pa || !pb) continue;
        context.moveTo(pa[0], pa[1]);
        context.lineTo(pb[0], pb[1]);
      }
      context.stroke();

      const sinceArrive = now - arrivedAt;
      geometry.forEach((segments, modelIndex) => {
        const isCurrent = modelIndex === shown;
        const distance = Math.abs(modelIndex - shown);
        if (distance > 2) return;
        const spin = now * 0.00018 + modelIndex * 1.3;
        const cosY = Math.cos(spin);
        const sinY = Math.sin(spin);
        const baseX = modelIndex * SPACING;
        const reveal = isCurrent && transitionStart < 0 ? Math.min(1, still ? 1 : sinceArrive / 1100 + 0.35) : 1;
        const count = Math.floor(segments.length * reveal);
        const place = (p: Point): Point => [baseX + p[0] * cosY - p[2] * sinY, p[1], p[0] * sinY + p[2] * cosY];
        for (let pass = 0; pass < 2; pass++) {
          const hot = pass === 1;
          const alpha = isCurrent ? (hot ? 0.95 : 0.6) : 0.16 / distance;
          context.lineWidth = hot ? 1.15 : 0.8;
          context.strokeStyle = hot && isCurrent ? `rgba(${modelIndex % 2 ? LIFE : ACCENT},${alpha})` : `rgba(232,240,255,${alpha})`;
          context.beginPath();
          for (let i = 0; i < count; i++) {
            const [a, b, isHot] = segments[i];
            if (isHot !== hot) continue;
            const pa = project(place(a));
            const pb = project(place(b));
            if (!pa || !pb) continue;
            context.moveTo(pa[0], pa[1]);
            context.lineTo(pb[0], pb[1]);
          }
          context.stroke();
        }
      });

      if (flash > 0.01) {
        context.fillStyle = `rgba(${ACCENT},${flash * 0.9})`;
        context.fillRect(0, horizon - 0.5, width, 1);
        context.fillStyle = `rgba(232,240,255,${flash * 0.5})`;
        context.fillRect(cx - width * 0.25 * flash, horizon - 0.5, width * 0.5 * flash, 1);
      }

      if (transitionStart < 0 && sinceArrive > 300 && width >= 700) {
        const fade = Math.min(1, (sinceArrive - 300) / 500);
        context.font = `500 11px ${displayFont}`;
        for (const callout of models[shown].callouts) {
          const corners = [
            [callout.at[0] - callout.half[0], callout.at[1] + callout.half[1]],
            [callout.at[0] + callout.half[0], callout.at[1] - callout.half[1]],
          ].map(([x, y]) => project([shown * SPACING + x, y, callout.at[2]]));
          const [topLeft, bottomRight] = corners;
          if (!topLeft || !bottomRight) continue;
          const boxW = (bottomRight[0] - topLeft[0]) * fade;
          context.strokeStyle = `rgba(${ACCENT},${0.9 * fade})`;
          context.lineWidth = 1;
          context.strokeRect(topLeft[0], topLeft[1], boxW, bottomRight[1] - topLeft[1]);
          const text = callout.label.toUpperCase();
          const labelW = context.measureText(text).width + 16;
          context.fillStyle = `rgba(${ACCENT},${fade})`;
          context.fillRect(topLeft[0] + boxW + 8, topLeft[1] - 1, labelW * fade, 18);
          if (fade > 0.6) {
            context.fillStyle = "#040912";
            context.fillText(text, topLeft[0] + boxW + 16, topLeft[1] + 12);
          }
        }
      }

      if (!still || transitionStart >= 0) frame = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    frame = requestAnimationFrame(draw);
    const restart = window.setInterval(() => {
      if (still && indexRef.current !== shown) frame = requestAnimationFrame(draw);
    }, 200);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(restart);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [models]);

  return <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />;
}

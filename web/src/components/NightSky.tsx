"use client";

import { useEffect, useRef } from "react";

const STAR_COUNT = 240;

type Star = { x: number; y: number; r: number; phase: number; speed: number };

function makeStars(): Star[] {
  return Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() ** 3 * 1.6 + 0.35,
    phase: Math.random() * Math.PI * 2,
    speed: 0.4 + Math.random() * 1.2,
  }));
}

export function NightSky() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const stars = makeStars();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;

    function resize() {
      if (!canvas || !context) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * ratio;
      canvas.height = window.innerHeight * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function draw(time: number) {
      if (!canvas || !context) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      context.clearRect(0, 0, width, height);
      for (const star of stars) {
        const twinkle = still ? 0.7 : 0.55 + 0.45 * Math.sin(time * 0.001 * star.speed + star.phase);
        context.globalAlpha = twinkle * (0.35 + star.r * 0.4);
        context.fillStyle = star.r > 1.2 ? "#dfe8ff" : "#b9c8ee";
        context.beginPath();
        context.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      if (!still) frame = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="sky" aria-hidden="true" />;
}

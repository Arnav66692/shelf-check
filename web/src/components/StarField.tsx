"use client";

import { useEffect, useRef } from "react";

const COUNT = 260;

export function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stars = Array.from({ length: COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: Math.random() < 0.1 ? 1.6 : 1,
      alpha: 0.15 + Math.random() * 0.5,
      speed: 0.000004 + Math.random() * 0.00001,
      warm: Math.random() < 0.12,
    }));
    let frame = 0;
    let width = 0;
    let height = 0;

    function resize() {
      if (!canvas || !context) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function draw(now: number) {
      if (!context) return;
      context.clearRect(0, 0, width, height);
      for (const star of stars) {
        const y = (star.y - (still ? 0 : now * star.speed)) % 1;
        context.globalAlpha = star.alpha;
        context.fillStyle = star.warm ? "#ffe600" : "#ffffff";
        context.fillRect(star.x * width, (y < 0 ? y + 1 : y) * height, star.size, star.size);
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

  return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 -z-10 pointer-events-none print:hidden" />;
}

"use client";

import { useEffect, useRef } from "react";

/**
 * Site-wide animated background: three depth layers of tinted stars plus a
 * few faint nebula clouds. Scrolling moves each layer at a different rate
 * (parallax). Drawn on one fixed 2D canvas; no library.
 *
 * Respects prefers-reduced-motion (static frame, redrawn on scroll only)
 * and stops animating while the tab is hidden.
 */

const STAR_TINTS = ["150,190,255", "255,200,130", "255,150,130", "185,210,255", "255,235,200", "210,170,255", "255,255,255"];
const NEBULA_TINTS = ["170,80,150", "60,120,190", "210,150,80", "90,70,180"];

interface Star { x: number; y: number; z: number; r: number; a: number; glow: boolean; tw: number; ts: number; c: string }
interface Cloud { x: number; y: number; r: number; c: string; a: number }

export default function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0;
    let stars: Star[] = [];
    let clouds: Cloud[] = [];
    let raf = 0;

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((W * H) / 1500);
      stars = Array.from({ length: n }, () => {
        const d = Math.random();
        const z = d < 0.6 ? 0.25 : d < 0.9 ? 0.55 : 1;
        return {
          x: Math.random() * W,
          y: Math.random() * H * 3,
          z,
          r: z * (0.6 + Math.random()),
          a: Math.min(1, 0.35 + Math.random() * 0.5 * z + 0.3 * z),
          glow: z === 1 && Math.random() < 0.18,
          tw: Math.random() * Math.PI * 2,
          ts: 0.4 + Math.random() * 1.2,
          c: STAR_TINTS[(Math.random() * STAR_TINTS.length) | 0],
        };
      });
      clouds = Array.from({ length: 5 }, (_, j) => ({
        x: Math.random() * W,
        y: Math.random() * H * 3,
        r: Math.max(W, H) * (0.25 + Math.random() * 0.3),
        c: NEBULA_TINTS[j % NEBULA_TINTS.length],
        a: 0.07 + Math.random() * 0.05,
      }));
    };

    const draw = (t: number) => {
      const sy = window.scrollY;
      ctx.clearRect(0, 0, W, H);

      for (const nb of clouds) {
        const span = H * 3;
        let ny = (((nb.y - sy * 0.08) % span) + span) % span;
        if (ny - nb.r > H) ny -= span;
        if (!reduce) nb.x = (nb.x - 0.03 + W + nb.r * 2) % (W + nb.r * 2);
        const nx = nb.x - nb.r * 0.5;
        const g = ctx.createRadialGradient(nx, ny, 0, nx, ny, nb.r);
        g.addColorStop(0, `rgba(${nb.c},${nb.a})`);
        g.addColorStop(1, `rgba(${nb.c},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(nx - nb.r, ny - nb.r, nb.r * 2, nb.r * 2);
      }

      for (const s of stars) {
        if (!reduce) {
          s.x -= 0.19 * s.z;
          if (s.x < -4) s.x += W + 8;
        }
        const span = H * 3;
        const y = (((s.y - sy * s.z * 0.35) % span) + span) % span;
        if (y > H + 4) continue;
        const a = s.a * (reduce ? 1 : 0.75 + 0.25 * Math.sin(t * 0.001 * s.ts + s.tw));
        if (s.glow) {
          ctx.fillStyle = `rgba(${s.c},${a * 0.12})`;
          ctx.beginPath();
          ctx.arc(s.x, y, s.r * 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(${s.c},${a})`;
        ctx.beginPath();
        ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      if (reduce) draw(0);
      else if (!document.hidden) raf = requestAnimationFrame(loop);
    };
    const onResize = () => { build(); if (reduce) draw(0); };
    const onScroll = () => { if (reduce) draw(0); };

    build();
    start();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", start);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", start);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 block h-full w-full" />;
}

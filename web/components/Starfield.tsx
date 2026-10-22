"use client";

import { useEffect, useRef } from "react";

/**
 * Site-wide sky, drawn on one fixed 2D canvas:
 *  - a deep blue-violet gradient and a faint diagonal Milky Way band
 *  - slowly drifting nebula clouds whose hues shift over time
 *  - three depth layers of tinted stars with scroll parallax
 *  - stars near the cursor drift slightly away and brighten softly
 *  - the easter egg: an occasional meteor that can be clicked to "catch" it
 *
 * Respects prefers-reduced-motion (one static frame, redrawn on scroll) and
 * pauses while the tab is hidden. Cursor effects only run with a fine pointer.
 */

const STAR_TINTS = ["150,190,255", "255,200,130", "255,150,130", "185,210,255", "255,235,200", "210,170,255", "255,255,255", "255,255,255"];
const CLOUD_HUES = [275, 190, 330, 220, 300, 170];
const WARM = [255, 228, 195];

// Cursor interaction, deliberately gentle.
const PUSH_RADIUS = 110;
const PUSH_DISTANCE = 7;
const PUSH_BRIGHTEN = 0.6;

const METEOR_MIN_MS = 12_000;
const METEOR_MAX_MS = 22_000;
const FIRST_METEOR_MS = 5_000;
const METEOR_HIT_RADIUS = 60; // px around the head or anywhere along the tail

interface Star {
  x: number; y: number; z: number; r: number; a: number; glow: boolean;
  tw: number; ts: number; rgb: number[];
  ox: number; oy: number; b: number; px: number; py: number;
}
interface Cloud { x: number; y: number; r: number; h: number; a: number; ph: number }
interface Meteor { x: number; y: number; vx: number; vy: number; life: number; max: number; dead: boolean }
interface Burst { x: number; y: number; t: number; p: { x: number; y: number; vx: number; vy: number }[] }
interface Constellation { pts: Star[]; t: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    let W = 0, H = 0;
    let stars: Star[] = [];
    let clouds: Cloud[] = [];
    let band: HTMLCanvasElement | null = null;
    const meteors: Meteor[] = [];
    const bursts: Burst[] = [];
    const constellations: Constellation[] = [];
    const mouse = { x: -9999, y: -9999, sx: -9999, sy: -9999, active: false };
    let raf = 0;
    let last = 0;
    let meteorTimer = 0;

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      stars = Array.from({ length: Math.round((W * H) / 1300) }, () => {
        const d = Math.random();
        const z = d < 0.6 ? 0.25 : d < 0.9 ? 0.55 : 1;
        return {
          x: Math.random() * W, y: Math.random() * H * 3, z,
          r: z * (0.6 + Math.random()),
          a: Math.min(1, 0.4 + Math.random() * 0.5 * z + 0.3 * z),
          glow: z === 1 && Math.random() < 0.2,
          tw: Math.random() * Math.PI * 2, ts: 0.4 + Math.random() * 1.2,
          rgb: STAR_TINTS[(Math.random() * STAR_TINTS.length) | 0].split(",").map(Number),
          ox: 0, oy: 0, b: 0, px: 0, py: 0,
        };
      });

      clouds = CLOUD_HUES.map((h) => ({
        x: Math.random() * W, y: Math.random() * H * 3,
        r: Math.max(W, H) * (0.35 + Math.random() * 0.35),
        h, a: 0.06 + Math.random() * 0.05, ph: Math.random() * Math.PI * 2,
      }));

      // The Milky Way band is static, so render it once to an offscreen canvas.
      band = document.createElement("canvas");
      const bw = Math.ceil(W * 1.6), bh = Math.ceil(H * 1.2);
      band.width = bw;
      band.height = bh;
      const b = band.getContext("2d");
      if (b) {
        b.translate(bw / 2, bh / 2);
        b.rotate(-0.42);
        const g = b.createLinearGradient(0, -bh * 0.22, 0, bh * 0.22);
        g.addColorStop(0, "rgba(120,110,190,0)");
        g.addColorStop(0.5, "rgba(150,135,210,.10)");
        g.addColorStop(1, "rgba(120,110,190,0)");
        b.fillStyle = g;
        b.fillRect(-bw, -bh * 0.22, bw * 2, bh * 0.44);
        for (let k = 0; k < Math.round((W * H) / 120); k++) {
          const gx = (Math.random() - 0.5) * bw * 1.6;
          const gy = ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * bh * 0.5;
          b.fillStyle = `rgba(220,215,255,${0.08 + Math.random() * 0.22})`;
          const s = Math.random() < 0.9 ? 0.8 : 1.4;
          b.fillRect(gx, gy, s, s);
        }
      }
    };

    const drawBackground = (t: number, sy: number) => {
      const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
      g.addColorStop(0, "rgb(11,9,22)");
      g.addColorStop(1, "rgb(7,8,18)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (band) {
        ctx.globalAlpha = 0.85;
        ctx.drawImage(band, -W * 0.3, -H * 0.1 - ((sy * 0.05) % (H * 0.2)));
        ctx.globalAlpha = 1;
      }
      for (const c of clouds) {
        const span = H * 3;
        let ny = (((c.y - sy * 0.08) % span) + span) % span;
        if (ny - c.r > H) ny -= span;
        if (!reduce) c.x = (c.x - 0.04 + W + c.r * 2) % (W + c.r * 2);
        const hue = c.h + Math.sin(t * 0.00006 + c.ph) * 25;
        const nx = c.x - c.r * 0.5;
        const a = c.a * 1.6;
        const gr = ctx.createRadialGradient(nx, ny, 0, nx, ny, c.r);
        gr.addColorStop(0, `hsla(${hue},70%,50%,${a})`);
        gr.addColorStop(0.45, `hsla(${hue + 20},65%,40%,${a * 0.45})`);
        gr.addColorStop(1, `hsla(${hue},60%,30%,0)`);
        ctx.fillStyle = gr;
        ctx.fillRect(nx - c.r, ny - c.r, c.r * 2, c.r * 2);
      }
    };

    const softGlow = (x: number, y: number, radius: number, rgb: string, alpha: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, `rgba(${rgb},${alpha})`);
      g.addColorStop(0.35, `rgba(${rgb},${alpha * 0.35})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };

    const drawStars = (t: number, sy: number) => {
      const cursorOn = mouse.active && fine && !reduce;
      for (const s of stars) {
        if (!reduce) {
          s.x -= 0.19 * s.z;
          if (s.x < -4) s.x += W + 8;
        }
        const span = H * 3;
        const y = (((s.y - sy * s.z * 0.35) % span) + span) % span;
        if (y > H + 20) continue;

        let tx = 0, ty = 0, tb = 0;
        if (cursorOn) {
          const dx = s.x - mouse.sx, dy = y - mouse.sy;
          const d = Math.hypot(dx, dy);
          if (d < PUSH_RADIUS && d > 0.01) {
            const f = 1 - d / PUSH_RADIUS;
            const f2 = f * f * (3 - 2 * f); // smoothstep: no visible edge
            tx = (dx / d) * f2 * PUSH_DISTANCE;
            ty = (dy / d) * f2 * PUSH_DISTANCE;
            tb = f2;
          }
        }
        s.ox = lerp(s.ox, tx, 0.06);
        s.oy = lerp(s.oy, ty, 0.06);
        s.b = lerp(s.b, tb, 0.06);
        const px = s.x + s.ox, py = y + s.oy;
        s.px = px;
        s.py = py;

        const twinkle = reduce ? 1 : 0.75 + 0.25 * Math.sin(t * 0.001 * s.ts + s.tw);
        const a = Math.min(1, s.a * twinkle * (1 + s.b * PUSH_BRIGHTEN));
        const rgb = `${Math.round(lerp(s.rgb[0], WARM[0], s.b * 0.5))},${Math.round(lerp(s.rgb[1], WARM[1], s.b * 0.5))},${Math.round(lerp(s.rgb[2], WARM[2], s.b * 0.5))}`;
        const r = s.r * (1 + s.b * 0.3);

        if (s.glow || s.b > 0.02) {
          const glowStrength = (s.glow ? 0.16 : 0) + s.b * 0.12;
          softGlow(px, py, r * (6 + s.b * 4), rgb, a * glowStrength);
        }
        ctx.fillStyle = `rgba(${rgb},${a})`;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    /* ---------- Meteors (easter egg) ---------- */
    const spawnMeteor = () => {
      const fromLeft = Math.random() < 0.5;
      const sx = fromLeft ? W * (0.05 + Math.random() * 0.4) : W * (0.55 + Math.random() * 0.4);
      const sy0 = H * (0.05 + Math.random() * 0.3);
      const ang = 0.35 + Math.random() * 0.25;
      const sp = Math.max(W, 900) / 2.8; // slow enough to aim at
      meteors.push({ x: sx, y: sy0, vx: (fromLeft ? 1 : -1) * Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0, max: 3.2, dead: false });
    };

    const drawMeteors = (dt: number) => {
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.life += dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.life > m.max || m.dead) {
          meteors.splice(i, 1);
          continue;
        }
        const fade = Math.min(1, m.life / 0.25) * Math.max(0, 1 - (m.life - (m.max - 0.5)) / 0.5);
        const n = Math.hypot(m.vx, m.vy);
        const nx = m.vx / n, ny = m.vy / n, len = 150;
        const g = ctx.createLinearGradient(m.x, m.y, m.x - nx * len, m.y - ny * len);
        g.addColorStop(0, `rgba(255,245,220,${0.95 * fade})`);
        g.addColorStop(1, "rgba(224,190,134,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - nx * len, m.y - ny * len);
        ctx.stroke();
        softGlow(m.x, m.y, 12, "255,235,200", 0.5 * fade);
        ctx.fillStyle = `rgba(255,250,235,${fade})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.t += dt;
        if (b.t > 1.4) {
          bursts.splice(i, 1);
          continue;
        }
        const k = 1 - b.t / 1.4;
        b.p.forEach((p, q) => {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.96;
          p.vy *= 0.96;
          ctx.fillStyle = `rgba(255,${200 + ((q * 7) % 55)},150,${k})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.strokeStyle = `rgba(240,215,170,${0.6 * k})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.t * 140, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (let i = constellations.length - 1; i >= 0; i--) {
        const c = constellations[i];
        c.t += dt;
        if (c.t > 5) {
          constellations.splice(i, 1);
          continue;
        }
        const al = c.t < 1.2 ? c.t / 1.2 : c.t > 3.8 ? (5 - c.t) / 1.2 : 1;
        ctx.strokeStyle = `rgba(240,215,170,${0.55 * al})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        c.pts.forEach((s, e) => (e === 0 ? ctx.moveTo(s.px, s.py) : ctx.lineTo(s.px, s.py)));
        ctx.stroke();
        for (const s of c.pts) softGlow(s.px, s.py, 8, "255,240,210", 0.6 * al);
      }
    };

    /** Distance from a point to the meteor's head-to-tail segment, so the whole streak is clickable. */
    const hitMeteor = (x: number, y: number) =>
      meteors.find((m) => {
        if (m.dead) return false;
        const n = Math.hypot(m.vx, m.vy);
        const tx = m.x - (m.vx / n) * 150, ty = m.y - (m.vy / n) * 150;
        const dx = m.x - tx, dy = m.y - ty;
        const t = Math.max(0, Math.min(1, ((x - tx) * dx + (y - ty) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(x - (tx + dx * t), y - (ty + dy * t)) < METEOR_HIT_RADIUS;
      });

    const catchMeteor = (m: Meteor) => {
      m.dead = true;
      bursts.push({
        x: m.x, y: m.y, t: 0,
        p: Array.from({ length: 46 }, () => {
          const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 220;
          return { x: m.x, y: m.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v };
        }),
      });
      const near = stars.filter((s) => s.z > 0.5 && Math.hypot(s.px - m.x, s.py - m.y) < 260).slice(0, 7);
      near.sort((a, b) => Math.atan2(a.py - m.y, a.px - m.x) - Math.atan2(b.py - m.y, b.px - m.x));
      if (near.length > 2) constellations.push({ pts: near, t: 0 });
    };

    const isUi = (el: EventTarget | null) => el instanceof Element && !!el.closest("a,button,input,label,select,textarea");

    const onPointerDown = (e: PointerEvent) => {
      if (isUi(e.target)) return;
      const m = hitMeteor(e.clientX, e.clientY);
      if (m) catchMeteor(m);
    };
    const onPointerMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (!mouse.active) {
        mouse.sx = mouse.x;
        mouse.sy = mouse.y;
      }
      mouse.active = true;
      document.body.style.cursor = !isUi(e.target) && hitMeteor(e.clientX, e.clientY) ? "pointer" : "";
    };
    const onLeave = () => { mouse.active = false; };

    const scheduleMeteor = () => {
      meteorTimer = window.setTimeout(() => {
        if (!document.hidden) spawnMeteor();
        scheduleMeteor();
      }, METEOR_MIN_MS + Math.random() * (METEOR_MAX_MS - METEOR_MIN_MS));
    };

    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000 || 0);
      last = t;
      mouse.sx = lerp(mouse.sx, mouse.x, 0.15);
      mouse.sy = lerp(mouse.sy, mouse.y, 0.15);
      const sy = window.scrollY;
      drawBackground(t, sy);
      drawStars(t, sy);
      drawMeteors(dt);
      if (!reduce && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) raf = requestAnimationFrame(frame);
    };
    const onResize = () => { build(); if (reduce) frame(0); };
    const onScroll = () => { if (reduce) frame(0); };

    build();
    if (reduce) {
      frame(0);
    } else {
      raf = requestAnimationFrame(frame);
      meteorTimer = window.setTimeout(() => {
        spawnMeteor();
        scheduleMeteor();
      }, FIRST_METEOR_MS);
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(meteorTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 block h-full w-full" />;
}

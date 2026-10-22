"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The landing-page thesis in one animation: three greyscale filter frames
 * take on red, green and blue, slide together so their light adds up, then
 * settle into the true Lupton composite.
 *
 * Driven by a single progress value p in [0, 1]. Frame transforms are written
 * straight to the DOM each animation frame; React only re-renders when the
 * step label changes.
 */

const FRAMES = [
  { key: "i", label: "SDSS i · 763 nm" },
  { key: "r", label: "SDSS r · 623 nm" },
  { key: "g", label: "SDSS g · 477 nm" },
];

const STEPS = [
  { title: "Three exposures", body: "One greyscale frame per filter: SDSS i, r and g." },
  { title: "Assign channels", body: "Longest wavelength to red, shortest to blue." },
  { title: "Align on the sky", body: "Stacked on one grid, so the light adds up." },
  { title: "Stretch into colour", body: "An asinh stretch reveals the true colour balance." },
];

const DURATION = 4600;
const DELAY = 700;
const FINAL_SIZE = 64; // composite width, % of the stage
// The merged frames sum to ~2.4x one grey frame (TINT_OTHER = 0.7 in scripts/make_hero_assets.py), and
// each frame is stretched brighter than the composite, so scale down further to meet it.
const MERGED_OPACITY = 0.28;

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const phaseOf = (p: number) => (p < 0.12 ? 0 : p < 0.36 ? 1 : p < 0.72 ? 2 : 3);

export default function HeroMerge() {
  const frameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const compRef = useRef<HTMLImageElement>(null);
  const stepperRef = useRef<HTMLOListElement>(null);
  const rafRef = useRef(0);
  const [phase, setPhase] = useState(0);

  const render = useCallback((p: number) => {
    const tint = ease(clamp((p - 0.12) / 0.22));
    const conv = ease(clamp((p - 0.36) / 0.34));
    const spread = 1 - conv;
    const size = lerp(30, FINAL_SIZE, conv);
    const fade = ease(clamp((p - 0.6) / 0.36));
    frameRefs.current.forEach((f, i) => {
      if (!f) return;
      const x = (i - 1) * 34 * spread * (100 / size);
      f.style.width = `${size}%`;
      f.style.transform = `translate(-50%, -50%) translateX(${x}%)`;
      // Tinted frames add their light together (plus-lighter). Each carries ~2.2x the
      // light of one channel, so dim them as they converge to keep the sum near grey.
      f.style.opacity = String((1 - fade * 0.9) * lerp(1, MERGED_OPACITY, conv));
      const [grey, tinted, tag] = f.children as unknown as HTMLElement[];
      grey.style.opacity = String(1 - tint);
      tinted.style.opacity = String(tint);
      tag.style.opacity = String(spread);
    });
    if (compRef.current) compRef.current.style.opacity = String(fade);
    stepperRef.current?.style.setProperty("--prog", String(clamp(p / 0.96)));
    setPhase(phaseOf(p));
  }, []);

  const play = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      render(1);
      return;
    }
    let start: number | null = null;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = clamp((ts - start - DELAY) / DURATION);
      render(p);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    render(0);
    rafRef.current = requestAnimationFrame(step);
  }, [render]);

  useEffect(() => {
    play();
    return () => cancelAnimationFrame(rafRef.current);
  }, [play]);

  return (
    <div className="relative mx-auto flex w-full flex-col gap-5 rounded-[18px] border border-rule-hi bg-ink-deep/90 p-5 shadow-[0_30px_100px_rgba(0,0,0,.55),inset_0_1px_0_rgba(255,255,255,.04)] sm:p-6 lg:max-w-[calc((100svh-380px)/0.66+48px)]">
      <button
        type="button"
        onClick={play}
        className="btn btn-ghost btn-sm absolute right-4 top-4 z-10"
      >
        Replay
      </button>
      <figure
        className="relative m-0 aspect-[1/0.66] w-full"
        aria-label="Three greyscale filter exposures of the Whirlpool Galaxy are tinted red, green and blue, aligned, and combined into one colour image"
      >
        {FRAMES.map((f, i) => (
          <div key={f.key} ref={(el) => { frameRefs.current[i] = el; }} className="merge-frame" style={{ width: "30%" }}>
            <img src={`/hero/m51-${f.key}-grey.webp`} alt="" />
            <img src={`/hero/m51-${f.key}-tint.webp`} alt="" style={{ opacity: 0 }} />
            <span className="absolute inset-x-0 top-[calc(100%+10px)] whitespace-nowrap text-center text-[11px] tracking-[0.08em] text-muted sm:text-xs">
              {f.label}
            </span>
          </div>
        ))}
        <img
          ref={compRef}
          src="/hero/m51-composite.webp"
          alt=""
          className="absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded shadow-[0_40px_120px_rgba(0,0,0,.8)]"
          style={{ width: `${FINAL_SIZE}%`, opacity: 0 }}
        />
      </figure>
      <ol ref={stepperRef} className="stepper relative m-0 grid list-none grid-cols-2 gap-4 p-0 px-1 sm:grid-cols-4" aria-label="How the image is built">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className="step relative z-[1] flex min-w-0 flex-col gap-2.5"
            data-state={i === phase ? "on" : i < phase ? "done" : "todo"}
            aria-current={i === phase ? "step" : undefined}
          >
            <span className="step-dot grid h-7 w-7 place-items-center rounded-full border border-rule-hi bg-ink font-display text-base text-muted">
              {i + 1}
            </span>
            <span className="flex flex-col gap-0.5">
              <strong className="step-title text-sm font-semibold text-muted transition-colors">{s.title}</strong>
              <small className="step-body text-[12.5px] leading-snug text-muted opacity-70 transition-opacity">{s.body}</small>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

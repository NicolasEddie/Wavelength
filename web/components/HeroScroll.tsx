"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

/**
 * Scroll-driven hero, in five stages. The section is several screens tall and its stage sticks to the
 * viewport. Scroll position only picks the stage; crossing a threshold plays that whole transition on a
 * timer, so the page never rests half-way between two states (no half-faded text or half-merged frames).
 * Scrolling back up plays the same transitions in reverse.
 *
 *   0  intro headline, frames faint and blurred
 *   1  "Three exposures"      frames sharp, greyscale, side by side
 *   2  "Assign channels"      frames tinted red, green, blue
 *   3  "Align on the sky"     frames slid together and enlarged; their light adds up
 *   4  "Stretch into colour"  the true composite
 *
 * Image styles are written straight to the DOM each animation frame; text switches with CSS transitions.
 */

const FRAMES = [
  { key: "i", label: "SDSS i · 763 nm" },
  { key: "r", label: "SDSS r · 623 nm" },
  { key: "g", label: "SDSS g · 477 nm" },
];

const STEPS = [
  {
    title: "Three exposures",
    body: "One greyscale frame per filter: SDSS i, r and g. A telescope camera only counts light, so each frame has no colour of its own.",
  },
  {
    title: "Assign channels",
    body: "Longest wavelength to red, shortest to blue, so the colours keep the order of the spectrum.",
  },
  {
    title: "Align on the sky",
    body: "Each frame is reprojected onto one grid, so a pixel is the same patch of sky in every channel and the light adds up.",
  },
  {
    title: "Stretch into colour",
    body: "An asinh stretch compresses a core thousands of times brighter than the arms, keeping the true colour balance.",
  },
];

/**
 * Scroll progress (0–1 through the section) at which each stage after the intro begins. Evenly spaced,
 * with the same distance again after the last stage before the page moves on, so every stage takes the
 * same amount of scrolling (about 1.1 screens with the section height below).
 */
const STAGE_AT = [0.2, 0.4, 0.6, 0.8];
/**
 * The images follow the chosen stage on a critically damped spring (no overshoot). Unlike a fixed-length
 * tween, a spring keeps its momentum when the target changes mid-move, so passing through several stages
 * (a fast scroll, or the logo's glide back to the top) plays as one continuous motion instead of a chain
 * of separate steps with a pause between each. Higher = snappier; at 4.2 one step mostly lands in ~1 s.
 */
const SPRING = 4.2;
/** Fastest the images may move, in stages per second, so a long jump never turns into a blur. */
const MAX_SPEED = 4.5;

// The merged frames sum to ~2.4x one grey frame (TINT_OTHER = 0.7 in scripts/make_hero_assets.py), and each
// frame is stretched brighter than the composite, so dim them as they converge.
const MERGED_OPACITY = 0.28;

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Eased 0→1 as v moves from a to b. */
const span = (v: number, a: number, b: number) => smooth(clamp((v - a) / (b - a)));

export default function HeroScroll() {
  const sectionRef = useRef<HTMLElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const frameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const compRef = useRef<HTMLImageElement>(null);
  const capRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cueRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const capsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stage = -1; // stage chosen by scroll
    let v = 0; // where the image animation is now, 0–4 (stage units)
    let to = 0; // stage the images are heading to
    let vel = 0; // stages per second
    let last = 0;
    let anim = 0;
    let scrollRaf = 0;

    /** Draw the images at animation position v (0–4). */
    const draw = () => {
      const section = sectionRef.current;
      if (!section) return;
      const vh = window.innerHeight;
      const W = section.clientWidth;

      // Geometry: three frames span most of the width; the composite ends large and centred.
      const phone = W < 640;
      const s0 = Math.min(W * (phone ? 0.3 : 0.29), vh * 0.6);
      const gap = W * (phone ? 0.02 : 0.025);
      const sF = Math.min(W * (phone ? 0.9 : 0.62), vh * 0.74);
      // Sit a little above centre so the bottom-left captions have room.
      const cy = `${phone ? 38 : 41}%`;

      const sharpen = span(v, 0, 1);
      const tint = span(v, 1, 2);
      const conv = span(v, 2, 3);
      const fade = span(v, 3, 4);
      const size = lerp(s0, sF, conv);

      if (groupRef.current) {
        groupRef.current.style.filter = sharpen < 1 ? `blur(${(1 - sharpen) * 14}px)` : "none";
        groupRef.current.style.opacity = String(lerp(0.22, 1, sharpen));
      }
      if (glowRef.current) {
        // One soft, rounded black field behind all three frames, shrinking to hug the composite.
        const pad = s0 * 0.16;
        const w = lerp(s0 * 3 + gap * 2, sF, conv) + pad * 2;
        const h = lerp(s0 + 30, sF, conv) + pad * 2; // +30: room for the filter labels
        const g = glowRef.current;
        g.style.width = `${w}px`;
        g.style.height = `${h}px`;
        g.style.borderRadius = `${Math.min(w, h) * 0.3}px`;
        g.style.filter = `blur(${Math.round(s0 * 0.14)}px)`;
        g.style.top = cy;
        g.style.transform = "translate(-50%, -50%)";
        g.style.opacity = String(lerp(0.75, 1, sharpen));
      }
      frameRefs.current.forEach((f, i) => {
        if (!f) return;
        const x = (i - 1) * (s0 + gap) * (1 - conv);
        f.style.width = `${size}px`;
        f.style.top = cy;
        f.style.transform = `translate(-50%, -50%) translateX(${x}px)`;
        f.style.opacity = String((1 - fade * 0.92) * lerp(1, MERGED_OPACITY, conv));
        const [grey, tinted, tag] = f.children as unknown as HTMLElement[];
        grey.style.opacity = String(1 - tint);
        tinted.style.opacity = String(tint);
        tag.style.opacity = String(sharpen * (1 - span(v, 2, 2.35)));
      });
      if (compRef.current) {
        compRef.current.style.width = `${sF}px`;
        compRef.current.style.top = cy;
        compRef.current.style.opacity = String(fade);
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const accel = SPRING * SPRING * (to - v) - 2 * SPRING * vel;
      vel = clamp(vel + accel * dt, -MAX_SPEED, MAX_SPEED);
      v = clamp(v + vel * dt, 0, STEPS.length);
      const settled = Math.abs(to - v) < 0.002 && Math.abs(vel) < 0.01;
      if (settled) {
        v = to;
        vel = 0;
      }
      draw();
      anim = settled ? 0 : requestAnimationFrame(tick);
    };

    /** Switch the text immediately (CSS fades it) and play the images to the new stage. */
    const setStage = (next: number) => {
      stage = next;
      introRef.current?.setAttribute("data-on", next === 0 ? "1" : "0");
      cueRef.current?.setAttribute("data-on", next === 0 ? "1" : "0");
      capsRef.current?.setAttribute("data-on", next > 0 ? "1" : "0");
      capRefs.current.forEach((c, i) => c?.setAttribute("data-on", next === i + 1 ? "1" : "0"));
      if (barRef.current) barRef.current.style.transform = `scaleX(${next / STEPS.length})`;

      to = next;
      if (reduced) {
        cancelAnimationFrame(anim);
        anim = 0;
        v = to;
        draw();
        return;
      }
      // Retarget without resetting velocity; start the loop only if it isn't already running.
      if (!anim) {
        last = performance.now();
        anim = requestAnimationFrame(tick);
      }
    };

    const onScroll = () => {
      scrollRaf = 0;
      const section = sectionRef.current;
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const p = clamp(-rect.top / Math.max(1, rect.height - window.innerHeight));
      const next = STAGE_AT.filter((at) => p >= at).length;
      if (next !== stage) setStage(next);
    };
    const schedule = () => {
      if (!scrollRaf) scrollRaf = requestAnimationFrame(onScroll);
    };
    const onResize = () => {
      draw();
      schedule();
    };

    // Start in whatever stage the page loaded at (e.g. after a reload part-way down), without animating.
    onScroll();
    v = to = stage;
    vel = 0;
    cancelAnimationFrame(anim);
    anim = 0;
    draw();

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(anim);
      cancelAnimationFrame(scrollRaf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="hero"
      className="relative h-[665svh]"
      aria-label="How a colour image is built"
    >
      <div className="sticky top-0 h-svh overflow-hidden">
        <div ref={glowRef} className="hero-glow" aria-hidden="true" />

        <div
          ref={groupRef}
          className="absolute inset-0"
          role="img"
          aria-label="Three greyscale filter exposures of the Whirlpool Galaxy are tinted red, green and blue, aligned, and combined into one colour image"
        >
          {FRAMES.map((f, i) => (
            <div
              key={f.key}
              ref={(el) => {
                frameRefs.current[i] = el;
              }}
              className="merge-frame hero-frame"
            >
              <img src={`/hero/m51-${f.key}-grey.webp`} alt="" />
              <img
                src={`/hero/m51-${f.key}-tint.webp`}
                alt=""
                style={{ opacity: 0 }}
              />
              <span className="absolute inset-x-0 top-[calc(100%+12px)] whitespace-nowrap text-center text-[11px] tracking-[0.08em] text-muted sm:text-xs">
                {f.label}
              </span>
            </div>
          ))}
          <img
            ref={compRef}
            src="/hero/m51-composite.webp"
            alt=""
            className="hero-soft absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2"
            style={{ opacity: 0 }}
          />
        </div>

        {/* Intro: the headline, left-aligned on the same edge the step captions take over. */}
        <div
          ref={introRef}
          data-on="1"
          className="hero-swap absolute inset-x-0 bottom-[max(40px,9svh)] z-[2]"
        >
          <div className="container-wide">
            <div className="hero-intro flex max-w-[640px] flex-col items-start gap-6">
              <p className="text-xs uppercase tracking-[0.14em] text-accent">
                Multi-filter astronomical imaging
              </p>
              <h1 className="font-display text-[clamp(44px,4.8vw,88px)] font-normal leading-[1.0] tracking-[-0.01em] [text-wrap:balance]">
                Telescopes see in grey. <em className="text-accent">Colour</em>{" "}
                is assembled.
              </h1>
              <p className="max-w-[32em] text-[clamp(16px,1.1vw,20px)] leading-relaxed text-soft">
                Wavelength rebuilds colour images from real Sloan Digital Sky
                Survey exposures, one filter at a time, then lets you take the
                controls an astronomer would.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/targets/m51" className="btn btn-primary">
                  Explore the galaxies
                </Link>
                <Link href="#how" className="btn btn-ghost">
                  How it works
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div ref={cueRef} data-on="1" className="hero-swap max-sm:hidden absolute inset-x-0 bottom-5 z-[2] flex flex-col items-center gap-1.5 text-xs uppercase tracking-[0.14em] text-muted"
          aria-hidden="true"
        >
          Scroll
          <svg
            className="cue-arrow"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 5l4 4 4-4" />
          </svg>
        </div>

        {/* Step captions, bottom left; each fades in for its part of the scroll. */}
        <div ref={capsRef} data-on="0" className="hero-fade pointer-events-none absolute inset-x-0 bottom-[max(40px,9svh)] z-[2]"
        >
          <div className="container-wide">
            <div className="w-full max-w-[560px]">
              <div className="relative min-h-[190px]">
                {STEPS.map((s, i) => (
                  <div
                    key={s.title}
                    ref={(el) => {
                      capRefs.current[i] = el;
                    }}
                    data-on="0" className="hero-caption hero-swap absolute inset-x-0 bottom-0 flex flex-col gap-3"
                  >
                    <span className="text-xs uppercase tracking-[0.14em] text-accent">
                      Step {i + 1} of {STEPS.length}
                    </span>
                    <h2 className="font-display text-[clamp(38px,3.6vw,64px)] font-normal leading-[1.0] tracking-[-0.01em]">
                      {s.title}
                    </h2>
                    <p className="max-w-[32em] text-[clamp(16px,1.1vw,20px)] leading-relaxed text-soft">
                      {s.body}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 h-px w-full bg-rule-hi">
                <div
                  ref={barRef}
                  className="h-px w-full origin-left bg-accent transition-transform duration-700 ease-out"
                  style={{ transform: "scaleX(0)" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect } from "react";

/**
 * One delegated pointer listener for the hover effects that need the cursor
 * position: the lit border on outlined buttons and the tilt on gallery cards.
 * Nothing renders; the CSS lives in globals.css.
 */
export default function InteractionEffects() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (!fine) return;
    let tilted: HTMLElement | null = null;

    const onMove = (e: PointerEvent) => {
      const target = e.target as Element | null;
      const ghost = target?.closest<HTMLElement>(".btn-ghost");
      if (ghost) {
        const r = ghost.getBoundingClientRect();
        ghost.style.setProperty("--mx", `${e.clientX - r.left}px`);
        ghost.style.setProperty("--my", `${e.clientY - r.top}px`);
      }

      const card = target?.closest<HTMLElement>(".tilt")?.querySelector<HTMLElement>(".tilt-inner") ?? null;
      if (tilted && tilted !== card) tilted.style.transform = "";
      tilted = card;
      if (card) {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        if (!reduce) {
          card.style.transform = `rotateX(${(0.5 - py) * 8}deg) rotateY(${(px - 0.5) * 10}deg) translateY(-4px)`;
        }
      }
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  return null;
}

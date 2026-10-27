"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The Wavelength mark: three filter dots (i, r, g as red, green, blue) sitting on
 * one wave. On hover the wave runs and the dots bob (CSS in globals.css).
 */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg className={`mark ${className}`} viewBox="0 0 50 28" width="50" height="28" aria-hidden="true">
      <defs>
        <linearGradient id="wl-spec" x1="0" y1="0" x2="50" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff8a7a" />
          <stop offset=".5" stopColor="#8fe39a" />
          <stop offset="1" stopColor="#8fb4ff" />
        </linearGradient>
        <clipPath id="wl-clip">
          <rect x="0" y="0" width="50" height="28" />
        </clipPath>
        <radialGradient id="wl-glow">
          <stop offset="0" stopColor="#e0be86" stopOpacity=".45" />
          <stop offset="1" stopColor="#e0be86" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse className="mark-glow" cx="25" cy="14" rx="26" ry="16" fill="url(#wl-glow)" />
      <g clipPath="url(#wl-clip)">
        <g className="wave-track">
          <path
            d="M-2 14 C 4 4, 10 4, 16 14 S 28 24, 34 14 S 46 4, 52 14 S 64 24, 70 14 S 82 4, 88 14"
            fill="none"
            stroke="url(#wl-spec)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </g>
      </g>
      <circle className="mark-dot" cx="7" cy="6.6" r="3.2" fill="#ff8a7a" />
      <circle className="mark-dot" cx="25" cy="21.4" r="3.2" fill="#8fe39a" style={{ animationDelay: "-0.4s" }} />
      <circle className="mark-dot" cx="43" cy="6.6" r="3.2" fill="#8fb4ff" style={{ animationDelay: "-0.8s" }} />
    </svg>
  );
}

/** Mark plus wordmark. `compact` shows the mark alone (viewer header, phones). */
export default function Logo({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  // Already on the home page: glide back to the top instead of reloading. The glide is timed (not the
  // browser's quick smooth-scroll) so the hero has time to play back through each stage.
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== "/" || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (window.location.hash) history.replaceState(null, "", "/");
    const start = window.scrollY;
    if (start <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    const screens = start / window.innerHeight;
    const dur = Math.min(2200, Math.max(700, screens * 280));
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let raf = 0;
    const t0 = performance.now();
    // Any wheel, touch or key input hands control back to the visitor.
    const stop = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("keydown", stop);
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      window.scrollTo({ top: start * (1 - ease(k)), behavior: "instant" });
      if (k < 1) raf = requestAnimationFrame(step);
      else stop();
    };
    raf = requestAnimationFrame(step);
  };
  return (
    <Link href="/" onClick={onClick} className="brand inline-flex items-center gap-3 text-fg no-underline hover:text-fg" aria-label="Wavelength home">
      <Mark />
      <span className={`font-display text-[28px] leading-none ${compact ? "sr-only" : "max-sm:sr-only"}`}>Wavelength</span>
    </Link>
  );
}

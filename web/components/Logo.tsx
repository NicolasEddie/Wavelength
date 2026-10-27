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
  // Already on the home page: glide back to the top (the hero plays back in reverse) instead of reloading.
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== "/" || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    if (window.location.hash) history.replaceState(null, "", "/");
  };
  return (
    <Link href="/" onClick={onClick} className="brand inline-flex items-center gap-3 text-fg no-underline hover:text-fg" aria-label="Wavelength home">
      <Mark />
      <span className={`font-display text-[28px] leading-none ${compact ? "sr-only" : "max-sm:sr-only"}`}>Wavelength</span>
    </Link>
  );
}

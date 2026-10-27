"use client";

import { useEffect, useState } from "react";

/**
 * Keeps the site header pinned to the top of the window. It stays transparent over the hero
 * (or the top of the page) and gains a dark, blurred backing once content scrolls beneath it.
 *
 * `overlay`: the header floats over the content below instead of taking up space (the home hero).
 */
export default function StickyHeader({ overlay = false, children }: { overlay?: boolean; children: React.ReactNode }) {
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const hero = document.getElementById("hero");
      // Over the home hero the header stays clear; it turns solid once the hero has scrolled away.
      setSolid(hero ? hero.getBoundingClientRect().bottom < 90 : window.scrollY > 8);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className={`sticky top-0 z-30 ${overlay ? "h-0" : ""}`}>
      <header className="site-header" data-solid={solid ? "1" : "0"}>
        {children}
      </header>
    </div>
  );
}

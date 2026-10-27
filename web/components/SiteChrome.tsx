import Link from "next/link";
import Logo from "./Logo";
import StickyHeader from "./StickyHeader";

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  return (
    <StickyHeader overlay={overlay}>
      <div className="container-wide flex items-center justify-between gap-4 py-4 sm:py-6">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-x-5 text-sm sm:gap-x-7">
          {/* On phones the sticky header keeps to one row: the in-page links drop out. */}
          <Link href="/#how" className="ulink hidden sm:inline">How it works</Link>
          <Link href="/#targets" className="ulink hidden sm:inline">Targets</Link>
          <Link href="/learn" className="ulink">The science</Link>
          <Link href="/targets/m51" className="btn btn-ghost btn-sm">Open the viewer</Link>
        </nav>
      </div>
    </StickyHeader>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer relative z-10 border-t border-rule">
      <div className="container-wide flex flex-wrap items-center justify-between gap-4 py-10 text-[13px] text-muted">
        <span>
          Imagery: <a className="ulink" href="https://www.sdss.org/" target="_blank" rel="noopener noreferrer">SDSS</a> via{" "}
          <a className="ulink" href="https://skyview.gsfc.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA SkyView</a>, CC-BY.
        </span>
        {/* The easter-egg hint: meteors cross the background every 12–22 seconds and can be clicked. */}
        <span className="font-display text-[15px] italic text-[#5f5c68]">Some things in this sky can be caught.</span>
        <span className="flex gap-5">
          <Link href="/learn#how-this-was-built" className="ulink">How this was built</Link>
          <a href="https://github.com/NicolasEddie/Wavelength" className="ulink" target="_blank" rel="noopener noreferrer">GitHub</a>
        </span>
      </div>
    </footer>
  );
}

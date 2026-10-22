import Link from "next/link";
import Logo from "./Logo";

export function SiteHeader() {
  return (
    <header className="relative z-10">
      <div className="container-wide flex flex-wrap items-center justify-between gap-4 py-6">
        <Logo />
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-7 gap-y-2 text-sm">
          <Link href="/#how" className="ulink">How it works</Link>
          <Link href="/#targets" className="ulink">Targets</Link>
          <Link href="/learn" className="ulink">The science</Link>
          <Link href="/targets/m51" className="btn btn-ghost btn-sm">Open the viewer</Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-rule">
      <div className="container-wide flex flex-wrap items-center justify-between gap-4 py-10 text-[13px] text-muted">
        <span>
          Imagery: <a className="ulink" href="https://www.sdss.org/">SDSS</a> via{" "}
          <a className="ulink" href="https://skyview.gsfc.nasa.gov/">NASA SkyView</a>, CC-BY.
        </span>
        {/* The easter-egg hint: meteors cross the background about once a minute. */}
        <span className="font-display text-[15px] italic text-[#5f5c68]">Some things in this sky can be caught.</span>
        <span className="flex gap-5">
          <Link href="/learn#how-this-was-built" className="ulink">How this was built</Link>
          <a href="https://github.com/NicolasEddie/Wavelength" className="ulink">GitHub</a>
        </span>
      </div>
    </footer>
  );
}

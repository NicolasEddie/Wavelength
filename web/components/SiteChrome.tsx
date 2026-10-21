import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="relative z-10">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-7 sm:px-8">
        <Link href="/" className="font-display text-[28px] leading-none text-fg no-underline">
          Wavelength
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-7 gap-y-2 text-sm">
          <Link href="/#how" className="text-muted transition-colors hover:text-fg">How it works</Link>
          <Link href="/#targets" className="text-muted transition-colors hover:text-fg">Targets</Link>
          <Link href="/learn" className="text-muted transition-colors hover:text-fg">The science</Link>
          <Link
            href="/targets/m51"
            className="rounded-full border border-rule-hi px-4 py-2 text-fg transition-colors hover:border-accent"
          >
            Open the viewer
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-rule">
      <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-4 px-4 py-10 text-[13px] text-muted sm:px-8">
        <span>
          Imagery: <a className="text-muted underline-offset-4 hover:text-fg" href="https://www.sdss.org/">SDSS</a> via{" "}
          <a className="text-muted underline-offset-4 hover:text-fg" href="https://skyview.gsfc.nasa.gov/">NASA SkyView</a>, CC-BY.
        </span>
        <span className="flex gap-4">
          <Link href="/learn#how-this-was-built" className="text-muted hover:text-fg">How this was built</Link>
          <a href="https://github.com/NicolasEddie/Wavelength" className="text-muted hover:text-fg">GitHub</a>
        </span>
      </div>
    </footer>
  );
}

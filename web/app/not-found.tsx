import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="container-wide flex min-h-[70svh] flex-col items-start justify-center gap-6 py-24">
        <p className="text-xs uppercase tracking-[0.14em] text-accent">404 · Nothing at these coordinates</p>
        <h1 className="max-w-[16ch] font-display text-[clamp(40px,4.6vw,80px)] font-normal leading-[1.02] tracking-[-0.01em] [text-wrap:balance]">
          This page is outside the survey area.
        </h1>
        <p className="max-w-[34em] text-[clamp(16px,1.1vw,19px)] leading-relaxed text-soft">
          The link may be mistyped, or the page may have moved. The four galaxies and the science behind them are
          still where you left them.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/" className="btn btn-primary">
            Back to the start
          </Link>
          <Link href="/targets/m51" className="btn btn-ghost">
            Open the viewer
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

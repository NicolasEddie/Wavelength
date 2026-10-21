import Image from "next/image";
import Link from "next/link";
import HeroMerge from "@/components/HeroMerge";
import Reveal from "@/components/Reveal";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { readManifest } from "@/lib/data";
import { TARGETS } from "@/lib/targets";

const PIPELINE = [
  {
    title: "Fetch",
    body: "One greyscale exposure per filter, from NASA SkyView. SDSS i, r and g become red, green and blue, in wavelength order.",
  },
  {
    title: "Align",
    body: "Every frame carries a map from pixels to sky coordinates. All three are reprojected onto one grid, so a pixel is the same patch of sky in every channel.",
  },
  {
    title: "Stretch",
    body: "Galaxy cores are thousands of times brighter than their outskirts. An asinh stretch compresses that range while keeping the true colour balance.",
  },
  {
    title: "Detect",
    body: "An automated pass finds every star and clump that rises above the background noise, the first step a survey takes before anything reaches a catalogue.",
  },
];

export default function Home() {
  const targets = TARGETS.map((t) => {
    const m = readManifest(t.slug);
    return { ...t, sources: m.detection.counts["3.0"], fov: m.fovArcmin };
  });

  return (
    <>
      <div className="flex min-h-svh flex-col">
        <SiteHeader />
        <section className="flex flex-1 flex-col justify-center">
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-4 pb-6 pt-2 sm:px-8 lg:flex-row lg:items-center lg:gap-12">
            <div className="flex max-w-[380px] flex-none flex-col items-start gap-7 lg:w-[380px]">
              <p className="text-xs uppercase tracking-[0.14em] text-accent">Multi-filter astronomical imaging</p>
              <h1 className="font-display text-[clamp(40px,4.4vw,60px)] font-normal leading-[1.02] tracking-[-0.01em]">
                Telescopes see in grey. <em className="text-accent">Colour</em> is assembled.
              </h1>
              <p className="text-[17px] leading-relaxed text-muted">
                Wavelength rebuilds colour images from real Sloan Digital Sky Survey exposures, one filter at a time, then
                lets you take the controls an astronomer would.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/targets/m51"
                  className="inline-flex min-h-11 items-center rounded-full bg-fg px-6 font-medium text-ink transition-colors hover:bg-white"
                >
                  Explore the galaxies
                </Link>
                <Link
                  href="#how"
                  className="inline-flex min-h-11 items-center rounded-full border border-rule-hi px-6 text-fg transition-colors hover:border-accent"
                >
                  How it works
                </Link>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <HeroMerge />
            </div>
          </div>
        </section>
        <a
          href="#about"
          className="mx-auto flex flex-col items-center gap-1.5 pb-5 text-xs uppercase tracking-[0.14em] text-muted no-underline hover:text-fg"
        >
          Scroll
          <svg className="cue-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M3 5l4 4 4-4" />
          </svg>
        </a>
      </div>

      <main>
        <section id="about" className="border-t border-rule">
          <Reveal className="mx-auto flex max-w-[1200px] flex-wrap gap-14 px-4 py-24 sm:px-8">
            <h2 className="flex-[1_1_320px] font-display text-[clamp(34px,4.4vw,48px)] font-normal leading-[1.1]">
              Observatories don&rsquo;t take colour pictures.
            </h2>
            <div className="flex min-w-0 max-w-[36em] flex-[1_1_460px] flex-col gap-5 text-lg leading-relaxed text-soft">
              <p>
                A survey camera records one greyscale frame per filter. Each filter passes a narrow band of wavelengths, so
                each frame measures brightness in one slice of the spectrum.
              </p>
              <p>
                Colour images are built afterwards, by assigning those frames to red, green and blue. Wavelength does that
                assembly on real survey data, in your browser, and shows each step along the way.
              </p>
            </div>
          </Reveal>
        </section>

        <section id="how" className="scroll-mt-4 border-t border-rule">
          <div className="mx-auto max-w-[1200px] px-4 py-24 sm:px-8">
            <Reveal className="flex flex-col gap-3">
              <p className="text-[13px] uppercase tracking-[0.18em] text-accent">How it works</p>
              <h2 className="font-display text-[clamp(34px,4.4vw,48px)] font-normal">Four steps from raw data to one image</h2>
            </Reveal>
            <ol className="mt-12 grid list-none grid-cols-1 gap-8 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {PIPELINE.map((s, i) => (
                <Reveal as="li" key={s.title} delay={i * 90} className="flex flex-col gap-2.5 border-t border-rule-hi pt-5">
                  <span className="font-display text-[40px] leading-none text-accent">0{i + 1}</span>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="text-[15px] leading-relaxed text-muted">{s.body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section id="targets" className="scroll-mt-4 border-t border-rule">
          <div className="mx-auto max-w-[1200px] px-4 py-24 sm:px-8">
            <Reveal className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-display text-[clamp(34px,4.4vw,48px)] font-normal">Four targets</h2>
              <p className="max-w-[28em] text-muted">
                Two face-on spirals, one edge-on, and a globular cluster of several hundred thousand stars.
              </p>
            </Reveal>
            <ul className="mt-10 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {targets.map((t, i) => (
                <Reveal as="li" key={t.slug} delay={i * 90}>
                  <Link href={`/targets/${t.slug}`} className="group flex flex-col gap-3 text-fg no-underline">
                    <Image
                      src={`/hero/thumb-${t.slug}.webp`}
                      alt={`${t.catalogue.split(" · ")[0]}, ${t.name}`}
                      width={480}
                      height={480}
                      sizes="(min-width: 1024px) 270px, (min-width: 640px) 45vw, 100vw"
                      className="aspect-square w-full rounded object-cover transition duration-500 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_24px_60px_rgba(0,0,0,.7)]"
                    />
                    <span className="font-display text-[26px] leading-none">{t.short}</span>
                    <span className="text-[13px] text-muted">
                      {t.catalogue.split(" · ")[0]} · {t.kind} · {t.sources.toLocaleString("en-US")} sources
                    </span>
                  </Link>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-rule">
          <Reveal className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-8 px-4 py-24 sm:px-8">
            <div className="flex-[1_1_480px]">
              <h2 className="font-display text-[clamp(30px,3.6vw,40px)] font-normal">Why aren&rsquo;t these as sharp as Hubble&rsquo;s?</h2>
              <p className="mt-2.5 max-w-[34em] text-[17px] text-muted">
                Filters, atmospheric seeing, stretching, and what counts as a source. The science behind every slider, in
                plain language.
              </p>
            </div>
            <Link
              href="/learn"
              className="inline-flex min-h-11 items-center rounded-full border border-rule-hi px-6 text-fg transition-colors hover:border-accent"
            >
              Read the science
            </Link>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

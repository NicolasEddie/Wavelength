import type { Metadata } from "next";
import Link from "next/link";
import Reveal from "@/components/Reveal";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export const metadata: Metadata = {
  title: "The science",
  description: "How a colour image is built from greyscale telescope exposures: filters, alignment, stretching, seeing and source detection.",
};

const SECTIONS = [
  { id: "filters", label: "Filters and colour" },
  { id: "align", label: "Alignment" },
  { id: "stretch", label: "Stretching" },
  { id: "seeing", label: "Why it looks soft" },
  { id: "detection", label: "Source detection" },
  { id: "how-this-was-built", label: "How this was built" },
];

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <Reveal as="section" id={id} className="scroll-mt-8 border-t border-rule py-16 first:border-t-0 first:pt-0">
      <p className="text-xs uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
      <h2 className="mt-3 font-display text-[clamp(30px,3.6vw,42px)] font-normal leading-[1.1]">{title}</h2>
      <div className="mt-6 flex max-w-[38em] flex-col gap-5 text-[17px] leading-relaxed text-soft">{children}</div>
    </Reveal>
  );
}

function Term({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-fg">{children}</strong>;
}

export default function Learn() {
  return (
    <>
      <SiteHeader />
      <main className="container-wide pb-24 pt-10">
        <div className="flex flex-col gap-4 pb-16">
          <p className="text-xs uppercase tracking-[0.18em] text-accent">The science</p>
          <h1 className="max-w-[14em] font-display text-[clamp(44px,6vw,72px)] font-normal leading-[1.02]">
            What happens between the telescope and the picture
          </h1>
          <p className="max-w-[34em] text-lg text-muted">
            Every image in Wavelength starts as three black-and-white measurements. These are the steps that turn them into
            colour, and what each control in the viewer changes.
          </p>
        </div>

        <div className="flex flex-col gap-12 lg:flex-row lg:gap-20">
          <nav aria-label="On this page" className="lg:sticky lg:top-28 lg:w-56 lg:flex-none lg:self-start">
            <ol className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-sm lg:flex-col lg:gap-3">
              {SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="ulink">
                    <span className="mr-2 font-display text-accent">{i + 1}</span>
                    {s.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0 flex-1">
            <Section id="filters" eyebrow="1 · Filters and colour" title="One filter, one greyscale frame">
              <p>
                A survey camera has no colour sensor. It records how much light arrives at each pixel, through one filter at a
                time. Each filter passes a band of wavelengths, so each exposure is a greyscale map of brightness in one slice
                of the spectrum.
              </p>
              <p>
                The Sloan Digital Sky Survey (SDSS) imaged the sky through five filters, named u, g, r, i and z. Wavelength
                uses three of them: <Term>g</Term> (about 477 nm, blue-green), <Term>r</Term> (about 623 nm, red) and{" "}
                <Term>i</Term> (about 763 nm, at the edge of the near-infrared).
              </p>
              <p>
                To make a colour image, each frame is assigned to a display channel in wavelength order: i to red, r to green
                and g to blue. The result is not exactly what your eye would see, since i is redder than human vision reaches,
                but it keeps the order of the spectrum. Bluer regions, like young star clusters, really are bluer; older,
                cooler stars really are redder.
              </p>
            </Section>

            <Section id="align" eyebrow="2 · Alignment" title="Putting three frames on one grid">
              <p>
                The three exposures are taken separately, so their pixels do not line up exactly. Each file carries a{" "}
                <Term>World Coordinate System</Term> (WCS): a precise mapping from pixel positions to coordinates on the sky.
              </p>
              <p>
                Using those mappings, all three frames are resampled onto one shared grid. After that, a given pixel covers
                the same patch of sky in every channel, so the red, green and blue values at that pixel describe the same
                light. Without this step, stars would show coloured fringes where the channels disagree.
              </p>
            </Section>

            <Section id="stretch" eyebrow="3 · Stretching" title="Fitting a huge range of brightness onto a screen">
              <p>
                The core of a galaxy can be thousands of times brighter than its outer arms. Map that range linearly onto a
                screen and you get a white dot on black. The data has to be compressed, or <Term>stretched</Term>, so faint
                and bright regions are both visible.
              </p>
              <p>
                Wavelength uses the <Term>asinh stretch</Term> from Lupton et al. (2004), the method behind SDSS colour
                images. It behaves linearly for faint light and logarithmically for bright light. Crucially, it computes one
                brightness for each pixel and scales all three channels by the same factor, so a pixel&rsquo;s colour is
                preserved instead of each channel being pushed to maximum contrast on its own.
              </p>
              <dl className="m-0 grid gap-4 rounded-xl border border-rule-hi bg-surface/70 p-6">
                <div>
                  <dt className="font-semibold text-fg">Black point</dt>
                  <dd className="m-0 text-muted">
                    A level subtracted from every pixel first. Raising it darkens the sky background and hides noise, at the
                    cost of the faintest structure.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-fg">Stretch</dt>
                  <dd className="m-0 text-muted">
                    The brightness scale where the curve turns from linear to logarithmic. Lower values brighten faint detail;
                    higher values protect bright regions.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-fg">Softening (Q)</dt>
                  <dd className="m-0 text-muted">
                    How strongly the bright end is compressed. Higher Q tames a glaring core and lifts faint arms relative to
                    it.
                  </dd>
                </div>
              </dl>
              <p>
                When a pixel is so bright that one channel would exceed the maximum, all three channels are scaled down
                together rather than clipped. That keeps the hue of bright cores intact instead of bleaching them white.
              </p>
            </Section>

            <Section id="seeing" eyebrow="4 · Why it looks soft" title="The atmosphere is part of the picture">
              <p>
                These images look softer than Hubble&rsquo;s because SDSS is a ground-based survey. Light from the galaxy
                passes through Earth&rsquo;s turbulent atmosphere before it reaches the telescope, which smears each star into
                a blob roughly 1.7 arcseconds across in this data. Astronomers call this <Term>seeing</Term>. Hubble orbits
                above the atmosphere and resolves detail more than ten times finer.
              </p>
              <p>
                That blur is already in the source data. Wavelength&rsquo;s pipeline was checked at every stage to make sure
                it adds none of its own. The images are resampled to 0.85 arcseconds per pixel for the web, which still
                samples the seeing blur at two pixels across, so no real detail is lost.
              </p>
            </Section>

            <Section id="detection" eyebrow="5 · Source detection" title="Finding every star and clump automatically">
              <p>
                Before anything reaches a catalogue, a survey pipeline has to decide which pixels belong to real objects and
                which are just noise. Wavelength runs the same kind of pass using <Term>image segmentation</Term>:
              </p>
              <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 marker:text-accent">
                <li>Estimate the sky background, which varies across the image, and how noisy it is.</li>
                <li>
                  Keep pixels brighter than the background by some number of standard deviations: the detection threshold,
                  written in sigma (σ).
                </li>
                <li>Group touching pixels into sources, ignoring groups too small to be real.</li>
                <li>Split sources that have merged, such as two overlapping stars, by looking for separate peaks.</li>
              </ol>
              <p>
                It assumes nothing about shape, so it works on round stars and irregular clumps in spiral arms alike. A lower
                threshold finds fainter sources but lets in more noise. At 3σ the four targets yield 349 (M51), 865 (M101),
                152 (M104) and 2,075 (M13) sources. Detection runs on the full-resolution data, so these counts match the
                original pipeline exactly.
              </p>
            </Section>

            <Section id="how-this-was-built" eyebrow="6 · How this was built" title="A Python pipeline, a browser renderer, and an agent">
              <p>
                Wavelength began as a Python and Streamlit app: astropy, reproject and photutils fetch, align, composite and
                analyse the data. This version keeps that pipeline as an offline step and moves the interactive part into
                the browser.
              </p>
              <p>
                The pipeline exports each target&rsquo;s three aligned bands as compact 12-bit files. The viewer downloads
                them once and re-runs the Lupton stretch in JavaScript every time a slider moves, so the controls respond
                instantly with no server round trip. The JavaScript renderer is checked against reference images rendered by
                astropy itself: across twelve test renders, 99.99% of pixels match to within one level out of 255.
              </p>
              <p>
                The redesign was built agentically with Claude, with no code editor opened. I scoped the project through a
                structured interview, compared two visual directions and an interactive motion prototype, then directed the
                implementation, reviewing each deployed result. The decisions, checks and problems found along the way are
                recorded in the{" "}
                <a className="text-accent underline decoration-accent/40 underline-offset-4 transition-colors hover:text-accent-hi hover:decoration-accent" href="https://github.com/NicolasEddie/Wavelength/blob/main/web/BUILD_LOG.md" target="_blank" rel="noopener noreferrer">
                  build log
                </a>
                .
              </p>
              <p>
                Built with Next.js, React, Tailwind CSS and Vercel. Imagery from{" "}
                <a className="text-accent underline decoration-accent/40 underline-offset-4 transition-colors hover:text-accent-hi hover:decoration-accent" href="https://www.sdss.org/" target="_blank" rel="noopener noreferrer">SDSS</a> via{" "}
                <a className="text-accent underline decoration-accent/40 underline-offset-4 transition-colors hover:text-accent-hi hover:decoration-accent" href="https://skyview.gsfc.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA SkyView</a>, used
                under CC-BY and the SDSS Image Use Policy.
              </p>
              <div>
                <Link href="/targets/m51" className="btn btn-primary">
                  Try the viewer
                </Link>
              </div>
            </Section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

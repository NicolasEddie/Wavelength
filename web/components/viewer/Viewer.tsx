"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { decodeBand, renderLupton, type Bands, type Manifest } from "@/lib/lupton";
import type { TargetInfo } from "@/lib/targets";

/**
 * The interactive viewer. Downloads the three linear band files for a target,
 * decodes them once, and re-runs the Lupton stretch on the CPU whenever a
 * slider moves (lib/lupton.ts). The low-resolution preview paints instantly
 * while the bands download.
 *
 * Slider values live in React state for the controls, but each frame is drawn
 * straight to a canvas inside requestAnimationFrame, so renders never block input.
 */

interface Params {
  minimum: number;
  stretch: number;
  q: number;
  sigma: number;
  sources: boolean;
}

const RANGES = {
  minimum: { min: 0, max: 1, step: 0.01 },
  stretch: { min: 0.5, max: 30, step: 0.1 },
  q: { min: 0.5, max: 20, step: 0.1 },
  sigma: { min: 1, max: 10, step: 0.5 },
} as const;

const ACCENT = [224, 190, 134];

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

function defaultsOf(m: Manifest): Params {
  return { minimum: m.defaults.minimum, stretch: m.defaults.stretch, q: m.defaults.q, sigma: m.defaults.nSigma, sources: false };
}

/** Read shareable state from the query string, ignoring anything malformed. */
function paramsFromUrl(m: Manifest): Params {
  const p = defaultsOf(m);
  const s = new URLSearchParams(window.location.search);
  const num = (key: string, r: { min: number; max: number }, fallback: number) => {
    const v = Number.parseFloat(s.get(key) ?? "");
    return Number.isFinite(v) ? clamp(v, r.min, r.max) : fallback;
  };
  p.minimum = num("min", RANGES.minimum, p.minimum);
  p.stretch = num("stretch", RANGES.stretch, p.stretch);
  p.q = num("q", RANGES.q, p.q);
  p.sigma = Math.round(num("sigma", RANGES.sigma, p.sigma) * 2) / 2;
  p.sources = s.get("sources") === "1";
  return p;
}

function urlFromParams(p: Params, d: Params): string {
  const s = new URLSearchParams();
  if (p.minimum !== d.minimum) s.set("min", p.minimum.toFixed(2));
  if (p.stretch !== d.stretch) s.set("stretch", p.stretch.toFixed(1));
  if (p.q !== d.q) s.set("q", p.q.toFixed(1));
  if (p.sigma !== d.sigma) s.set("sigma", p.sigma.toFixed(1));
  if (p.sources) s.set("sources", "1");
  const qs = s.toString();
  return window.location.pathname + (qs ? `?${qs}` : "");
}

type Status = "loading" | "ready" | "error";

export default function Viewer({
  manifest,
  target,
  tabs,
}: {
  manifest: Manifest;
  target: TargetInfo;
  tabs: { slug: string; short: string }[];
}) {
  const base = `/data/${manifest.slug}/`;
  const defaults = defaultsOf(manifest);
  const [params, setParams] = useState<Params>(defaults);
  const [status, setStatus] = useState<Status>("loading");
  const [openInfo, setOpenInfo] = useState<string | null>(null);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const bandsRef = useRef<Bands | null>(null);
  const pixelsRef = useRef<ImageData | null>(null);
  const rafRef = useRef(0);
  const maskCache = useRef(new Map<number, ImageData>());

  // Pick up a shared link's settings once, on the client.
  useEffect(() => {
    setParams(paramsFromUrl(manifest));
  }, [manifest]);

  // Download and decode the three bands.
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    (async () => {
      try {
        const keys = ["R", "G", "B"] as const;
        const bufs = await Promise.all(
          keys.map(async (k) => {
            const res = await fetch(base + manifest.bands[k].file, { signal: ctrl.signal });
            if (!res.ok) throw new Error(`${res.status}`);
            return res.arrayBuffer();
          }),
        );
        if (cancelled) return;
        const [r, g, b] = bufs.map((buf, i) => {
          const band = manifest.bands[keys[i]];
          return decodeBand(buf, band.lo, band.hi, manifest.encoding);
        });
        bandsRef.current = { width: manifest.width, height: manifest.height, r, g, b };
        pixelsRef.current = new ImageData(manifest.width, manifest.height);
        setStatus("ready");
      } catch (e) {
        if (!cancelled && (e as Error).name !== "AbortError") setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [base, manifest]);

  // Re-render the composite whenever the stretch changes.
  useEffect(() => {
    if (status !== "ready") return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const bands = bandsRef.current;
      const img = pixelsRef.current;
      const ctx = canvasRef.current?.getContext("2d");
      if (!bands || !img || !ctx) return;
      renderLupton(bands, params, img.data, true);
      ctx.putImageData(img, 0, 0);
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [status, params]);

  // Detection outlines: the 1-bit mask PNG, recoloured to the accent with alpha from its luminance.
  useEffect(() => {
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    if (!params.sources) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    let cancelled = false;
    const draw = (data: ImageData) => !cancelled && ctx.putImageData(data, 0, 0);
    const cached = maskCache.current.get(params.sigma);
    if (cached) {
      draw(cached);
      return;
    }
    const img = new Image();
    img.src = base + manifest.detection.maskPattern.replace("{sigma}", params.sigma.toFixed(1));
    img.onload = () => {
      const w = manifest.detection.maskWidth;
      const h = manifest.detection.maskHeight;
      const scratch = document.createElement("canvas");
      scratch.width = w;
      scratch.height = h;
      const sctx = scratch.getContext("2d");
      if (!sctx) return;
      sctx.drawImage(img, 0, 0, w, h);
      const data = sctx.getImageData(0, 0, w, h);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const on = px[i];
        px[i] = ACCENT[0];
        px[i + 1] = ACCENT[1];
        px[i + 2] = ACCENT[2];
        px[i + 3] = on;
      }
      maskCache.current.set(params.sigma, data);
      draw(data);
    };
    return () => {
      cancelled = true;
    };
  }, [params.sources, params.sigma, base, manifest]);

  // Keep the address bar in sync so any view can be shared.
  useEffect(() => {
    const t = window.setTimeout(() => {
      window.history.replaceState(null, "", urlFromParams(params, defaults));
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const set = useCallback(<K extends keyof Params>(key: K, value: Params[K]) => {
    setParams((p) => ({ ...p, [key]: value }));
  }, []);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
    window.setTimeout(() => setCopied("idle"), 2200);
  };

  const count = manifest.detection.counts[params.sigma.toFixed(1)] ?? 0;
  const isDefault =
    params.minimum === defaults.minimum &&
    params.stretch === defaults.stretch &&
    params.q === defaults.q &&
    params.sigma === defaults.sigma &&
    !params.sources;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="relative z-10 border-b border-rule bg-ink/80 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
          <Link href="/" className="font-display text-[26px] leading-none text-fg">
            Wavelength
          </Link>
          <nav aria-label="Targets" className="order-3 flex w-full flex-wrap gap-2 md:order-none md:w-auto">
            {tabs.map((t) => {
              const current = t.slug === manifest.slug;
              return (
                <Link
                  key={t.slug}
                  href={`/targets/${t.slug}`}
                  aria-current={current ? "page" : undefined}
                  className={`flex min-h-10 items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm transition-colors ${
                    current ? "bg-raised text-fg ring-1 ring-rule-hi" : "text-muted hover:bg-surface hover:text-fg"
                  }`}
                >
                  <img src={`/hero/thumb-${t.slug}.webp`} alt="" className="h-7 w-7 rounded-full object-cover" />
                  {t.short}
                </Link>
              );
            })}
          </nav>
          <Link href="/learn" className="text-sm text-muted hover:text-fg">
            The science
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col lg:flex-row">
        <figure className="m-0 flex min-w-0 flex-1 flex-col items-center justify-center gap-4 bg-black/60 p-4 sm:p-8">
          <div className="relative aspect-square w-full max-w-[min(780px,calc(100svh-170px))] overflow-hidden rounded-sm bg-black shadow-[0_30px_100px_rgba(0,0,0,.7)]">
            {/* Instant-paint tier. Stored south-up like the bands, so flip it for display. */}
            <img
              src={base + manifest.preview.file}
              alt=""
              className={`absolute inset-0 h-full w-full -scale-y-100 object-cover transition-opacity duration-500 ${
                status === "ready" ? "opacity-0" : "opacity-100 blur-[1px]"
              }`}
            />
            <canvas
              ref={canvasRef}
              width={manifest.width}
              height={manifest.height}
              role="img"
              aria-label={`${target.name} composited in colour from SDSS i, r and g exposures at the current settings`}
              className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${status === "ready" ? "opacity-100" : "opacity-0"}`}
            />
            <canvas
              ref={overlayRef}
              width={manifest.detection.maskWidth}
              height={manifest.detection.maskHeight}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
            {status !== "ready" && (
              <p
                role="status"
                className="absolute bottom-3 left-3 m-0 rounded-full bg-ink/85 px-3 py-1.5 text-xs text-soft ring-1 ring-rule-hi"
              >
                {status === "loading" ? "Loading full-resolution data…" : "Couldn’t load the image data. Reload the page to try again."}
              </p>
            )}
          </div>
          <figcaption className="text-[13px] text-muted">
            {manifest.fovArcmin}′ field · SDSS i, r, g → R, G, B · North up
          </figcaption>
        </figure>

        <aside
          aria-label="Controls"
          className="flex w-full flex-col gap-8 border-t border-rule bg-ink/70 px-5 py-8 backdrop-blur sm:px-9 lg:w-[400px] lg:flex-none lg:border-l lg:border-t-0 lg:py-10"
        >
          <div className="flex flex-col gap-1.5">
            <p className="text-xs uppercase tracking-[0.18em] text-accent">{target.catalogue}</p>
            <h1 className="font-display text-[44px] font-normal leading-[1.05]">{target.name}</h1>
            <p className="text-[15px] leading-relaxed text-muted">{target.blurb}</p>
            <p className="text-[13px] text-muted">
              {target.kind} in {target.constellation}, {target.distance} away.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            <Control
              id="minimum"
              label="Black point"
              value={params.minimum}
              display={params.minimum.toFixed(2)}
              range={RANGES.minimum}
              onChange={(v) => set("minimum", v)}
              open={openInfo === "minimum"}
              onToggle={() => setOpenInfo((o) => (o === "minimum" ? null : "minimum"))}
              info="Subtracted from every pixel before stretching. Raise it to darken the sky background and hide noise; push it too far and the faint outskirts vanish."
            />
            <Control
              id="stretch"
              label="Stretch"
              value={params.stretch}
              display={params.stretch.toFixed(1)}
              range={RANGES.stretch}
              onChange={(v) => set("stretch", v)}
              open={openInfo === "stretch"}
              onToggle={() => setOpenInfo((o) => (o === "stretch" ? null : "stretch"))}
              info="Sets the brightness scale where the curve stops being linear. Lower values brighten faint detail; higher values keep bright regions from saturating."
            />
            <Control
              id="q"
              label="Softening (Q)"
              value={params.q}
              display={params.q.toFixed(1)}
              range={RANGES.q}
              onChange={(v) => set("q", v)}
              open={openInfo === "q"}
              onToggle={() => setOpenInfo((o) => (o === "q" ? null : "q"))}
              info="Controls how hard bright regions are compressed. Raise it to tame a glaring core and bring faint spiral arms up relative to it; lower it for a more linear, contrasty look."
            />
            <Control
              id="sigma"
              label="Detection threshold"
              value={params.sigma}
              display={`${params.sigma.toFixed(1)}σ`}
              range={RANGES.sigma}
              onChange={(v) => set("sigma", v)}
              open={openInfo === "sigma"}
              onToggle={() => setOpenInfo((o) => (o === "sigma" ? null : "sigma"))}
              info="How far above the background noise a pixel must be to count as part of a source, in standard deviations (σ). Lower finds fainter sources but more false ones."
            />

            <label className="flex cursor-pointer items-center justify-between gap-3 border-y border-rule py-3.5">
              <span className="flex flex-col">
                <span className="font-medium">Show detected sources</span>
                <span className="text-[13px] tabular-nums text-muted">
                  {count.toLocaleString("en-US")} sources at {params.sigma.toFixed(1)}σ
                </span>
              </span>
              <input
                type="checkbox"
                checked={params.sources}
                onChange={(e) => set("sources", e.target.checked)}
                className="h-5 w-5 accent-accent"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setParams(defaults)}
              disabled={isDefault}
              className="min-h-11 flex-auto rounded-full border border-rule-hi px-5 text-sm font-medium text-fg transition-colors hover:border-accent disabled:cursor-default disabled:opacity-40 disabled:hover:border-rule-hi"
            >
              Reset to defaults
            </button>
            <button
              type="button"
              onClick={copyLink}
              className="min-h-11 flex-auto rounded-full bg-fg px-5 text-sm font-medium text-ink transition-colors hover:bg-white"
            >
              <span aria-live="polite">
                {copied === "done" ? "Link copied" : copied === "failed" ? "Copy the address bar instead" : "Copy link to this view"}
              </span>
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Control({
  id,
  label,
  value,
  display,
  range,
  onChange,
  info,
  open,
  onToggle,
}: {
  id: string;
  label: string;
  value: number;
  display: string;
  range: { min: number; max: number; step: number };
  onChange: (v: number) => void;
  info: string;
  open: boolean;
  onToggle: () => void;
}) {
  const uid = useId();
  const inputId = `${uid}-${id}`;
  const noteId = `${uid}-${id}-info`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="font-medium">
          {label}
        </label>
        <span className="flex items-center gap-2.5">
          <output htmlFor={inputId} className="tabular-nums text-muted">
            {display}
          </output>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={noteId}
            aria-label={`About ${label.toLowerCase()}`}
            className={`grid h-7 w-7 place-items-center rounded-full border font-display text-[15px] italic transition-colors ${
              open ? "border-accent bg-accent text-ink" : "border-rule-hi text-muted hover:text-fg"
            }`}
          >
            i
          </button>
        </span>
      </div>
      <input
        id={inputId}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-describedby={open ? noteId : undefined}
      />
      <div
        id={noteId}
        hidden={!open}
        className="rounded-lg border border-rule-hi bg-raised px-4 py-3.5 text-sm leading-relaxed text-soft"
      >
        {info}{" "}
        <Link href={`/learn#${id === "sigma" ? "detection" : "stretch"}`} className="text-accent hover:text-accent-hi">
          More in The science
        </Link>
      </div>
    </div>
  );
}

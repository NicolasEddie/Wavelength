# Build log — Wavelength web redesign

The redesign was built agentically: Nico set the goals, constraints and reviewed every
checkpoint; Claude wrote the code, copy and assets. No code editor was opened.

## Session 1 — 21 Oct 2026: scoping, design, first build

### Goal
Turn the Streamlit demo into a polished multi-page site on the target stack (Next.js, React,
Tailwind, Vercel) for a final interview on 27 Oct. UI redesign only, no new pipeline features.

### Scoping (structured "grill me" interview)
- **Timeline:** about five days, a couple of evenings of review time. Scope cut accordingly.
- **Priority:** design and front-end quality over scientific depth; the science stays accurate and brief.
- **Renderer:** CPU (JavaScript) only. The WebGL path and in-browser shader tests in DESIGN.md are deferred.
- **Structure:** `/` landing, `/targets/[slug]` viewer, `/learn` science page. No modals.
- **Viewer scope:** target switching, four sliders with info notes, detection overlay, reset, shareable
  URL state, loading state. Deferred: zoom/pan, source hover, keyboard shortcuts, OG images.
- **AI chat:** out of scope unless everything else finishes with two days to spare.
- **Devices:** desktop-first; landing and science pages responsive; the viewer stacks on phones.

### Design
- Two directions mocked on a design canvas with real data: A "editorial / observatory" (serif display,
  warm gold accent) and B "instrument / technical" (sans + mono readouts, cool accent). **A chosen.**
- Motion explored in an interactive prototype with switchable options, revised three times:
  - Hero: three greyscale filter frames tint to R/G/B, slide together (additive blending), then settle
    into the true composite. Level frames, no rotation. Plays once on load, with a replay button.
  - Numbered step tracker under the image, inside a card; text beside the card on desktop.
  - Starfield across the whole site: tinted stars plus faint drifting nebula clouds, parallax on scroll.
  - Hero fills the first screen; content below rises into view on scroll.

### Build
- Scaffolded Next.js 15 + Tailwind v4 in `web/`, alongside the existing exported data.
- `lib/lupton.ts`: band decoder and Lupton renderer, written once as pure functions.
- `scripts/make_hero_assets.py`: hero frames and gallery thumbnails generated from the exported bands.
- Fonts self-hosted through `@fontsource` (the build sandbox blocks Google Fonts).

### Verification
- `scripts/verify-renderer.mjs` compares the JS renderer to astropy's float reference renders
  (12 renders: M51 and M13, six slider positions each, spanning both extremes).
  **All pass: 99.99th-percentile error ≤ 1 level out of 255.** Render time 18–80 ms in Node.
- `npm run build` clean (lint + types). Screenshots checked at 1440×900 and 390×844 for every page;
  no console errors, no horizontal scrolling.
- Detection outlines confirmed to line up with the composite after the orientation fix below.

### Problems found and fixed
1. **Upside-down web data.** The exported bands are stored south-up (FITS order) while the Streamlit app
   shows north-up. The masks and catalogues were already flipped. Fix: the renderer writes rows in
   reverse, and the preview image is flipped with CSS. No re-export needed.
2. **Renderer precision.** The first lookup table (65,536 entries spaced evenly in brightness) failed
   4 of 12 reference renders, up to 8 levels off at aggressive stretches. The ratio f(I)/I changes
   fastest near zero, where most sky pixels sit. Fix: space the table in √I and interpolate linearly.
   All 12 then matched the exact (no-table) computation.

### Deferred / next
- WebGL renderer (DESIGN.md §4) for larger images and weaker CPUs.
- Zoom and pan, source hover with catalogue values, keyboard shortcuts, per-target OG images.
- `.bin` files may be served uncompressed by Vercel (octet-stream); about 3 MB per target either way.

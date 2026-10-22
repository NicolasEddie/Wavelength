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

### Deployment
- Vercel project `wavelength`, root directory `web/`, Next.js preset. Vercel's GitHub app is limited to this
  one repository. Every push to `redesign` builds a preview; `main` becomes production once merged.
- The sandbox's git proxy can't push to this repo, so commits travel as a git bundle to Nico's machine
  and are pushed from there.

## Session 2 — 21 Oct 2026: checkpoint 2 feedback

### Feedback → decisions (second grill round, then a revised motion prototype)
- **Empty sides on large monitors (1920×1080):** layout now grows to 1600px (`.container-wide`) with fluid
  type; reading widths stay capped.
- **Background too muted:** deep blue-violet gradient, a faint Milky Way band, larger nebulae with slow
  hue drift. Intensity chosen in the prototype (1.0).
- **Logo:** a mark of three filter dots on one wave beside the wordmark; the wave runs on hover. Mark only
  in the viewer header and on phones. Favicon matches.
- **Interactive elements:** gleam sweep on primary buttons, cursor-lit borders on outlined buttons,
  growing link underlines, gallery cards that tilt toward the cursor, restyled sliders, info buttons and
  an on/off switch. One delegated pointer listener (`InteractionEffects`) drives the cursor-position effects.
- **Stars react to the cursor:** tried push-away and a black-hole option. Black hole dropped as too much;
  push-away made gentler (110 px radius, 7 px drift, smoothstep falloff, soft gradient glow instead of a
  hard-edged halo).
- **Easter egg:** a meteor crosses about once a minute; clicking it bursts it and briefly links nearby
  stars into a constellation. No text popup. Faint footer hint.
- **Hero felt "amateurish":** filter frames muted toward grey with a colour cast, and the merged frames
  dimmed to the composite's brightness so the hand-off into colour is gradual rather than a jump.

### Problems found and fixed
- Custom button classes overrode Tailwind utilities (unlayered CSS wins over `@layer utilities`), which
  stretched the Replay button. Moved them into `@layer components`.

## Session 3 — 22 Oct 2026: checkpoint 2, round 2

- **Meteors too rare to demo:** now every 12–22 s (first one 5 s after load), 30% slower, and the whole
  streak is clickable within 60 px rather than just the head.
- **Toolbar warning while dragging sliders:** the Vercel Toolbar (shown only to signed-in team members on
  previews) flags slow interactions. Rendering ran on the main thread, so each slider move blocked the next
  paint. Moved band decoding and rendering into a Web Worker (`lib/render.worker.ts`); the page only paints
  finished frames and coalesces input to the newest value. Main-thread fallback kept for browsers without
  workers. Same `lupton.ts`, so the verification still covers it.
- **Viewer logo:** wordmark restored next to the mark.
- **Gallery cards:** removed the cursor-following highlight ("flashlight"); the tilt and lift remain.

## Session 4 — 22 Oct 2026: viewer on laptop screens

- **Problem:** on a 1366×768 laptop the viewer page was ~1000 px tall, so the bottom was cut off and needed
  scrolling, and the image was capped at 598 px.
- **Fix:** on desktop the viewer is now a one-screen app (`h-svh`, no page scroll). The image stage is a CSS
  size container and the square takes `min(100cqw, 100cqh)`, the largest that fits any window. The caption
  moved onto the image. The sidebar scrolls on its own only as a last resort: the galaxy description folds
  into an "About this galaxy" disclosure on screens under 900 px tall, spacing tightens under 820 px, and the
  two buttons share a row.
- **Checked:** no page scroll and no sidebar overflow at 1024×640, 1280×720, 1366×768, 1536×864 and
  1920×1080; image size up ~12% on laptops (598 → 667 px at 1366×768). Phones unchanged (stacked, scrolls).

## Session 5 — 22 Oct 2026: viewer on phones (directed from a phone)

- **Problem:** on phones the viewer stacked image, description and all four sliders, so changing a setting
  meant scrolling the image out of view.
- **Fix:** below 1024 px the controls move into a dock fixed to the bottom of the screen: a tab row picks one
  setting (Black point, Stretch, Softening, Threshold), one slider with its info note, and the detected-sources
  switch. It hides to an "Adjust image" button. Desktop keeps the full sidebar; both render from one shared
  control list. Target tabs scroll in one row instead of wrapping onto two.
- **Checked:** iPhone 13 viewport, the whole image stays visible above the open dock; desktop unchanged
  (no dock, four sliders, no page scroll at 1366×768).
- Committed in the cloud workspace while Nico's computer was off; pushed once it reconnected.

## Session 6 — 22 Oct 2026 (evening, unattended): zoom, caching, Ask Wavelength

Scoped in a grill round before Nico left; built while he was away; pushed to the `redesign` preview only.

- **Download size:** checked live. Vercel already serves the band files Brotli-compressed (M51 1.0 → 0.75 MB,
  M13 1.4 → 1.1 MB per band), so the old note was wrong. Added a 1-hour cache with background revalidation
  for `/data` and `/hero`, so revisits and target switches don't re-check every file.
- **Zoom and pan** (`components/viewer/useZoomPan.ts`): wheel or trackpad pinch zooms toward the cursor
  (1–8×), drag pans, double-click or double-tap toggles fit ↔ 3×, two-finger pinch on phones, a readout with
  −/+/Fit. Image, preview and source outlines share one transformed layer, so outlines stay aligned. Real
  pixels (no smoothing) from 2× up. The image clamps so no empty edge shows.
- **Ask Wavelength** (`app/api/chat/route.ts`, `components/chat/AskWavelength.tsx`, `lib/chatPrompt.ts`):
  - Claude Haiku 5.5, streamed as plain text; low effort for speed. Key only in Vercel's environment.
  - Context: page, target, slider values, source count and zoom, re-validated on the server against the
    manifests (the browser can't inject arbitrary context).
  - Scope: astronomy and this site; unrelated questions get a one-line redirect. Planetarium-guide voice,
    ~150 words. Site and target facts in the prompt come from the same data the pages use.
  - Cost guards: 500-character questions, last 10 messages, 700-token answers, ~20 questions per visitor
    per hour (in-memory, best-effort), plus the console spend limit.
  - UI: floating button on landing and science pages; an "Ask" header button in the viewer (clear of the
    phone dock); side panel on desktop, slide-up sheet on phones; starter questions per page and target;
    disclosure line; Escape closes. Hidden everywhere when no key is configured.
  - Tested locally against a stand-in answer mode (`CHAT_MOCK=1`, never set on Vercel).

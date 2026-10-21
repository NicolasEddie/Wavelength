# Wavelength — working rules for agents

Wavelength turns real SDSS multi-filter exposures into colour images with automated source detection.
Two halves:

- `src/wavelength/` — the Python pipeline (fetch → align → compose → detect → export_web). Runs offline.
- `web/` — the Next.js site deployed on Vercel. Reads only the static files in `web/public/data/`.

## Constraints

- **The web app never runs Python.** Anything the browser needs is exported ahead of time by
  `python -m wavelength.export_web` and committed under `web/public/data/`.
- **Stack:** Next.js (App Router), React, TypeScript, Tailwind CSS v4, Vercel. No other UI frameworks.
- **Orientation:** band `.bin` files, `preview.webp` and the reference renders are stored in FITS order
  (row 0 = south). Masks and catalogues are already flipped to north-up. Anything displayed must be north-up.
- **The renderer is a contract.** `web/lib/lupton.ts` implements web/DESIGN.md §1 exactly. After any change,
  run `node --experimental-strip-types scripts/verify-renderer.mjs reference` from `web/` with the reference
  renders present; the 99.99th-percentile error must stay ≤ 1 level.
- **Fonts are self-hosted** via `@fontsource` so builds need no network access.
- **Design direction A ("editorial / observatory"):** tokens live in `web/app/globals.css` under `@theme`.
  One gold accent, neutral greys, the images supply the colour. Respect `prefers-reduced-motion`.
- **Scope for the redesign:** UI only, no new pipeline features. Deferred: WebGL renderer, zoom/pan,
  source hover, keyboard shortcuts, OG images, AI chat.

## Workflow

- Work on the `redesign` branch; every push gets a Vercel preview.
- Check `npm run build` (includes lint and type-check) and screenshot each page at desktop and phone width before pushing.
- Record each session's goal, decisions, checks and problems in `web/BUILD_LOG.md`.

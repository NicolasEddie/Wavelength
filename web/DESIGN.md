# Wavelength web renderer — design

Port of the Streamlit app to a Next.js frontend that performs the Lupton
composite in the browser rather than in Python.

The Streamlit app recomputes the composite server-side on every slider move,
costing a round trip per nudge. This design ships the *linear* band data to the
browser and does the stretch per-pixel there, so the controls are continuous.

The Python pipeline is unchanged and stays the offline data stage:
`fetch → align → compose → detect` still produce `data/processed/*.npz`, and
`export_web.py` turns those into the browser payload. Nothing in the web app
touches Python at runtime, so the Vercel deploy needs no Python toolchain.

**Status:** export stage complete and verified. Frontend built on the `redesign` branch with the CPU renderer (see `BUILD_LOG.md`). WebGL path deferred.

---

## 1. The algorithm

This is the contract. Both the GLSL shader and the JS renderer must produce
this exactly, and both are verified against float reference renders generated
by astropy itself.

Transcribed from `astropy.visualization.lupton_rgb.RGBImageMappingLupton.apply_mappings`
and `LuptonAsinhStretch` in **astropy 8.0.1**. Given bands `r, g, b` in data
units and slider values `minimum`, `stretch`, `Q`:

```
1.  r, g, b  -=  minimum                        per-band vmin
2.  I        =  (r + g + b) / 3
3.  fI       =  asinh(I * Q/stretch) * 0.1/asinh(0.1*Q)
4.  ratio    =  (I <= 0) ? 0 : fI / I
5.  r, g, b  *=  ratio
6.  r, g, b  =  max(r, g, b, 0)                 per channel, lower bound only
7.  m        =  max(r, g, b)
    if m > 1:   r, g, b /= m                    hue-preserving desaturation
8.  output   =  round(rgb * 255)
```

Three things that are easy to get wrong:

- **Step 7 is not a clamp.** When any channel exceeds 1, *all three* are
  divided by the max. A naive `clamp(rgb, 0.0, 1.0)` shifts hue in bright
  cores — exactly where it is most visible.
- **`0.1 / asinh(0.1 * Q)`** is astropy's `frac`-based slope constant, not
  anything from the Lupton paper directly. `frac` is hardcoded to `0.1`.
- **Step 4 is a genuine discontinuity.** Pixels where `I` crosses zero flip
  between black and non-black under any perturbation, including in the float
  path. This is why fidelity is measured as a percentile, never a max.

`Q` is guarded in astropy: below machine epsilon it becomes `0.1`, above `1e10`
it clamps. The app's slider range is 0.5–20, so neither branch is reachable.

**This formula is version-specific.** astropy 6 used `AsinhMapping` with
different structure. `pyproject.toml` pins `astropy>=8.0,<9` for this reason —
unpinning it would make the reference renders disagree with the shader, and the
failure would look like a shader bug.

Also note `make_lupton_rgb(minimum=...)` is deprecated in astropy 8. It still
works via a shim that builds `ManualInterval(vmin=minimum, vmax=None)`.
`export_web.py` uses the `interval=` form directly; `app.py` still uses the
deprecated keyword.

## 2. Wire format

`export_web.py` writes, per target, into `web/public/data/<slug>/`:

| File | Contents |
|---|---|
| `r.bin` `g.bin` `b.bin` | One band each. uint16, little-endian, row-major, no header. |
| `preview.webp` | 384×384 lossless, 8-bit. Instant-paint and weak-hardware tier. |
| `masks/sigma-{s}.png` | 1-bit detection outlines, **native** resolution. |
| `catalog/sigma-{s}.json` | Per-source measurements. Fetched on demand. |
| `manifest.json` | Everything below. |

Plus `web/public/data/index.json`, a target list for the gallery that needs no
per-target fetch.

### Decoding a band

Values are asinh-companded into 12 significant bits held in the **top** of a
uint16. The low 4 bits are always zero — that is what makes otherwise
incompressible noise compress (brotli reaches 54–66% of raw at 12 bits versus
79–89% at 16).

Do not hardcode the bit depth. `manifest.encoding.levels` is the divisor:

```
companded  = stored / levels                      // levels = 65520
normalized = sinh(companded * asinh(soften)) / soften
value      = normalized * (hi - lo) + lo          // per-band lo/hi
```

`soften` is 3000 and is unitless (applied to the band normalized to [0,1]), so
it is the same for every target. `lo`/`hi` are per-band and **required** —
without them the browser cannot recover data units, and the `minimum` slider
operates in data units.

Planar rather than interleaved because it compresses better, downloads in
parallel over HTTP/2, and uploads to three textures from typed-array views with
no CPU de-interleaving.

### Manifest fields

```jsonc
{
  "slug": "m51", "displayName": "...", "object": "M51",
  "width": 706, "height": 706,          // web tier, matches the .bin files
  "nativeWidth": 923, "nativeHeight": 923,  // matches the mask PNGs
  "pixelScaleArcsec": 0.85, "fovArcmin": 10.0,
  "encoding": { "type": "asinh", "soften": 3000.0, "levels": 65520,
                "bits": 12, "dtype": "uint16",
                "byteOrder": "little", "layout": "planar" },
  "bands": { "R": { "file": "r.bin", "survey": "SDSSi",
                    "lo": -0.058, "hi": 119.66, "bytes": 996872 }, ... },
  "preview": { "file": "preview.webp", "side": 384, "bytes": 185754 },
  "defaults": { "minimum": 0.0, "stretch": 5.0, "q": 8.0, "nSigma": 3.0 },
  "detection": { "sigmas": [1.0, 1.5, ... 10.0],
                 "maskPattern": "masks/sigma-{sigma}.png",
                 "catalogPattern": "catalog/sigma-{sigma}.json",
                 "maskWidth": 923, "maskHeight": 923,
                 "counts": { "3.0": 349, ... } }
}
```

`defaults` carries the per-target tuned values from `config.py` — surface
brightness varies enough between targets that one default will not do.

### Catalog entries

```jsonc
{ "i": 1, "u": 0.50867, "v": 0.99864, "area": 11.0, "flux": 3.9768 }
```

`u`/`v` are **normalized display-space** coordinates, origin top-left, so the
frontend needs no knowledge of either resolution. The flip is already applied:
detection runs in FITS orientation (row 0 at the south of the sky) and
`outline_mask` flips to display orientation, so the catalog is flipped to match
or the overlay and the tooltips would disagree.

## 3. Resolution

Bands resample to **0.85″/px**; masks and catalogs stay at native **0.65″/px**.

Bands: SDSS seeing in this data is ~1.7″ FWHM, so native 0.65″/px is ~2.6 px per
FWHM — deliberately oversampled (see the comment in `config.py`). 0.85″/px lands
at 2.0 px/FWHM, Nyquist for blur already present in the data. This discards
oversampling, not detail. Noise is incompressible, so pixel count was the only
remaining lever on payload size.

Detection does **not** resample, because source counts depend on pixel scale
through `npixels`. Detecting on resampled data would silently change the
published numbers. Exported counts at 3σ are 349 / 865 / 152 / 2075, matching
the README table exactly. A side benefit: the masks are higher-resolution than
the bands beneath them, so the one-pixel outlines stay crisp.

Resampling uses `reproject_adaptive` with a Gaussian kernel and
`conserve_flux=False`. Flux conservation is deliberately off — it preserves
surface brightness, keeping pixel values on the same scale as native data so
the tuned `stretch` defaults remain valid. Conserving flux would scale values
by the pixel-area ratio and silently invalidate them.

`boundary_mode="ignore"` is also deliberate. The default `"strict"` returns NaN
wherever the kernel overhangs the input edge — a 2-pixel ring, ~1% of pixels —
which encoded to code 0, decoded to the band minimum, and rendered as a black
frame around every image. `encode_band` now raises on non-finite input rather
than silently encoding it.

## 4. Rendering

**WebGL is an optimization, not a requirement.** The app must work without it.

### GPU path (primary)

Three `R32F` textures, one per band, with a fragment shader implementing §1.

Format choice: WebGL2 core has no 16-bit normalized texture format. `R16UI` is
exact but integer textures **cannot be filtered**, so minification aliases badly
when fitting 918px into a smaller canvas. `R16F` is filterable but has only a
10-bit mantissa, discarding the precision the encoding paid for. `R32F` means
converting uint16 → float32 during upload (one pass, a few ms); the download
stays 2 bytes per sample and the texture is exact, filterable, and mipmappable.
~11 MB of GPU memory per target — evict non-active targets on mobile.

Slider values are **uniforms**, not React state. Changing one is
`gl.uniform1f` + redraw inside `requestAnimationFrame`. React owns the DOM and
the control panel; the canvas is a mutable surface React allocates and then
stays out of. Per-frame work must never enter the React tree.

### CPU path (fallback, and the reference implementation)

Write the stretch **once, in JavaScript**. It is needed anyway as the
verification reference for the shader, so the fallback is nearly free — the
GLSL becomes a transcription of the same eight steps, which also makes the two
trivially diffable.

Key optimization: **`ratio = f(I)/I` depends only on `I`**, not on the
individual channels. Precompute it into a LUT once per slider change and the
per-pixel loop collapses to a few multiplies and a table read, with no `asinh`
per pixel. Measured in V8:

| Resolution | Naive | With LUT | LUT rebuild |
|---|---|---|---|
| 384² preview | 4.9 ms | 2.0 ms (492 fps) | 0.98 ms |
| 918² web tier | 28.0 ms | **11.3 ms (88 fps)** | 0.98 ms |
| 1200² native | 47.8 ms | 19.4 ms (52 fps) | 0.98 ms |

A 65536-entry LUT quantizes `ratio` at ~0.0058 data units, the same order as
the encoding itself — negligible, but it goes through the same verification.

A low-end machine may be 3–5× slower, so render at half resolution while a
slider is dragging and full resolution on release. Optionally run it in a Web
Worker with `OffscreenCanvas`.

### Capability detection

"No GPU" effectively does not exist on anything running a browser. The real
failure is **no usable WebGL context**: driver blocklists, hardware
acceleration disabled, VMs and remote desktop, privacy extensions that block
WebGL for fingerprinting reasons, or a GPU process crash.

- Try for a `webgl2` context; fall back to CPU if null.
- **Also time the first few frames and downgrade if they are bad.** Chrome and
  Edge ship SwiftShader, a software rasterizer that returns a *working* context
  running at a few fps — worse than a clean failure, because it looks broken
  rather than degraded. Measurement is the authority here;
  `WEBGL_debug_renderer_info` is restricted in some browsers and is a hint only.
- **Handle `webglcontextlost`** and switch to CPU at runtime, not only at
  startup. Commonly skipped; the page just goes blank.
- If measurement says the machine is struggling, keep rendering from
  `preview.webp` (2 ms/frame) and skip the full download entirely.

## 5. Verification

Do not eyeball this. `export_web.py` writes float reference renders to
`web/reference/<slug>/` (gitignored, regenerable) at six slider positions
spanning both extremes of the app's ranges plus per-target defaults, alongside
`verification.json` recording measured error.

Assert on a **percentile, not a max** — because of the step-4 discontinuity, a
handful of background pixels flip under any perturbation. Suggested bound:
99.99th percentile error ≤ 1 level.

Current encoding error, worst case across all targets and all slider positions:
**p99.99 = 1.0/255, ≤0.0025% of pixels off by more than one level** (~20 px per
megapixel). Max error 14–17 on isolated single pixels.

Verify in two stages: the JS implementation against the reference PNGs
headlessly, then the shader against the JS implementation in a browser test.

**m13 is the stress case** throughout — largest catalog (2075 sources at 3σ),
worst compression ratio, highest quantization error. Build against m13, not m51.

## 6. Payload

Measured, brotli q11 as Vercel serves:

| Target | Native → web | Bands | Preview | Masks (19) | First paint | Full |
|---|---|---|---|---|---|---|
| m104 | 831² → 635² | 1.32 MB | 168 KB | 71 KB | 168 KB | 1.56 MB |
| m51 | 923² → 706² | 1.74 MB | 181 KB | 122 KB | 181 KB | 2.06 MB |
| m101 | 1200² → 918² | 2.86 MB | 193 KB | 282 KB | 193 KB | 3.35 MB |
| m13 | 1108² → 847² | 2.83 MB | 264 KB | 379 KB | 264 KB | 3.49 MB |

Two-tier load: paint `preview.webp` immediately at the target's default slider
position, stream the bands behind it, swap when ready. Preload masks in the
background once bands land; fetch catalogs only when the source inspector opens
(m13's full set is ~489 KB, the largest single item).

Prefetch the next target's preview on thumbnail hover.

## 7. Frontend plan

Next.js App Router, Tailwind v4, shadcn/ui, deployed on Vercel.

Routes — a multi-page app rather than one Streamlit-style screen:

```
/                    hero + explainer + target gallery
/targets/[slug]      the viewer  (generateStaticParams + generateMetadata)
/method              pipeline writeup
```

Slider state belongs in the query string (`?stretch=5&q=8`) so a view is
shareable. Per-target OG images from the composite.

Interactions Streamlit could not do: pinch/wheel zoom on the composite, hover a
detected source for its catalog row, keyboard shortcuts, smooth target
transitions.

**Sanity was evaluated and dropped.** It was not earning its place for four
paragraphs of prose and four target records. Copy lives as typed constants or
MDX. If it is added later, the only thing that changes is where text comes
from — nothing in this architecture needs to anticipate it.

Animation is deliberately last. The intended hero is the three grayscale filter
frames sliding together and blooming into the color composite — the project's
thesis in one visual, using assets that already exist — plus scroll-triggered
reveals via Motion's `useScroll` / `whileInView`. An ambient animated galaxy
background was considered and rejected: it competes with the astronomical image,
which is the actual subject. Motion only; no three.js needed, which also avoids
a ~600 KB dependency.

## 8. Build order

1. ~~`export_web.py` — band binaries, masks, catalogs, manifests, references~~ **done**
2. Scaffold Next.js + Tailwind + shadcn/ui; deploy a near-empty page to Vercel
   immediately, so the pipeline is green before there is anything to break
3. Manifest loader + band decoder + the JS reference renderer (§4), verified
   against `web/reference/` (§5)
4. WebGL renderer, verified against the JS implementation
5. Controls — sliders, target switching, URL state, detection overlay
6. Polish — hero animation, transitions, loading states, metadata, OG images

Each stage ends with something deployed and working.

## 9. Open items

- **Zoom/pan filtering** — mipmaps for minification; nearest-neighbour when
  zoomed past 1:1 is conventional for astronomical images.
- **`photutils` floor is loose.** Pinned at `>=1.13` but running 3.0.0, and
  `detect.py` documents that `SegmentationImage.outline_segments()` was removed
  in 3.0. Same drift exposure astropy had, in the downgrade direction only.
- **Regenerating assets** is `python -m wavelength.export_web` (~82 s for all
  four targets). `--native` skips resampling. Re-run after any change to
  `config.py`, `detect.py`, or the encoding constants, and commit the result —
  `web/public/data/` is tracked on purpose so Vercel needs no Python.

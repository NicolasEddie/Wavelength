# Wavelength

**Turns real multi-filter telescope data into color astronomical images, with
automated source detection.**

Observatories don't take color pictures — they record one grayscale frame per
filter. Color images are assembled afterwards by mapping those frames onto red,
green, and blue channels. Wavelength does that assembly on real Sloan Digital
Sky Survey data: fetch the filter exposures, align them on a common sky grid,
composite them with an astronomically correct stretch, and optionally run
automated source detection over the result.

## Quick start

```bash
python -m venv .venv
.venv/Scripts/activate          # Windows;  source .venv/bin/activate on Unix
pip install -e .

python -m wavelength.prepare    # fetch + align all targets (one-time, network)
streamlit run app.py
```

`prepare.py` is the only step that touches the network. It caches small arrays to
`data/processed/`; the app reads only those, so it runs offline.

Each stage also has its own CLI: `python -m wavelength.{fetch,align,compose,detect} m51`

## Targets

| Target | Type | Field | Sources (3σ) |
|---|---|---|---|
| M51 — Whirlpool | face-on spiral + companion | 10′ | 349 |
| M101 — Pinwheel | face-on spiral | 13′ | 865 |
| M104 — Sombrero | edge-on spiral | 9′ | 152 |
| M13 — Hercules | globular cluster | 12′ | 2075 |

Framing, band mapping, and default stretch are per-target in
[`config.py`](src/wavelength/config.py) — these objects differ severalfold in
angular size, so one global field of view would crop the large ones and strand
the small ones in empty sky.

## Pipeline

`fetch → align → compose → detect`

- **`fetch`** — one grayscale FITS per filter from NASA SkyView. SDSS *i*/*r*/*g*
  map to R/G/B, so channel order follows wavelength order.
- **`align`** — every FITS carries a World Coordinate System mapping pixels to sky
  position. `reproject_interp` puts all bands on one grid, so a pixel means the
  same patch of sky in every channel.
- **`compose`** — `make_lupton_rgb` (Lupton et al. 2004, as used for SDSS and
  Hubble imagery). Astronomical data spans a huge dynamic range, so a linear
  mapping shows a white dot on black. Lupton stretching scales all three channels
  by one shared factor, preserving true color balance instead of
  contrast-maximising each channel into false color.
- **`detect`** — `photutils` segmentation: estimate a varying sky background,
  threshold at N sigma, group connected pixels, deblend merged sources. It assumes
  nothing about source shape, so it handles stars and irregular galaxy structure
  alike.

`prepare` orchestrates fetch → align and caches the result. Compose and detect are
fast enough to run live in the app.

## Technical notes

**The pipeline adds no blur of its own.** These images look softer than Hubble's
because SDSS is a ground-based survey — its light passes through Earth's
atmosphere before reaching the telescope, and that blur is already present in the
source data. Each stage here was checked against the originals: alignment,
compositing, and display all leave sharpness untouched.

**SkyView quirks.** Requesting several filters in one call fails once images get
large, so each band is fetched separately. SkyView also fails intermittently on
requests that succeed when retried, so `fetch.py` retries with backoff. Coverage
varies by filter — M97 has SDSS *u*, *g*, *r*, and *z* data but no *i* — which is
why the filter mapping is set per target.

## Layout

```
app.py                  Streamlit interface
src/wavelength/
    config.py           targets, framing, band mapping
    fetch.py            SkyView download
    align.py            reprojection onto a common sky grid
    compose.py          RGB compositing and stretch
    detect.py           source detection
    prepare.py          offline orchestration + cache I/O
data/raw/               downloaded FITS (gitignored, regenerable)
data/processed/         cached aligned arrays (committed, ~20 MB)
```

Built with [astropy](https://www.astropy.org/),
[astroquery](https://astroquery.readthedocs.io/),
[reproject](https://reproject.readthedocs.io/),
[photutils](https://photutils.readthedocs.io/), and
[Streamlit](https://streamlit.io/).

## Credits

Imagery via [NASA SkyView](https://skyview.gsfc.nasa.gov/), serving
[SDSS](https://www.sdss.org/) data under a Creative Commons Attribution (CC-BY)
licence, subject to the SDSS Image Use Policy.

MIT licensed — see [LICENSE](LICENSE).

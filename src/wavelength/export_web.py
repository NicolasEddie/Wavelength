"""Export cached pipeline output as browser-renderable web assets.

The Streamlit app recomputes the Lupton composite in Python on every slider
move. The web app instead ships the *linear* band data to the browser and
performs the stretch there, per-pixel, so the controls respond without a
round trip. This module produces that payload.

Three decisions here are load-bearing and non-obvious:

**12 significant bits, asinh-companded, left-aligned in uint16.** The display
stretch has an effective gain of up to ~2.8x at the most aggressive slider
position, which turns a quantization step into visible output levels.
Measured against float reference renders across the slider range, 8-bit
encodings put 6-26% of pixels off by more than one output level -- and
steepening the curve makes it *worse*, because the error is concentrated in
the mid-range rather than the faint end. An asinh companding curve at 12 bits
leaves ~20 pixels per megapixel in error, all of them isolated single pixels
sitting on the `I <= 0` discontinuity that exists in the float path too.

Those 12 bits sit in the top of a uint16 rather than being bit-packed. Noise
is incompressible, so zeroing the low 4 bits is what makes the payload
compress at all: brotli reaches 57-66% of raw at 12 bits versus 79-89% at 16,
cutting ~28% off the transfer for an error rate of two pixels in 100,000. The
wire format stays a plain uint16 array, so the decode is one divide and the
reader needs no bit manipulation.

**Resampled to WEB_PIXEL_SCALE_ARCSEC.** Noise is incompressible (gzip reaches
only 60-84% on this data), so pixel count is the only remaining lever on
payload size. The native 0.65"/px oversamples the ~1.7" atmospheric PSF by
~2.6 px/FWHM; resampling to 0.85"/px lands at 2.0 px/FWHM, which is Nyquist
for the blur already present in the data. That discards oversampling, not
detail. Pass --native to skip it.

**Detection stays at native resolution.** Source counts depend on pixel
scale through `npixels`, so detecting on resampled data would silently change
the published numbers. Masks are therefore exported at native size and
sampled by the frontend in normalized coordinates -- which also keeps the
one-pixel outlines crisper than the bands underneath them.
"""

import argparse
import json
import warnings
from pathlib import Path

import numpy as np
from astropy.visualization import ManualInterval
from astropy.visualization.lupton_rgb import LuptonAsinhStretch, make_lupton_rgb
from astropy.wcs import WCS
from PIL import Image
from reproject import reproject_adaptive

from wavelength.config import TARGETS
from wavelength.detect import detect_sources_in_image, luminance, outline_mask
from wavelength.prepare import load_processed

REPO_ROOT = Path(__file__).resolve().parents[2]
WEB_DATA_DIR = REPO_ROOT / "web" / "public" / "data"
REFERENCE_DIR = REPO_ROOT / "web" / "reference"

CHANNELS = ("R", "G", "B")

# Target sampling for the web tier. See module docstring.
WEB_PIXEL_SCALE_ARCSEC = 0.85

# Companding curve for the encode. Applied to the band normalized to [0, 1],
# so it is unitless and identical for every target -- the per-band `lo`/`hi`
# in the manifest carry the mapping back to data units. The shader inverts it
# with sinh(); 3000 was validated across the full slider range.
ASINH_SOFTEN = 3000.0

# 12 significant bits held in the high end of a uint16 (see module docstring).
# WIRE_MAX, not 65535, is the divisor that recovers the companded value --
# it is published in the manifest so no reader hardcodes a bit depth.
ENCODE_BITS = 12
QUANT_LEVELS = (1 << ENCODE_BITS) - 1
WIRE_SHIFT = 16 - ENCODE_BITS
WIRE_MAX = QUANT_LEVELS << WIRE_SHIFT

# Instant-paint tier, also the fallback render target on machines where
# measurement says the full-resolution path is too slow.
PREVIEW_SIDE = 384

# Matches the app's detection-threshold slider: 1.0 to 10.0 in 0.5 steps.
SIGMA_GRID = [round(1.0 + 0.5 * i, 1) for i in range(19)]

# Slider positions used to generate float reference renders. Spans the two
# extremes of the app's ranges plus the per-target defaults, because the
# encoding error is worst where the stretch gain is highest.
REFERENCE_CASES = [
    {"minimum": 0.0, "stretch": 0.5, "q": 20.0},
    {"minimum": 0.0, "stretch": 1.0, "q": 20.0},
    {"minimum": 0.0, "stretch": 2.0, "q": 8.0},
    {"minimum": 0.0, "stretch": 5.0, "q": 8.0},
    {"minimum": 0.0, "stretch": 30.0, "q": 0.5},
    {"minimum": 0.5, "stretch": 5.0, "q": 8.0},
]


def lupton_rgb(bands, minimum, stretch, q):
    """Render an RGB composite, matching what the Streamlit app produces.

    Uses the `interval=` form rather than the `minimum=` keyword the app
    passes: `minimum=` is deprecated in astropy 8 and routes through a
    back-compat shim that builds exactly this ManualInterval. Going direct
    keeps reference generation working when the shim is removed.
    """
    return make_lupton_rgb(
        bands["R"],
        bands["G"],
        bands["B"],
        interval=ManualInterval(vmin=minimum, vmax=None),
        stretch_object=LuptonAsinhStretch(stretch=stretch, Q=q),
    )


def resampled_grid(wcs: WCS, shape: tuple[int, int]) -> tuple[tuple[int, int], WCS]:
    """Build the output grid for WEB_PIXEL_SCALE_ARCSEC.

    The scale factor is derived from the WCS rather than config's nominal
    0.65, because SkyView returns scales that differ in the fourth decimal
    per target -- deriving it means the output lands on exactly the
    requested pixel scale instead of inheriting that drift.
    """
    ny, nx = shape
    native_scale = abs(wcs.wcs.cdelt[1]) * 3600.0
    factor = native_scale / WEB_PIXEL_SCALE_ARCSEC

    out_wcs = WCS(naxis=2)
    out_wcs.wcs.ctype = list(wcs.wcs.ctype)
    out_wcs.wcs.crval = list(wcs.wcs.crval)
    # Preserve each axis's sign (RA runs backwards) while setting magnitude.
    out_wcs.wcs.cdelt = [
        np.sign(c) * WEB_PIXEL_SCALE_ARCSEC / 3600.0 for c in wcs.wcs.cdelt
    ]
    # Pure scaling about the array origin, in FITS 1-based pixel convention.
    out_wcs.wcs.crpix = [(c - 0.5) * factor + 0.5 for c in wcs.wcs.crpix]

    return (int(round(ny * factor)), int(round(nx * factor))), out_wcs


def resample_bands(bands, wcs, shape):
    """Resample every band onto the web grid, anti-aliased.

    `conserve_flux=False` is deliberate: it preserves surface brightness, so
    pixel values stay on the same scale as the native data and the tuned
    `stretch` defaults in config.py remain correct. Conserving flux would
    scale values by the pixel-area ratio and silently invalidate them.

    reproject_adaptive's Gaussian kernel low-pass filters before sampling.
    A plain interpolation would alias when downsampling, and a Lanczos
    resize would ring around bright stellar cores.

    `boundary_mode="ignore"` renormalizes the kernel over the samples that
    exist instead of the default "strict", which returns NaN wherever the
    kernel overhangs the input edge. Strict produced a 2-pixel NaN ring
    (~1% of pixels) that encoded to code 0 -- decoding to the band minimum
    and rendering as a black frame around every image.
    """
    out_shape, out_wcs = resampled_grid(wcs, shape)
    resampled = {}
    for channel in CHANNELS:
        # Arrays come out of the .npz as big-endian '>f4'; reproject wants
        # native byte order.
        data = np.ascontiguousarray(bands[channel], dtype=np.float64)
        resampled[channel], _footprint = reproject_adaptive(
            (data, wcs),
            output_projection=out_wcs,
            shape_out=out_shape,
            kernel="gaussian",
            conserve_flux=False,
            boundary_mode="ignore",
            return_footprint=True,
        )
    return resampled, out_wcs, out_shape


def encode_band(array: np.ndarray) -> tuple[np.ndarray, float, float]:
    """Compand a linear band to little-endian uint16.

    Returns (quantized, lo, hi). `lo`/`hi` go in the manifest; without them
    the browser cannot recover data units, and the `minimum` slider operates
    in data units.

    Non-finite input is rejected rather than skipped over: NaN survives the
    companding arithmetic and then becomes code 0 in the uint16 cast, which
    decodes to the band minimum and renders as black. Failing here makes a
    resampling regression obvious instead of shipping a corrupted border.
    """
    if not np.isfinite(array).all():
        raise ValueError(
            f"{int((~np.isfinite(array)).sum())} non-finite pixels in band; "
            "refusing to encode (check the resampling boundary mode)"
        )

    lo = float(array.min())
    hi = float(array.max())
    normalized = np.clip((array - lo) / (hi - lo), 0.0, 1.0)
    companded = np.arcsinh(normalized * ASINH_SOFTEN) / np.arcsinh(ASINH_SOFTEN)
    quantized = np.rint(companded * QUANT_LEVELS).astype(np.uint16) << WIRE_SHIFT
    return quantized.astype("<u2"), lo, hi


def decode_band(quantized: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """Invert encode_band. Mirrors what the shader and CPU path must do."""
    companded = quantized.astype(np.float64) / WIRE_MAX
    normalized = np.sinh(companded * np.arcsinh(ASINH_SOFTEN)) / ASINH_SOFTEN
    return normalized * (hi - lo) + lo


def write_preview(bands, path: Path) -> int:
    """Write the instant-paint tier: 8-bit companded RGB, lossless WebP.

    8-bit is fine here precisely because this tier is never stretched
    interactively -- it is shown at the target's default slider position
    while the 16-bit bands download.
    """
    planes = []
    for channel in CHANNELS:
        array = bands[channel]
        lo, hi = float(array.min()), float(array.max())
        normalized = np.clip((array - lo) / (hi - lo), 0.0, 1.0)
        companded = np.arcsinh(normalized * ASINH_SOFTEN) / np.arcsinh(ASINH_SOFTEN)
        plane = Image.fromarray(np.rint(companded * 255).astype(np.uint8))
        planes.append(np.asarray(plane.resize((PREVIEW_SIDE, PREVIEW_SIDE), Image.LANCZOS)))

    image = Image.fromarray(np.stack(planes, axis=-1), "RGB")
    image.save(path, "WEBP", lossless=True, quality=100)
    return path.stat().st_size


def export_detection(target_key, bands, shape, mask_dir, catalog_dir):
    """Export outline masks and source catalogs across the sigma grid.

    Runs on native-resolution bands (see module docstring). Background
    estimation is repeated per sigma because detect.py owns it internally;
    that is the bulk of the runtime here and is build-time only.
    """
    ny, nx = shape
    image = luminance(bands)
    counts = {}

    for sigma in SIGMA_GRID:
        catalog, segment_map = detect_sources_in_image(image, n_sigma=sigma)
        if catalog is None:
            counts[f"{sigma}"] = 0
            continue

        mask = outline_mask(segment_map)
        Image.fromarray((mask * 255).astype(np.uint8)).convert("1").save(
            mask_dir / f"sigma-{sigma}.png", optimize=True
        )

        table = catalog.to_table(
            columns=["label", "x_centroid", "y_centroid", "area", "segment_flux"]
        )
        # Centroids are in FITS orientation (row 0 at the south); outline_mask
        # flips to display orientation, so flip y here too or the catalog and
        # the overlay disagree. Emitted normalized so the frontend needs no
        # knowledge of either resolution.
        sources = [
            {
                "i": int(row["label"]),
                "u": round(float(row["x_centroid"]) / (nx - 1), 5),
                "v": round(1.0 - float(row["y_centroid"]) / (ny - 1), 5),
                "area": round(float(np.asarray(row["area"], dtype=float)), 1),
                "flux": round(float(row["segment_flux"]), 4),
            }
            for row in table
        ]
        (catalog_dir / f"sigma-{sigma}.json").write_text(
            json.dumps(sources, separators=(",", ":")), encoding="utf-8"
        )
        counts[f"{sigma}"] = len(catalog)

    return counts


def export_reference(target_key, bands, decoded, out_dir):
    """Write float reference renders and measure the encoding's fidelity.

    The reference PNGs are what the JS and GLSL implementations get diffed
    against. The measured error is recorded alongside them so a regression in
    the encoding shows up here rather than as a visual surprise later.

    Error is reported as a percentile, not a max: the `I <= 0` branch in the
    Lupton algorithm is a genuine discontinuity, so a handful of background
    pixels flip between black and dim under any perturbation, including in
    the float path.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []

    for case in REFERENCE_CASES:
        reference = lupton_rgb(bands, case["minimum"], case["stretch"], case["q"])
        name = f"min{case['minimum']}_s{case['stretch']}_q{case['q']}"
        Image.fromarray(reference, "RGB").save(out_dir / f"{name}.png", optimize=True)

        roundtrip = lupton_rgb(decoded, case["minimum"], case["stretch"], case["q"])
        delta = np.abs(roundtrip.astype(np.int16) - reference.astype(np.int16))
        results.append(
            {
                **case,
                "file": f"{name}.png",
                "p99_99_error": float(np.percentile(delta, 99.99)),
                "max_error": int(delta.max()),
                "fraction_over_one_level": float((delta > 1).mean()),
            }
        )

    return results


def export_target(target_key: str, native: bool = False) -> dict:
    """Export one target's full web payload. Returns (manifest, verification)."""
    target = TARGETS[target_key]
    bands, wcs = load_processed(target_key)
    native_shape = bands["R"].shape

    if native:
        web_bands = {c: np.asarray(bands[c], dtype=np.float64) for c in CHANNELS}
        web_wcs, web_shape = wcs, native_shape
        pixel_scale = abs(wcs.wcs.cdelt[1]) * 3600.0
    else:
        web_bands, web_wcs, web_shape = resample_bands(bands, wcs, native_shape)
        pixel_scale = WEB_PIXEL_SCALE_ARCSEC

    target_dir = WEB_DATA_DIR / target_key
    mask_dir = target_dir / "masks"
    catalog_dir = target_dir / "catalog"
    for directory in (target_dir, mask_dir, catalog_dir):
        directory.mkdir(parents=True, exist_ok=True)

    # Bands as three planar files: planar gzips better than interleaved
    # (60-84% vs 70-89%), downloads in parallel over HTTP/2, and uploads to
    # three textures from typed-array views with no CPU de-interleaving.
    band_manifest = {}
    decoded = {}
    for channel in CHANNELS:
        quantized, lo, hi = encode_band(web_bands[channel])
        path = target_dir / f"{channel.lower()}.bin"
        path.write_bytes(quantized.tobytes())
        decoded[channel] = decode_band(quantized, lo, hi)
        band_manifest[channel] = {
            "file": f"{channel.lower()}.bin",
            "survey": target["bands"][channel],
            "lo": lo,
            "hi": hi,
            "bytes": path.stat().st_size,
        }

    preview_bytes = write_preview(web_bands, target_dir / "preview.webp")

    counts = export_detection(
        target_key, bands, native_shape, mask_dir, catalog_dir
    )

    verification = export_reference(
        target_key, web_bands, decoded, REFERENCE_DIR / target_key
    )

    manifest = {
        "slug": target_key,
        "displayName": target["display_name"],
        "object": target["object"],
        "width": int(web_shape[1]),
        "height": int(web_shape[0]),
        "pixelScaleArcsec": round(pixel_scale, 4),
        "fovArcmin": target["fov_arcmin"],
        "nativeWidth": int(native_shape[1]),
        "nativeHeight": int(native_shape[0]),
        "encoding": {
            "type": "asinh",
            "soften": ASINH_SOFTEN,
            # Divide the stored uint16 by `levels` to recover the companded
            # value in [0, 1], then invert with sinh. `bits` is informational.
            "levels": WIRE_MAX,
            "bits": ENCODE_BITS,
            "dtype": "uint16",
            "byteOrder": "little",
            "layout": "planar",
        },
        "bands": band_manifest,
        "preview": {"file": "preview.webp", "side": PREVIEW_SIDE, "bytes": preview_bytes},
        "defaults": {
            "minimum": 0.0,
            "stretch": target["stretch"],
            "q": 8.0,
            "nSigma": 3.0,
        },
        "detection": {
            "sigmas": SIGMA_GRID,
            "maskPattern": "masks/sigma-{sigma}.png",
            "catalogPattern": "catalog/sigma-{sigma}.json",
            "maskWidth": int(native_shape[1]),
            "maskHeight": int(native_shape[0]),
            "counts": counts,
        },
    }
    (target_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    (REFERENCE_DIR / target_key / "verification.json").write_text(
        json.dumps(verification, indent=2), encoding="utf-8"
    )

    return manifest, verification


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "targets", nargs="*", default=None, help="target keys (default: all)"
    )
    parser.add_argument(
        "--native",
        action="store_true",
        help=f"skip resampling to {WEB_PIXEL_SCALE_ARCSEC}\"/px and export at full resolution",
    )
    args = parser.parse_args()

    target_keys = args.targets or list(TARGETS)
    for target_key in target_keys:
        if target_key not in TARGETS:
            raise SystemExit(f"Unknown target '{target_key}'. Choices: {list(TARGETS)}")

    index = []
    for target_key in target_keys:
        print(f"Exporting {TARGETS[target_key]['display_name']}...")
        manifest, verification = export_target(target_key, native=args.native)

        band_bytes = sum(b["bytes"] for b in manifest["bands"].values())
        print(
            f"  {manifest['nativeWidth']}x{manifest['nativeHeight']}"
            f" -> {manifest['width']}x{manifest['height']}"
            f" @ {manifest['pixelScaleArcsec']}\"/px"
        )
        print(
            f"  bands {band_bytes / 1e6:.2f} MB"
            f"  preview {manifest['preview']['bytes'] / 1024:.0f} KB"
            f"  sources@3sigma {manifest['detection']['counts'].get('3.0', 0)}"
        )
        worst = max(verification, key=lambda v: v["fraction_over_one_level"])
        print(
            f"  encoding worst case (stretch={worst['stretch']} Q={worst['q']}):"
            f" p99.99 error {worst['p99_99_error']:.1f}/255,"
            f" {worst['fraction_over_one_level'] * 100:.4f}% of pixels >1 level"
        )

        index.append(
            {
                "slug": target_key,
                "displayName": manifest["displayName"],
                "object": manifest["object"],
                "fovArcmin": manifest["fovArcmin"],
                "width": manifest["width"],
                "height": manifest["height"],
                "sourcesAt3Sigma": manifest["detection"]["counts"].get("3.0", 0),
                "preview": f"{target_key}/preview.webp",
            }
        )

    # Only rewrite the index when exporting everything -- a single-target run
    # would otherwise drop the other targets from the gallery.
    if len(target_keys) == len(TARGETS):
        WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
        (WEB_DATA_DIR / "index.json").write_text(
            json.dumps(index, indent=2), encoding="utf-8"
        )
        print(f"\nWrote {WEB_DATA_DIR / 'index.json'} ({len(index)} targets)")


if __name__ == "__main__":
    warnings.filterwarnings("ignore", category=RuntimeWarning)
    main()

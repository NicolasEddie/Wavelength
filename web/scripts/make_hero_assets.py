"""Generate the landing-page hero images from the exported M51 band data.

Writes web/public/hero/: one greyscale frame per filter, the same frame tinted
into its display channel (red/green/blue), and the Lupton composite at the
target's default settings. All are flipped from FITS orientation (row 0 =
south) to north-up for display.

Usage (from the repo root, with the project's Python environment):
    python web/scripts/make_hero_assets.py
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "public" / "data"
DATA = DATA_ROOT / "m51"
OUT = ROOT / "public" / "hero"
SIDE = 640
TINT_OTHER = 0.7  # 0 = pure red/green/blue, 1 = plain grey


def decode(manifest, key, data=DATA):
    band = manifest["bands"][key]
    enc = manifest["encoding"]
    raw = np.fromfile(data / band["file"], "<u2").astype(np.float64)
    raw = raw.reshape(manifest["height"], manifest["width"])
    companded = raw / enc["levels"]
    normalized = np.sinh(companded * np.arcsinh(enc["soften"])) / enc["soften"]
    return normalized * (band["hi"] - band["lo"]) + band["lo"]


def save(array, name, side=SIDE):
    image = Image.fromarray(np.flipud(array)).resize((side, side), Image.LANCZOS)
    image.save(OUT / name, "WEBP", quality=88)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((DATA / "manifest.json").read_text())
    stretch, q = manifest["defaults"]["stretch"], manifest["defaults"]["q"]
    bands = [decode(manifest, k) for k in ("R", "G", "B")]
    slope = 0.1 / np.arcsinh(0.1 * q)

    for index, (band, name) in enumerate(zip(bands, ("i", "r", "g"))):
        # Each frame stretched on its own, so every filter reads clearly as greyscale.
        grey = np.clip(np.arcsinh(np.clip(band, 0, None) * q / stretch) * slope * 4, 0, 1)
        grey8 = (grey * 255).astype(np.uint8)
        save(grey8, f"m51-{name}-grey.webp")
        # Muted tint: the frame's own channel at full strength, the other two at
        # TINT_OTHER, so each frame reads as grey with a clear colour cast.
        weights = np.full(3, TINT_OTHER)
        weights[index] = 1.0
        tinted = (grey8[..., None] * weights).round().astype(np.uint8)
        save(tinted, f"m51-{name}-tint.webp")

    save(lupton(bands, stretch, q), "m51-composite.webp")

    # Gallery thumbnails for every target, at each target's tuned defaults.
    for target in json.loads((DATA_ROOT / "index.json").read_text()):
        data = DATA_ROOT / target["slug"]
        m = json.loads((data / "manifest.json").read_text())
        tb = [decode(m, k, data) for k in ("R", "G", "B")]
        save(lupton(tb, m["defaults"]["stretch"], m["defaults"]["q"]), f"thumb-{m['slug']}.webp", 480)


def lupton(bands, stretch, q):
    """Lupton composite (web/DESIGN.md §1) as uint8 RGB, FITS orientation."""
    slope = 0.1 / np.arcsinh(0.1 * q)
    r, g, b = bands
    intensity = (r + g + b) / 3
    f = np.arcsinh(intensity * q / stretch) * slope
    with np.errstate(divide="ignore", invalid="ignore"):
        ratio = np.where(intensity <= 0, 0, f / intensity)
    rgb = np.clip(np.stack(bands, -1) * ratio[..., None], 0, None)
    peak = rgb.max(-1, keepdims=True)
    rgb = np.where(peak > 1, rgb / np.where(peak > 1, peak, 1), rgb)
    return (rgb * 255).round().astype(np.uint8)


if __name__ == "__main__":
    main()

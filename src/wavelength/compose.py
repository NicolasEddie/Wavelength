"""Stack aligned bands into an RGB composite via joint (Lupton) stretching.

Uses astropy's make_lupton_rgb (Lupton et al. 2004) rather than independent
per-channel normalization: it computes one combined intensity, asinh-
stretches that, then scales all three channels by the same ratio. This
preserves true color balance instead of each channel being contrast-
maximized on its own.
"""

import sys

import numpy as np
from astropy.visualization import make_lupton_rgb

from wavelength.align import load_bands, reproject_to_common
from wavelength.config import TARGETS


def compose_rgb(
    aligned_bands: dict[str, np.ndarray],
    minimum: float = 0.0,
    stretch: float = 5.0,
    q: float = 8.0,
) -> np.ndarray:
    """Combine aligned R/G/B arrays into a single (H, W, 3) uint8 RGB image.

    FITS arrays store row 0 at the south (bottom of the sky), but standard
    raster display (matplotlib, PIL, Streamlit) assumes row 0 is the top of
    the image. Without correcting for that, the composite renders as a
    vertical mirror of the true sky orientation -- which flips the apparent
    chirality of anything asymmetric, like a spiral galaxy's arms. Flipping
    here means every consumer of this array gets a correctly oriented image
    for free.
    """
    rgb = make_lupton_rgb(
        aligned_bands["R"],
        aligned_bands["G"],
        aligned_bands["B"],
        minimum=minimum,
        stretch=stretch,
        Q=q,
    )
    return np.flipud(rgb)


def main() -> None:
    target_key = sys.argv[1] if len(sys.argv) > 1 else "m51"
    if target_key not in TARGETS:
        raise SystemExit(f"Unknown target '{target_key}'. Choices: {list(TARGETS)}")

    bands = load_bands(target_key)
    aligned, _wcs = reproject_to_common(bands)
    rgb = compose_rgb(aligned)

    print(f"Composed {TARGETS[target_key]['display_name']}:")
    print(f"  shape={rgb.shape} dtype={rgb.dtype}")
    for i, channel in enumerate("RGB"):
        chan = rgb[:, :, i]
        print(f"  {channel}: min={chan.min()} max={chan.max()} mean={chan.mean():.1f}")


if __name__ == "__main__":
    main()

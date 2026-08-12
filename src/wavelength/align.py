"""Reproject per-band FITS onto a common WCS grid.

Even when bands already arrive on a shared grid (e.g. same-request SkyView
cutouts), this step still runs -- it's a no-op safety net that becomes
load-bearing the moment a band comes from a source that isn't pre-aligned.
"""

import sys
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from reproject import reproject_interp

from wavelength.config import TARGETS

RAW_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "raw"


def load_bands(target_key: str) -> dict[str, tuple[np.ndarray, fits.Header]]:
    """Load each band's pixel data and header from data/raw/<target>/."""
    target = TARGETS[target_key]
    band_dir = RAW_DATA_DIR / target_key

    bands = {}
    for channel in target["bands"]:
        with fits.open(band_dir / f"{channel}.fits") as hdul:
            bands[channel] = (hdul[0].data, hdul[0].header)
    return bands


def reproject_to_common(
    bands: dict[str, tuple[np.ndarray, fits.Header]],
    reference_channel: str = "R",
) -> tuple[dict[str, np.ndarray], WCS]:
    """Reproject every band onto the reference band's pixel grid.

    Returns a mapping of channel name to a 2D array -- all sharing one
    shape/WCS -- plus that shared reference WCS.
    """
    reference_data, reference_header = bands[reference_channel]
    reference_wcs = WCS(reference_header)
    reference_shape = reference_data.shape

    aligned = {reference_channel: reference_data}
    for channel, (data, header) in bands.items():
        if channel == reference_channel:
            continue
        reprojected, _footprint = reproject_interp(
            (data, WCS(header)),
            output_projection=reference_wcs,
            shape_out=reference_shape,
        )
        aligned[channel] = reprojected

    return aligned, reference_wcs


def main() -> None:
    target_key = sys.argv[1] if len(sys.argv) > 1 else "m51"
    if target_key not in TARGETS:
        raise SystemExit(f"Unknown target '{target_key}'. Choices: {list(TARGETS)}")

    bands = load_bands(target_key)
    aligned, _wcs = reproject_to_common(bands)

    print(f"Aligned {TARGETS[target_key]['display_name']} onto reference grid:")
    for channel, array in aligned.items():
        coverage = 1.0 - np.isnan(array).mean()
        print(f"  {channel}: shape={array.shape} coverage={coverage:.1%}")


if __name__ == "__main__":
    main()

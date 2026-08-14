"""Segmentation-based source detection on the composited luminance image.

Runs on the linear (pre-stretch) aligned bands, not the display-stretched
RGB composite -- asinh stretching distorts pixel statistics in a way that
would bias background/noise estimation.
"""

import sys

import numpy as np
from astropy.stats import SigmaClip
from photutils.background import Background2D, MedianBackground
from photutils.segmentation import SourceCatalog, deblend_sources, detect_sources

from wavelength.align import load_bands, reproject_to_common
from wavelength.config import TARGETS


def luminance(aligned_bands: dict[str, np.ndarray]) -> np.ndarray:
    """Co-add aligned bands into a single image for detection.

    Combining bands raises signal-to-noise for faint sources and gives one
    catalog instead of three redundant per-band ones.
    """
    return aligned_bands["R"] + aligned_bands["G"] + aligned_bands["B"]


def detect_sources_in_image(
    image: np.ndarray,
    box_size: int = 50,
    n_sigma: float = 3.0,
    npixels: int = 10,
):
    """Background-subtract, threshold, detect, and deblend sources.

    Returns (catalog, segment_map), both None if nothing was detected.
    `segment_map` carries the per-source outlines used for the app's
    overlay; `catalog` carries the per-source measurements (position, flux,
    shape).
    """
    bkg = Background2D(
        image,
        box_size=box_size,
        sigma_clip=SigmaClip(sigma=3.0),
        bkg_estimator=MedianBackground(),
    )
    data_sub = image - bkg.background
    threshold = n_sigma * bkg.background_rms

    segment_map = detect_sources(data_sub, threshold, n_pixels=npixels)
    if segment_map is None:
        return None, None

    segment_map = deblend_sources(
        data_sub, segment_map, n_pixels=npixels, n_levels=32, contrast=0.001
    )

    catalog = SourceCatalog(data_sub, segment_map)
    return catalog, segment_map


def outline_mask(segment_map) -> np.ndarray:
    """Trace one-pixel outlines around each detected source.

    Returns a boolean mask in *display* orientation, matching what
    compose_rgb returns, so the two can be overlaid directly. (Detection
    runs on FITS-orientation data, where row 0 is the south of the sky;
    without the flip the outlines land mirrored against the composite.)

    SegmentationImage.outline_segments() was removed in photutils 3.0, so
    this walks the label array directly: a pixel is an outline pixel if it
    belongs to a source and differs from any 4-neighbour.
    """
    labels = segment_map.data
    edges = np.zeros_like(labels, dtype=bool)

    vertical = labels[:-1, :] != labels[1:, :]
    edges[:-1, :] |= vertical
    edges[1:, :] |= vertical

    horizontal = labels[:, :-1] != labels[:, 1:]
    edges[:, :-1] |= horizontal
    edges[:, 1:] |= horizontal

    edges &= labels != 0
    return np.flipud(edges)


def main() -> None:
    target_key = sys.argv[1] if len(sys.argv) > 1 else "m51"
    if target_key not in TARGETS:
        raise SystemExit(f"Unknown target '{target_key}'. Choices: {list(TARGETS)}")

    bands = load_bands(target_key)
    aligned, _wcs = reproject_to_common(bands)
    image = luminance(aligned)

    catalog, segment_map = detect_sources_in_image(image)
    if catalog is None:
        print("No sources detected.")
        return

    table = catalog.to_table(
        columns=["label", "x_centroid", "y_centroid", "area", "segment_flux"]
    )
    print(f"Detected {len(table)} sources in {TARGETS[target_key]['display_name']}:")
    print(table)


if __name__ == "__main__":
    main()

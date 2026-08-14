"""Fetch multi-band FITS cutouts for a target from SkyView (SDSS bands).

SkyView resolves object names server-side and returns each requested
survey already centered on the same coordinates, so this step needs no
manual coordinate lookup. The bands are still on slightly different
pixel grids/scales, though -- that's handled later by align.py.
"""

import sys
import time
from pathlib import Path

from astropy import units as u
from astroquery.skyview import SkyView

from wavelength.config import TARGETS, pixels_for

RAW_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "raw"

MAX_ATTEMPTS = 4
RETRY_BACKOFF_SECONDS = 4


def _get_images_with_retry(**kwargs):
    """Call SkyView.get_images, retrying on its intermittent failures.

    SkyView returns HTTP 404 sporadically for requests that succeed on a
    later identical attempt, so a single failure says nothing about whether
    the data exists. Without retries a multi-target prepare run reliably
    dies partway through.
    """
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return SkyView.get_images(**kwargs)
        except Exception:
            if attempt == MAX_ATTEMPTS:
                raise
            time.sleep(RETRY_BACKOFF_SECONDS * attempt)


def fetch_target(target_key: str) -> dict[str, Path]:
    """Fetch all configured bands for a target and save them as FITS files.

    Field of view and pixel count both come from config, so each target is
    framed to its own angular size at a common pixel scale.

    Two SkyView quirks drive the request shape here. Its `radius` argument
    404s for some targets, so the field is set with explicit width/height.
    And asking for all three surveys in one call also 404s once the pixel
    count grows past a few hundred, so each band is requested separately --
    slower, but reliable, and a failure names the band that failed.

    Returns a mapping of channel name (e.g. "R") to the saved FITS path.
    """
    target = TARGETS[target_key]
    out_dir = RAW_DATA_DIR / target_key
    out_dir.mkdir(parents=True, exist_ok=True)

    fov = target["fov_arcmin"] * u.arcmin
    pixels = str(pixels_for(target_key))

    saved_paths = {}
    for channel, survey in target["bands"].items():
        images = _get_images_with_retry(
            position=target["object"],
            survey=[survey],
            pixels=pixels,
            width=fov,
            height=fov,
            coordinates="J2000",
        )
        out_path = out_dir / f"{channel}.fits"
        images[0].writeto(out_path, overwrite=True)
        saved_paths[channel] = out_path

    return saved_paths


def main() -> None:
    target_key = sys.argv[1] if len(sys.argv) > 1 else "m51"
    if target_key not in TARGETS:
        raise SystemExit(f"Unknown target '{target_key}'. Choices: {list(TARGETS)}")

    print(f"Fetching {TARGETS[target_key]['display_name']}...")
    paths = fetch_target(target_key)
    for channel, path in paths.items():
        print(f"  {channel}: {path}")


if __name__ == "__main__":
    main()

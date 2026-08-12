"""Fetch multi-band FITS cutouts for a target from SkyView (SDSS bands).

SkyView resolves object names server-side and returns each requested
survey already centered on the same coordinates, so this step needs no
manual coordinate lookup. The bands are still on slightly different
pixel grids/scales, though -- that's handled later by align.py.
"""

import sys
from pathlib import Path

from astroquery.skyview import SkyView

from wavelength.config import TARGETS

RAW_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "raw"


def fetch_target(target_key: str, pixels: int = 600) -> dict[str, Path]:
    """Fetch all configured bands for a target and save them as FITS files.

    Returns a mapping of channel name (e.g. "R") to the saved FITS path.
    """
    target = TARGETS[target_key]
    out_dir = RAW_DATA_DIR / target_key
    out_dir.mkdir(parents=True, exist_ok=True)

    channels = list(target["bands"].keys())
    surveys = list(target["bands"].values())

    images = SkyView.get_images(
        position=target["object"],
        survey=surveys,
        pixels=str(pixels),
        coordinates="J2000",
    )

    saved_paths = {}
    for channel, hdulist in zip(channels, images):
        out_path = out_dir / f"{channel}.fits"
        hdulist.writeto(out_path, overwrite=True)
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

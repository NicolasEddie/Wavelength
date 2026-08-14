"""Orchestrate fetch -> align -> save for every configured target.

Produces the small, committed data/processed/<target>.npz files that the
Streamlit app reads at runtime -- no network calls happen when the app
runs. compose.py and detect.py are deliberately not run here; they're
cheap enough to run live in the app against these cached arrays.
"""

import sys
from pathlib import Path

import numpy as np

from wavelength.align import load_bands, reproject_to_common
from wavelength.config import TARGETS
from wavelength.fetch import fetch_target

PROCESSED_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "processed"


def prepare_target(target_key: str) -> Path:
    """Fetch, align, and cache one target's bands. Returns the saved path."""
    fetch_target(target_key)

    bands = load_bands(target_key)
    aligned, wcs = reproject_to_common(bands)

    PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = PROCESSED_DATA_DIR / f"{target_key}.npz"
    np.savez_compressed(
        out_path,
        R=aligned["R"],
        G=aligned["G"],
        B=aligned["B"],
        wcs_header=wcs.to_header_string(),
    )
    return out_path


def main() -> None:
    target_keys = [sys.argv[1]] if len(sys.argv) > 1 else list(TARGETS)
    for target_key in target_keys:
        if target_key not in TARGETS:
            raise SystemExit(f"Unknown target '{target_key}'. Choices: {list(TARGETS)}")

    for target_key in target_keys:
        print(f"Preparing {TARGETS[target_key]['display_name']}...")
        out_path = prepare_target(target_key)
        size_kb = out_path.stat().st_size / 1024
        print(f"  saved {out_path} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()

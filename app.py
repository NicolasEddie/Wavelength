"""Streamlit app: browse multi-filter RGB composites of nearby galaxies.

Reads only the cached data/processed/*.npz arrays -- no network calls at
runtime, so a Community Cloud deploy works from a plain repo checkout.
"""

import numpy as np
import streamlit as st

from wavelength.compose import compose_rgb
from wavelength.config import TARGETS
from wavelength.detect import detect_sources_in_image, luminance, outline_mask
from wavelength.prepare import PROCESSED_DATA_DIR, load_processed

OVERLAY_COLOR = (255, 70, 70)


def data_fingerprint(target_key: str) -> tuple[float, int]:
    """Identify the current contents of a target's cached .npz.

    Passed into the cached functions below so that re-running prepare.py
    invalidates them. Keying only on target_key would leave the app serving
    stale arrays after the underlying data is regenerated.
    """
    path = PROCESSED_DATA_DIR / f"{target_key}.npz"
    if not path.exists():
        return (0.0, 0)
    stat = path.stat()
    return (stat.st_mtime, stat.st_size)

st.set_page_config(page_title="Wavelength", layout="centered")


@st.cache_data
def cached_bands(target_key: str, fingerprint: tuple[float, int]) -> dict[str, np.ndarray]:
    """Load a target's aligned bands, cached across reruns.

    Only the load is cached -- compose_rgb runs in ~20 ms, so recomputing
    it per rerun is cheaper than caching a ~1 MB image per slider position.
    `fingerprint` is unused in the body but participates in the cache key.
    """
    bands, _wcs = load_processed(target_key)
    return bands


@st.cache_data(max_entries=32)
def cached_detection(
    target_key: str, n_sigma: float, fingerprint: tuple[float, int]
) -> tuple[np.ndarray, int]:
    """Detect sources and return (display-oriented outline mask, count).

    Detection runs ~240 ms, so unlike compose it is worth caching. Keyed
    only on the parameters it actually depends on, so moving a *stretch*
    slider never re-triggers it. Returns plain arrays rather than photutils
    objects, which do not survive st.cache_data's serialization.
    """
    image = luminance(cached_bands(target_key, fingerprint))
    catalog, segment_map = detect_sources_in_image(image, n_sigma=n_sigma)
    if catalog is None:
        return np.zeros(image.shape, dtype=bool), 0
    return outline_mask(segment_map), len(catalog)


st.sidebar.title("Wavelength")

display_names = {key: target["display_name"] for key, target in TARGETS.items()}
target_key = st.sidebar.selectbox(
    "Target",
    options=list(TARGETS),
    format_func=lambda key: display_names[key],
)

# Ranges chosen from a parameter sweep on real data: `minimum` above ~1.0
# drives the frame almost fully black, while `stretch` and Q stay useful
# across a much wider span.
show_sources = st.sidebar.checkbox("Show detected sources")

# Each slider is keyed per target so switching targets starts from that
# target's tuned default rather than carrying over the previous one --
# surface brightness varies enough between them that one default won't do.
with st.sidebar.expander("Advanced: pipeline parameters"):
    minimum = st.slider(
        "Black point (minimum)", 0.0, 1.0, 0.0, step=0.02, key=f"min_{target_key}"
    )
    stretch = st.slider(
        "Stretch",
        0.5,
        30.0,
        TARGETS[target_key]["stretch"],
        step=0.5,
        key=f"stretch_{target_key}",
    )
    q = st.slider("Softening (Q)", 0.5, 20.0, 8.0, step=0.5, key=f"q_{target_key}")
    n_sigma = st.slider(
        "Detection threshold (sigma)", 1.0, 10.0, 3.0, step=0.5, key=f"sig_{target_key}"
    )

fingerprint = data_fingerprint(target_key)

try:
    bands = cached_bands(target_key, fingerprint)
except FileNotFoundError as exc:
    st.error(str(exc))
    st.stop()

rgb = compose_rgb(bands, minimum=minimum, stretch=stretch, q=q)

if show_sources:
    outlines, n_sources = cached_detection(target_key, n_sigma, fingerprint)
    rgb = rgb.copy()
    rgb[outlines] = OVERLAY_COLOR
    st.sidebar.metric("Sources detected", n_sources)

# Targets are stored at their own pixel counts (462-1200 px), so "content"
# renders each 1:1 rather than scaling it to the container.
st.image(rgb, width="content")

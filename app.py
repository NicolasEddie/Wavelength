"""Streamlit app: browse multi-filter RGB composites of nearby galaxies.

Reads only the cached data/processed/*.npz arrays -- no network calls at
runtime, so a Community Cloud deploy works from a plain repo checkout.
"""

import numpy as np
import streamlit as st

from wavelength.compose import compose_rgb
from wavelength.config import TARGETS
from wavelength.detect import detect_sources_in_image, luminance, outline_mask
from wavelength.prepare import load_processed

OVERLAY_COLOR = (255, 70, 70)

st.set_page_config(page_title="Wavelength", layout="centered")


@st.cache_data
def cached_bands(target_key: str) -> dict[str, np.ndarray]:
    """Load a target's aligned bands, cached across reruns.

    Only the load is cached -- compose_rgb runs in ~20 ms, so recomputing
    it per rerun is cheaper than caching a ~1 MB image per slider position.
    """
    bands, _wcs = load_processed(target_key)
    return bands


@st.cache_data(max_entries=32)
def cached_detection(target_key: str, n_sigma: float) -> tuple[np.ndarray, int]:
    """Detect sources and return (display-oriented outline mask, count).

    Detection runs ~240 ms, so unlike compose it is worth caching. Keyed
    only on the parameters it actually depends on, so moving a *stretch*
    slider never re-triggers it. Returns plain arrays rather than photutils
    objects, which do not survive st.cache_data's serialization.
    """
    image = luminance(cached_bands(target_key))
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

with st.sidebar.expander("Advanced: pipeline parameters"):
    minimum = st.slider("Black point (minimum)", 0.0, 1.0, 0.0, step=0.02)
    stretch = st.slider("Stretch", 0.5, 30.0, 5.0, step=0.5)
    q = st.slider("Softening (Q)", 0.5, 20.0, 8.0, step=0.5)
    n_sigma = st.slider("Detection threshold (sigma)", 1.0, 10.0, 3.0, step=0.5)

try:
    bands = cached_bands(target_key)
except FileNotFoundError as exc:
    st.error(str(exc))
    st.stop()

rgb = compose_rgb(bands, minimum=minimum, stretch=stretch, q=q)

if show_sources:
    outlines, n_sources = cached_detection(target_key, n_sigma)
    rgb = rgb.copy()
    rgb[outlines] = OVERLAY_COLOR
    st.sidebar.metric("Sources detected", n_sources)

# The data is natively 600x600 -- "content" renders it 1:1 rather than
# upscaling it to the container, which only adds blur and vertical scroll.
st.image(rgb, width="content")

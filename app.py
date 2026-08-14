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

# Targets are stored at 831-1200 px, which overflows a typical viewport at
# 1:1, so the image is scaled down to fit its column. Downscaling stays
# sharp; only upscaling softens an image, and the column is narrower than
# the smallest stored target at any ordinary window size.


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

st.set_page_config(page_title="Wavelength", layout="wide")

# The title card carries its own background so it reads the same against
# Streamlit's light and dark themes without needing to detect which is active.
st.markdown(
    """
    <style>
      /* Enough top padding to clear Streamlit's floating toolbar, which
         otherwise overlaps and visually clips the title card. */
      .block-container { padding-top: 4.5rem; padding-bottom: 2rem; }

      .wl-title {
        background: linear-gradient(110deg, #10131c 0%, #1b2130 55%, #24304a 100%);
        border: 1px solid #2f3950;
        border-radius: 12px;
        padding: 20px 28px 22px;
        margin-bottom: 20px;
        text-align: center;
      }
      /* Deliberately plain divs rather than <h1>/<span>: Streamlit's own
         heading rules are specific enough to override element selectors,
         which flattened the title and subtitle to the same size. */
      .wl-title .wl-name {
        font-size: 36px;
        font-weight: 700;
        line-height: 1.1;
        letter-spacing: 0.02em;
        color: #f2efe8;
        margin: 0 0 8px 0;
      }
      .wl-title .wl-sub {
        font-size: 12.5px;
        font-weight: 400;
        line-height: 1.4;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #8fa3c0;
        margin: 0;
      }

      /* Image centring is handled structurally with padding columns rather
         than CSS -- Streamlit wraps a fixed-width image in a container sized
         to the image, so centring the <img> inside that wrapper does nothing,
         and the wrapper's own selector is not stable across versions. */
    </style>
    <div class="wl-title">
      <div class="wl-name">Wavelength</div>
      <div class="wl-sub">multi-filter astronomical imaging</div>
    </div>
    """,
    unsafe_allow_html=True,
)


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


INTRO = (
    "**Real telescope data, composited into color.** Observatories don't take "
    "color pictures. They record one grayscale frame per filter, and color "
    "images are built afterwards by assigning those frames to red, green, and "
    "blue channels.\n\n"
    "This app does that assembly on real Sloan Digital Sky Survey imagery, then "
    "optionally runs an automated source-detection pass over the result — the "
    "same basic steps a survey pipeline performs before anything reaches a "
    "catalogue or a press release."
)

TECHNICAL_DETAILS = """
**Filters, not color.** Each target is three exposures through different SDSS
filters — *g* (blue-green), *r* (red), and *i* (near-infrared, invisible to
the eye). Reddest maps to Red, bluest to Blue, so the colors are real: amber
is old cool stars, blue-green knots are young star-forming regions.

**Alignment.** Every frame carries a World Coordinate System mapping pixels to
sky position. All bands are reprojected onto one grid, so a pixel means the
same patch of sky in every channel.

**Stretch.** A galaxy core can be thousands of times brighter than its arms —
shown linearly you'd see a white dot on black. The Lupton (2004) asinh method
scales all three channels by one shared factor, so color balance survives
rather than each channel being separately contrast-maximised into false color.

**Detection.** `photutils` segmentation — estimate a varying sky background,
threshold at N sigma, group connected pixels, deblend merged sources. It
assumes nothing about source shape, so stars and irregular galaxy structure
both work.

---

**Sharpness.** These look softer than Hubble images because SDSS is a
ground-based survey, and its light passes through Earth's atmosphere before
reaching the telescope. That blur is already in the source data. Every step
taken here — aligning, compositing, displaying — was checked, and none of them
add any blur of their own.
"""

st.sidebar.title("Controls")

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
    with st.spinner("Detecting sources..."):
        outlines, n_sources = cached_detection(target_key, n_sigma, fingerprint)
    rgb = rgb.copy()
    rgb[outlines] = OVERLAY_COLOR
    st.sidebar.metric("Sources detected", n_sources)

# The explanatory text sits in a right-hand column rather than above the
# image, so the composite stays at the top of the page instead of being
# pushed below the fold. (Streamlit supports only one true sidebar.)
image_col, info_col = st.columns([3, 2], gap="large")

with image_col:
    # Empty padding columns either side put the image dead centre by
    # construction. The image stretches to fill the middle slot, so it ends up
    # flush with that slot rather than hugging one edge of a wider container.
    _pad_left, image_slot, _pad_right = st.columns([1, 4, 1])
    with image_slot:
        st.image(rgb, width="stretch")

with info_col:
    st.markdown(INTRO)
    with st.expander("Technical details"):
        st.markdown(TECHNICAL_DETAILS)

"""Target objects and their filter-band configuration.

Each target maps RGB channels to SkyView survey names for SDSS bands.
Channel order follows the standard SDSS false-color convention: the
reddest band (i) drives Red, r drives Green, and the bluest band (g)
drives Blue.

Framing is per-target: objects differ by several times in angular size, so
a single field of view either crops the large ones or strands the small
ones in empty sky.
"""

# Measured stellar FWHM in this SDSS data is ~1.7 arcsec (atmospheric
# seeing). Nyquist sampling of that PSF needs only ~0.85"/px, so SDSS's
# native 0.396"/px is roughly 2x oversampled -- it records the same blur
# in finer increments rather than more detail. Sampling at 0.65"/px stays
# comfortably above Nyquist (~2.6 px per FWHM) while keeping images small
# enough to display 1:1 without scaling.
PIXEL_SCALE_ARCSEC = 0.65

TARGETS = {
    "m51": {
        "display_name": "M51 (Whirlpool Galaxy)",
        "object": "M51",
        "bands": {"R": "SDSSi", "G": "SDSSr", "B": "SDSSg"},
        # Wide enough to include NGC 5195 and the tidal bridge between them.
        "fov_arcmin": 10.0,
        "stretch": 5.0,
    },
    "m101": {
        "display_name": "M101 (Pinwheel Galaxy)",
        "object": "M101",
        "bands": {"R": "SDSSi", "G": "SDSSr", "B": "SDSSg"},
        "fov_arcmin": 13.0,
        # Low surface brightness -- the default stretch leaves it very dim.
        "stretch": 2.0,
    },
    "m104": {
        "display_name": "M104 (Sombrero Galaxy)",
        "object": "M104",
        "bands": {"R": "SDSSi", "G": "SDSSr", "B": "SDSSg"},
        "fov_arcmin": 9.0,
        "stretch": 5.0,
    },
    "m13": {
        "display_name": "M13 (Hercules Cluster)",
        "object": "M13",
        "bands": {"R": "SDSSi", "G": "SDSSr", "B": "SDSSg"},
        "fov_arcmin": 12.0,
        "stretch": 5.0,
    },
}


def pixels_for(target_key: str) -> int:
    """Pixel count that renders this target's field at PIXEL_SCALE_ARCSEC."""
    fov_arcsec = TARGETS[target_key]["fov_arcmin"] * 60
    return round(fov_arcsec / PIXEL_SCALE_ARCSEC)

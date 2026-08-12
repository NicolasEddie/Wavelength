"""Target objects and their filter-band configuration.

Each target maps RGB channels to SkyView survey names for SDSS bands.
Channel order follows the standard SDSS false-color convention: the
reddest band (i) drives Red, r drives Green, and the bluest band (g)
drives Blue.
"""

TARGETS = {
    "m51": {
        "display_name": "M51 (Whirlpool Galaxy)",
        "object": "M51",
        "bands": {"R": "SDSSi", "G": "SDSSr", "B": "SDSSg"},
    },
    "m81": {
        "display_name": "M81 (Bode's Galaxy)",
        "object": "M81",
        "bands": {"R": "SDSSi", "G": "SDSSr", "B": "SDSSg"},
    },
    "m104": {
        "display_name": "M104 (Sombrero Galaxy)",
        "object": "M104",
        "bands": {"R": "SDSSi", "G": "SDSSr", "B": "SDSSg"},
    },
}

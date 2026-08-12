"""One-time offline pipeline: fetch -> align -> save to data/processed/.

TODO: for each target in config.TARGETS, run fetch.fetch_target then
align.reproject_to_common, and save the aligned per-band arrays plus
WCS metadata as data/processed/<target>.npz for the Streamlit app to
read at runtime (no network calls in the deployed app).
"""

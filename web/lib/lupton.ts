/**
 * Lupton asinh RGB compositing, transcribed from astropy 8.0.1
 * (RGBImageMappingLupton.apply_mappings + LuptonAsinhStretch).
 * See web/DESIGN.md §1 for the eight-step contract this implements.
 *
 * Pure functions only: no DOM, so the same code runs in the browser
 * and in the Node verification script (scripts/verify-renderer.mjs).
 */

export interface Manifest {
  slug: string;
  displayName: string;
  object: string;
  width: number;
  height: number;
  nativeWidth: number;
  nativeHeight: number;
  pixelScaleArcsec: number;
  fovArcmin: number;
  encoding: { type: string; soften: number; levels: number; bits: number };
  bands: Record<"R" | "G" | "B", { file: string; survey: string; lo: number; hi: number; bytes: number }>;
  preview: { file: string; side: number; bytes: number };
  defaults: { minimum: number; stretch: number; q: number; nSigma: number };
  detection: {
    sigmas: number[];
    maskPattern: string;
    catalogPattern: string;
    maskWidth: number;
    maskHeight: number;
    counts: Record<string, number>;
  };
}

export interface Bands {
  width: number;
  height: number;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
}

export interface StretchParams {
  minimum: number;
  stretch: number;
  q: number;
}

/** Decode one uint16 band (DESIGN.md §2, "Decoding a band") into data units. */
export function decodeBand(
  buf: ArrayBuffer,
  lo: number,
  hi: number,
  enc: { soften: number; levels: number },
): Float32Array {
  const raw = new Uint16Array(buf); // little-endian on every platform a browser runs on
  const out = new Float32Array(raw.length);
  // Only 2^12 distinct codes exist, so decode through a table instead of sinh per pixel.
  const table = new Float32Array(65536);
  const k = Math.asinh(enc.soften);
  const span = hi - lo;
  for (let code = 0; code < 65536; code += 16) {
    const companded = code / enc.levels;
    table[code] = (Math.sinh(companded * k) / enc.soften) * span + lo;
  }
  for (let i = 0; i < raw.length; i++) out[i] = table[raw[i]];
  return out;
}

const LUT_SIZE = 65536;

/**
 * Render the composite into an RGBA buffer.
 *
 * Bands are stored in FITS orientation (row 0 = south). When `flipY` is true
 * the output is written north-up, which is how the image is displayed.
 * The reference PNGs are stored un-flipped, so verification passes flipY=false.
 */
export function renderLupton(
  bands: Bands,
  p: StretchParams,
  out: Uint8ClampedArray,
  flipY = true,
): void {
  const { width: w, height: h, r, g, b } = bands;
  const { minimum, stretch, q } = p;
  const slope = 0.1 / Math.asinh(0.1 * q);
  const qs = q / stretch;

  // ratio = f(I)/I depends only on I, so precompute it over the image's I range.
  let iMax = 0;
  for (let i = 0; i < r.length; i++) {
    const I = (r[i] + g[i] + b[i]) / 3 - minimum;
    if (I > iMax) iMax = I;
  }
  // The table is spaced in sqrt(I), not I: f(I)/I changes fastest near zero,
  // where most of a galaxy image's sky background sits. Linear interpolation
  // between entries keeps the table error well under one output level.
  const span = Math.max(iMax, 1e-12);
  const scale = (LUT_SIZE - 2) / Math.sqrt(span);
  const lut = new Float32Array(LUT_SIZE);
  const ratioAt = (I: number) => (Math.asinh(I * qs) * slope) / I;
  lut[0] = slope * qs; // limit of f(I)/I as I -> 0
  for (let k = 1; k < LUT_SIZE; k++) {
    const s = k / scale;
    lut[k] = ratioAt(s * s);
  }

  for (let y = 0; y < h; y++) {
    const srcRow = y * w;
    const dstRow = (flipY ? h - 1 - y : y) * w;
    for (let x = 0; x < w; x++) {
      const i = srcRow + x;
      const rv = r[i] - minimum;
      const gv = g[i] - minimum;
      const bv = b[i] - minimum;
      const I = (rv + gv + bv) / 3;
      let R = 0;
      let G = 0;
      let B = 0;
      if (I > 0) {
        const f = Math.sqrt(I) * scale;
        const k = f | 0;
        const ratio = lut[k] + (lut[k + 1] - lut[k]) * (f - k);
        R = rv * ratio;
        G = gv * ratio;
        B = bv * ratio;
        if (R < 0) R = 0;
        if (G < 0) G = 0;
        if (B < 0) B = 0;
        const m = R > G ? (R > B ? R : B) : G > B ? G : B;
        if (m > 1) {
          R /= m;
          G /= m;
          B /= m;
        }
      }
      const o = (dstRow + x) * 4;
      out[o] = Math.round(R * 255);
      out[o + 1] = Math.round(G * 255);
      out[o + 2] = Math.round(B * 255);
      out[o + 3] = 255;
    }
  }
}

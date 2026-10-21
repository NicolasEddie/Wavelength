// Verifies lib/lupton.ts against the float reference renders written by
// `python -m wavelength.export_web` (web/reference/, gitignored).
// Usage: node --experimental-strip-types scripts/verify-renderer.mjs [referenceDir]
// Pass criterion (DESIGN.md §5): 99.99th-percentile error <= 1 output level.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { decodeBand, renderLupton } from "../lib/lupton.ts";

const refRoot = process.argv[2] ?? "reference";
const dataRoot = "public/data";
let failed = false;

for (const slug of readdirSync(refRoot)) {
  const dir = join(refRoot, slug);
  if (!existsSync(join(dataRoot, slug, "manifest.json"))) continue;
  const m = JSON.parse(readFileSync(join(dataRoot, slug, "manifest.json"), "utf8"));
  const band = (k) => {
    const b = readFileSync(join(dataRoot, slug, m.bands[k].file));
    const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    return decodeBand(ab, m.bands[k].lo, m.bands[k].hi, m.encoding);
  };
  const bands = { width: m.width, height: m.height, r: band("R"), g: band("G"), b: band("B") };
  const out = new Uint8ClampedArray(m.width * m.height * 4);

  for (const f of readdirSync(dir).filter((f) => f.endsWith(".png"))) {
    const [, minimum, stretch, q] = f.match(/min([\d.]+)_s([\d.]+)_q([\d.]+)\.png/).map(Number);
    const ref = PNG.sync.read(readFileSync(join(dir, f)));
    if (ref.width !== m.width) { console.log(`${slug}/${f}: size ${ref.width} != ${m.width}, skipped`); continue; }
    const t0 = performance.now();
    renderLupton(bands, { minimum, stretch, q }, out, false);
    const ms = performance.now() - t0;
    const errs = new Uint8Array(m.width * m.height * 3);
    let n = 0, max = 0, over = 0;
    for (let i = 0; i < m.width * m.height; i++) {
      for (let c = 0; c < 3; c++) {
        const e = Math.abs(out[i * 4 + c] - ref.data[i * 4 + c]);
        errs[n++] = e; if (e > max) max = e; if (e > 1) over++;
      }
    }
    const sorted = errs.sort();
    const p9999 = sorted[Math.floor(sorted.length * 0.9999)];
    const ok = p9999 <= 1;
    failed ||= !ok;
    console.log(`${ok ? "PASS" : "FAIL"} ${slug}/${f}  p99.99=${p9999}  max=${max}  >1 level=${((over / sorted.length) * 100).toFixed(4)}%  ${ms.toFixed(1)} ms`);
  }
}
process.exit(failed ? 1 : 0);

/// <reference lib="webworker" />
/**
 * Background thread for the viewer. Decodes the band files once, then renders
 * the Lupton composite whenever the page sends new slider values, so dragging a
 * slider never blocks the page. Each frame's pixel buffer is transferred back
 * (no copy).
 */
import { decodeBand, renderLupton, type Bands, type StretchParams } from "./lupton";

type InMessage =
  | {
      type: "bands";
      width: number;
      height: number;
      buffers: [ArrayBuffer, ArrayBuffer, ArrayBuffer];
      ranges: [{ lo: number; hi: number }, { lo: number; hi: number }, { lo: number; hi: number }];
      encoding: { soften: number; levels: number };
    }
  | { type: "render"; params: StretchParams; id: number };

let bands: Bands | null = null;

self.onmessage = (e: MessageEvent<InMessage>) => {
  const msg = e.data;
  if (msg.type === "bands") {
    const [r, g, b] = msg.buffers.map((buf, i) => decodeBand(buf, msg.ranges[i].lo, msg.ranges[i].hi, msg.encoding));
    bands = { width: msg.width, height: msg.height, r, g, b };
    self.postMessage({ type: "ready" });
    return;
  }
  if (msg.type === "render" && bands) {
    const out = new Uint8ClampedArray(bands.width * bands.height * 4);
    renderLupton(bands, msg.params, out, true);
    self.postMessage({ type: "frame", id: msg.id, pixels: out }, [out.buffer]);
  }
};

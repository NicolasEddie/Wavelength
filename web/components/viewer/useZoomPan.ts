"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Zoom and pan for the viewer image.
 *
 * - Mouse wheel / trackpad pinch zooms toward the cursor (1× to MAX_ZOOM).
 * - One pointer drags to pan when zoomed in; two touch pointers pinch-zoom.
 * - Double-click or double-tap toggles between fit and 3×.
 *
 * The transform is written straight to `layerRef` (no React render per frame);
 * React state only carries the zoom level for the readout.
 * Coordinates are CSS pixels relative to the square's top-left corner.
 */

export const MAX_ZOOM = 8;
const DOUBLE_ZOOM = 3;

interface View {
  s: number;
  x: number;
  y: number;
}

export function useZoomPan(boxRef: RefObject<HTMLElement | null>, layerRef: RefObject<HTMLElement | null>) {
  const view = useRef<View>({ s: 1, x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  const apply = useCallback(
    (next: View) => {
      const box = boxRef.current;
      const layer = layerRef.current;
      if (!box || !layer) return;
      const w = box.clientWidth;
      const h = box.clientHeight;
      const s = Math.min(MAX_ZOOM, Math.max(1, next.s));
      // Keep the image covering the box: no empty space at any edge.
      const x = Math.min(0, Math.max(w - w * s, next.x));
      const y = Math.min(0, Math.max(h - h * s, next.y));
      view.current = { s, x, y };
      layer.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
      box.dataset.zoomed = s > 1.001 ? "true" : "false";
      setScale(Math.round(s * 10) / 10);
    },
    [boxRef, layerRef],
  );

  /** Zoom by `factor` keeping the point (px, py) fixed on screen. */
  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      const { s, x, y } = view.current;
      const ns = Math.min(MAX_ZOOM, Math.max(1, s * factor));
      const k = ns / s;
      apply({ s: ns, x: px - (px - x) * k, y: py - (py - y) * k });
    },
    [apply],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const box = boxRef.current;
      if (!box) return;
      zoomAt(factor, box.clientWidth / 2, box.clientHeight / 2);
    },
    [boxRef, zoomAt],
  );

  const reset = useCallback(() => apply({ s: 1, x: 0, y: 0 }), [apply]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    const local = (e: { clientX: number; clientY: number }) => {
      const r = box.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      // Trackpad pinch arrives as ctrl+wheel with small deltas; mouse wheels as larger steps.
      const delta = e.ctrlKey ? e.deltaY * 0.01 : e.deltaY * 0.0015;
      zoomAt(Math.exp(-delta), p.x, p.y);
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let pinchStart: { dist: number; s: number } | null = null;
    let lastTap = { t: 0, x: 0, y: 0 };

    const toggleAt = (p: { x: number; y: number }) => {
      if (view.current.s > 1.001) reset();
      else zoomAt(DOUBLE_ZOOM, p.x, p.y);
    };

    const onDown = (e: PointerEvent) => {
      if ((e.target as Element).closest("button")) return;
      box.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), s: view.current.s };
      }
      if (pointers.size === 1) box.dataset.dragging = "true";
    };

    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const target = (pinchStart.s * dist) / Math.max(pinchStart.dist, 1);
        zoomAt(target / view.current.s, mid.x, mid.y);
      } else if (pointers.size === 1 && view.current.s > 1) {
        apply({ ...view.current, x: view.current.x + p.x - prev.x, y: view.current.y + p.y - prev.y });
      }
    };

    const onUp = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = null;
      if (pointers.size === 0) box.dataset.dragging = "false";
      // Double-tap for touch and pen; mice use the native dblclick below.
      if (p && e.pointerType !== "mouse" && e.type === "pointerup") {
        const now = performance.now();
        if (now - lastTap.t < 300 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) {
          toggleAt(p);
          lastTap = { t: 0, x: 0, y: 0 };
        } else {
          lastTap = { t: now, x: p.x, y: p.y };
        }
      }
    };

    const onDblClick = (e: MouseEvent) => {
      if ((e.target as Element).closest("button")) return;
      toggleAt(local(e));
    };

    const onResize = () => apply(view.current);

    box.addEventListener("wheel", onWheel, { passive: false });
    box.addEventListener("pointerdown", onDown);
    box.addEventListener("pointermove", onMove);
    box.addEventListener("pointerup", onUp);
    box.addEventListener("pointercancel", onUp);
    box.addEventListener("dblclick", onDblClick);
    window.addEventListener("resize", onResize);
    return () => {
      box.removeEventListener("wheel", onWheel);
      box.removeEventListener("pointerdown", onDown);
      box.removeEventListener("pointermove", onMove);
      box.removeEventListener("pointerup", onUp);
      box.removeEventListener("pointercancel", onUp);
      box.removeEventListener("dblclick", onDblClick);
      window.removeEventListener("resize", onResize);
    };
  }, [boxRef, apply, zoomAt, reset]);

  return { scale, zoomBy, reset };
}

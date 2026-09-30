import { contentBounds } from '../model/geometry';
import type { Viewport } from '../model/types';
import { useFactory } from '../store/useFactory';

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 2.5;
export const CANVAS_ID = 'factory-canvas';

/** Last known pointer position on the canvas, in world pixels (for R and Q under the cursor). */
export const pointer = { world: null as { x: number; y: number } | null };

/** Space taken by the floating panels, so "fit" and "centre" use the visible floor. */
function insets() {
  const hasInspector = !!document.querySelector('.inspector');
  const narrow = window.innerWidth < 760;
  if (narrow) return { left: 16, right: 16, top: 120, bottom: window.innerHeight * 0.4 };
  return { left: 290, right: hasInspector ? 340 : 24, top: 80, bottom: 110 };
}

function canvasSize() {
  const el = document.getElementById(CANVAS_ID);
  return el ? { w: el.clientWidth, h: el.clientHeight } : { w: window.innerWidth, h: window.innerHeight };
}

export function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Zoom keeping the given screen point (relative to the canvas) fixed. */
export function zoomAt(view: Viewport, factor: number, sx: number, sy: number): Viewport {
  const zoom = clampZoom(view.zoom * factor);
  const wx = (sx - view.x) / view.zoom;
  const wy = (sy - view.y) / view.zoom;
  return { zoom, x: sx - wx * zoom, y: sy - wy * zoom };
}

export function zoomBy(factor: number) {
  const { view, setView } = useFactory.getState();
  const { w, h } = canvasSize();
  setView(zoomAt(view, factor, w / 2, h / 2));
}

export function fitToView() {
  const { pipeline, setView } = useFactory.getState();
  const b = contentBounds(pipeline.nodes, pipeline.belts);
  const { w, h } = canvasSize();
  const ins = insets();
  if (!b) {
    setView({ x: ins.left + 40, y: ins.top + 60, zoom: 1 });
    return;
  }
  // Leave room for labels below buildings and belts looping underneath.
  const pad = { x: 40, top: 40, bottom: 110 };
  const availW = Math.max(100, w - ins.left - ins.right);
  const availH = Math.max(100, h - ins.top - ins.bottom);
  const zoom = clampZoom(Math.min(availW / (b.w + pad.x * 2), availH / (b.h + pad.top + pad.bottom), 1.25));
  const x = ins.left + (availW - b.w * zoom) / 2 - b.x * zoom;
  const y = ins.top + (availH - (b.h + pad.bottom - pad.top) * zoom) / 2 - b.y * zoom;
  setView({ x, y, zoom });
}


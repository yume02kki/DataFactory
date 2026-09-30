import type { FactoryNode, NodeKind } from './types';

/** Size of one grid cell in world pixels. */
export const CELL = 32;

/** Footprint of each building in grid cells. Heights are odd so ports sit on a cell centre. */
export const KIND_SIZE: Record<NodeKind, { w: number; h: number }> = {
  source: { w: 3, h: 3 },
  machine: { w: 3, h: 3 },
  buffer: { w: 5, h: 3 },
  store: { w: 3, h: 3 },
};

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function nodeRect(node: Pick<FactoryNode, 'kind' | 'x' | 'y'>): Rect {
  const size = KIND_SIZE[node.kind];
  return { x: node.x * CELL, y: node.y * CELL, w: size.w * CELL, h: size.h * CELL };
}

export function inPort(node: Pick<FactoryNode, 'kind' | 'x' | 'y'>): Pt {
  const r = nodeRect(node);
  return { x: r.x, y: r.y + r.h / 2 };
}

export function outPort(node: Pick<FactoryNode, 'kind' | 'x' | 'y'>): Pt {
  const r = nodeRect(node);
  return { x: r.x + r.w, y: r.y + r.h / 2 };
}

export function rectContains(r: Rect, p: Pt, pad = 0): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function normalizeRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/**
 * Orthogonal conveyor route from an output port to an input port.
 * Forward belts use a single S-bend; belts that have to go "backwards"
 * loop around underneath both buildings so flow direction stays readable.
 */
export function routeBelt(a: Pt, b: Pt, fromRect?: Rect, toRect?: Rect): Pt[] {
  const gap = b.x - a.x;
  if (gap >= CELL) {
    if (Math.abs(a.y - b.y) < 0.5) return [a, b];
    const mx = a.x + Math.round(gap / 2 / (CELL / 2)) * (CELL / 2);
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
  }
  const out = a.x + CELL * 0.75;
  const back = b.x - CELL * 0.75;
  const bottoms = [a.y, b.y];
  if (fromRect) bottoms.push(fromRect.y + fromRect.h);
  if (toRect) bottoms.push(toRect.y + toRect.h);
  // Lanes below the buildings leave room for the name labels.
  const lane = Math.max(...bottoms) + CELL * 1.75;
  return [a, { x: out, y: a.y }, { x: out, y: lane }, { x: back, y: lane }, { x: back, y: b.y }, b];
}

/** SVG path through the points with softly rounded corners. */
export function pathFromPoints(points: Pt[], radius = 12): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const prev = points[i - 1];
    const next = points[i + 1];
    if (!next) {
      d += ` L ${p.x} ${p.y}`;
      break;
    }
    const inLen = Math.hypot(p.x - prev.x, p.y - prev.y);
    const outLen = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < 0.5) {
      d += ` L ${p.x} ${p.y}`;
      continue;
    }
    const inDir = { x: (p.x - prev.x) / inLen, y: (p.y - prev.y) / inLen };
    const outDir = { x: (next.x - p.x) / outLen, y: (next.y - p.y) / outLen };
    d += ` L ${p.x - inDir.x * r} ${p.y - inDir.y * r}`;
    d += ` Q ${p.x} ${p.y} ${p.x + outDir.x * r} ${p.y + outDir.y * r}`;
  }
  return d;
}

export function polylineLength(points: Pt[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/** Point halfway along a polyline, plus the direction of travel there. */
export function polylineMidpoint(points: Pt[]): { p: Pt; horizontal: boolean } {
  const total = polylineLength(points);
  let target = total / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg >= target && seg > 0) {
      const t = target / seg;
      return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, horizontal: Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) };
    }
    target -= seg;
  }
  return { p: points[0] ?? { x: 0, y: 0 }, horizontal: true };
}

export function nodesBounds(nodes: FactoryNode[]): Rect | null {
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const r = nodeRect(n);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

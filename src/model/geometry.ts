import type { Dir, FactoryNode, NodeKind } from './types';

/** Size of one grid cell in world pixels. */
export const CELL = 32;

/** Footprint of each building in grid cells, unrotated (flowing to the right). */
export const KIND_SIZE: Record<NodeKind, { w: number; h: number }> = {
  source: { w: 3, h: 3 },
  machine: { w: 3, h: 3 },
  buffer: { w: 5, h: 3 },
  store: { w: 3, h: 3 },
};

/** Unit vectors for each direction. */
export const DV: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
export const rotateDir = (d: Dir, steps: number): Dir => ((((d + steps) % 4) + 4) % 4) as Dir;

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

export const cellKey = (x: number, y: number) => `${x},${y}`;

/** Footprint in cells after rotation (vertical buildings swap width and height). */
export function footprint(kind: NodeKind, rotation: Dir): { w: number; h: number } {
  const s = KIND_SIZE[kind];
  return rotation % 2 === 0 ? { w: s.w, h: s.h } : { w: s.h, h: s.w };
}

type Placed = Pick<FactoryNode, 'kind' | 'x' | 'y' | 'rotation'>;

export function nodeRect(node: Placed): Rect {
  const f = footprint(node.kind, node.rotation);
  return { x: node.x * CELL, y: node.y * CELL, w: f.w * CELL, h: f.h * CELL };
}

export function nodeCells(node: Placed): Pt[] {
  const f = footprint(node.kind, node.rotation);
  const cells: Pt[] = [];
  for (let dy = 0; dy < f.h; dy++) for (let dx = 0; dx < f.w; dx++) cells.push({ x: node.x + dx, y: node.y + dy });
  return cells;
}

/** The cells just outside the face of a building that points in `side`. */
export function faceCells(node: Placed, side: Dir): Pt[] {
  const f = footprint(node.kind, node.rotation);
  const cells: Pt[] = [];
  if (side === 0) for (let i = 0; i < f.h; i++) cells.push({ x: node.x + f.w, y: node.y + i });
  if (side === 2) for (let i = 0; i < f.h; i++) cells.push({ x: node.x - 1, y: node.y + i });
  if (side === 1) for (let i = 0; i < f.w; i++) cells.push({ x: node.x + i, y: node.y + f.h });
  if (side === 3) for (let i = 0; i < f.w; i++) cells.push({ x: node.x + i, y: node.y - 1 });
  return cells;
}

/** Cells where belts pick items up from a building. */
export const outputCells = (node: Placed) => faceCells(node, node.rotation);
/** Cells from which belts deliver items into a building. */
export const inputCells = (node: Placed) => faceCells(node, opposite(node.rotation));

export const cellCenter = (x: number, y: number): Pt => ({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL });

/** Top-left cell for a building of `kind` centred on the cell under the cursor. */
export function anchorFor(kind: NodeKind, rotation: Dir, cell: Pt): Pt {
  const f = footprint(kind, rotation);
  return { x: cell.x - Math.floor(f.w / 2), y: cell.y - Math.floor(f.h / 2) };
}

/**
 * Cells from `a` to `b` in an L shape (along `firstAxis` first), each with
 * the direction to the next cell. The last tile keeps the final direction,
 * or `fallback` when the path is a single cell.
 */
export function lPath(a: Pt, b: Pt, firstAxis: 'h' | 'v', fallback: Dir): Array<Pt & { dir: Dir }> {
  const cells: Pt[] = [{ ...a }];
  const cur = { ...a };
  const stepX = () => {
    while (cur.x !== b.x) {
      cur.x += Math.sign(b.x - cur.x);
      cells.push({ ...cur });
    }
  };
  const stepY = () => {
    while (cur.y !== b.y) {
      cur.y += Math.sign(b.y - cur.y);
      cells.push({ ...cur });
    }
  };
  if (firstAxis === 'h') {
    stepX();
    stepY();
  } else {
    stepY();
    stepX();
  }
  const dirTo = (p: Pt, q: Pt): Dir => (q.x > p.x ? 0 : q.x < p.x ? 2 : q.y > p.y ? 1 : 3);
  return cells.map((c, i) => {
    if (i < cells.length - 1) return { ...c, dir: dirTo(c, cells[i + 1]) };
    return { ...c, dir: i > 0 ? dirTo(cells[i - 1], c) : fallback };
  });
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function normalizeRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
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
    const turn = (p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x);
    if (r < 0.5 || Math.abs(turn) < 1e-6) {
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
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return len;
}

/** Point halfway along a polyline, plus whether travel there is horizontal. */
export function polylineMidpoint(points: Pt[]): { p: Pt; horizontal: boolean } {
  let target = polylineLength(points) / 2;
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

export function contentBounds(nodes: Placed[], tiles: Pt[]): Rect | null {
  if (nodes.length === 0 && tiles.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (r: Rect) => {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  };
  for (const n of nodes) add(nodeRect(n));
  for (const t of tiles) add({ x: t.x * CELL, y: t.y * CELL, w: CELL, h: CELL });
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

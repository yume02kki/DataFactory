import type { Dir, FactoryNode } from './types';

/** Size of one grid cell in world pixels. Buildings and belt tiles are one cell each. */
export const CELL = 40;

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

type Placed = Pick<FactoryNode, 'x' | 'y' | 'cells'>;
type Oriented = Placed & Pick<FactoryNode, 'rotation'>;
export type Offsets = Array<[number, number]>;

export function nodeCells(node: Placed): Pt[] {
  return node.cells.map(([dx, dy]) => ({ x: node.x + dx, y: node.y + dy }));
}

/** Bounding box of a building, in world pixels. */
export function nodeRect(node: Placed): Rect {
  let w = 1;
  let h = 1;
  for (const [dx, dy] of node.cells) {
    w = Math.max(w, dx + 1);
    h = Math.max(h, dy + 1);
  }
  return { x: node.x * CELL, y: node.y * CELL, w: w * CELL, h: h * CELL };
}

/** Cells just outside every exposed face of a building that points in `side`. */
export function faceCells(node: Placed, side: Dir): Pt[] {
  const own = new Set(node.cells.map(([dx, dy]) => cellKey(node.x + dx, node.y + dy)));
  const [sx, sy] = DV[side];
  const out: Pt[] = [];
  for (const c of nodeCells(node)) {
    const n = { x: c.x + sx, y: c.y + sy };
    if (!own.has(cellKey(n.x, n.y))) out.push(n);
  }
  return out;
}

/** Cells where belts pick items up from a building: one per exposed front face. */
export const outputCells = (node: Oriented) => faceCells(node, node.rotation);
/** Cells from which belts deliver items into a building: one per exposed back face. */
export const inputCells = (node: Oriented) => faceCells(node, opposite(node.rotation));

/** Shifts offsets so the smallest x and y are 0; returns the shift applied. */
export function normalizeOffsets(cells: Offsets): { cells: Offsets; dx: number; dy: number } {
  const dx = Math.min(...cells.map((c) => c[0]));
  const dy = Math.min(...cells.map((c) => c[1]));
  const seen = new Set<string>();
  const out: Offsets = [];
  for (const [x, y] of cells) {
    const k = cellKey(x - dx, y - dy);
    if (!seen.has(k)) {
      seen.add(k);
      out.push([x - dx, y - dy]);
    }
  }
  out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return { cells: out, dx, dy };
}

/** Offsets turned a quarter turn clockwise per step (screen coordinates), normalised. */
export function rotateOffsets(cells: Offsets, steps: number): Offsets {
  let out = cells;
  const n = ((steps % 4) + 4) % 4;
  for (let i = 0; i < n; i++) out = out.map(([x, y]) => [-y, x] as [number, number]);
  return normalizeOffsets(out).cells;
}

/** Splits cells into 4-connected groups, largest-first order preserved by discovery. */
export function connectedGroups(cells: Pt[]): Pt[][] {
  const left = new Map(cells.map((c) => [cellKey(c.x, c.y), c]));
  const groups: Pt[][] = [];
  for (const c of cells) {
    if (!left.has(cellKey(c.x, c.y))) continue;
    const group: Pt[] = [];
    const stack = [c];
    left.delete(cellKey(c.x, c.y));
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      for (const [dx, dy] of DV) {
        const k = cellKey(cur.x + dx, cur.y + dy);
        const n = left.get(k);
        if (n) {
          left.delete(k);
          stack.push(n);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

/**
 * Outline of a set of cells as one SVG path with rounded corners, pulled in by
 * `inset` pixels (negative grows it). Holes come out as separate loops, so
 * fill with `evenodd`. Works for any shape made of whole cells.
 */
export function outlinePath(cells: Pt[], inset: number, radius: number): string {
  const own = new Set(cells.map((c) => cellKey(c.x, c.y)));
  const has = (x: number, y: number) => own.has(cellKey(x, y));
  // Directed boundary edges with the shape on their right-hand side (y points down).
  const next = new Map<string, Array<[number, number]>>();
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const k = cellKey(ax, ay);
    if (!next.has(k)) next.set(k, []);
    next.get(k)!.push([bx, by]);
  };
  for (const { x, y } of cells) {
    if (!has(x, y - 1)) add(x, y, x + 1, y);
    if (!has(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!has(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!has(x - 1, y)) add(x, y + 1, x, y);
  }
  let d = '';
  for (const [startKey, outs] of next) {
    while (outs.length) {
      // Walk one loop, merging straight runs into single segments.
      const [sx, sy] = startKey.split(',').map(Number);
      const loop: Pt[] = [{ x: sx, y: sy }];
      let cur = { x: sx, y: sy };
      let prevDir: [number, number] | null = null;
      for (let guard = 0; guard < 100000; guard++) {
        const list = next.get(cellKey(cur.x, cur.y));
        if (!list || !list.length) break;
        // Where two loops touch at a corner, keep turning right so each loop stays simple.
        let pick = 0;
        if (list.length > 1 && prevDir) {
          const right: [number, number] = [-prevDir[1], prevDir[0]];
          const i = list.findIndex(([bx, by]) => bx - cur.x === right[0] && by - cur.y === right[1]);
          if (i >= 0) pick = i;
        }
        const [bx, by] = list.splice(pick, 1)[0];
        const dir: [number, number] = [bx - cur.x, by - cur.y];
        if (prevDir && prevDir[0] === dir[0] && prevDir[1] === dir[1]) loop[loop.length - 1] = { x: bx, y: by };
        else loop.push({ x: bx, y: by });
        prevDir = dir;
        cur = { x: bx, y: by };
        if (bx === sx && by === sy) break;
      }
      loop.pop(); // last point repeats the start
      // The start may sit in the middle of a straight run.
      if (loop.length > 2) {
        const a = loop[loop.length - 1];
        const b = loop[0];
        const c = loop[1];
        if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) loop.shift();
      }
      if (loop.length < 3) continue;
      // Offset each corner inwards along both adjoining edges' inner normals.
      const pts = loop.map((p, i) => {
        const a = loop[(i - 1 + loop.length) % loop.length];
        const b = loop[(i + 1) % loop.length];
        const din = [Math.sign(p.x - a.x), Math.sign(p.y - a.y)];
        const dout = [Math.sign(b.x - p.x), Math.sign(b.y - p.y)];
        const nx = -din[1] - dout[1];
        const ny = din[0] + dout[0];
        return { x: p.x * CELL + nx * inset, y: p.y * CELL + ny * inset };
      });
      d += closedRoundedPath(pts, radius);
    }
  }
  return d;
}

function closedRoundedPath(pts: Pt[], radius: number): string {
  const n = pts.length;
  const corner = (i: number) => {
    const p = pts[i];
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const lin = Math.hypot(p.x - a.x, p.y - a.y);
    const lout = Math.hypot(b.x - p.x, b.y - p.y);
    const r = Math.max(0, Math.min(radius, lin / 2, lout / 2));
    return {
      a: { x: p.x - ((p.x - a.x) / lin) * r, y: p.y - ((p.y - a.y) / lin) * r },
      p,
      b: { x: p.x + ((b.x - p.x) / lout) * r, y: p.y + ((b.y - p.y) / lout) * r },
    };
  };
  const f = (v: number) => Math.round(v * 100) / 100;
  let d = '';
  for (let i = 0; i < n; i++) {
    const c = corner(i);
    d += `${i === 0 ? 'M' : 'L'} ${f(c.a.x)} ${f(c.a.y)} Q ${f(c.p.x)} ${f(c.p.y)} ${f(c.b.x)} ${f(c.b.y)} `;
  }
  return `${d}Z `;
}

export const cellCenter = (x: number, y: number): Pt => ({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL });

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

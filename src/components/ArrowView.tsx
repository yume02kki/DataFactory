import { memo } from 'react';
import { pathFromPoints, polylineMidpoint, type Pt, type Rect } from '../model/geometry';
import type { Arrow, ArrowHeads, ArrowShape } from '../model/types';
import { textWidth, truncate } from '../lib/text';

const LABEL_FONT = '600 11px Inter, system-ui, sans-serif';
const HEAD = 11;
const GAP = 5;

const centre = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Where the line from the centre of `r` towards `toward` leaves the rectangle (plus a small gap). */
function edgePoint(r: Rect, toward: Pt): Pt {
  const c = centre(r);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const t = Math.min(dx ? r.w / 2 / Math.abs(dx) : Infinity, dy ? r.h / 2 / Math.abs(dy) : Infinity);
  const len = Math.hypot(dx, dy);
  return { x: c.x + dx * t + (dx / len) * GAP, y: c.y + dy * t + (dy / len) * GAP };
}

export interface ArrowGeometry {
  line: string;
  /** One path holding every arrowhead. */
  head: string;
  mid: Pt;
  /** The points the arrow runs through: its two ends with the bend points between. */
  through: Pt[];
  /** A spot on the drawn line between each pair of `through` points, for adding a bend there. */
  addAt: Pt[];
}

export interface ArrowShapeOptions {
  shape?: ArrowShape;
  heads?: ArrowHeads;
  points?: Pt[];
}

const f = (v: number) => Math.round(v * 10) / 10;

/** Middle of the side of `r` that faces `toward`, for right-angle arrows. */
function facePoint(r: Rect, toward: Pt): Pt {
  const c = centre(r);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (Math.abs(dx) / r.w >= Math.abs(dy) / r.h) return { x: c.x + Math.sign(dx || 1) * (r.w / 2 + GAP), y: c.y };
  return { x: c.x, y: c.y + Math.sign(dy || 1) * (r.h / 2 + GAP) };
}

/**
 * Right-angle route through the points. It leaves the first point along
 * `startH` (horizontal or not) and enters the last along `endH`; hops in
 * between go along their longer axis first.
 */
function elbowRoute(pts: Pt[], startH: boolean, endH: boolean, hops: Pt[][] = []): Pt[] {
  const out: Pt[] = [pts[0]];
  const n = pts.length;
  for (let i = 1; i < n; i++) {
    const from = out.length - 1;
    elbowHop(out, pts, i, n, startH, endH);
    hops.push(out.slice(from));
  }
  return out;
}

function elbowHop(out: Pt[], pts: Pt[], i: number, n: number, startH: boolean, endH: boolean) {
  {
    const a = out[out.length - 1];
    const b = pts[i];
    if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) {
      out.push(b);
      return;
    }
    const first = i === 1;
    const last = i === n - 1;
    if (first && last && startH === endH) {
      // Leave and enter along the same axis: a Z with its turn halfway.
      if (startH) out.push({ x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b);
      else out.push({ x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }, b);
      return;
    }
    const horizontalFirst = first ? startH : last ? !endH : Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    out.push(horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y }, b);
  }
}

function headAt(tip: Pt, ux: number, uy: number): string {
  const base = { x: tip.x - ux * HEAD, y: tip.y - uy * HEAD };
  return `M ${f(tip.x)} ${f(tip.y)} L ${f(base.x - uy * HEAD * 0.55)} ${f(base.y + ux * HEAD * 0.55)} L ${f(base.x + uy * HEAD * 0.55)} ${f(base.y - ux * HEAD * 0.55)} Z`;
}

const unit = (from: Pt, to: Pt) => {
  const l = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: (to.x - from.x) / l, y: (to.y - from.y) / l };
};

/**
 * An arrow from rectangle `a` (or a point) to rectangle `b` (or a point),
 * optionally through bend points. Curved arrows bow gently (or flow smoothly
 * through the bends), straight ones are lines between the bends, and elbow
 * ones run at right angles.
 */
export function arrowGeometry(a: Rect | Pt, b: Rect | Pt, opts: ArrowShapeOptions = {}): ArrowGeometry | null {
  const shape = opts.shape ?? 'curved';
  const heads = opts.heads ?? 'end';
  const bends = opts.points ?? [];
  const ca = 'w' in a ? centre(a) : a;
  const cb = 'w' in b ? centre(b) : b;
  const firstAim = bends[0] ?? cb;
  const lastAim = bends[bends.length - 1] ?? ca;
  const edge = shape === 'elbow' ? facePoint : edgePoint;
  const start = 'w' in a ? edge(a, firstAim) : ca;
  const end = 'w' in b ? edge(b, lastAim) : cb;
  if (!bends.length && Math.hypot(end.x - start.x, end.y - start.y) < HEAD * 1.5) return null;
  const through = [start, ...bends, end];
  const atStart = heads === 'both';
  const atEnd = heads !== 'none';

  let line: string;
  let tipIn: { x: number; y: number };
  let tipOut: { x: number; y: number };
  let midPts: Pt[];
  let addAt: Pt[];

  if (shape === 'curved') {
    // Bezier segments through every point (Catmull-Rom); with no bends, one gentle bow.
    const segs: Array<[Pt, Pt, Pt, Pt]> = [];
    if (!bends.length) {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.hypot(dx, dy);
      const bend = Math.min(60, len * 0.12);
      const q = { x: (start.x + end.x) / 2 - (dy / len) * bend, y: (start.y + end.y) / 2 + (dx / len) * bend };
      segs.push([start, { x: start.x + (q.x - start.x) * (2 / 3), y: start.y + (q.y - start.y) * (2 / 3) }, { x: end.x + (q.x - end.x) * (2 / 3), y: end.y + (q.y - end.y) * (2 / 3) }, end]);
    } else {
      for (let i = 0; i < through.length - 1; i++) {
        const p0 = through[i - 1] ?? through[i];
        const p1 = through[i];
        const p2 = through[i + 1];
        const p3 = through[i + 2] ?? p2;
        segs.push([p1, { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }, p2]);
      }
    }
    const first = segs[0];
    const last = segs[segs.length - 1];
    tipIn = unit(first[1].x === first[0].x && first[1].y === first[0].y ? first[3] : first[1], first[0]);
    tipOut = unit(last[2].x === last[3].x && last[2].y === last[3].y ? last[0] : last[2], last[3]);
    // Stop the line short of each head so its round cap doesn't poke out.
    if (atStart) first[0] = { x: first[0].x + tipIn.x * -(HEAD - 2), y: first[0].y + tipIn.y * -(HEAD - 2) };
    if (atEnd) last[3] = { x: last[3].x - tipOut.x * (HEAD - 2), y: last[3].y - tipOut.y * (HEAD - 2) };
    line = `M ${f(first[0].x)} ${f(first[0].y)}` + segs.map(([, c1, c2, p]) => ` C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p.x)} ${f(p.y)}`).join('');
    addAt = segs.map(([p0, c1, c2, p3]) => ({ x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8, y: (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8 }));
    // Sample the curves for the label position.
    midPts = segs.flatMap(([p0, c1, c2, p3]) =>
      Array.from({ length: 9 }, (_, k) => {
        const t = k / 8;
        const u = 1 - t;
        return {
          x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
          y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
        };
      }),
    );
  } else {
    const towards = (p: Pt, q: Pt) => Math.abs(q.x - p.x) >= Math.abs(q.y - p.y);
    // Off a building's left or right side the arrow starts out horizontally; off the top or bottom, vertically.
    const startH = 'w' in a ? Math.abs(start.y - ca.y) < 1e-6 : towards(start, through[1]);
    const endH = 'w' in b ? Math.abs(end.y - cb.y) < 1e-6 : towards(through[through.length - 2], end);
    const hops: Pt[][] = [];
    const pts = shape === 'elbow' ? elbowRoute(through, startH, endH, hops) : through.slice();
    addAt = shape === 'elbow' ? hops.map((h) => polylineMidpoint(h).p) : through.slice(1).map((p, i) => ({ x: (p.x + through[i].x) / 2, y: (p.y + through[i].y) / 2 }));
    tipIn = unit(pts[1], pts[0]);
    tipOut = unit(pts[pts.length - 2], pts[pts.length - 1]);
    midPts = pts.slice();
    const drawn = pts.slice();
    if (atStart) drawn[0] = { x: drawn[0].x - tipIn.x * (HEAD - 2), y: drawn[0].y - tipIn.y * (HEAD - 2) };
    if (atEnd) drawn[drawn.length - 1] = { x: drawn[drawn.length - 1].x - tipOut.x * (HEAD - 2), y: drawn[drawn.length - 1].y - tipOut.y * (HEAD - 2) };
    line = shape === 'elbow' ? pathFromPoints(drawn.map((p) => ({ x: f(p.x), y: f(p.y) })), 10) : `M ${drawn.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L ')}`;
  }

  const head = [atEnd ? headAt(end, tipOut.x, tipOut.y) : '', atStart ? headAt(start, tipIn.x, tipIn.y) : ''].join(' ').trim();
  return { line, head, mid: polylineMidpoint(midPts).p, through, addAt };
}

interface Props {
  arrow: Arrow;
  from: Rect;
  to: Rect;
  selected: boolean;
  dimmed: boolean;
}

/** Where an arrow's bend points are measured from: halfway between the two buildings' centres. */
export function arrowAnchor(from: Rect, to: Rect): Pt {
  return { x: (from.x + from.w / 2 + to.x + to.w / 2) / 2, y: (from.y + from.h / 2 + to.y + to.h / 2) / 2 };
}

export const ArrowView = memo(function ArrowView({ arrow, from, to, selected, dimmed }: Props) {
  const anchor = arrowAnchor(from, to);
  const bends = (arrow.points ?? []).map((p) => ({ x: anchor.x + p.x, y: anchor.y + p.y }));
  const geo = arrowGeometry(from, to, { shape: arrow.shape, heads: arrow.heads, points: bends });
  if (!geo) return null;
  const label = truncate(arrow.label.trim(), 28);
  const labelW = label ? textWidth(label, LABEL_FONT) + 16 : 0;
  return (
    <g className={`arrow${selected ? ' selected' : ''}${dimmed ? ' dimmed' : ''}`} data-arrow-id={arrow.id}>
      <path className="arrow-hit" d={geo.line} />
      {selected && <path className="arrow-glow" d={geo.line} />}
      <path className="arrow-line" d={geo.line} stroke={arrow.color} strokeDasharray={arrow.dashed ? '7 6' : undefined} />
      {geo.head && <path className="arrow-head" d={geo.head} fill={arrow.color} />}
      {label && (
        <g className="arrow-label" transform={`translate(${geo.mid.x - labelW / 2} ${geo.mid.y - 10})`}>
          <rect width={labelW} height={20} rx={10} stroke={arrow.color} />
          <text x={8} y={14} style={{ font: LABEL_FONT }}>
            {label}
          </text>
        </g>
      )}
      {selected && (
        <g className="arrow-handles">
          {/* Drag a + to add a bend there; drag a bend to move it; right-click or double-click one to remove it. */}
          {geo.addAt.map((p, i) => (
            <g key={`add${i}`} className="arrow-add" data-arrow-insert={i} transform={`translate(${p.x} ${p.y})`}>
              <circle r={6.5} />
              <path d="M -3 0 L 3 0 M 0 -3 L 0 3" />
            </g>
          ))}
          {bends.map((p, i) => (
            <circle key={`pt${i}`} className="arrow-point" data-arrow-point={i} cx={p.x} cy={p.y} r={6.5} stroke={arrow.color} />
          ))}
        </g>
      )}
    </g>
  );
});

/** The rubber-band arrow shown while dragging out a new link. */
export function ArrowPreview({ from, to, color, valid }: { from: Rect; to: Rect | Pt; color: string; valid: boolean }) {
  const geo = arrowGeometry(from, to);
  if (!geo) return null;
  return (
    <g className={`arrow arrow-preview${valid ? ' valid' : ''}`}>
      <path className="arrow-line" d={geo.line} stroke={color} strokeDasharray="6 5" />
      <path className="arrow-head" d={geo.head} fill={color} />
    </g>
  );
}


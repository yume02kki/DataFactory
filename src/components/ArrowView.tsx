import { memo } from 'react';
import { type Pt, type Rect } from '../model/geometry';
import type { Arrow } from '../model/types';
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
  head: string;
  mid: Pt;
}

/**
 * A gently curved arrow from rectangle `a` (or a point) to rectangle `b`
 * (or a point). Curving keeps it apart from straight belts, and two arrows
 * between the same pair in opposite directions bow to opposite sides.
 */
export function arrowGeometry(a: Rect | Pt, b: Rect | Pt): ArrowGeometry | null {
  const ca = 'w' in a ? centre(a) : a;
  const cb = 'w' in b ? centre(b) : b;
  const start = 'w' in a ? edgePoint(a, cb) : ca;
  const end = 'w' in b ? edgePoint(b, ca) : cb;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < HEAD * 1.5) return null;
  const bend = Math.min(60, len * 0.12);
  const ctrl = { x: (start.x + end.x) / 2 - (dy / len) * bend, y: (start.y + end.y) / 2 + (dx / len) * bend };
  // Direction of travel at the tip, for the head and for stopping the line short of it.
  const tx = end.x - ctrl.x;
  const ty = end.y - ctrl.y;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  const base = { x: end.x - ux * HEAD, y: end.y - uy * HEAD };
  const f = (v: number) => Math.round(v * 10) / 10;
  const head = `M ${f(end.x)} ${f(end.y)} L ${f(base.x - uy * HEAD * 0.55)} ${f(base.y + ux * HEAD * 0.55)} L ${f(base.x + uy * HEAD * 0.55)} ${f(base.y - ux * HEAD * 0.55)} Z`;
  const line = `M ${f(start.x)} ${f(start.y)} Q ${f(ctrl.x)} ${f(ctrl.y)} ${f(base.x + ux * 2)} ${f(base.y + uy * 2)}`;
  const mid = { x: 0.25 * start.x + 0.5 * ctrl.x + 0.25 * end.x, y: 0.25 * start.y + 0.5 * ctrl.y + 0.25 * end.y };
  return { line, head, mid };
}

interface Props {
  arrow: Arrow;
  from: Rect;
  to: Rect;
  selected: boolean;
  dimmed: boolean;
}

export const ArrowView = memo(function ArrowView({ arrow, from, to, selected, dimmed }: Props) {
  const geo = arrowGeometry(from, to);
  if (!geo) return null;
  const label = truncate(arrow.label.trim(), 28);
  const labelW = label ? textWidth(label, LABEL_FONT) + 16 : 0;
  return (
    <g className={`arrow${selected ? ' selected' : ''}${dimmed ? ' dimmed' : ''}`} data-arrow-id={arrow.id}>
      <path className="arrow-hit" d={geo.line} />
      {selected && <path className="arrow-glow" d={geo.line} />}
      <path className="arrow-line" d={geo.line} stroke={arrow.color} strokeDasharray={arrow.dashed ? '7 6' : undefined} />
      <path className="arrow-head" d={geo.head} fill={arrow.color} />
      {label && (
        <g className="arrow-label" transform={`translate(${geo.mid.x - labelW / 2} ${geo.mid.y - 10})`}>
          <rect width={labelW} height={20} rx={10} stroke={arrow.color} />
          <text x={8} y={14} style={{ font: LABEL_FONT }}>
            {label}
          </text>
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


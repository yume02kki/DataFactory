import { memo, useMemo } from 'react';
import { CELL, DV, cellCenter, opposite, pathFromPoints, polylineLength, polylineMidpoint, type Pt } from '../model/geometry';
import type { Link } from '../model/ops';
import type { BeltTile, Dir, ItemType } from '../model/types';
import { textWidth, truncate } from '../lib/text';
import { ItemGlyph } from './ItemGlyph';

/** World pixels per second that items travel along belts. */
export const BELT_SPEED = 42;
const ITEM_SPACING = CELL * 1.25;
const LABEL_FONT = '600 11px Inter, system-ui, sans-serif';
const HALF = CELL / 2;

/** Path of one tile: from the edge items arrive at, through the centre, out the far edge. */
export function tilePath(x: number, y: number, dir: Dir, inflow: Dir): string {
  const c = cellCenter(x, y);
  const [ix, iy] = DV[opposite(inflow)];
  const [ox, oy] = DV[dir];
  const entry = { x: c.x + ix * HALF, y: c.y + iy * HALF };
  const exit = { x: c.x + ox * HALF, y: c.y + oy * HALF };
  if (inflow === dir) return `M ${entry.x} ${entry.y} L ${exit.x} ${exit.y}`;
  return `M ${entry.x} ${entry.y} Q ${c.x} ${c.y} ${exit.x} ${exit.y}`;
}

function chevron(x: number, y: number, dir: Dir): string {
  const c = cellCenter(x, y);
  return `translate(${c.x} ${c.y}) rotate(${dir * 90})`;
}

interface TileProps {
  tiles: BeltTile[];
  inflow: Map<string, Dir>;
  className?: string;
  selected?: Set<string>;
  dimmed?: Set<string>;
}

/** All belt tiles, drawn in passes (edges, surface, arrows) so neighbours join seamlessly. */
export const BeltTiles = memo(function BeltTiles({ tiles, inflow, className = '', selected, dimmed }: TileProps) {
  const paths = tiles.map((t) => ({ t, d: tilePath(t.x, t.y, t.dir, inflow.get(t.id) ?? t.dir) }));
  const cls = (t: BeltTile) => `${selected?.has(t.id) ? ' sel' : ''}${dimmed?.has(t.id) ? ' dim' : ''}`;
  return (
    <g className={`belt-tiles ${className}`}>
      {selected && selected.size > 0 && (
        <g className="belt-glow">
          {paths.filter(({ t }) => selected.has(t.id)).map(({ t, d }) => <path key={t.id} d={d} />)}
        </g>
      )}
      <g className="belt-edge">
        {paths.map(({ t, d }) => (
          <path key={t.id} d={d} className={cls(t)} />
        ))}
      </g>
      <g className="belt-surface">
        {paths.map(({ t, d }) => (
          <path key={t.id} d={d} className={cls(t)} />
        ))}
      </g>
      <g className="belt-chevrons">
        {paths.map(({ t }) => (
          <path key={t.id} className={cls(t)} transform={chevron(t.x, t.y, t.dir)} d="M -3 -6 L 4 0 L -3 6 Z" />
        ))}
      </g>
    </g>
  );
});

interface LinkProps {
  link: Link;
  item: ItemType | null;
  dimmed: boolean;
  showLabel: boolean;
}

/** Items riding along one belt line, plus a small label saying what it carries. */
export const LinkItems = memo(
  function LinkItems({ link, item, dimmed, showLabel }: LinkProps) {
    const geo = useMemo(() => {
      const d = pathFromPoints(link.points, HALF);
      return { d, length: polylineLength(link.points), mid: polylineMidpoint(link.points), end: link.points[link.points.length - 1] };
    }, [link.points]);

    const count = Math.max(1, Math.floor(geo.length / ITEM_SPACING));
    const dur = Math.max(0.5, geo.length / BELT_SPEED);
    const label = item ? truncate(item.name, 20) : null;
    const labelW = label ? textWidth(label, LABEL_FONT) + 30 : 0;
    const labelPos: Pt = geo.mid.horizontal ? { x: geo.mid.p.x - labelW / 2, y: geo.mid.p.y - 36 } : { x: geo.mid.p.x + 20, y: geo.mid.p.y - 10 };

    return (
      <g className={`link${dimmed ? ' dimmed' : ''}`}>
        <g className="link-items">
          {Array.from({ length: count }, (_, i) => (
            <g key={i}>
              <animateMotion
                dur={`${dur.toFixed(2)}s`}
                repeatCount="indefinite"
                begin={`-${((i * dur) / count).toFixed(2)}s`}
                path={geo.d}
                calcMode="linear"
              />
              {item ? <ItemGlyph shape={item.shape} color={item.color} r={7.5} /> : <circle className="blank-item" r={4.5} />}
            </g>
          ))}
        </g>
        {!link.to && (
          <g className="dead-end" transform={`translate(${geo.end.x} ${geo.end.y})`}>
            <circle r={6} />
            <path d="M -2.5 -2.5 L 2.5 2.5 M 2.5 -2.5 L -2.5 2.5" />
          </g>
        )}
        {showLabel && label && item && geo.length > CELL * 2.5 && (
          <g className="belt-label" transform={`translate(${labelPos.x} ${labelPos.y})`}>
            <rect width={labelW} height={20} rx={10} />
            <g transform="translate(12 10)">
              <ItemGlyph shape={item.shape} color={item.color} r={5} strokeWidth={1.3} />
            </g>
            <text x={22} y={14} style={{ font: LABEL_FONT }}>
              {label}
            </text>
          </g>
        )}
      </g>
    );
  },
  (a, b) =>
    a.item === b.item &&
    a.dimmed === b.dimmed &&
    a.showLabel === b.showLabel &&
    a.link.to === b.link.to &&
    a.link.points.length === b.link.points.length &&
    a.link.points.every((p, i) => p.x === b.link.points[i].x && p.y === b.link.points[i].y),
);

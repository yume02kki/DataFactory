import { memo, useMemo } from 'react';
import { CELL, DV, cellCenter, opposite, pathFromPoints, polylineLength, polylineMidpoint, type Pt } from '../model/geometry';
import type { Link } from '../model/ops';
import type { BeltTile, Dir, ItemType } from '../model/types';
import { textWidth, truncate } from '../lib/text';
import { LayeredGlyph } from './ItemGlyph';
import { lookOf } from '../model/ops';

/** World pixels per second that items travel along belts. */
export const BELT_SPEED = 42;
const ITEM_SPACING = CELL * 1.25;
const LABEL_FONT = '600 11px Inter, system-ui, sans-serif';
const HALF = CELL / 2;

/** Chevrons per tile, and how long the belt takes to move one chevron along (in step with items). */
const CHEVRONS_PER_TILE = 4;
export const BELT_STEP_SECONDS = CELL / CHEVRONS_PER_TILE / BELT_SPEED;
const CHEVRON = 'M -3.5 -5.2 L 3.8 0 L -3.5 5.2 Z';

/** Path of one tile: from the edge items arrive at to the far edge; turns are true quarter circles. */
export function tilePath(x: number, y: number, dir: Dir, inflow: Dir): string {
  const c = cellCenter(x, y);
  const [ix, iy] = DV[opposite(inflow)];
  const [ox, oy] = DV[dir];
  const entry = { x: c.x + ix * HALF, y: c.y + iy * HALF };
  const exit = { x: c.x + ox * HALF, y: c.y + oy * HALF };
  if (inflow === dir) return `M ${entry.x} ${entry.y} L ${exit.x} ${exit.y}`;
  // Clockwise on screen when turning right relative to the direction of travel.
  const [tx, ty] = DV[inflow];
  const sweep = tx * oy - ty * ox > 0 ? 1 : 0;
  return `M ${entry.x} ${entry.y} A ${HALF} ${HALF} 0 0 ${sweep} ${exit.x} ${exit.y}`;
}

interface TileChevrons {
  marks: Array<{ x: number; y: number; angle: number }>;
  /** Straight tiles slide their chevrons one step along; curved ones turn them one step around the corner. */
  style: React.CSSProperties;
  turn: boolean;
}

/**
 * Chevrons for one tile in the tile's own coordinates (0..CELL). One extra
 * chevron sits just before the tile so that, as they all move one step, the
 * tile is always evenly filled; anything outside the tile is clipped away.
 */
function tileChevrons(dir: Dir, inflow: Dir): TileChevrons {
  const fracs = Array.from({ length: CHEVRONS_PER_TILE + 1 }, (_, k) => (k - 0.5) / CHEVRONS_PER_TILE);
  const step = CELL / CHEVRONS_PER_TILE;
  if (dir === inflow) {
    const [dx, dy] = DV[dir];
    const entry = { x: HALF - dx * HALF, y: HALF - dy * HALF };
    return {
      marks: fracs.map((f) => ({ x: entry.x + dx * CELL * f, y: entry.y + dy * CELL * f, angle: dir * 90 })),
      style: { ['--mx' as string]: `${dx * step}px`, ['--my' as string]: `${dy * step}px` },
      turn: false,
    };
  }
  const [ix, iy] = DV[inflow];
  const [ox, oy] = DV[dir];
  const entry = { x: HALF - ix * HALF, y: HALF - iy * HALF };
  const pivot = { x: entry.x + ox * HALF, y: entry.y + oy * HALF };
  const a0 = Math.atan2(entry.y - pivot.y, entry.x - pivot.x);
  const sweep = (ix * oy - iy * ox > 0 ? 1 : -1) * (Math.PI / 2);
  return {
    marks: fracs.map((f) => {
      const a = a0 + sweep * f;
      return {
        x: pivot.x + Math.cos(a) * HALF,
        y: pivot.y + Math.sin(a) * HALF,
        angle: ((a + Math.sign(sweep) * (Math.PI / 2)) * 180) / Math.PI,
      };
    }),
    style: { transformOrigin: `${pivot.x}px ${pivot.y}px`, ['--turn' as string]: `${(sweep * 180) / Math.PI / CHEVRONS_PER_TILE}deg` },
    turn: true,
  };
}

interface TileProps {
  tiles: BeltTile[];
  inflow: Map<string, Dir>;
  className?: string;
  selected?: Set<string>;
  dimmed?: Set<string>;
}

/**
 * All belt tiles, drawn in passes (outline, surface, chevrons) so neighbours
 * join into one continuous band, in the style of shapez.io's conveyors.
 */
export const BeltTiles = memo(function BeltTiles({ tiles, inflow, className = '', selected, dimmed }: TileProps) {
  const paths = tiles.map((t) => {
    const from = inflow.get(t.id) ?? t.dir;
    return { t, from, d: tilePath(t.x, t.y, t.dir, from) };
  });
  const cls = (t: BeltTile) => `${selected?.has(t.id) ? ' sel' : ''}${dimmed?.has(t.id) ? ' dim' : ''}`;
  return (
    <g className={`belt-tiles ${className}`} style={{ ['--belt-step' as string]: `${BELT_STEP_SECONDS}s` }}>
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
        {paths.map(({ t, from }) => {
          const ch = tileChevrons(t.dir, from);
          return (
            <svg key={t.id} className={`chev-tile${cls(t)}`} x={t.x * CELL} y={t.y * CELL} width={CELL} height={CELL} overflow="hidden">
              <g className={ch.turn ? 'chev-turn' : 'chev-move'} style={ch.style}>
                {ch.marks.map((m, i) => (
                  <path key={i} d={CHEVRON} transform={`translate(${m.x.toFixed(2)} ${m.y.toFixed(2)}) rotate(${m.angle.toFixed(1)})`} />
                ))}
              </g>
            </svg>
          );
        })}
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

    // Blocks handing items straight to each other have nothing to animate.
    if (geo.length < 1) return null;
    const count = Math.max(1, Math.floor(geo.length / ITEM_SPACING));
    const dur = Math.max(0.5, geo.length / BELT_SPEED);
    const label = item ? truncate(item.name, 20) : null;
    const labelW = label ? textWidth(label, LABEL_FONT) + 30 : 0;
    const labelPos: Pt = geo.mid.horizontal ? { x: geo.mid.p.x - labelW / 2, y: geo.mid.p.y - 32 } : { x: geo.mid.p.x + 20, y: geo.mid.p.y - 10 };

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
              {item ? <LayeredGlyph layers={lookOf(item)} r={8.5} /> : <circle className="blank-item" r={4} />}
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
              <LayeredGlyph layers={lookOf(item)} r={5} strokeWidth={1.3} />
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

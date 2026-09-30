import { memo } from 'react';
import { shade } from '../lib/color';
import { KIND_META } from '../model/defaults';
import { CELL, DV, cellCenter, inputCells, opposite, outlinePath, outputCells, type Pt } from '../model/geometry';
import type { Dir, ItemType, NodeKind } from '../model/types';
import { LayeredGlyph } from './ItemGlyph';
import { lookOf } from '../model/ops';

function gearPath(outer: number, inner: number, teeth: number): string {
  const step = (Math.PI * 2) / teeth;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [
      [a - step * 0.25, inner],
      [a - step * 0.16, outer],
      [a + step * 0.16, outer],
      [a + step * 0.25, inner],
    ];
    for (const [ang, r] of pts) {
      const x = (Math.cos(ang) * r).toFixed(2);
      const y = (Math.sin(ang) * r).toFixed(2);
      d += d ? ` L ${x} ${y}` : `M ${x} ${y}`;
    }
  }
  return `${d} Z`;
}

const GEAR = gearPath(9.5, 7, 8);

/** A small dark tab on the block edge with an arrow showing flow direction. */
function PortTab({ x, y, rotation }: { x: number; y: number; rotation: Dir }) {
  return (
    <g className="port-tab" transform={`translate(${x} ${y}) rotate(${rotation * 90})`}>
      <rect x={-3.5} y={-6.5} width={7} height={13} rx={2} />
      <path d="M -1.5 -3 L 2 0 L -1.5 3 Z" />
    </g>
  );
}

/** The symbol of a source or machine, drawn upright around (0, 0). Buffers and stores are tanks instead. */
function KindSymbol({ kind, color }: { kind: 'source' | 'machine'; color: string }) {
  const dark = shade(color, -0.3);
  switch (kind) {
    case 'source':
      return (
        <g>
          <circle r={8.5} fill={color} className="body" />
          <circle className="pulse" r={8.5} stroke={dark} />
          <circle r={3.5} fill="#fff" className="body" />
        </g>
      );
    case 'machine':
      return (
        <g className="spin">
          <path d={GEAR} fill="#fff" className="body" />
          <circle r={3} fill={dark} className="body" />
        </g>
      );
  }
}

interface Props {
  kind: NodeKind;
  /** Absolute grid cells making up the building (any connected shape). */
  cells: Pt[];
  rotation?: Dir;
  color: string;
  /** Items shown queued inside a buffer. */
  queue?: ItemType[];
  ports?: boolean;
}

/** Where the symbol goes: the shape's centre when that lies inside it (e.g. a 2×2), else the block nearest to it. */
function symbolPoint(cells: Pt[]): Pt {
  const mx = cells.reduce((a, c) => a + c.x, 0) / cells.length + 0.5;
  const my = cells.reduce((a, c) => a + c.y, 0) / cells.length + 0.5;
  const own = new Set(cells.map((c) => `${c.x},${c.y}`));
  const inside = [-0.01, 0.01].every((ox) => [-0.01, 0.01].every((oy) => own.has(`${Math.floor(mx + ox)},${Math.floor(my + oy)}`)));
  if (inside) return { x: mx * CELL, y: my * CELL };
  const best = cells.reduce((b, c) => (Math.hypot(c.x + 0.5 - mx, c.y + 0.5 - my) < Math.hypot(b.x + 0.5 - mx, b.y + 0.5 - my) ? c : b), cells[0]);
  return cellCenter(best.x, best.y);
}

/**
 * A building drawn in world coordinates: all its blocks share one outlined
 * plate, so any shape reads as a single building. Every exposed back face gets
 * an input tab and every exposed front face an output tab; the symbol stays upright.
 */
export const BuildingArt = memo(function BuildingArt({ kind, cells, rotation = 0, color, queue = [], ports = true }: Props) {
  const meta = KIND_META[kind];
  const node = { x: 0, y: 0, cells: cells.map((c) => [c.x, c.y] as [number, number]), rotation };
  const [fx, fy] = DV[rotation];
  const tab = (outside: Pt, side: Dir, inward: number) => {
    // Tab sits on the face between the outside cell and the building's cell next to it.
    const [sx, sy] = DV[side];
    const c = cellCenter(outside.x - sx, outside.y - sy);
    const x = c.x + (sx * CELL) / 2 + fx * inward;
    const y = c.y + (sy * CELL) / 2 + fy * inward;
    return <PortTab key={`${side}:${outside.x},${outside.y}`} x={x} y={y} rotation={rotation} />;
  };
  const sym = symbolPoint(cells);
  const back = opposite(rotation);
  const tank = kind === 'buffer' || kind === 'store';

  return (
    <g className={`art art-${kind}`}>
      {ports && meta.hasInput && inputCells(node).map((c) => tab(c, back, tank ? 4 : 1.5))}
      {ports && meta.hasOutput && outputCells(node).map((c) => tab(c, rotation, tank ? -4 : -1.5))}
      {tank ? (
        <Tank kind={kind} cells={cells} color={color} queue={queue} />
      ) : (
        <>
          <path className="plate" d={outlinePath(cells, 2.5, 7)} fillRule="evenodd" />
          <path className="body" d={outlinePath(cells, 7, 5)} fillRule="evenodd" fill={kind === 'source' ? shade(color, 0.45) : color} />
          <g transform={`translate(${sym.x} ${sym.y})`}>
            <KindSymbol kind={kind as 'source' | 'machine'} color={color} />
          </g>
        </>
      )}
    </g>
  );
});

/** Liquid levels: buffers hold items for a while, stores keep them. */
const TANK_LEVEL = { buffer: 0.5, store: 0.82 } as const;
const WAVE = 16;

/**
 * Buffers and stores are drawn as tanks rather than machines: a pill-shaped
 * vessel with a glass wall and liquid that settles at the bottom whichever way
 * the tank faces. Buffers are half full with items bobbing at the surface;
 * stores are nearly full, hooped like a silo, with items settled inside.
 */
function Tank({ kind, cells, color, queue }: { kind: 'buffer' | 'store'; cells: Pt[]; color: string; queue: ItemType[] }) {
  const round = CELL / 2;
  const glass = outlinePath(cells, 6.5, round - 6.5);
  const minX = Math.min(...cells.map((c) => c.x)) * CELL;
  const minY = Math.min(...cells.map((c) => c.y)) * CELL;
  const maxX = (Math.max(...cells.map((c) => c.x)) + 1) * CELL;
  const maxY = (Math.max(...cells.map((c) => c.y)) + 1) * CELL;
  const top = maxY - 6.5 - (maxY - minY - 13) * TANK_LEVEL[kind];
  // A gently scrolling wave along the liquid's surface.
  let wave = `M ${minX - WAVE * 2} ${top}`;
  for (let x = minX - WAVE * 2; x < maxX + WAVE; x += WAVE) wave += ` q ${WAVE / 4} -2.2 ${WAVE / 2} 0 t ${WAVE / 2} 0`;
  wave += ` V ${maxY + 2} H ${minX - WAVE * 2} Z`;
  const clipId = `tank-${kind}-${cells.map((c) => `${c.x}_${c.y}`).join('-')}`.replace(/[^\w-]/g, 'm');
  const liquid = kind === 'store' ? color : shade(color, 0.15);
  const items = cells.slice(0, 8).map((c, i) => ({ c: cellCenter(c.x, c.y), item: queue.length ? queue[i % queue.length] : null }));

  return (
    <g className={`tank tank-${kind}`}>
      <path className="plate" d={outlinePath(cells, 2.5, round - 2.5)} fillRule="evenodd" />
      <clipPath id={clipId}>
        <path d={glass} fillRule="evenodd" />
      </clipPath>
      <path className="tank-glass" d={glass} fillRule="evenodd" />
      <g clipPath={`url(#${clipId})`}>
        <path className="tank-liquid wave" d={wave} fill={liquid} />
        <path className="tank-surface wave" d={wave.slice(0, wave.indexOf(' V '))} stroke={shade(color, 0.5)} />
        {kind === 'store' &&
          // Silo hoops across the tank.
          [0.3, 0.62].map((f) => (
            <line key={f} className="tank-hoop" x1={minX} x2={maxX} y1={minY + (maxY - minY) * f} y2={minY + (maxY - minY) * f} />
          ))}
        {items.map(({ c, item }, i) => (
          <g
            key={i}
            className={kind === 'buffer' ? 'bob' : undefined}
            style={kind === 'buffer' ? { animationDelay: `${(i % 3) * 0.4}s` } : undefined}
            transform={`translate(${c.x} ${kind === 'buffer' ? Math.max(c.y, top) : Math.max(c.y + 4, top + 7)})`}
          >
            {item ? <LayeredGlyph layers={lookOf(item)} r={5.5} strokeWidth={1.2} /> : <circle className="tank-bubble" r={2.5} />}
          </g>
        ))}
      </g>
      <path className="tank-rim" d={glass} fillRule="evenodd" />
      <path className="tank-shine" d={outlinePath(cells, 10, round - 10)} fillRule="evenodd" />
    </g>
  );
}

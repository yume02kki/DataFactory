import { ICONS, ICON_VIEWBOX, hasIcon } from '../lib/icons';
import { memo } from 'react';
import { shade } from '../lib/color';
import { KIND_META } from '../model/defaults';
import { CELL, DV, cellCenter, inputCells, opposite, outlinePath, outputCells, type Pt } from '../model/geometry';
import type { Dir, ItemType, NodeKind } from '../model/types';
import { LayeredGlyph } from './ItemGlyph';
import { lookOf, portKey } from '../model/ops';

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
  /** When given, only these ports (see portKey) get a tab; otherwise every port does. */
  usedPorts?: Set<string>;
  /** Icon from the icon set, shown instead of the kind's symbol. */
  icon?: string;
}

/** Size an icon is drawn at on a building, in world pixels. */
const ICON_SIZE = 28;

/** An icon from the set, inlined and centred on (x, y). */
export function IconGlyph({ name, x, y, size = ICON_SIZE }: { name: string; x: number; y: number; size?: number }) {
  if (!hasIcon(name)) return null;
  const s = size / ICON_VIEWBOX;
  return <g className="icon-glyph" transform={`translate(${x - size / 2} ${y - size / 2}) scale(${s})`} dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
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
export const BuildingArt = memo(function BuildingArt({ kind, cells, rotation = 0, color, queue = [], ports = true, usedPorts, icon }: Props) {
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
      {ports && meta.hasInput && inputCells(node).filter((c) => !usedPorts || usedPorts.has(portKey(back, c))).map((c) => tab(c, back, 1.5))}
      {ports && meta.hasOutput && outputCells(node).filter((c) => !usedPorts || usedPorts.has(portKey(rotation, c))).map((c) => tab(c, rotation, -1.5))}
      {tank ? (
        <Tank kind={kind} cells={cells} color={color} queue={queue} icon={icon} />
      ) : (
        <>
          <path className="plate" d={outlinePath(cells, 2.5, 7)} fillRule="evenodd" />
          <path className="body" d={outlinePath(cells, 7, 5)} fillRule="evenodd" fill={kind === 'source' ? shade(color, 0.45) : color} />
          {hasIcon(icon) ? (
            <IconGlyph name={icon} x={sym.x} y={sym.y} />
          ) : (
            <g transform={`translate(${sym.x} ${sym.y})`}>
              <KindSymbol kind={kind as 'source' | 'machine'} color={color} />
            </g>
          )}
        </>
      )}
    </g>
  );
});

/**
 * Buffers and stores are drawn as tanks rather than machines: a fully rounded
 * vessel (one block is round, a row is a capsule) held in the same square
 * frame as other buildings, so belts meet a flat edge. Buffers show their
 * queued items through round windows, one per block; stores carry the storage symbol.
 */
function Tank({ kind, cells, color, queue, icon }: { kind: 'buffer' | 'store'; cells: Pt[]; color: string; queue: ItemType[]; icon?: string }) {
  const round = CELL / 2;
  const dark = shade(color, -0.3);
  const light = shade(color, 0.45);
  const sym = symbolPoint(cells);
  const withIcon = hasIcon(icon);
  // With an icon, the block holding it has no item window.
  const windows = cells.filter((c) => !withIcon || Math.hypot(cellCenter(c.x, c.y).x - sym.x, cellCenter(c.x, c.y).y - sym.y) > CELL * 0.6);
  return (
    <g className={`tank tank-${kind}`}>
      <path className="plate" d={outlinePath(cells, 2.5, 7)} fillRule="evenodd" />
      <path className="body" d={outlinePath(cells, 5.5, round - 5.5)} fillRule="evenodd" fill={color} />
      {kind === 'buffer' &&
        windows.slice(0, 12).map((c, i) => {
          const p = cellCenter(c.x, c.y);
          const item = queue.length ? queue[i % queue.length] : null;
          return (
            <g key={i} transform={`translate(${p.x} ${p.y})`}>
              <circle className="tank-window" r={8.5} />
              {item ? <LayeredGlyph layers={lookOf(item)} r={4.8} strokeWidth={1.1} /> : <circle r={2.5} fill={dark} />}
            </g>
          );
        })}
      {withIcon && <IconGlyph name={icon} x={sym.x} y={sym.y} />}
      {kind === 'store' && !withIcon && (
        <g className="body" fill="#fff" transform={`translate(${sym.x} ${sym.y})`}>
          <path d="M -9 -6 L -9 6 A 9 3.2 0 0 0 9 6 L 9 -6" />
          <path d="M -9 0 A 9 3.2 0 0 0 9 0" fill="none" />
          <ellipse cx={0} cy={-6} rx={9} ry={3.2} fill={light} />
        </g>
      )}
    </g>
  );
}

import { memo } from 'react';
import { shade } from '../lib/color';
import { KIND_META } from '../model/defaults';
import { CELL } from '../model/geometry';
import type { Dir, ItemType, NodeKind } from '../model/types';
import { ItemGlyph } from './ItemGlyph';

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
function PortTab({ x, y }: { x: number; y: number }) {
  return (
    <g className="port-tab" transform={`translate(${x} ${y})`}>
      <rect x={-3.5} y={-6.5} width={7} height={13} rx={2} />
      <path d="M -1.5 -3 L 2 0 L -1.5 3 Z" />
    </g>
  );
}

/** The kind's symbol, drawn upright around (0, 0). */
function KindSymbol({ kind, color, queue }: { kind: NodeKind; color: string; queue: ItemType[] }) {
  const dark = shade(color, -0.3);
  const light = shade(color, 0.45);
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
    case 'buffer':
      return (
        <g>
          <rect x={-11} y={-6.5} width={22} height={13} rx={6.5} fill="#fff" className="body" />
          {[-5.5, 0, 5.5].map((x, i) => {
            const item = queue.length ? queue[i % queue.length] : null;
            return (
              <g key={i} className="slot" style={{ animationDelay: `${i * 0.25}s` }} transform={`translate(${x} 0)`}>
                {item ? <ItemGlyph shape={item.shape} color={item.color} r={2.6} strokeWidth={1} /> : <circle r={2} fill={dark} />}
              </g>
            );
          })}
        </g>
      );
    case 'store':
      return (
        <g className="body" fill="#fff">
          <path d="M -9 -6 L -9 6 A 9 3.2 0 0 0 9 6 L 9 -6" />
          <path d="M -9 0 A 9 3.2 0 0 0 9 0" fill="none" />
          <ellipse cx={0} cy={-6} rx={9} ry={3.2} fill={light} />
        </g>
      );
  }
}

interface Props {
  kind: NodeKind;
  /** Blocks in the row. */
  size?: number;
  rotation?: Dir;
  color: string;
  /** Items shown queued inside a buffer. */
  queue?: ItemType[];
  ports?: boolean;
}

/**
 * A building: `size` 1×1 blocks joined into one plate, drawn flowing
 * left → right and rotated into place. The symbol always stays upright.
 */
export const BuildingArt = memo(function BuildingArt({ kind, size = 1, rotation = 0, color, queue = [], ports = true }: Props) {
  const W = CELL;
  const H = CELL * size;
  const meta = KIND_META[kind];
  const inset = 5;
  const bodyR = kind === 'buffer' ? Math.min(W, H) / 2 - inset : 5;

  return (
    <g className={`art art-${kind}`} transform={`rotate(${rotation * 90}) translate(${-W / 2} ${-H / 2})`}>
      {ports &&
        Array.from({ length: size }, (_, i) => (
          <g key={i}>
            {meta.hasInput && <PortTab x={1.5} y={(i + 0.5) * CELL} />}
            {meta.hasOutput && <PortTab x={W - 1.5} y={(i + 0.5) * CELL} />}
          </g>
        ))}
      <rect className="plate" x={2.5} y={2.5} width={W - 5} height={H - 5} rx={7} />
      <rect className="body" x={inset + 2} y={inset + 2} width={W - inset * 2 - 4} height={H - inset * 2 - 4} rx={bodyR} fill={kind === 'source' ? shade(color, 0.45) : color} />
      <g transform={`translate(${W / 2} ${H / 2}) rotate(${-rotation * 90})`}>
        <KindSymbol kind={kind} color={color} queue={queue} />
      </g>
    </g>
  );
});

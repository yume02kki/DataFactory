import { memo } from 'react';
import { shade } from '../lib/color';
import { KIND_META } from '../model/defaults';
import { CELL } from '../model/geometry';
import type { ItemType, NodeKind } from '../model/types';
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

const GEAR = gearPath(17, 13, 9);

interface Props {
  kind: NodeKind;
  /** Unrotated size in px: items enter on the left and leave on the right. */
  w: number;
  h: number;
  color: string;
  /** Items shown queued inside a buffer. */
  queue?: ItemType[];
  ports?: boolean;
}

/** A small dark tab on the building edge with an arrow showing flow direction. */
function PortTab({ x, y }: { x: number; y: number }) {
  return (
    <g className="port-tab" transform={`translate(${x} ${y})`}>
      <rect x={-5} y={-8} width={10} height={16} rx={3} />
      <path d="M -2 -3.5 L 2 0 L -2 3.5 Z" />
    </g>
  );
}

/**
 * The flat, outlined building drawn for each component kind, in local
 * coordinates (0,0)–(w,h) flowing left → right; the caller rotates it.
 */
export const BuildingArt = memo(function BuildingArt({ kind, w, h, color, queue = [], ports = true }: Props) {
  const dark = shade(color, -0.3);
  const light = shade(color, 0.45);
  const cx = w / 2;
  const cy = h / 2;
  const inset = 7;
  const rows = Math.round(h / CELL);
  const meta = KIND_META[kind];

  return (
    <g className={`art art-${kind}`}>
      {ports &&
        Array.from({ length: rows }, (_, i) => (
          <g key={i}>
            {meta.hasInput && <PortTab x={1} y={(i + 0.5) * CELL} />}
            {meta.hasOutput && <PortTab x={w - 1} y={(i + 0.5) * CELL} />}
          </g>
        ))}
      <rect className="plate" x={3} y={3} width={w - 6} height={h - 6} rx={9} />
      {kind === 'source' && (
        <g>
          <rect x={inset + 3} y={inset + 3} width={w - inset * 2 - 6} height={h - inset * 2 - 6} rx={6} fill={light} className="body" />
          <circle cx={cx} cy={cy} r={20} fill={color} className="body" />
          <circle className="pulse" cx={cx} cy={cy} r={20} stroke={dark} />
          <circle cx={cx} cy={cy} r={8} fill="#fff" className="body" />
        </g>
      )}
      {kind === 'machine' && (
        <g>
          <rect x={inset + 3} y={inset + 3} width={w - inset * 2 - 6} height={h - inset * 2 - 6} rx={6} fill={color} className="body" />
          <g transform={`translate(${cx} ${cy})`}>
            <g className="spin">
              <path d={GEAR} fill="#fff" className="body" />
              <circle r={5.5} fill={dark} className="body" />
            </g>
          </g>
        </g>
      )}
      {kind === 'buffer' && (
        <g>
          <rect x={inset + 3} y={inset + 5} width={w - inset * 2 - 6} height={h - inset * 2 - 10} rx={(h - inset * 2 - 10) / 2} fill={color} className="body" />
          {[0, 1, 2, 3].map((i) => {
            const slotW = 22;
            const gap = 6;
            const total = slotW * 4 + gap * 3;
            const x = cx - total / 2 + i * (slotW + gap);
            const item = queue.length ? queue[i % queue.length] : null;
            return (
              <g key={i} className="slot" style={{ animationDelay: `${i * 0.25}s` }}>
                <rect x={x} y={cy - 11} width={slotW} height={22} rx={5} fill="#fff" opacity={0.9} stroke={dark} strokeWidth={1.5} />
                {item && (
                  <g transform={`translate(${x + slotW / 2} ${cy})`}>
                    <ItemGlyph shape={item.shape} color={item.color} r={6} />
                  </g>
                )}
              </g>
            );
          })}
        </g>
      )}
      {kind === 'store' && (
        <g>
          <rect x={inset + 3} y={inset + 3} width={w - inset * 2 - 6} height={h - inset * 2 - 6} rx={6} fill={color} className="body" />
          <g className="body" fill="#fff">
            <path d={`M ${cx - 20} ${cy - 14} L ${cx - 20} ${cy + 14} A 20 6.5 0 0 0 ${cx + 20} ${cy + 14} L ${cx + 20} ${cy - 14}`} />
            <path d={`M ${cx - 20} ${cy - 4} A 20 6.5 0 0 0 ${cx + 20} ${cy - 4}`} fill="none" />
            <path d={`M ${cx - 20} ${cy + 5} A 20 6.5 0 0 0 ${cx + 20} ${cy + 5}`} fill="none" />
            <ellipse cx={cx} cy={cy - 14} rx={20} ry={6.5} fill={light} />
          </g>
        </g>
      )}
    </g>
  );
});

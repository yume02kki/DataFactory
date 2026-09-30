import { memo } from 'react';
import { shade } from '../lib/color';
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

const GEAR = gearPath(19, 14.5, 9);

interface Props {
  kind: NodeKind;
  w: number;
  h: number;
  color: string;
  /** Items shown queued inside a buffer. */
  queue?: ItemType[];
}

/**
 * The flat, outlined building drawn for each component kind. Drawn in local
 * coordinates (0,0)–(w,h); animation hooks are plain CSS classes.
 */
export const BuildingArt = memo(function BuildingArt({ kind, w, h, color, queue = [] }: Props) {
  const dark = shade(color, -0.28);
  const light = shade(color, 0.35);
  const cx = w / 2;
  const cy = h / 2;
  const inset = 8;

  return (
    <g className={`art art-${kind}`}>
      <rect className="shadow" x={3} y={5} width={w} height={h} rx={11} />
      <rect className="plate" x={0} y={0} width={w} height={h} rx={11} />
      {kind === 'source' && (
        <g>
          <rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} rx={8} fill={color} className="body" />
          <rect x={inset + 5} y={inset + 5} width={w - inset * 2 - 10} height={6} rx={3} fill={light} opacity={0.7} />
          <circle cx={cx} cy={cy + 2} r={20} fill={dark} className="body" />
          <circle className="pulse" cx={cx} cy={cy + 2} r={20} stroke={light} />
          <circle cx={cx} cy={cy + 2} r={8} fill="#fff" className="body" />
        </g>
      )}
      {kind === 'machine' && (
        <g>
          <rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} rx={8} fill={color} className="body" />
          <rect x={inset + 5} y={inset + 5} width={w - inset * 2 - 10} height={6} rx={3} fill={light} opacity={0.7} />
          <g transform={`translate(${cx} ${cy + 3})`}>
            <g className="spin">
              <path d={GEAR} fill="#fff" className="body" />
              <circle r={6} fill={dark} className="body" />
            </g>
          </g>
        </g>
      )}
      {kind === 'buffer' && (
        <g>
          <rect x={inset} y={inset + 6} width={w - inset * 2} height={h - inset * 2 - 12} rx={(h - inset * 2 - 12) / 2} fill={color} className="body" />
          <rect x={inset + 14} y={inset + 11} width={w - inset * 2 - 28} height={5} rx={2.5} fill={light} opacity={0.7} />
          {[0, 1, 2, 3].map((i) => {
            const slotW = 22;
            const gap = 6;
            const total = slotW * 4 + gap * 3;
            const x = cx - total / 2 + i * (slotW + gap);
            const item = queue.length ? queue[i % queue.length] : null;
            return (
              <g key={i} className="slot" style={{ animationDelay: `${i * 0.25}s` }}>
                <rect x={x} y={cy - 9} width={slotW} height={22} rx={5} fill="#fff" opacity={0.9} stroke={dark} strokeWidth={1.5} />
                {item && (
                  <g transform={`translate(${x + slotW / 2} ${cy + 2})`}>
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
          <rect x={inset} y={inset} width={w - inset * 2} height={h - inset * 2} rx={8} fill={color} className="body" />
          <g className="body" fill="#fff">
            <path d={`M ${cx - 22} ${cy - 13} L ${cx - 22} ${cy + 17} A 22 7 0 0 0 ${cx + 22} ${cy + 17} L ${cx + 22} ${cy - 13}`} />
            <path d={`M ${cx - 22} ${cy - 3} A 22 7 0 0 0 ${cx + 22} ${cy - 3}`} fill="none" />
            <path d={`M ${cx - 22} ${cy + 7} A 22 7 0 0 0 ${cx + 22} ${cy + 7}`} fill="none" />
            <ellipse cx={cx} cy={cy - 13} rx={22} ry={7} fill={light} />
          </g>
        </g>
      )}
    </g>
  );
});

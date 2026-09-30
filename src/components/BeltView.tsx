import { memo, useMemo } from 'react';
import { inPort, nodeRect, outPort, pathFromPoints, polylineLength, polylineMidpoint, routeBelt } from '../model/geometry';
import type { Belt, FactoryNode, ItemType } from '../model/types';
import { textWidth, truncate } from '../lib/text';
import { ItemGlyph } from './ItemGlyph';

/** World pixels per second that belts (and the items on them) travel. */
export const BELT_SPEED = 40;
const ITEM_SPACING = 52;
const LABEL_FONT = '600 11px Inter, system-ui, sans-serif';

interface Props {
  belt: Belt;
  from: FactoryNode;
  to: FactoryNode;
  item: ItemType | null;
  selected: boolean;
  highlighted: boolean;
  dimmed: boolean;
}

export const BeltView = memo(function BeltView({ belt, from, to, item, selected, highlighted, dimmed }: Props) {
  const geo = useMemo(() => {
    const points = routeBelt(outPort(from), inPort(to), nodeRect(from), nodeRect(to));
    return {
      points,
      d: pathFromPoints(points),
      length: polylineLength(points),
      mid: polylineMidpoint(points),
      end: points[points.length - 1],
    };
  }, [from, to]);

  // Items leave a little gap at both ends so they appear to exit/enter the buildings.
  const count = Math.max(1, Math.floor(geo.length / ITEM_SPACING));
  const dur = Math.max(0.6, geo.length / BELT_SPEED);
  const label = item ? truncate(item.name, 20) : null;
  const labelW = label ? textWidth(label, LABEL_FONT) + 30 : 0;
  const showLabel = label && geo.length > 70;
  const labelPos = geo.mid.horizontal
    ? { x: geo.mid.p.x - labelW / 2, y: geo.mid.p.y - 29 }
    : { x: geo.mid.p.x + 14, y: geo.mid.p.y - 10 };

  return (
    <g
      className={`belt${selected ? ' selected' : ''}${highlighted ? ' highlighted' : ''}${dimmed ? ' dimmed' : ''}${item ? '' : ' empty'}`}
      data-belt-id={belt.id}
    >
      <path className="belt-hit" d={geo.d} />
      {(selected || highlighted) && <path className="belt-glow" d={geo.d} />}
      <path className="belt-edge" d={geo.d} />
      <path className="belt-surface" d={geo.d} />
      <path className="belt-tread" d={geo.d} />
      <path className="belt-arrow" d={`M ${geo.end.x - 17} ${geo.end.y - 6} L ${geo.end.x - 10} ${geo.end.y} L ${geo.end.x - 17} ${geo.end.y + 6}`} />

      <g className="belt-items">
        {Array.from({ length: count }, (_, i) => (
          <g key={i}>
            <animateMotion
              dur={`${dur.toFixed(2)}s`}
              repeatCount="indefinite"
              begin={`-${((i * dur) / count).toFixed(2)}s`}
              path={geo.d}
              keyPoints="0.04;0.96"
              keyTimes="0;1"
              calcMode="linear"
            />
            {item ? <ItemGlyph shape={item.shape} color={item.color} r={6.5} /> : <circle className="blank-item" r={4} />}
          </g>
        ))}
      </g>

      {showLabel && item && (
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
});

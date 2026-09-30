import { memo } from 'react';
import { CELL } from '../model/geometry';
import type { Area } from '../model/types';
import { textWidth, truncate } from '../lib/text';

const LABEL_FONT = '700 13px Inter, system-ui, sans-serif';

/**
 * A named, see-through coloured area on the floor. Only its name tag (drag to
 * move, right-click to delete) and, when selected, its corner handle (drag to
 * resize) take the mouse; clicks elsewhere reach the floor and buildings.
 */
export const AreaView = memo(function AreaView({ area, selected }: { area: Area; selected: boolean }) {
  const x = area.x * CELL;
  const y = area.y * CELL;
  const w = area.w * CELL;
  const h = area.h * CELL;
  const name = truncate(area.name.trim() || 'Area', 36);
  const labelW = textWidth(name, LABEL_FONT) + 20;
  return (
    <g className={`area${selected ? ' selected' : ''}`}>
      <rect className="area-fill" x={x} y={y} width={w} height={h} rx={14} fill={area.color} stroke={area.color} />
      <g className="area-label" data-area-id={area.id} data-area-part="label" transform={`translate(${x + 8} ${y + 8})`}>
        <rect width={labelW} height={24} rx={12} fill={area.color} />
        <text x={10} y={16.5} style={{ font: LABEL_FONT }}>
          {name}
        </text>
      </g>
      {selected && (
        <g className="area-handle" data-area-id={area.id} data-area-part="handle" transform={`translate(${x + w} ${y + h})`}>
          <circle r={9} fill={area.color} />
          <path d="M -3 3 L 3 -3 M 0 3 L 3 0" />
        </g>
      )}
    </g>
  );
});

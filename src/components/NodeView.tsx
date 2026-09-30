import { memo } from 'react';
import { KIND_META } from '../model/defaults';
import { CELL, footprint, nodeRect } from '../model/geometry';
import type { Dir, FactoryNode, ItemType, NodeKind } from '../model/types';
import { textWidth, truncate } from '../lib/text';
import { BuildingArt } from './BuildingArt';

const NAME_FONT = '700 12px Inter, system-ui, sans-serif';
const META_FONT = '600 10px Inter, system-ui, sans-serif';

/** Building art rotated into its footprint, whose top-left is (x, y) in world pixels. */
export function RotatedArt({ kind, rotation, size, color, queue, x, y }: { kind: NodeKind; rotation: Dir; size: number; color: string; queue?: ItemType[]; x: number; y: number }) {
  const f = footprint(rotation, size);
  return (
    <g transform={`translate(${x + (f.w * CELL) / 2} ${y + (f.h * CELL) / 2})`}>
      <BuildingArt kind={kind} size={size} rotation={rotation} color={color} queue={queue} />
    </g>
  );
}

interface Props {
  node: FactoryNode;
  items: ItemType[];
  selected: boolean;
  dimmed: boolean;
}

export const NodeView = memo(function NodeView({ node, items, selected, dimmed }: Props) {
  const r = nodeRect(node);
  const meta = KIND_META[node.kind];
  const name = truncate(node.name || meta.label, 28);
  // Skip the type caption when it would just repeat the name ("API" / "API").
  const rawType = node.type.trim() && node.type.trim() !== node.name.trim() ? node.type : '';
  const type = truncate(rawType, 22);
  const tech = truncate(node.technology, 24);
  const queue = node.kind === 'buffer' ? node.inputs.map((id) => items.find((i) => i.id === id)).filter((i): i is ItemType => !!i) : [];

  const typeW = type ? textWidth(type, META_FONT) : 0;
  const techW = tech ? textWidth(tech, META_FONT) + 14 : 0;
  const gap = tech && type ? 6 : 0;
  const lineW = typeW + gap + techW;

  return (
    <g className={`node node-${node.kind}${selected ? ' selected' : ''}${dimmed ? ' dimmed' : ''}`} data-node-id={node.id}>
      {selected && <rect className="select-ring" x={r.x - 3} y={r.y - 3} width={r.w + 6} height={r.h + 6} rx={9} />}
      <RotatedArt kind={node.kind} rotation={node.rotation} size={node.size} color={node.color} queue={queue} x={r.x} y={r.y} />
      <g className="labels" transform={`translate(${r.x + r.w / 2} ${r.y + r.h + 15})`}>
        <text className="node-name" x={0} y={0} textAnchor="middle" style={{ font: NAME_FONT }}>
          {name}
        </text>
        {(type || tech) && (
          <g transform={`translate(${-lineW / 2} 15)`}>
            {type && (
              <text className="node-type" x={0} y={0} style={{ font: META_FONT }}>
                {type}
              </text>
            )}
            {tech && (
              <g transform={`translate(${typeW + gap} 0)`}>
                <rect className="tech-pill" x={0} y={-11} width={techW} height={15} rx={7.5} />
                <text className="tech-text" x={7} y={0} style={{ font: META_FONT }}>
                  {tech}
                </text>
              </g>
            )}
          </g>
        )}
      </g>
    </g>
  );
});

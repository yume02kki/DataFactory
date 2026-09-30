import { memo } from 'react';
import { KIND_META } from '../model/defaults';
import { CELL, KIND_SIZE, nodeRect } from '../model/geometry';
import type { Dir, FactoryNode, ItemType, NodeKind } from '../model/types';
import { textWidth, truncate } from '../lib/text';
import { BuildingArt } from './BuildingArt';

const NAME_FONT = '700 13px Inter, system-ui, sans-serif';
const META_FONT = '600 11px Inter, system-ui, sans-serif';

/** Building art rotated into its footprint at (x, y) in world pixels. */
export function RotatedArt({ kind, rotation, color, queue, x, y }: { kind: NodeKind; rotation: Dir; color: string; queue?: ItemType[]; x: number; y: number }) {
  const W = KIND_SIZE[kind].w * CELL;
  const H = KIND_SIZE[kind].h * CELL;
  const fw = rotation % 2 === 0 ? W : H;
  const fh = rotation % 2 === 0 ? H : W;
  return (
    <g transform={`translate(${x + fw / 2} ${y + fh / 2}) rotate(${rotation * 90}) translate(${-W / 2} ${-H / 2})`}>
      <BuildingArt kind={kind} w={W} h={H} color={color} queue={queue} />
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
      {selected && <rect className="select-ring" x={r.x - 5} y={r.y - 5} width={r.w + 10} height={r.h + 10} rx={12} />}
      <RotatedArt kind={node.kind} rotation={node.rotation} color={node.color} queue={queue} x={r.x} y={r.y} />
      <g className="labels" transform={`translate(${r.x + r.w / 2} ${r.y + r.h + 19})`}>
        <text className="node-name" x={0} y={0} textAnchor="middle" style={{ font: NAME_FONT }}>
          {name}
        </text>
        {(type || tech) && (
          <g transform={`translate(${-lineW / 2} 17)`}>
            {type && (
              <text className="node-type" x={0} y={0} style={{ font: META_FONT }}>
                {type}
              </text>
            )}
            {tech && (
              <g transform={`translate(${typeW + gap} 0)`}>
                <rect className="tech-pill" x={0} y={-12} width={techW} height={17} rx={8.5} />
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

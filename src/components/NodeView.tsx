import { memo, useMemo } from 'react';
import { KIND_META } from '../model/defaults';
import { nodeCells, nodeRect, outlinePath } from '../model/geometry';
import type { FactoryNode, ItemType } from '../model/types';
import { textWidth, truncate } from '../lib/text';
import { BuildingArt } from './BuildingArt';

const NAME_FONT = '700 12px Inter, system-ui, sans-serif';
const META_FONT = '600 10px Inter, system-ui, sans-serif';

interface Props {
  node: FactoryNode;
  items: ItemType[];
  selected: boolean;
  dimmed: boolean;
}

export const NodeView = memo(function NodeView({ node, items, selected, dimmed }: Props) {
  const r = nodeRect(node);
  const cells = useMemo(() => nodeCells(node), [node]);
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
      {selected && <path className="select-ring" d={outlinePath(cells, -3, 9)} fillRule="evenodd" />}
      <BuildingArt kind={node.kind} cells={cells} rotation={node.rotation} color={node.color} queue={queue} />
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

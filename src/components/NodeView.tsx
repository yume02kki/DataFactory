import { memo } from 'react';
import { KIND_META } from '../model/defaults';
import { nodeRect } from '../model/geometry';
import type { FactoryNode, ItemType } from '../model/types';
import { textWidth, truncate } from '../lib/text';
import { BuildingArt } from './BuildingArt';

const NAME_FONT = '700 13px Inter, system-ui, sans-serif';
const META_FONT = '600 11px Inter, system-ui, sans-serif';

interface Props {
  node: FactoryNode;
  items: ItemType[];
  selected: boolean;
  /** Highlighted as the drop target while dragging a belt. */
  target: 'valid' | 'invalid' | null;
  dimmed: boolean;
}

export const NodeView = memo(function NodeView({ node, items, selected, target, dimmed }: Props) {
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
  const lineX = r.w / 2 - lineW / 2;

  return (
    <g
      className={`node node-${node.kind}${selected ? ' selected' : ''}${target ? ` target-${target}` : ''}${dimmed ? ' dimmed' : ''}`}
      transform={`translate(${r.x} ${r.y})`}
      data-node-id={node.id}
    >
      {selected && <rect className="select-ring" x={-7} y={-7} width={r.w + 14} height={r.h + 14} rx={15} />}
      {target && <rect className="target-ring" x={-7} y={-7} width={r.w + 14} height={r.h + 14} rx={15} />}
      <BuildingArt kind={node.kind} w={r.w} h={r.h} color={node.color} queue={queue} />

      {meta.hasInput && (
        <g className="port port-in" transform={`translate(0 ${r.h / 2})`}>
          <rect x={-7} y={-10} width={11} height={20} rx={3} />
          <path d="M -4 -4 L 0 0 L -4 4" />
        </g>
      )}
      {meta.hasOutput && (
        <g className="port port-out" transform={`translate(${r.w} ${r.h / 2})`} data-port="out" data-node-id={node.id}>
          <circle className="port-hit" r={16} />
          <circle className="port-nub" r={9} />
          <path d="M -2.5 -4 L 2 0 L -2.5 4" />
        </g>
      )}

      <g className="labels" transform={`translate(0 ${r.h + 23})`}>
        <text className="node-name" x={r.w / 2} y={0} textAnchor="middle" style={{ font: NAME_FONT }}>
          {name}
        </text>
        <g transform={`translate(${lineX} 17)`}>
          <text className="node-type" x={0} y={0} style={{ font: META_FONT }}>
            {type}
          </text>
          {tech && (
            <g transform={`translate(${typeW + gap} 0)`}>
              <rect className="tech-pill" x={0} y={-12} width={techW} height={17} rx={8.5} />
              <text className="tech-text" x={7} y={0} style={{ font: META_FONT }}>
                {tech}
              </text>
            </g>
          )}
        </g>
      </g>
    </g>
  );
});

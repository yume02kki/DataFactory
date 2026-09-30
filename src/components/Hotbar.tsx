import { KIND_META, NODE_KINDS } from '../model/defaults';
import type { Tool } from '../model/types';
import { useFactory } from '../store/useFactory';
import { KindIcon } from './KindIcon';

export const BELT_HOTKEY = '1';

export function BeltIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="belt-icon">
      <rect x="1" y="7" width="30" height="18" rx="2" className="bi-edge" />
      <rect x="1" y="8.5" width="30" height="15" rx="1.5" className="bi-surface" />
      <path d="M 8 12 L 13 16 L 8 20 Z M 18 12 L 23 16 L 18 20 Z" className="bi-chevron" />
    </svg>
  );
}

function toolLabel(tool: Tool | null, blueprintName?: string): string {
  if (!tool) return '';
  if (tool.type === 'belt') return 'Belt';
  return tool.template?.name ?? blueprintName ?? KIND_META[tool.kind].label;
}

/** Bottom toolbar: pick what the left mouse button builds. */
export function Hotbar() {
  const tool = useFactory((s) => s.tool);
  const rotation = useFactory((s) => s.rotation);
  const blueprints = useFactory((s) => s.pipeline.blueprints);
  const setTool = useFactory((s) => s.setTool);
  const blueprintName = tool?.type === 'building' && tool.blueprintId ? blueprints.find((b) => b.id === tool.blueprintId)?.name : undefined;

  return (
    <div className="hotbar-wrap">
      {tool && (
        <div className="tool-hint">
          <b>{toolLabel(tool, blueprintName)}</b>
          <span className="rot" style={{ transform: `rotate(${rotation * 90}deg)` }}>
            ➜
          </span>
          <span>
            <kbd>Left</kbd> build · <kbd>R</kbd> rotate · <kbd>Right</kbd> destroy / cancel · <kbd>Q</kbd> pick
          </span>
        </div>
      )}
      <div className="panel hotbar" role="toolbar" aria-label="Build tools">
        <button className={`hot-slot${tool?.type === 'belt' ? ' active' : ''}`} onClick={() => setTool(tool?.type === 'belt' ? null : { type: 'belt' })} title="Belt — drag to lay a conveyor">
          <BeltIcon />
          <kbd>{BELT_HOTKEY}</kbd>
        </button>
        {NODE_KINDS.map((k) => {
          const active = tool?.type === 'building' && tool.kind === k;
          return (
            <button
              key={k}
              className={`hot-slot${active ? ' active' : ''}`}
              onClick={() => setTool(active && !tool.blueprintId && !tool.template ? null : { type: 'building', kind: k, blueprintId: null })}
              title={`${KIND_META[k].label} — ${KIND_META[k].hint}`}
            >
              <KindIcon kind={k} size={34} />
              <kbd>{KIND_META[k].hotkey}</kbd>
            </button>
          );
        })}
      </div>
    </div>
  );
}

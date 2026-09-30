import { KIND_META, NODE_KINDS } from '../model/defaults';
import { KindIcon } from './KindIcon';

const CONTROLS: Array<[string, string]> = [
  ['Drag from palette', 'Place a building or drop an item'],
  ['1 · 2 · 3 · 4', 'Build a source / machine / buffer / store at the cursor'],
  ['Double-click floor', 'Quick-build menu'],
  ['Drag ▶ port → building', 'Lay a belt (drop on empty floor to build and connect)'],
  ['Drag item → belt', 'Choose what the belt carries'],
  ['Drag floor · Space+drag', 'Pan'],
  ['Scroll · + / −', 'Zoom'],
  ['F', 'Fit the whole factory on screen'],
  ['Shift+click · Shift+drag', 'Select several buildings'],
  ['Arrow keys', 'Nudge selection (Shift: 4 cells)'],
  ['Ctrl D', 'Duplicate (keeps belts inside the selection)'],
  ['Del / Backspace', 'Delete selection'],
  ['Ctrl Z · Ctrl Shift Z', 'Undo · Redo'],
  ['P', 'Pause / run the flow animation'],
  ['Ctrl S', 'Save now (autosaves anyway)'],
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="panel modal" role="dialog" aria-label="Controls" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>How the factory works</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="legend">
          {NODE_KINDS.map((k) => (
            <div key={k} className="legend-row">
              <KindIcon kind={k} size={36} />
              <div>
                <b>{KIND_META[k].label}</b>
                <div className="muted small">{KIND_META[k].hint}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="muted small">
          Every building is generic. Its <b>type</b> says what role it plays and its <b>technology</b> is free text — the factory never assumes a stack.
        </p>
        <table className="controls">
          <tbody>
            {CONTROLS.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

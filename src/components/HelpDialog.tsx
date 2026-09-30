import { KIND_META, NODE_KINDS } from '../model/defaults';
import { KindIcon } from './KindIcon';

const CONTROLS: Array<[string, string]> = [
  ['1', 'Belt tool: left-drag to lay a conveyor'],
  ['2 · 3 · 4 · 5', 'Source / machine / buffer / store tool'],
  ['Palette tile', 'Build that component type'],
  ['Left click', 'Build with the active tool (or select / move without one)'],
  ['Right click · drag', 'Destroy what is under the cursor'],
  ['Right click on floor · Esc', 'Put the tool away'],
  ['R · Shift R', 'Rotate the tool, the selected buildings, or the belt under the cursor'],
  ['Q', 'Pick up the building or belt under the cursor as the tool'],
  ['Drag item → belt', 'Choose what the belt carries'],
  ['Drag floor · WASD · Space+drag', 'Pan'],
  ['Scroll · + / −', 'Zoom'],
  ['F', 'Fit the whole factory on screen'],
  ['Shift+click · Shift+drag', 'Select several buildings and belts'],
  ['Arrow keys', 'Nudge selection (Shift: 4 cells)'],
  ['Ctrl D', 'Duplicate selection'],
  ['Del / Backspace', 'Delete selection'],
  ['Ctrl Z · Ctrl Shift Z', 'Undo · Redo'],
  ['P', 'Pause / run the flow animation'],
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
          Items enter a building on the side with inward arrows and leave on the side with outward arrows. Lay belts from one building's
          output side into the next building's input side. Every building is generic: its <b>type</b> says what role it plays and its{' '}
          <b>technology</b> is free text.
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

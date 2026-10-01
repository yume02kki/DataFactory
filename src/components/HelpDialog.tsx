import { KIND_META, NODE_KINDS } from '../model/defaults';
import { KindIcon } from './KindIcon';

const CONTROLS: Array<[string, string]> = [
  ['1', 'Belt tool: left-drag to lay a conveyor'],
  ['1 · drag from a belt', 'Start on a belt and head sideways to split it; end on a belt to merge into it'],
  ['2 · 3 · 4 · 5', 'Source / machine / buffer / store tool'],
  ['6', 'Link tool: drag from one building onto another to draw an arrow'],
  ['7 · Ctrl G', 'Area tool: drag a coloured background (Ctrl G wraps the selection)'],
  ['8', 'Text tool: click to place a note; double-click a note to edit it'],
  ['Palette tile', 'Build that component type'],
  ['Left click · drag', 'Build with the active tool; drag to paint blocks into any shape'],
  ['Right click · drag', 'Destroy what is under the cursor'],
  ['Right click on floor · Esc', 'Put the tool away'],
  ['R · Shift R', 'Rotate the tool, the selected buildings, or the belt under the cursor'],
  ['Q · Middle click', 'Pick up the building or belt under the cursor as the tool'],
  ['Drag item → belt', 'Choose what the belt carries'],
  ['Drag floor · WASD · Space+drag', 'Pan'],
  ['Scroll · + / −', 'Zoom'],
  ['F', 'Fit the whole factory on screen'],
  ['Shift/Ctrl + drag', 'Box-select buildings and belts (drag the selection to move it)'],
  ['Ctrl C · Ctrl X · Ctrl V', 'Copy · cut · paste (R rotates the paste, click to place, again for more)'],
  ['Arrow keys', 'Nudge selection (Shift: 4 cells)'],
  ['Ctrl D', 'Duplicate selection'],
  ['Del / Backspace', 'Delete selection'],
  ['Ctrl Z · Ctrl Shift Z', 'Undo · Redo'],
  ['P', 'Pause / run the flow animation'],
  ['Export ▾', 'Save a PNG or animated GIF of the whole factory or a dragged area'],
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
          output side into the next building's input side. Buildings of the same kind that touch are always one structure, of any shape, with a port on
          every exposed face. A machine's <b>Combine</b> setting can stack, paint or mix its inputs' looks into its outputs. Every building is generic: its <b>type</b> says what role it plays and its{' '}
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

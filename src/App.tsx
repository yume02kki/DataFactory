import { useEffect, useState } from 'react';
import { Canvas } from './components/Canvas';
import { ChannelPill } from './components/ChannelPill';
import { HelpDialog } from './components/HelpDialog';
import { Inspector } from './components/Inspector';
import { KindIcon } from './components/KindIcon';
import { Palette } from './components/Palette';
import { TopBar, openPipeline, saveNow } from './components/TopBar';
import { KIND_META, NODE_KINDS, examplePipeline } from './model/defaults';
import * as storage from './model/storage';
import { useFactory } from './store/useFactory';
import { fitToView, pointer, zoomBy } from './lib/viewport';
import { BELT_HOTKEY, Hotbar, LINK_HOTKEY } from './components/Hotbar';
import { CELL, cellKey } from './model/geometry';
import * as ops from './model/ops';

function hoverCell() {
  const w = pointer.world;
  return w ? { x: Math.floor(w.x / CELL), y: Math.floor(w.y / CELL) } : null;
}

function bootstrap() {
  const id = storage.getCurrentId();
  const saved = id ? storage.loadPipeline(id) : null;
  const first = storage.listPipelines()[0];
  const p = saved ?? (first ? storage.loadPipeline(first.id) : null);
  if (p) {
    useFactory.getState().loadPipeline(p);
    return false;
  }
  const example = examplePipeline();
  useFactory.getState().loadPipeline(example);
  storage.savePipeline(example);
  return true;
}

export default function App() {
  const [saved, setSaved] = useState(true);
  const [help, setHelp] = useState(false);
  const empty = useFactory((s) => s.pipeline.nodes.length === 0 && s.pipeline.belts.length === 0 && !s.tool);
  const toast = useFactory((s) => s.toast);

  useEffect(() => {
    const fresh = bootstrap();
    if (fresh) requestAnimationFrame(() => fitToView());
  }, []);

  // Autosave the factory (and where you were looking) shortly after every change.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useFactory.subscribe((s, prev) => {
      if (s.pipeline === prev.pipeline && s.view === prev.view) return;
      setSaved(false);
      clearTimeout(timer);
      timer = setTimeout(() => setSaved(saveNow()), 500);
    });
    const flush = () => saveNow();
    window.addEventListener('beforeunload', flush);
    return () => {
      unsub();
      clearTimeout(timer);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = document.activeElement;
      if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement) {
        if (e.key === 'Escape') a.blur();
        return;
      }
      const s = useFactory.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        s.redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        s.duplicateSelection();
      } else if (mod && key === 's') {
        e.preventDefault();
        s.notify(saveNow() ? 'Saved in this browser' : 'Could not save (storage unavailable)');
      } else if (mod && key === 'a') {
        e.preventDefault();
        s.select({ nodes: s.pipeline.nodes.map((n) => n.id), tiles: s.pipeline.belts.map((t) => t.id) });
      } else if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        s.deleteSelection();
      } else if (key === 'escape') {
        if (s.exportArea) s.setExportArea(null);
        else if (s.tool) s.setTool(null);
        else s.clearSelection();
        setHelp(false);
      } else if (mod) {
        return;
      } else if (key === 'f') {
        fitToView();
      } else if (key === 'p') {
        s.toggleFlow();
      } else if (key === '=' || key === '+') {
        zoomBy(1.2);
      } else if (key === '-') {
        zoomBy(1 / 1.2);
      } else if (key === '?') {
        setHelp((h) => !h);
      } else if (key.startsWith('arrow') && (s.selection.nodes.length || s.selection.tiles.length)) {
        e.preventDefault();
        const step = e.shiftKey ? 4 : 1;
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
        const { nodes, tiles } = s.selection;
        if (!ops.canMove(s.pipeline, nodes, tiles, dx, dy)) return;
        s.edit(
          (p) => {
            for (const n of p.nodes)
              if (nodes.includes(n.id)) {
                n.x += dx;
                n.y += dy;
              }
            for (const t of p.belts)
              if (tiles.includes(t.id)) {
                t.x += dx;
                t.y += dy;
              }
          },
          { coalesce: 'nudge' },
        );
      } else if (key === 'r') {
        s.rotate(e.shiftKey ? -1 : 1, hoverCell());
      } else if (key === 'q') {
        // Pipette: pick up whatever is under the cursor as the build tool.
        const cell = hoverCell();
        const occ = cell ? ops.occupancy(s.pipeline).get(cellKey(cell.x, cell.y)) : undefined;
        if (occ?.node) {
          const { name, type, technology, description, color, icon, inputs, outputs, metadata } = occ.node;
          s.setTool({ type: 'building', kind: occ.node.kind, blueprintId: null, template: { name, type, technology, description, color, icon, inputs, outputs, metadata } });
          useFactory.setState({ rotation: occ.node.rotation });
        } else if (occ?.tile) {
          s.setTool({ type: 'belt' });
          useFactory.setState({ rotation: occ.tile.dir });
        } else {
          s.setTool(null);
        }
      } else if (['w', 'a', 's', 'd'].includes(key)) {
        const step = e.shiftKey ? 160 : 60;
        const dx = key === 'a' ? step : key === 'd' ? -step : 0;
        const dy = key === 'w' ? step : key === 's' ? -step : 0;
        s.setView({ ...s.view, x: s.view.x + dx, y: s.view.y + dy });
      } else if (key === BELT_HOTKEY) {
        s.setTool(s.tool?.type === 'belt' ? null : { type: 'belt' });
      } else if (key === LINK_HOTKEY) {
        s.setTool(s.tool?.type === 'link' ? null : { type: 'link' });
      } else {
        const kind = NODE_KINDS.find((k) => KIND_META[k].hotkey === key);
        if (kind) {
          const t = s.tool;
          const same = t?.type === 'building' && t.kind === kind && !t.blueprintId && !t.template;
          s.setTool(same ? null : { type: 'building', kind, blueprintId: null });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <Canvas />
      <Palette />
      <TopBar saved={saved} onHelp={() => setHelp(true)} />
      <Inspector />
      {empty && <EmptyState />}
      <Hotbar />
      <ChannelPill />
      {toast && (
        <div className="toast" key={toast.id} role="status">
          {toast.text}
        </div>
      )}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-card panel">
        <div className="empty-icons">
          {NODE_KINDS.map((k, i) => (
            <span key={k} className="empty-icon">
              <KindIcon kind={k} size={44} />
              {i < NODE_KINDS.length - 1 && <span className="empty-arrow">→</span>}
            </span>
          ))}
        </div>
        <h2>An empty factory floor</h2>
        <p>
          Pick a building from the bar below (keys 2–5), left-click to build, <b>R</b> to rotate. Press <b>1</b> and drag to lay belts
          from a building's output side into the next one. Right-click destroys.
        </p>
        <div className="empty-actions">
          <button
            className="btn primary"
            onClick={() => {
              useFactory.getState().setTool({ type: 'building', kind: 'source', blueprintId: null });
            }}
          >
            Build a source
          </button>
          <button className="btn" onClick={() => openPipeline(examplePipeline())}>
            Open the example factory
          </button>
        </div>
      </div>
    </div>
  );
}

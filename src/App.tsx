import { useEffect, useState } from 'react';
import { Canvas } from './components/Canvas';
import { HelpDialog } from './components/HelpDialog';
import { Inspector } from './components/Inspector';
import { KindIcon } from './components/KindIcon';
import { Palette } from './components/Palette';
import { TopBar, openPipeline, saveNow } from './components/TopBar';
import { KIND_META, NODE_KINDS, examplePipeline } from './model/defaults';
import * as storage from './model/storage';
import { useFactory } from './store/useFactory';
import { fitToView, placementCell, zoomBy } from './lib/viewport';

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
  const empty = useFactory((s) => s.pipeline.nodes.length === 0);
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
        s.selectNodes(s.pipeline.nodes.map((n) => n.id));
      } else if (key === 'delete' || key === 'backspace') {
        e.preventDefault();
        s.deleteSelection();
      } else if (key === 'escape') {
        s.clearSelection();
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
      } else if (key.startsWith('arrow') && s.selection.nodes.length) {
        e.preventDefault();
        const step = e.shiftKey ? 4 : 1;
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
        const ids = new Set(s.selection.nodes);
        s.edit(
          (p) => {
            for (const n of p.nodes)
              if (ids.has(n.id)) {
                n.x += dx;
                n.y += dy;
              }
          },
          { coalesce: 'nudge' },
        );
      } else {
        const kind = NODE_KINDS.find((k) => KIND_META[k].hotkey === key);
        if (kind) s.addNode(kind, placementCell(kind, true));
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
      <div className="hintbar">
        Drag from the palette · Drag a <b>▶</b> port onto a building to lay a belt · Double-click the floor to build · Drag the floor to pan · Scroll to zoom
      </div>
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
        <p>Drag a Source from the palette, press 1–4 to drop a building, or double-click anywhere on the floor.</p>
        <div className="empty-actions">
          <button
            className="btn primary"
            onClick={() => {
              const s = useFactory.getState();
              s.addNode('source', placementCell('source', false));
            }}
          >
            Place a source
          </button>
          <button className="btn" onClick={() => openPipeline(examplePipeline())}>
            Open the example factory
          </button>
        </div>
      </div>
    </div>
  );
}

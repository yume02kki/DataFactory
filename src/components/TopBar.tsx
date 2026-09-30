import { useEffect, useMemo, useRef, useState } from 'react';
import { traceLinks } from '../model/ops';
import { blankPipeline, examplePipeline } from '../model/defaults';
import * as storage from '../model/storage';
import { useFactory } from '../store/useFactory';
import { fitToView, zoomBy } from '../lib/viewport';
import type { ExportFormat } from '../lib/exportImage';
import { useTheme } from '../lib/theme';
import { runExport } from './Canvas';

export function openPipeline(p: ReturnType<typeof blankPipeline>, fit = true) {
  const state = useFactory.getState();
  saveNow();
  state.loadPipeline(p);
  storage.savePipeline(p);
  if (fit) requestAnimationFrame(() => fitToView());
}

export function saveNow(): boolean {
  const { pipeline, view } = useFactory.getState();
  if (!pipeline.id) return false;
  return storage.savePipeline({ ...pipeline, view });
}

export function TopBar({ saved, onHelp }: { saved: boolean; onHelp: () => void }) {
  const name = useFactory((s) => s.pipeline.name);
  const pipeline = useFactory((s) => s.pipeline);
  const lines = useMemo(() => traceLinks(pipeline).length, [pipeline]);
  const counts = `${pipeline.nodes.length} buildings · ${lines} belts · ${pipeline.items.length} items`;
  const zoom = useFactory((s) => s.view.zoom);
  const flowing = useFactory((s) => s.flowing);
  const canUndo = useFactory((s) => s.past.length > 0);
  const canRedo = useFactory((s) => s.future.length > 0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const [exportOpen, setExportOpen] = useState(false);
  const { edit, undo, redo, toggleFlow } = useFactory.getState();

  return (
    <>
      <div className="panel topbar topbar-left">
        <input
          className="pipeline-name"
          value={name}
          size={Math.max(8, Math.min(32, name.length + 1))}
          onChange={(e) => edit((p) => void (p.name = e.target.value), { coalesce: 'pipeline:name' })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label="Factory name"
        />
        <span className={`save-state${saved ? ' ok' : ''}`} title={saved ? 'Saved in this browser' : 'Saving…'}>
          {saved ? '● Saved' : '○ Saving…'}
        </span>
        <div className="menu-anchor">
          <button className={`btn ghost${menuOpen ? ' active' : ''}`} onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
            Factories ▾
          </button>
          {menuOpen && <FactoriesMenu onClose={() => setMenuOpen(false)} />}
        </div>
        <div className="menu-anchor">
          <button className={`btn ghost${exportOpen ? ' active' : ''}`} onClick={() => setExportOpen((o) => !o)} aria-haspopup="menu" aria-expanded={exportOpen}>
            Export ▾
          </button>
          {exportOpen && <ExportMenu onClose={() => setExportOpen(false)} />}
        </div>
        <span className="counts">{counts}</span>
      </div>

      <div className="panel topbar topbar-right">
        <button className="icon-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl Z)" aria-label="Undo">
          ↶
        </button>
        <button className="icon-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl Shift Z)" aria-label="Redo">
          ↷
        </button>
        <span className="divider" />
        <button className={`flow-btn${flowing ? ' on' : ''}`} onClick={toggleFlow} title="Pause or run the item flow (P)">
          {flowing ? '❚❚ Pause flow' : '▶ Run flow'}
        </button>
        <span className="divider" />
        <button className="icon-btn" onClick={() => zoomBy(1 / 1.2)} title="Zoom out (-)" aria-label="Zoom out">
          −
        </button>
        <button className="zoom-level" onClick={() => zoomBy(1 / useFactory.getState().view.zoom)} title="Reset zoom">
          {Math.round(zoom * 100)}%
        </button>
        <button className="icon-btn" onClick={() => zoomBy(1.2)} title="Zoom in (+)" aria-label="Zoom in">
          +
        </button>
        <button className="icon-btn" onClick={fitToView} title="Fit factory to screen (F)" aria-label="Fit to screen">
          ⤢
        </button>
        <span className="divider" />
        <button className="icon-btn theme-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle dark mode">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <button className="icon-btn" onClick={onHelp} title="Controls (?)" aria-label="Help">
          ?
        </button>
      </div>
    </>
  );
}

function FactoriesMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentId = useFactory((s) => s.pipeline.id);
  const [list, setList] = useState(() => storage.listPipelines());
  const notify = useFactory.getState().notify;

  useEffect(() => {
    saveNow();
    setList(storage.listPipelines());
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest('.menu-anchor')) onClose();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [onClose]);

  const open = (id: string) => {
    const p = storage.loadPipeline(id);
    if (p) openPipeline(p);
    onClose();
  };

  return (
    <div className="menu" ref={ref} role="menu">
      <button className="menu-item" onClick={() => (openPipeline(blankPipeline(), true), onClose())}>
        <span>＋</span> New empty factory
      </button>
      <button className="menu-item" onClick={() => (openPipeline(examplePipeline(), true), onClose())}>
        <span>★</span> New from example
      </button>
      <div className="menu-sep" />
      <div className="menu-label">Saved in this browser</div>
      <div className="menu-list">
        {list.map((entry) => (
          <div key={entry.id} className={`menu-row${entry.id === currentId ? ' current' : ''}`}>
            <button className="menu-item grow" onClick={() => open(entry.id)} disabled={entry.id === currentId}>
              <span className="menu-name">{entry.name || 'Untitled'}</span>
              <span className="muted small">
                {entry.nodeCount} bldg · {new Date(entry.updatedAt).toLocaleDateString()}
              </span>
            </button>
            {entry.id !== currentId && (
              <button
                className="icon-btn small"
                title="Delete factory"
                aria-label={`Delete ${entry.name}`}
                onClick={() => {
                  if (confirm(`Delete “${entry.name}”? This cannot be undone.`)) {
                    storage.deletePipeline(entry.id);
                    setList(storage.listPipelines());
                  }
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="menu-sep" />
      <button
        className="menu-item"
        onClick={() => {
          notify(saveNow() ? 'Saved in this browser' : 'Could not save (storage unavailable)');
          onClose();
        }}
      >
        <span>⤓</span> Save now <kbd>Ctrl S</kbd>
      </button>
      <button
        className="menu-item"
        onClick={() => {
          const { pipeline, view } = useFactory.getState();
          storage.downloadPipeline({ ...pipeline, view });
          onClose();
        }}
      >
        <span>⇩</span> Export as JSON
      </button>
      <button className="menu-item" onClick={() => fileRef.current?.click()}>
        <span>⇧</span> Import JSON…
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            openPipeline(await storage.readPipelineFile(file));
            notify(`Imported “${file.name}”`);
          } catch (err) {
            notify(err instanceof Error ? err.message : 'Could not import that file');
          }
          onClose();
        }}
      />
    </div>
  );
}

function ExportMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState(false);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest('.menu-anchor')) onClose();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [onClose]);

  const whole = (format: ExportFormat) => {
    onClose();
    runExport(format, undefined, grid);
  };
  const area = (format: ExportFormat) => {
    onClose();
    useFactory.getState().setExportArea({ format, grid });
  };

  return (
    <div className="menu" ref={ref} role="menu">
      <div className="menu-label">Image (PNG)</div>
      <button className="menu-item" onClick={() => whole('png')}>
        <span>▣</span> Whole factory
      </button>
      <button className="menu-item" onClick={() => area('png')}>
        <span>⬚</span> Select an area…
      </button>
      <div className="menu-sep" />
      <div className="menu-label">Animation (GIF)</div>
      <button className="menu-item" onClick={() => whole('gif')}>
        <span>▣</span> Whole factory
      </button>
      <button className="menu-item" onClick={() => area('gif')}>
        <span>⬚</span> Select an area…
      </button>
      <div className="menu-sep" />
      <div className="menu-label">Video (MP4)</div>
      <button className="menu-item" onClick={() => whole('mp4')}>
        <span>▣</span> Whole factory
      </button>
      <button className="menu-item" onClick={() => area('mp4')}>
        <span>⬚</span> Select an area…
      </button>
      <div className="menu-sep" />
      <label className="menu-check">
        <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Include the grid
      </label>
    </div>
  );
}

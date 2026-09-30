import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KIND_META, NODE_KINDS } from '../model/defaults';
import { CELL, KIND_SIZE, inPort, nodeRect, normalizeRect, outPort, pathFromPoints, rectContains, rectsIntersect, routeBelt, type Pt, type Rect } from '../model/geometry';
import * as ops from '../model/ops';
import type { FactoryNode, NodeKind } from '../model/types';
import { useFactory } from '../store/useFactory';
import { CANVAS_ID, pointer, zoomAt } from '../lib/viewport';
import { BeltView } from './BeltView';
import { NodeView } from './NodeView';
import { KindIcon } from './KindIcon';

export const DND_MIME = 'application/x-datafactory';

export type DragPayload =
  | { type: 'blueprint'; id: string }
  | { type: 'kind'; kind: NodeKind }
  | { type: 'item'; id: string };

type Gesture =
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | {
      type: 'drag';
      start: Pt;
      origins: Map<string, { x: number; y: number }>;
      last: { dx: number; dy: number };
      moved: boolean;
      nodeId: string;
      narrowOnClick: boolean;
    }
  | { type: 'connect'; from: string; start: Pt }
  | { type: 'marquee'; start: Pt; additive: boolean; base: string[] };

interface ConnectPreview {
  from: string;
  to: Pt;
  target: string | null;
  valid: boolean;
}

interface QuickBuild {
  screen: Pt;
  world: Pt;
  from: string | null;
}

function nodeAt(nodes: FactoryNode[], p: Pt, pad = 0): FactoryNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (rectContains(nodeRect(nodes[i]), p, pad)) return nodes[i];
  }
  return null;
}

export function Canvas() {
  const pipeline = useFactory((s) => s.pipeline);
  const view = useFactory((s) => s.view);
  const selection = useFactory((s) => s.selection);
  const flowing = useFactory((s) => s.flowing);
  const highlightItem = useFactory((s) => s.highlightItem);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const spaceHeld = useRef(false);
  const [preview, setPreview] = useState<ConnectPreview | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [quick, setQuick] = useState<QuickBuild | null>(null);
  const [panning, setPanning] = useState(false);
  const [dropHint, setDropHint] = useState(false);

  const toWorld = useCallback((clientX: number, clientY: number): Pt => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const v = useFactory.getState().view;
    return { x: (clientX - rect.left - v.x) / v.zoom, y: (clientY - rect.top - v.y) / v.zoom };
  }, []);

  // Pause SMIL item animations together with the CSS belt treads.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (flowing) svg.unpauseAnimations();
    else svg.pauseAnimations();
  }, [flowing]);

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const { view: v, setView } = useFactory.getState();
      // Trackpad two-finger scroll pans; pinch (ctrlKey) and mouse wheels zoom.
      const isTrackpadPan = !e.ctrlKey && e.deltaMode === 0 && Math.abs(e.deltaX) > 0;
      if (isTrackpadPan) {
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
        return;
      }
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const factor = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015));
      setView(zoomAt(v, factor, e.clientX - rect.left, e.clientY - rect.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const isTyping = () => {
      const a = document.activeElement;
      return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement;
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping()) {
        spaceHeld.current = true;
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        setQuick(null);
        if (gesture.current?.type === 'connect') {
          gesture.current = null;
          setPreview(null);
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    setQuick(null);
    const target = e.target as Element;
    const world = toWorld(e.clientX, e.clientY);
    const state = useFactory.getState();
    const portEl = target.closest('[data-port="out"]');
    const nodeEl = target.closest('[data-node-id]');
    const beltEl = target.closest('[data-belt-id]');

    svgRef.current?.setPointerCapture(e.pointerId);

    if (e.button === 1 || spaceHeld.current) {
      gesture.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y, moved: false };
      setPanning(true);
      return;
    }

    if (portEl) {
      const from = portEl.getAttribute('data-node-id')!;
      gesture.current = { type: 'connect', from, start: world };
      setPreview({ from, to: world, target: null, valid: false });
      return;
    }

    if (nodeEl) {
      const id = nodeEl.getAttribute('data-node-id')!;
      let selected = state.selection.nodes;
      let narrowOnClick = false;
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        state.selectNodes([id], true);
        selected = useFactory.getState().selection.nodes;
        if (!selected.includes(id)) return;
      } else if (!selected.includes(id)) {
        state.selectNodes([id]);
        selected = [id];
      } else {
        narrowOnClick = selected.length > 1;
      }
      const origins = new Map<string, { x: number; y: number }>();
      for (const n of state.pipeline.nodes) if (selected.includes(n.id)) origins.set(n.id, { x: n.x, y: n.y });
      gesture.current = { type: 'drag', start: world, origins, last: { dx: 0, dy: 0 }, moved: false, nodeId: id, narrowOnClick };
      return;
    }

    if (beltEl) {
      state.select({ belt: beltEl.getAttribute('data-belt-id') });
      return;
    }

    if (e.shiftKey) {
      const base = state.selection.nodes;
      gesture.current = { type: 'marquee', start: world, additive: true, base };
      return;
    }

    gesture.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y, moved: false };
    setPanning(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const world = toWorld(e.clientX, e.clientY);
    pointer.world = world;
    const g = gesture.current;
    if (!g) return;
    const state = useFactory.getState();

    if (g.type === 'pan') {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (!g.moved && Math.hypot(dx, dy) > 3) g.moved = true;
      if (g.moved) state.setView({ ...state.view, x: g.vx + dx, y: g.vy + dy });
      return;
    }

    if (g.type === 'drag') {
      const dx = Math.round((world.x - g.start.x) / CELL);
      const dy = Math.round((world.y - g.start.y) / CELL);
      if (dx === g.last.dx && dy === g.last.dy) return;
      if (!g.moved) {
        g.moved = true;
        state.checkpoint();
      }
      g.last = { dx, dy };
      state.edit(
        (p) => {
          for (const n of p.nodes) {
            const o = g.origins.get(n.id);
            if (o) {
              n.x = o.x + dx;
              n.y = o.y + dy;
            }
          }
        },
        { history: false },
      );
      return;
    }

    if (g.type === 'connect') {
      const hit = nodeAt(state.pipeline.nodes, world, 12);
      const target = hit && hit.id !== g.from ? hit : null;
      const valid = target ? ops.canConnect(state.pipeline, g.from, target.id).ok : false;
      setPreview({ from: g.from, to: target && valid ? inPort(target) : world, target: target?.id ?? null, valid });
      return;
    }

    if (g.type === 'marquee') {
      const rect = normalizeRect(g.start, world);
      setMarquee(rect);
      const inside = state.pipeline.nodes.filter((n) => rectsIntersect(nodeRect(n), rect)).map((n) => n.id);
      state.selectNodes([...new Set([...g.base, ...inside])]);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    setPanning(false);
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    if (!g) return;
    const state = useFactory.getState();

    if (g.type === 'pan' && !g.moved) {
      state.clearSelection();
    } else if (g.type === 'drag' && !g.moved && g.narrowOnClick) {
      state.selectNodes([g.nodeId]);
    } else if (g.type === 'connect') {
      const world = toWorld(e.clientX, e.clientY);
      setPreview(null);
      const hit = nodeAt(state.pipeline.nodes, world, 12);
      if (hit && hit.id !== g.from) {
        const id = state.addBelt(g.from, hit.id);
        if (id) state.select({ belt: id });
      } else if (!hit && Math.hypot(world.x - g.start.x, world.y - g.start.y) > 30) {
        const rect = wrapRef.current!.getBoundingClientRect();
        setQuick({ screen: { x: e.clientX - rect.left, y: e.clientY - rect.top }, world, from: g.from });
      }
    } else if (g.type === 'marquee') {
      setMarquee(null);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as Element;
    if (target.closest('[data-node-id]') || target.closest('[data-belt-id]')) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    setQuick({ screen: { x: e.clientX - rect.left, y: e.clientY - rect.top }, world: toWorld(e.clientX, e.clientY), from: null });
  };

  const quickBuild = (kind: NodeKind) => {
    if (!quick) return;
    const size = KIND_SIZE[kind];
    const state = useFactory.getState();
    const cell = quick.from
      ? { x: Math.round(quick.world.x / CELL), y: Math.round(quick.world.y / CELL - size.h / 2) }
      : { x: Math.round(quick.world.x / CELL - size.w / 2), y: Math.round(quick.world.y / CELL - size.h / 2) };
    const id = state.addNode(kind, cell);
    if (quick.from) state.addBelt(quick.from, id);
    setQuick(null);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(DND_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropHint(true);
  };

  const onDrop = (e: React.DragEvent) => {
    setDropHint(false);
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return;
    e.preventDefault();
    let payload: DragPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const state = useFactory.getState();
    const world = toWorld(e.clientX, e.clientY);

    if (payload.type === 'item') {
      const itemId = payload.id;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const beltId = el?.closest('[data-belt-id]')?.getAttribute('data-belt-id');
      const nodeId = el?.closest('[data-node-id]')?.getAttribute('data-node-id') ?? nodeAt(state.pipeline.nodes, world, 8)?.id;
      if (nodeId) {
        const node = state.pipeline.nodes.find((n) => n.id === nodeId)!;
        const list = KIND_META[node.kind].hasOutput ? 'outputs' : 'inputs';
        state.edit((p) => {
          const n = p.nodes.find((x) => x.id === nodeId)!;
          if (!n[list].includes(itemId)) n[list].push(itemId);
        });
        state.selectNodes([nodeId]);
      } else if (beltId) {
        state.edit((p) => ops.setBeltItem(p, beltId, itemId));
        state.select({ belt: beltId });
      } else {
        state.notify('Drop items onto a belt or a building');
      }
      return;
    }

    const kind = payload.type === 'kind' ? payload.kind : state.pipeline.blueprints.find((b) => b.id === payload.id)?.kind;
    if (!kind) return;
    const blueprint = payload.type === 'blueprint' ? state.pipeline.blueprints.find((b) => b.id === payload.id) : undefined;
    const size = KIND_SIZE[kind];
    state.addNode(kind, { x: Math.round(world.x / CELL - size.w / 2), y: Math.round(world.y / CELL - size.h / 2) }, blueprint);
  };

  const itemsById = useMemo(() => new Map(pipeline.items.map((i) => [i.id, i])), [pipeline.items]);
  const nodesById = useMemo(() => new Map(pipeline.nodes.map((n) => [n.id, n])), [pipeline.nodes]);
  const selectedNodes = useMemo(() => new Set(selection.nodes), [selection.nodes]);
  const activeItem = highlightItem ?? selection.item;

  const previewPath = useMemo(() => {
    if (!preview) return null;
    const from = nodesById.get(preview.from);
    if (!from) return null;
    const target = preview.target && preview.valid ? nodesById.get(preview.target) : undefined;
    return pathFromPoints(routeBelt(outPort(from), preview.to, nodeRect(from), target ? nodeRect(target) : undefined));
  }, [preview, nodesById]);

  const cellPx = CELL * view.zoom;
  const quickKinds = quick?.from ? NODE_KINDS.filter((k) => KIND_META[k].hasInput) : NODE_KINDS;

  return (
    <div
      id={CANVAS_ID}
      ref={wrapRef}
      className={`canvas-wrap${flowing ? ' flowing' : ' paused'}${panning ? ' panning' : ''}${preview ? ' connecting' : ''}${dropHint ? ' drop-hint' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={() => setDropHint(false)}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg
        ref={svgRef}
        className="canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <defs>
          <pattern id="grid-minor" width={cellPx} height={cellPx} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
            <path d={`M ${cellPx} 0 L 0 0 0 ${cellPx}`} className="grid-line" style={{ opacity: Math.min(1, Math.max(0, (view.zoom - 0.3) * 2)) }} />
          </pattern>
          <pattern id="grid-major" width={cellPx * 8} height={cellPx * 8} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
            <rect width={cellPx * 8} height={cellPx * 8} fill="url(#grid-minor)" />
            <path d={`M ${cellPx * 8} 0 L 0 0 0 ${cellPx * 8}`} className="grid-line-major" />
          </pattern>
        </defs>
        <rect className="grid-bg" width="100%" height="100%" fill="url(#grid-major)" />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          <g className="layer-belts">
            {pipeline.belts.map((b) => {
              const from = nodesById.get(b.from);
              const to = nodesById.get(b.to);
              if (!from || !to) return null;
              return (
                <BeltView
                  key={b.id}
                  belt={b}
                  from={from}
                  to={to}
                  item={b.itemId ? itemsById.get(b.itemId) ?? null : null}
                  selected={selection.belt === b.id}
                  highlighted={!!activeItem && b.itemId === activeItem}
                  dimmed={!!activeItem && b.itemId !== activeItem}
                />
              );
            })}
          </g>
          {preview && previewPath && <path className={`belt-preview${preview.valid ? ' valid' : ''}`} d={previewPath} />}
          <g className="layer-nodes">
            {pipeline.nodes.map((n) => (
              <NodeView
                key={n.id}
                node={n}
                items={pipeline.items}
                selected={selectedNodes.has(n.id)}
                target={preview?.target === n.id ? (preview.valid ? 'valid' : 'invalid') : null}
                dimmed={!!activeItem && !n.inputs.includes(activeItem) && !n.outputs.includes(activeItem)}
              />
            ))}
          </g>
          {marquee && <rect className="marquee" x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} />}
        </g>
      </svg>

      {quick && (
        <div className="quick-build" style={{ left: quick.screen.x, top: quick.screen.y }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="quick-title">{quick.from ? 'Connect to a new…' : 'Build here'}</div>
          <div className="quick-options">
            {quickKinds.map((k) => (
              <button key={k} className="quick-option" onClick={() => quickBuild(k)}>
                <KindIcon kind={k} size={34} />
                <span>{KIND_META[k].label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

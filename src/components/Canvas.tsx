import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KIND_META } from '../model/defaults';
import { CELL, cellKey, lPath, nodeRect, normalizeRect, rectsIntersect, type Pt, type Rect } from '../model/geometry';
import * as ops from '../model/ops';
import type { Dir, NodeKind } from '../model/types';
import { useFactory } from '../store/useFactory';
import { CANVAS_ID, pointer, zoomAt } from '../lib/viewport';
import { BeltTiles, LinkItems } from './BeltView';
import { NodeView } from './NodeView';
import { BuildingArt } from './BuildingArt';

export const DND_MIME = 'application/x-datafactory';

export type DragPayload = { type: 'item'; id: string };

type Gesture =
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean; clearOnClick: boolean }
  | { type: 'paint'; start: Pt; axis: 'h' | 'v' | null }
  | { type: 'place'; last: Pt; placed: number }
  | { type: 'erase'; last: Pt; erased: boolean; moved: boolean }
  | {
      type: 'drag';
      start: Pt;
      nodes: Map<string, Pt>;
      tiles: Map<string, Pt>;
      last: Pt;
      moved: boolean;
      nodeId: string | null;
      narrowOnClick: boolean;
    }
  | { type: 'marquee'; start: Pt; baseNodes: string[]; baseTiles: string[] };

const cellOf = (w: Pt): Pt => ({ x: Math.floor(w.x / CELL), y: Math.floor(w.y / CELL) });

/** Cells on a straight-ish line between two cells, so fast drags don't skip any. */
function cellsBetween(a: Pt, b: Pt): Pt[] {
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) out.push({ x: Math.round(a.x + ((b.x - a.x) * i) / n), y: Math.round(a.y + ((b.y - a.y) * i) / n) });
  return out;
}

export function Canvas() {
  const pipeline = useFactory((s) => s.pipeline);
  const view = useFactory((s) => s.view);
  const selection = useFactory((s) => s.selection);
  const flowing = useFactory((s) => s.flowing);
  const highlightItem = useFactory((s) => s.highlightItem);
  const tool = useFactory((s) => s.tool);
  const rotation = useFactory((s) => s.rotation);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const spaceHeld = useRef(false);
  const [hover, setHover] = useState<Pt | null>(null);
  const [paintPreview, setPaintPreview] = useState<Array<Pt & { dir: Dir }> | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [panning, setPanning] = useState(false);

  const toWorld = useCallback((clientX: number, clientY: number): Pt => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const v = useFactory.getState().view;
    return { x: (clientX - rect.left - v.x) / v.zoom, y: (clientY - rect.top - v.y) / v.zoom };
  }, []);

  // Pause SMIL item animations together with the CSS machine animations.
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
      if (!e.ctrlKey && e.deltaMode === 0 && Math.abs(e.deltaX) > 0) {
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
        return;
      }
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      setView(zoomAt(v, Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - rect.left, e.clientY - rect.top));
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
      if (e.key === 'Escape' && gesture.current?.type === 'paint') {
        gesture.current = null;
        setPaintPreview(null);
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

  const eraseAt = (cells: Pt[]) => {
    let erased = false;
    useFactory.getState().edit(
      (p) => {
        for (const c of cells) if (ops.eraseCell(p, c.x, c.y)) erased = true;
      },
      { history: false },
    );
    return erased;
  };

  const placeBlockAt = (cell: Pt) => {
    const state = useFactory.getState();
    const t = state.tool;
    if (t?.type !== 'building') return null;
    const blueprint = t.blueprintId ? state.pipeline.blueprints.find((b) => b.id === t.blueprintId) : undefined;
    return state.placeNode(t.kind, cell, state.rotation, blueprint, t.template, { history: false });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const world = toWorld(e.clientX, e.clientY);
    const cell = cellOf(world);
    const state = useFactory.getState();
    svgRef.current?.setPointerCapture(e.pointerId);
    (document.activeElement as HTMLElement | null)?.blur?.();

    if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
      gesture.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y, moved: false, clearOnClick: false };
      setPanning(true);
      return;
    }

    // Right mouse destroys whatever is under the cursor (drag to destroy more).
    if (e.button === 2) {
      state.checkpoint();
      const erased = eraseAt([cell]);
      gesture.current = { type: 'erase', last: cell, erased, moved: false };
      return;
    }
    if (e.button !== 0) return;

    if (tool?.type === 'belt') {
      gesture.current = { type: 'paint', start: cell, axis: null };
      setPaintPreview(lPath(cell, cell, 'h', state.rotation));
      return;
    }

    if (tool?.type === 'building') {
      // Drag to lay a row of blocks; neighbours of the same type join into one wide block.
      state.checkpoint();
      gesture.current = { type: 'place', last: cell, placed: placeBlockAt(cell) ? 1 : 0 };
      return;
    }

    const occ = occupancy.get(cellKey(cell.x, cell.y));
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const inSelection = (occ?.node && state.selection.nodes.includes(occ.node.id)) || (occ?.tile && state.selection.tiles.includes(occ.tile.id));

    if (occ?.node || (occ?.tile && inSelection)) {
      let sel = state.selection;
      let narrowOnClick = false;
      if (occ.node && additive) {
        state.selectNodes([occ.node.id], true);
        sel = useFactory.getState().selection;
        if (!sel.nodes.includes(occ.node.id)) return;
      } else if (!inSelection && occ.node) {
        state.selectNodes([occ.node.id]);
        sel = useFactory.getState().selection;
      } else {
        narrowOnClick = sel.nodes.length + sel.tiles.length > 1 && !!occ.node;
      }
      const nodes = new Map<string, Pt>();
      const tiles = new Map<string, Pt>();
      for (const n of state.pipeline.nodes) if (sel.nodes.includes(n.id)) nodes.set(n.id, { x: n.x, y: n.y });
      for (const t of state.pipeline.belts) if (sel.tiles.includes(t.id)) tiles.set(t.id, { x: t.x, y: t.y });
      gesture.current = { type: 'drag', start: cell, nodes, tiles, last: { x: 0, y: 0 }, moved: false, nodeId: occ.node?.id ?? null, narrowOnClick };
      return;
    }

    if (additive) {
      gesture.current = { type: 'marquee', start: world, baseNodes: state.selection.nodes, baseTiles: state.selection.tiles };
      return;
    }

    if (occ?.tile) state.select({ belt: occ.tile.id });
    gesture.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y, moved: false, clearOnClick: !occ?.tile };
    setPanning(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const world = toWorld(e.clientX, e.clientY);
    const cell = cellOf(world);
    pointer.world = world;
    setHover((h) => (h && h.x === cell.x && h.y === cell.y ? h : cell));
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

    if (g.type === 'paint') {
      if (!g.axis && (cell.x !== g.start.x || cell.y !== g.start.y)) g.axis = Math.abs(cell.x - g.start.x) >= Math.abs(cell.y - g.start.y) ? 'h' : 'v';
      setPaintPreview(lPath(g.start, cell, g.axis ?? 'h', state.rotation));
      return;
    }

    if (g.type === 'place') {
      if (cell.x === g.last.x && cell.y === g.last.y) return;
      for (const c of cellsBetween(g.last, cell)) if (placeBlockAt(c)) g.placed++;
      g.last = cell;
      return;
    }

    if (g.type === 'erase') {
      if (cell.x === g.last.x && cell.y === g.last.y) return;
      g.moved = true;
      if (eraseAt(cellsBetween(g.last, cell))) g.erased = true;
      g.last = cell;
      return;
    }

    if (g.type === 'drag') {
      const dx = cell.x - g.start.x;
      const dy = cell.y - g.start.y;
      if (dx === g.last.x && dy === g.last.y) return;
      if (!ops.canMove(state.pipeline, [...g.nodes.keys()], [...g.tiles.keys()], dx - g.last.x, dy - g.last.y)) return;
      if (!g.moved) {
        g.moved = true;
        state.checkpoint();
      }
      g.last = { x: dx, y: dy };
      state.edit(
        (p) => {
          for (const n of p.nodes) {
            const o = g.nodes.get(n.id);
            if (o) {
              n.x = o.x + dx;
              n.y = o.y + dy;
            }
          }
          for (const t of p.belts) {
            const o = g.tiles.get(t.id);
            if (o) {
              t.x = o.x + dx;
              t.y = o.y + dy;
            }
          }
        },
        { history: false },
      );
      return;
    }

    if (g.type === 'marquee') {
      const rect = normalizeRect(g.start, world);
      setMarquee(rect);
      const nodes = state.pipeline.nodes.filter((n) => rectsIntersect(nodeRect(n), rect)).map((n) => n.id);
      const tiles = state.pipeline.belts.filter((t) => rectsIntersect({ x: t.x * CELL, y: t.y * CELL, w: CELL, h: CELL }, rect)).map((t) => t.id);
      state.select({ nodes: [...new Set([...g.baseNodes, ...nodes])], tiles: [...new Set([...g.baseTiles, ...tiles])] });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    setPanning(false);
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    if (!g) return;
    const state = useFactory.getState();

    if (g.type === 'pan' && !g.moved && g.clearOnClick) {
      state.clearSelection();
    } else if (g.type === 'paint') {
      const cells = paintPreview ?? [];
      setPaintPreview(null);
      state.paintBelt(cells);
      // Keep drawing in the direction we were going, like shapez.
      const last = cells[cells.length - 1];
      if (last) useFactory.setState({ rotation: last.dir });
    } else if (g.type === 'place') {
      if (!g.placed) {
        useFactory.setState((s) => ({ past: s.past.slice(0, -1) }));
        state.notify('Something is in the way');
      }
    } else if (g.type === 'erase') {
      if (!g.erased) {
        // Nothing destroyed: drop the history entry, and treat it as "cancel tool".
        useFactory.setState((s) => ({ past: s.past.slice(0, -1) }));
        if (!g.moved && state.tool) state.setTool(null);
        else if (!g.moved) state.clearSelection();
      }
    } else if (g.type === 'drag' && !g.moved && g.narrowOnClick && g.nodeId) {
      state.selectNodes([g.nodeId]);
    } else if (g.type === 'marquee') {
      setMarquee(null);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(DND_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (e: React.DragEvent) => {
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
    const cell = cellOf(toWorld(e.clientX, e.clientY));
    const occ = ops.occupancy(state.pipeline).get(cellKey(cell.x, cell.y));
    const itemId = payload.id;
    if (occ?.tile) {
      const tileId = occ.tile.id;
      state.edit((p) => ops.setLinkItem(p, tileId, itemId));
      state.select({ belt: tileId });
    } else if (occ?.node) {
      const node = occ.node;
      const list = KIND_META[node.kind].hasOutput ? 'outputs' : 'inputs';
      state.edit((p) => {
        const n = p.nodes.find((x) => x.id === node.id)!;
        if (!n[list].includes(itemId)) n[list].push(itemId);
      });
      state.selectNodes([node.id]);
    } else {
      state.notify('Drop items onto a belt or a building');
    }
  };

  const occupancy = useMemo(() => ops.occupancy(pipeline), [pipeline]);
  const links = useMemo(() => ops.traceLinks(pipeline), [pipeline]);
  const inflow = useMemo(() => ops.tileInflow(pipeline), [pipeline]);
  const itemsById = useMemo(() => new Map(pipeline.items.map((i) => [i.id, i])), [pipeline.items]);
  const activeItem = highlightItem ?? selection.item;

  const selectedTiles = useMemo(() => {
    const set = new Set(selection.tiles);
    if (selection.belt) {
      const link = links.find((l) => l.tiles.some((t) => t.id === selection.belt));
      for (const t of link?.tiles ?? []) set.add(t.id);
      set.add(selection.belt);
    }
    return set;
  }, [selection.tiles, selection.belt, links]);

  const dimmedTiles = useMemo(() => {
    if (!activeItem) return undefined;
    const lit = new Set(links.filter((l) => l.itemId === activeItem).flatMap((l) => l.tiles.map((t) => t.id)));
    return new Set(pipeline.belts.filter((t) => !lit.has(t.id)).map((t) => t.id));
  }, [activeItem, links, pipeline.belts]);

  // Ghost preview for the active tool.
  const ghost = useMemo(() => {
    if (!hover || !tool || gesture.current?.type === 'erase') return null;
    if (tool.type === 'belt') {
      if (paintPreview) return null;
      return { belt: [{ id: 'ghost', x: hover.x, y: hover.y, dir: rotation, itemId: null, description: '' }] };
    }
    const at = hover;
    const blueprint = tool.blueprintId ? pipeline.blueprints.find((b) => b.id === tool.blueprintId) : undefined;
    const color = tool.template?.color ?? blueprint?.color ?? KIND_META[tool.kind].color;
    const valid = ops.canPlaceNode(pipeline, at.x, at.y);
    return { building: { kind: tool.kind as NodeKind, at, color, valid } };
  }, [hover, tool, rotation, pipeline, paintPreview]);

  const previewTiles = useMemo(() => {
    const cells = paintPreview ?? ghost?.belt;
    if (!cells) return null;
    const tiles = cells
      .filter((c) => !occupancy.get(cellKey(c.x, c.y))?.node)
      .map((c, i) => ({ id: `p${i}`, x: c.x, y: c.y, dir: c.dir, itemId: null, description: '' }));
    // Preview curves follow the previous preview tile.
    const inflowPreview = new Map<string, Dir>();
    tiles.forEach((t, i) => inflowPreview.set(t.id, i > 0 ? tiles[i - 1].dir : t.dir));
    return { tiles, inflow: inflowPreview };
  }, [paintPreview, ghost, occupancy]);

  const cellPx = CELL * view.zoom;
  // Belt labels only for the belt under the cursor or the selected one; the item shapes speak for themselves.
  const labelledLinks = useMemo(() => {
    const ids = new Set<string>();
    const hoverTile = hover && !tool ? occupancy.get(cellKey(hover.x, hover.y))?.tile : undefined;
    for (const l of links) {
      if ((hoverTile && l.tiles.includes(hoverTile)) || (selection.belt && l.tiles.some((t) => t.id === selection.belt))) ids.add(l.id);
    }
    return ids;
  }, [hover, tool, occupancy, links, selection.belt]);

  return (
    <div
      id={CANVAS_ID}
      ref={wrapRef}
      className={`canvas-wrap${flowing ? ' flowing' : ' paused'}${panning ? ' panning' : ''}${tool ? ' building' : ''}`}
      onDragOver={onDragOver}
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
        onPointerLeave={() => !gesture.current && setHover(null)}
      >
        <defs>
          <pattern id="grid" width={cellPx} height={cellPx} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
            <path d={`M ${cellPx} 0 L 0 0 0 ${cellPx}`} className="grid-line" style={{ opacity: Math.min(1, Math.max(0, (view.zoom - 0.3) * 2)) }} />
          </pattern>
        </defs>
        <rect className="grid-bg" width="100%" height="100%" fill="url(#grid)" />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          <BeltTiles tiles={pipeline.belts} inflow={inflow} selected={selectedTiles} dimmed={dimmedTiles} />
          <g className="layer-items">
            {links.map((l) => (
              <LinkItems
                key={l.id}
                link={l}
                item={l.itemId ? itemsById.get(l.itemId) ?? null : null}
                dimmed={!!activeItem && l.itemId !== activeItem}
                showLabel={labelledLinks.has(l.id)}
              />
            ))}
          </g>
          <g className="layer-nodes">
            {pipeline.nodes.map((n) => (
              <NodeView
                key={n.id}
                node={n}
                items={pipeline.items}
                selected={selection.nodes.includes(n.id)}
                dimmed={!!activeItem && !n.inputs.includes(activeItem) && !n.outputs.includes(activeItem)}
              />
            ))}
          </g>
          {previewTiles && <BeltTiles tiles={previewTiles.tiles} inflow={previewTiles.inflow} className="belt-ghost" />}
          {ghost?.building && (
            <g className={`ghost-building${ghost.building.valid ? '' : ' invalid'}`}>
              <BuildingArt kind={ghost.building.kind} cells={[ghost.building.at]} rotation={rotation} color={ghost.building.color} />
              {!ghost.building.valid && (
                <rect
                  className="ghost-block"
                  x={ghost.building.at.x * CELL}
                  y={ghost.building.at.y * CELL}
                  width={CELL}
                  height={CELL}
                  rx={7}
                />
              )}
            </g>
          )}
          {hover && !tool && (
            <rect className="hover-cell" x={hover.x * CELL} y={hover.y * CELL} width={CELL} height={CELL} rx={4} />
          )}
          {marquee && <rect className="marquee" x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} />}
        </g>
      </svg>
    </div>
  );
}

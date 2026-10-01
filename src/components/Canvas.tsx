import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ARROW_COLOR, KIND_META, SWATCHES } from '../model/defaults';
import { CELL, cellKey, nodeCells, nodeRect, normalizeRect, rectsIntersect, type Pt, type Rect } from '../model/geometry';
import * as ops from '../model/ops';
import type { Dir, NodeKind, Pipeline } from '../model/types';
import { useFactory } from '../store/useFactory';
import { CANVAS_ID, pointer, zoomAt } from '../lib/viewport';
import { exportFactory, type ExportFormat } from '../lib/exportImage';
import { BeltTiles, LinkItems } from './BeltView';
import { NodeView } from './NodeView';
import { BuildingArt } from './BuildingArt';
import { ArrowPreview, ArrowView } from './ArrowView';
import { AreaView } from './AreaView';
import { TextView } from './TextView';
import { uid } from '../model/ids';

export const DND_MIME = 'application/x-datafactory';

/** Exports with progress and error toasts. */
export async function runExport(format: ExportFormat, region?: Rect, grid = false) {
  const { notify } = useFactory.getState();
  notify(`Rendering ${format === 'mp4' ? 'video' : format.toUpperCase()}…`);
  try {
    await exportFactory(format, region, { grid });
    notify(`Exported ${format.toUpperCase()}`);
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Export failed');
  }
}

export type DragPayload = { type: 'item'; id: string };

type Gesture =
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean; clearOnClick: boolean; pickCell?: Pt }
  | { type: 'paint'; last: Pt; changed: boolean; keep: Set<string>; branch: boolean }
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
  | { type: 'marquee'; start: Pt; baseNodes: string[]; baseTiles: string[] }
  | { type: 'exportArea'; start: Pt }
  | { type: 'link'; from: string }
  | { type: 'areaDraw'; start: Pt }
  | { type: 'areaMove'; id: string; start: Pt; origin: Pt; nodes: Map<string, Pt>; tiles: Map<string, Pt>; texts: Map<string, Pt>; last: Pt; moved: boolean }
  | { type: 'textMove'; id: string; start: Pt; origin: Pt; moved: boolean }
  | { type: 'textResize'; id: string; start: Pt; w0: number }
  | { type: 'areaResize'; id: string; start: Pt; w0: number; h0: number };

interface LinkPreview {
  from: string;
  to: Pt;
  target: string | null;
}

const cellOf = (w: Pt): Pt => ({ x: Math.floor(w.x / CELL), y: Math.floor(w.y / CELL) });

/** Cells on a straight-ish line between two cells, so fast drags don't skip any. */
function cellsBetween(a: Pt, b: Pt): Pt[] {
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) out.push({ x: Math.round(a.x + ((b.x - a.x) * i) / n), y: Math.round(a.y + ((b.y - a.y) * i) / n) });
  return out;
}

/** Where a pasted clip's top-left goes so that it's centred on the cursor cell. */
function pasteAnchor(clip: ops.Clip, cell: Pt): Pt {
  return { x: cell.x - Math.floor(clip.w / 2), y: cell.y - Math.floor(clip.h / 2) };
}

export function Canvas() {
  const pipeline = useFactory((s) => s.pipeline);
  const view = useFactory((s) => s.view);
  const selection = useFactory((s) => s.selection);
  const flowing = useFactory((s) => s.flowing);
  const highlightItem = useFactory((s) => s.highlightItem);
  const tool = useFactory((s) => s.tool);
  const exportArea = useFactory((s) => s.exportArea);
  const clipboard = useFactory((s) => s.clipboard);
  const rotation = useFactory((s) => s.rotation);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const spaceHeld = useRef(false);
  const [hover, setHover] = useState<Pt | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
  const [areaPreview, setAreaPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
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
      if (e.key === 'Escape' && gesture.current?.type === 'paint') gesture.current = null;
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

    // Picking an area to export: left-drag a box, right-click cancels.
    if (state.exportArea && e.button !== 1 && !spaceHeld.current) {
      if (e.button === 2) state.setExportArea(null);
      else gesture.current = { type: 'exportArea', start: world };
      return;
    }

    if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
      // Middle-drag pans; a middle click (no drag) picks up what's under the cursor, like Q.
      e.preventDefault();
      gesture.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y, moved: false, clearOnClick: false, pickCell: e.button === 1 ? cell : undefined };
      setPanning(true);
      return;
    }

    // Text boxes: drag to move, the handle sets the wrap width, right-click deletes.
    const textEl = (e.target as Element).closest('[data-text-part]');
    const textId = textEl?.getAttribute('data-text-id');
    const textBox = textId ? state.pipeline.texts.find((t) => t.id === textId) : undefined;
    if (textBox && e.button === 2) {
      state.edit((p) => void (p.texts = p.texts.filter((t) => t.id !== textBox.id)));
      return;
    }
    if (textBox && e.button === 0 && (!tool || tool.type === 'text')) {
      state.select({ text: textBox.id });
      gesture.current =
        textEl?.getAttribute('data-text-part') === 'handle'
          ? { type: 'textResize', id: textBox.id, start: cell, w0: textBox.w }
          : { type: 'textMove', id: textBox.id, start: cell, origin: { x: textBox.x, y: textBox.y }, moved: false };
      return;
    }

    // Areas: the name tag moves (with everything inside) or deletes on right-click; the handle resizes.
    const areaEl = (e.target as Element).closest('[data-area-part]');
    const areaId = areaEl?.getAttribute('data-area-id');
    const area = areaId ? state.pipeline.areas.find((a) => a.id === areaId) : undefined;
    if (area && e.button === 2 && areaEl?.getAttribute('data-area-part') === 'label') {
      state.edit((p) => void (p.areas = p.areas.filter((a) => a.id !== area.id)));
      return;
    }
    if (area && e.button === 0 && (!tool || tool.type === 'area')) {
      state.select({ area: area.id });
      if (areaEl?.getAttribute('data-area-part') === 'handle') {
        gesture.current = { type: 'areaResize', id: area.id, start: cell, w0: area.w, h0: area.h };
      } else {
        const inside = ops.areaContents(state.pipeline, area);
        const nodes = new Map(state.pipeline.nodes.filter((n) => inside.nodes.includes(n.id)).map((n) => [n.id, { x: n.x, y: n.y }]));
        const tiles = new Map(state.pipeline.belts.filter((t) => inside.tiles.includes(t.id)).map((t) => [t.id, { x: t.x, y: t.y }]));
        const texts = new Map(state.pipeline.texts.filter((t) => inside.texts.includes(t.id)).map((t) => [t.id, { x: t.x, y: t.y }]));
        gesture.current = { type: 'areaMove', id: area.id, start: cell, origin: { x: area.x, y: area.y }, nodes, tiles, texts, last: { x: 0, y: 0 }, moved: false };
      }
      return;
    }

    // Arrows float above the floor: right-click deletes one, left-click selects it (unless building).
    const arrowId = (e.target as Element).closest('[data-arrow-id]')?.getAttribute('data-arrow-id');
    if (arrowId && e.button === 2) {
      state.edit((p) => ops.removeArrow(p, arrowId));
      return;
    }
    if (arrowId && e.button === 0 && (!tool || tool.type === 'link')) {
      state.select({ arrow: arrowId });
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

    if (tool?.type === 'text') {
      const box = { id: uid('text'), text: '', x: cell.x, y: cell.y, w: 6, size: 'm' as const, color: '', card: false };
      state.edit((p) => void p.texts.push(box));
      // Put the tool away and start typing into the new box.
      state.setTool(null);
      state.select({ text: box.id });
      state.setEditText(box.id);
      return;
    }

    if (tool?.type === 'area') {
      gesture.current = { type: 'areaDraw', start: cell };
      setAreaPreview({ x: cell.x, y: cell.y, w: 1, h: 1 });
      return;
    }

    if (tool?.type === 'paste') {
      const clip = state.clipboard;
      if (clip) state.pasteAt(pasteAnchor(clip, cell));
      return;
    }

    if (tool?.type === 'link') {
      // Drag from one building onto another to point an arrow at it.
      const from = occupancy.get(cellKey(cell.x, cell.y))?.node;
      if (from) {
        gesture.current = { type: 'link', from: from.id };
        setLinkPreview({ from: from.id, to: world, target: null });
      } else {
        gesture.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: state.view.x, vy: state.view.y, moved: false, clearOnClick: true };
        setPanning(true);
      }
      return;
    }

    if (tool?.type === 'belt') {
      // Belts are laid live as the cursor moves, like shapez: first tile points the current way.
      state.checkpoint();
      // Belts already on the floor get joined (merge into / split off), not rewritten.
      const keep = new Set(state.pipeline.belts.map((t) => t.id));
      const onBelt = state.pipeline.belts.some((t) => t.x === cell.x && t.y === cell.y);
      let changed = false;
      if (!onBelt) state.edit((p) => void (changed = ops.paintBelt(p, [{ ...cell, dir: state.rotation }]) > 0), { history: false });
      gesture.current = { type: 'paint', last: cell, changed, keep, branch: onBelt };
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
      if (cell.x === g.last.x && cell.y === g.last.y) return;
      const steps = ops.gridSteps(g.last, cell);
      let from = g.last;
      state.edit(
        (p) => {
          for (const to of steps) {
            if (ops.extendBelt(p, from, to, g.keep, g.branch)) g.changed = true;
            g.branch = false;
            from = to;
          }
        },
        { history: false },
      );
      // Keep building in the direction of travel.
      useFactory.setState({ rotation: ops.stepDir(steps.length > 1 ? steps[steps.length - 2] : g.last, cell) });
      g.last = cell;
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

    if (g.type === 'areaDraw') {
      setAreaPreview({ x: Math.min(g.start.x, cell.x), y: Math.min(g.start.y, cell.y), w: Math.abs(cell.x - g.start.x) + 1, h: Math.abs(cell.y - g.start.y) + 1 });
      return;
    }

    if (g.type === 'areaResize') {
      const w = Math.max(1, g.w0 + cell.x - g.start.x);
      const h = Math.max(1, g.h0 + cell.y - g.start.y);
      const cur = state.pipeline.areas.find((a) => a.id === g.id);
      if (!cur || (cur.w === w && cur.h === h)) return;
      state.edit(
        (p) => {
          const a = p.areas.find((x) => x.id === g.id);
          if (a) Object.assign(a, { w, h });
        },
        { coalesce: `resize:${g.id}` },
      );
      return;
    }

    if (g.type === 'textResize') {
      const w = Math.max(2, g.w0 + cell.x - g.start.x);
      if (state.pipeline.texts.find((t) => t.id === g.id)?.w === w) return;
      state.edit(
        (p) => {
          const t = p.texts.find((x) => x.id === g.id);
          if (t) t.w = w;
        },
        { coalesce: `resize:${g.id}` },
      );
      return;
    }

    if (g.type === 'textMove') {
      const x = g.origin.x + cell.x - g.start.x;
      const y = g.origin.y + cell.y - g.start.y;
      const cur = state.pipeline.texts.find((t) => t.id === g.id);
      if (!cur || (cur.x === x && cur.y === y)) return;
      state.edit(
        (p) => {
          const t = p.texts.find((v) => v.id === g.id);
          if (t) Object.assign(t, { x, y });
        },
        { coalesce: `move:${g.id}` },
      );
      g.moved = true;
      return;
    }

    if (g.type === 'areaMove') {
      const dx = cell.x - g.start.x;
      const dy = cell.y - g.start.y;
      if (dx === g.last.x && dy === g.last.y) return;
      // Everything inside comes along; if it can't fit, the area waits.
      if (!ops.canMove(state.pipeline, [...g.nodes.keys()], [...g.tiles.keys()], dx - g.last.x, dy - g.last.y)) return;
      if (!g.moved) {
        g.moved = true;
        state.checkpoint();
      }
      g.last = { x: dx, y: dy };
      state.edit(
        (p) => {
          const a = p.areas.find((x) => x.id === g.id);
          if (a) Object.assign(a, { x: g.origin.x + dx, y: g.origin.y + dy });
          for (const n of p.nodes) {
            const o = g.nodes.get(n.id);
            if (o) Object.assign(n, { x: o.x + dx, y: o.y + dy });
          }
          for (const t of p.belts) {
            const o = g.tiles.get(t.id);
            if (o) Object.assign(t, { x: o.x + dx, y: o.y + dy });
          }
          for (const t of p.texts) {
            const o = g.texts.get(t.id);
            if (o) Object.assign(t, { x: o.x + dx, y: o.y + dy });
          }
        },
        { history: false },
      );
      return;
    }

    if (g.type === 'link') {
      const target = occupancy.get(cellKey(cell.x, cell.y))?.node;
      setLinkPreview({ from: g.from, to: world, target: target && target.id !== g.from ? target.id : null });
      return;
    }

    if (g.type === 'exportArea') {
      setMarquee(normalizeRect(g.start, world));
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

    if (g.type === 'pan' && !g.moved && g.pickCell) {
      state.pickAt(g.pickCell);
    } else if (g.type === 'pan' && !g.moved && g.clearOnClick) {
      state.clearSelection();
    } else if (g.type === 'paint') {
      if (g.changed) state.edit((p) => ops.syncLinkItems(p), { history: false });
      else useFactory.setState((s) => ({ past: s.past.slice(0, -1) }));
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
    } else if (g.type === 'drag' && g.moved) {
      // Dropped next to a building of the same kind: they become one structure.
      state.edit((p) => void ops.mergeTouching(p), { history: false });
    } else if (g.type === 'drag' && !g.moved && g.narrowOnClick && g.nodeId) {
      state.selectNodes([g.nodeId]);
    } else if (g.type === 'marquee') {
      setMarquee(null);
    } else if (g.type === 'areaDraw') {
      setAreaPreview(null);
      const cell = cellOf(toWorld(e.clientX, e.clientY));
      const color = SWATCHES[state.pipeline.areas.length % SWATCHES.length];
      const area = {
        id: uid('area'),
        name: `Area ${state.pipeline.areas.length + 1}`,
        color,
        x: Math.min(g.start.x, cell.x),
        y: Math.min(g.start.y, cell.y),
        w: Math.abs(cell.x - g.start.x) + 1,
        h: Math.abs(cell.y - g.start.y) + 1,
      };
      state.edit((p) => void p.areas.push(area));
      // Put the tool away and open the new area so it can be named.
      state.setTool(null);
      state.select({ area: area.id });
    } else if (g.type === 'areaMove' && g.moved) {
      state.edit((p) => void ops.mergeTouching(p), { history: false });
    } else if (g.type === 'link') {
      setLinkPreview(null);
      const cell = cellOf(toWorld(e.clientX, e.clientY));
      const target = ops.occupancy(state.pipeline).get(cellKey(cell.x, cell.y))?.node;
      if (!target || target.id === g.from) return;
      let result: ops.ArrowResult = { ok: false, reason: '' };
      state.edit((p) => {
        result = ops.addArrow(p, g.from, target.id);
      });
      const r = result as ops.ArrowResult;
      if (r.ok) state.select({ arrow: r.id });
      else {
        useFactory.setState((s) => ({ past: s.past.slice(0, -1) }));
        state.notify(r.reason);
      }
    } else if (g.type === 'exportArea') {
      setMarquee(null);
      const area = state.exportArea;
      const rect = normalizeRect(g.start, toWorld(e.clientX, e.clientY));
      if (!area) return;
      if (rect.w * state.view.zoom < 8 || rect.h * state.view.zoom < 8) {
        state.notify('Drag a box around the part to export');
        return;
      }
      state.setExportArea(null);
      runExport(area.format, rect, area.grid);
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
  // Unused port tabs are hidden, except on the selected building and while laying belts.
  const usedPorts = useMemo(() => ops.connectedPorts(pipeline), [pipeline]);
  const inflow = useMemo(() => ops.tileInflow(pipeline), [pipeline]);
  const itemsById = useMemo(() => new Map(pipeline.items.map((i) => [i.id, i])), [pipeline.items]);
  const activeItem = highlightItem ?? selection.item;

  const nodesById = useMemo(() => new Map(pipeline.nodes.map((n) => [n.id, n])), [pipeline.nodes]);

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
      if (gesture.current?.type === 'paint') return null;
      return { belt: [{ id: 'ghost', x: hover.x, y: hover.y, dir: rotation, itemId: null, description: '' }] };
    }
    if (tool.type !== 'building') return null;
    const at = hover;
    const blueprint = tool.blueprintId ? pipeline.blueprints.find((b) => b.id === tool.blueprintId) : undefined;
    const color = tool.template?.color ?? blueprint?.color ?? KIND_META[tool.kind].color;
    const valid = ops.canPlaceNode(pipeline, at.x, at.y);
    const icon = tool.template ? tool.template.icon : blueprint?.icon;
    return { building: { kind: tool.kind as NodeKind, at, color, valid, icon } };
  }, [hover, tool, rotation, pipeline]);

  // The clipboard following the cursor while pasting; cells in the way are marked red.
  const pasteGhost = useMemo(() => {
    if (tool?.type !== 'paste' || !clipboard || !hover) return null;
    const at = pasteAnchor(clipboard, hover);
    const nodes = clipboard.nodes.map((n) => ({ ...n, x: n.x + at.x, y: n.y + at.y }));
    const tiles = clipboard.tiles.map((t) => ({ ...t, x: t.x + at.x, y: t.y + at.y }));
    const inflow = ops.tileInflow({ nodes, belts: tiles } as Pipeline);
    const blocked = ops.clipCells(clipboard, at).filter((c) => occupancy.has(cellKey(c.x, c.y)));
    return { nodes, tiles, inflow, blocked };
  }, [tool, clipboard, hover, occupancy]);

  const previewTiles = useMemo(() => {
    const cells = ghost?.belt;
    if (!cells) return null;
    const tiles = cells
      .filter((c) => !occupancy.get(cellKey(c.x, c.y))?.node)
      .map((c, i) => ({ id: `p${i}`, x: c.x, y: c.y, dir: c.dir, itemId: null, description: '' }));
    // Preview curves follow the previous preview tile.
    const inflowPreview = new Map<string, Dir>();
    tiles.forEach((t, i) => inflowPreview.set(t.id, i > 0 ? tiles[i - 1].dir : t.dir));
    return { tiles, inflow: inflowPreview };
  }, [ghost, occupancy]);

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
      className={`canvas-wrap${flowing ? ' flowing' : ' paused'}${panning ? ' panning' : ''}${tool ? ' building' : ''}${exportArea ? ' picking' : ''}`}
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
        onDoubleClick={(e) => {
          // Double-click a text box to type into it.
          const id = (e.target as Element).closest('[data-text-id]')?.getAttribute('data-text-id');
          if (!id) return;
          useFactory.getState().select({ text: id });
          useFactory.getState().setEditText(id);
        }}
      >
        <defs>
          <pattern id="grid" width={cellPx} height={cellPx} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
            <path d={`M ${cellPx} 0 L 0 0 0 ${cellPx}`} className="grid-line" style={{ opacity: Math.min(1, Math.max(0, (view.zoom - 0.3) * 2)) }} />
          </pattern>
        </defs>
        <rect className="grid-bg" width="100%" height="100%" fill="url(#grid)" />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          <g className="layer-areas">
            {pipeline.areas.map((a) => (
              <AreaView key={a.id} area={a} selected={selection.area === a.id} />
            ))}
            {areaPreview && (
              <rect className="area-preview" x={areaPreview.x * CELL} y={areaPreview.y * CELL} width={areaPreview.w * CELL} height={areaPreview.h * CELL} rx={14} />
            )}
          </g>
          {/* Notes sit on the floor, under belts and buildings. */}
          <g className="layer-texts">
            {pipeline.texts.map((t) => (
              <TextView key={t.id} box={t} selected={selection.text === t.id} />
            ))}
          </g>
          <BeltTiles tiles={pipeline.belts} inflow={inflow} selected={selectedTiles} dimmed={dimmedTiles} />
          <g className="layer-items">
            {links.map((l) => (
              <LinkItems
                key={l.key}
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
                usedPorts={usedPorts.get(n.id)}
                allPorts={tool?.type === 'belt'}
              />
            ))}
          </g>
          <g className="layer-arrows">
            {pipeline.arrows.map((a) => {
              const from = nodesById.get(a.from);
              const to = nodesById.get(a.to);
              if (!from || !to) return null;
              return (
                <ArrowView
                  key={a.id}
                  arrow={a}
                  from={nodeRect(from)}
                  to={nodeRect(to)}
                  selected={selection.arrow === a.id}
                  dimmed={!!activeItem}
                />
              );
            })}
          </g>
          {linkPreview && nodesById.get(linkPreview.from) && (
            <ArrowPreview
              from={nodeRect(nodesById.get(linkPreview.from)!)}
              to={linkPreview.target && nodesById.get(linkPreview.target) ? nodeRect(nodesById.get(linkPreview.target)!) : linkPreview.to}
              color={ARROW_COLOR}
              valid={!!linkPreview.target}
            />
          )}
          {previewTiles && <BeltTiles tiles={previewTiles.tiles} inflow={previewTiles.inflow} className="belt-ghost" />}
          {pasteGhost && (
            <g className="paste-ghost">
              <BeltTiles tiles={pasteGhost.tiles} inflow={pasteGhost.inflow} className="belt-ghost" />
              <g className="ghost-building">
                {pasteGhost.nodes.map((n) => (
                  <BuildingArt key={n.id} kind={n.kind} cells={nodeCells(n)} rotation={n.rotation} color={n.color} icon={n.icon} />
                ))}
              </g>
              {pasteGhost.blocked.map((c) => (
                <rect key={`${c.x},${c.y}`} className="ghost-block" x={c.x * CELL} y={c.y * CELL} width={CELL} height={CELL} rx={7} />
              ))}
            </g>
          )}
          {ghost?.building && (
            <g className={`ghost-building${ghost.building.valid ? '' : ' invalid'}`}>
              <BuildingArt kind={ghost.building.kind} cells={[ghost.building.at]} rotation={rotation} color={ghost.building.color} icon={ghost.building.icon} />
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
          {hover && !tool && !exportArea && (
            <rect className="hover-cell" x={hover.x * CELL} y={hover.y * CELL} width={CELL} height={CELL} rx={4} />
          )}
          {marquee && <rect className={exportArea ? 'marquee export-marquee' : 'marquee'} x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} />}
        </g>
      </svg>
      {exportArea && (
        <div className="pick-hint">
          Drag a box around what to export as <b>{exportArea.format.toUpperCase()}</b> · <kbd>Esc</kbd> or right-click to cancel
        </div>
      )}
    </div>
  );
}

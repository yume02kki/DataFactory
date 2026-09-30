import { produce } from 'immer';
import { create } from 'zustand';
import { KIND_META, SWATCHES, makeItem, makeNode } from '../model/defaults';
import { cellKey, rotateDir, type Pt } from '../model/geometry';
import { uid } from '../model/ids';
import * as ops from '../model/ops';
import type { Blueprint, Dir, FactoryNode, ItemType, NodeKind, Pipeline, Selection, Tool, Viewport } from '../model/types';

const HISTORY_LIMIT = 120;
const COALESCE_MS = 1200;

const EMPTY_SELECTION: Selection = { nodes: [], tiles: [], belt: null, arrow: null, area: null, item: null };

export interface Toast {
  id: number;
  text: string;
}

export interface FactoryState {
  pipeline: Pipeline;
  view: Viewport;
  selection: Selection;
  past: Pipeline[];
  future: Pipeline[];
  lastEdit: { key: string; at: number } | null;
  flowing: boolean;
  highlightItem: string | null;
  toast: Toast | null;
  /** Active build tool; null means select / move. */
  tool: Tool | null;
  /** Rotation used for the next building or belt tile placed. */
  rotation: Dir;
  /** The last copied or cut selection. */
  clipboard: ops.Clip | null;
  /** Set while the user drags a box to choose what to export. */
  exportArea: { format: 'png' | 'gif'; grid: boolean } | null;

  loadPipeline: (p: Pipeline) => void;
  /** Applies a change to the pipeline. Edits sharing a `coalesce` key within a short window form one undo step. */
  edit: (recipe: (draft: Pipeline) => void, opts?: { coalesce?: string; history?: boolean }) => void;
  /** Records the current state as an undo step (used before continuous gestures). */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;

  setView: (v: Viewport) => void;
  select: (sel: Partial<Selection>) => void;
  selectNodes: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;

  setTool: (tool: Tool | null) => void;
  /** Copies the selection to the clipboard. Returns false when nothing is selected. */
  copySelection: () => boolean;
  cutSelection: () => void;
  /** Wraps the selected buildings and belts in a new area (Ctrl G). */
  areaFromSelection: () => void;
  /** Picks up the clipboard as the paste tool. */
  startPaste: () => void;
  /** Places the clipboard with its top-left at `at`; the paste tool stays out for more. */
  pasteAt: (at: Pt) => boolean;
  /** Pipette (Q / middle click): the building or belt on this cell becomes the build tool. */
  pickAt: (cell: Pt) => void;
  setExportArea: (area: FactoryState['exportArea']) => void;
  /** R: rotates the ghost while building, otherwise the selected buildings. */
  rotate: (steps: number, hoverCell?: Pt | null) => void;

  /** Places one 1×1 block (joining matching neighbours into one building when it touches them). */
  placeNode: (
    kind: NodeKind,
    at: Pt,
    rotation: Dir,
    blueprint?: Blueprint,
    template?: Partial<FactoryNode>,
    opts?: { history?: boolean },
  ) => string | null;
  paintBelt: (cells: Array<Pt & { dir: Dir }>) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  addItem: (partial?: Partial<ItemType>) => string;
  deleteItem: (id: string) => void;
  addBlueprint: (kind: NodeKind, partial: Partial<Blueprint>) => string;
  deleteBlueprint: (id: string) => void;

  toggleFlow: () => void;
  setHighlightItem: (id: string | null) => void;
  notify: (text: string) => void;
}

export const useFactory = create<FactoryState>()((set, get) => {
  const pushHistory = () => {
    const { pipeline, past } = get();
    const next = past.length >= HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT + 1) : past.slice();
    next.push(pipeline);
    set({ past: next, future: [] });
  };

  /** Drops selected ids that no longer exist (after undo, delete, ...). */
  const pruneSelection = (p: Pipeline, sel: Selection): Selection => {
    const tileIds = new Set(p.belts.map((t) => t.id));
    return {
      nodes: sel.nodes.filter((id) => p.nodes.some((n) => n.id === id)),
      tiles: sel.tiles.filter((id) => tileIds.has(id)),
      belt: sel.belt && tileIds.has(sel.belt) ? sel.belt : null,
      arrow: sel.arrow && p.arrows.some((a) => a.id === sel.arrow) ? sel.arrow : null,
      area: sel.area && p.areas.some((a) => a.id === sel.area) ? sel.area : null,
      item: sel.item && p.items.some((i) => i.id === sel.item) ? sel.item : null,
    };
  };

  return {
    pipeline: { id: '', name: '', description: '', items: [], blueprints: [], nodes: [], belts: [], arrows: [], areas: [], view: { x: 0, y: 0, zoom: 1 }, createdAt: 0, updatedAt: 0 },
    view: { x: 0, y: 0, zoom: 1 },
    selection: EMPTY_SELECTION,
    past: [],
    future: [],
    lastEdit: null,
    flowing: true,
    highlightItem: null,
    toast: null,
    tool: null,
    rotation: 0,
    exportArea: null,
    clipboard: null,

    loadPipeline: (p) =>
      set({ pipeline: p, view: p.view, selection: EMPTY_SELECTION, past: [], future: [], lastEdit: null, highlightItem: null, tool: null }),

    edit: (recipe, opts = {}) => {
      const { history = true, coalesce } = opts;
      const { lastEdit } = get();
      const now = Date.now();
      if (history) {
        const merge = coalesce && lastEdit && lastEdit.key === coalesce && now - lastEdit.at < COALESCE_MS;
        if (!merge) pushHistory();
      }
      const next = produce(get().pipeline, (draft) => {
        recipe(draft);
        // Touching buildings of the same kind are one structure. Live gestures
        // (dragging, painting) skip this and settle when they end.
        if (history) ops.mergeTouching(draft);
        // Keep combined item looks in step with whatever just changed.
        ops.applyRecipes(draft);
        draft.updatedAt = now;
      });
      set({
        pipeline: next,
        lastEdit: coalesce ? { key: coalesce, at: now } : null,
        selection: pruneSelection(next, get().selection),
      });
    },

    checkpoint: () => {
      pushHistory();
      set({ lastEdit: null });
    },

    undo: () => {
      const { past, future, pipeline, selection } = get();
      if (past.length === 0) return;
      const prev = past[past.length - 1];
      set({ pipeline: prev, past: past.slice(0, -1), future: [pipeline, ...future], lastEdit: null, selection: pruneSelection(prev, selection) });
    },

    redo: () => {
      const { past, future, pipeline, selection } = get();
      if (future.length === 0) return;
      const next = future[0];
      set({ pipeline: next, past: [...past, pipeline], future: future.slice(1), lastEdit: null, selection: pruneSelection(next, selection) });
    },

    setView: (view) => set({ view }),

    select: (sel) => set({ selection: { ...EMPTY_SELECTION, ...sel } }),

    selectNodes: (ids, additive = false) => {
      if (!additive) {
        set({ selection: { ...EMPTY_SELECTION, nodes: ids } });
        return;
      }
      const { nodes, tiles } = get().selection;
      const next = new Set(nodes);
      for (const id of ids) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      set({ selection: { ...EMPTY_SELECTION, nodes: [...next], tiles } });
    },

    clearSelection: () => set({ selection: EMPTY_SELECTION }),

    setTool: (tool) => set({ tool, exportArea: null }),

    copySelection: () => {
      const { selection, pipeline } = get();
      let tiles = selection.tiles;
      // A selected belt line copies all of its tiles.
      if (!selection.nodes.length && !tiles.length && selection.belt) {
        const link = ops.traceLinks(pipeline).find((l) => l.tiles.some((t) => t.id === selection.belt));
        tiles = link ? link.tiles.map((t) => t.id) : [selection.belt];
      }
      const clip = ops.copySelection(pipeline, selection.nodes, tiles);
      if (!clip) {
        get().notify('Select something to copy (Shift or Ctrl + drag)');
        return false;
      }
      set({ clipboard: clip });
      const parts = [clip.nodes.length && `${clip.nodes.length} building${clip.nodes.length === 1 ? '' : 's'}`, clip.tiles.length && `${clip.tiles.length} belt tile${clip.tiles.length === 1 ? '' : 's'}`].filter(Boolean);
      get().notify(`Copied ${parts.join(' and ')} · Ctrl V to paste`);
      return true;
    },

    cutSelection: () => {
      if (!get().copySelection()) return;
      get().deleteSelection();
      get().notify('Cut · Ctrl V to paste');
    },

    areaFromSelection: () => {
      const { selection, pipeline } = get();
      const color = SWATCHES[pipeline.areas.length % SWATCHES.length];
      const area = ops.areaAround(pipeline, selection.nodes, selection.tiles, `Area ${pipeline.areas.length + 1}`, color);
      if (!area) {
        get().notify('Select buildings first (Shift or Ctrl + drag), or use the Area tool (7)');
        return;
      }
      get().edit((p) => void p.areas.push(area));
      set({ selection: { ...EMPTY_SELECTION, area: area.id } });
    },

    startPaste: () => {
      if (!get().clipboard) {
        get().notify('Nothing copied yet (Ctrl C)');
        return;
      }
      set({ tool: { type: 'paste' }, exportArea: null });
    },

    pasteAt: (at) => {
      const clip = get().clipboard;
      if (!clip) return false;
      let ids: { nodes: string[]; tiles: string[] } | null = null;
      if (!ops.canPaste(get().pipeline, clip, at)) {
        get().notify('Something is in the way');
        return false;
      }
      get().edit((p) => {
        ids = ops.pasteClip(p, clip, at);
        ops.syncLinkItems(p);
      });
      const placed = ids as { nodes: string[]; tiles: string[] } | null;
      if (placed) set({ selection: { ...EMPTY_SELECTION, nodes: placed.nodes, tiles: placed.tiles } });
      return !!placed;
    },

    pickAt: (cell) => {
      const occ = ops.occupancy(get().pipeline).get(cellKey(cell.x, cell.y));
      if (occ?.node) {
        const { kind, rotation, name, type, technology, description, color, icon, inputs, outputs, metadata } = occ.node;
        set({
          tool: { type: 'building', kind, blueprintId: null, template: { name, type, technology, description, color, icon, inputs, outputs, metadata } },
          rotation,
          exportArea: null,
        });
      } else if (occ?.tile) {
        set({ tool: { type: 'belt' }, rotation: occ.tile.dir, exportArea: null });
      } else {
        set({ tool: null });
      }
    },
    setExportArea: (exportArea) => set({ exportArea, tool: exportArea ? null : get().tool }),

    rotate: (steps, hoverCell) => {
      const { tool, selection, pipeline } = get();
      if (tool?.type === 'paste' && get().clipboard) {
        set({ clipboard: ops.rotateClip(get().clipboard!, steps) });
        return;
      }
      if (tool) {
        set({ rotation: rotateDir(get().rotation, steps) });
        return;
      }
      if (selection.nodes.length) {
        let n = 0;
        get().edit((p) => {
          n = ops.rotateNodes(p, selection.nodes, steps);
        });
        if (n < selection.nodes.length) get().notify('No room to rotate there');
        return;
      }
      const tile = hoverCell && pipeline.belts.find((t) => t.x === hoverCell.x && t.y === hoverCell.y);
      if (tile) {
        get().edit((p) => {
          const t = p.belts.find((x) => x.id === tile.id);
          if (t) t.dir = rotateDir(t.dir, steps);
        });
        return;
      }
      set({ rotation: rotateDir(get().rotation, steps) });
    },

    placeNode: (kind, at, rotation, blueprint, template, opts = {}) => {
      const { pipeline } = get();
      if (!ops.canPlaceNode(pipeline, at.x, at.y)) return null;
      const base = { ...makeNode(kind, at.x, at.y, blueprint, rotation), ...(template ?? {}) };
      let id: string | null = null;
      get().edit(
        (p) => {
          id = ops.placeBlock(p, {
            ...base,
            id: uid('node'),
            kind,
            x: at.x,
            y: at.y,
            rotation,
            cells: [[0, 0]],
            // Only used when the block doesn't join a neighbour.
            name: ops.copyName(p, base.name),
            inputs: [...base.inputs],
            outputs: [...base.outputs],
            metadata: base.metadata.map((m) => ({ ...m, id: uid('m') })),
          });
          ops.syncLinkItems(p);
        },
        { history: opts.history ?? true },
      );
      return id;
    },

    paintBelt: (cells) => {
      if (!cells.length) return;
      get().edit((p) => {
        ops.paintBelt(p, cells);
        ops.syncLinkItems(p);
      });
    },

    deleteSelection: () => {
      const { selection, pipeline } = get();
      if (selection.nodes.length || selection.tiles.length) {
        get().edit((p) => {
          ops.removeNodes(p, selection.nodes);
          ops.removeTiles(p, selection.tiles);
        });
      } else if (selection.area) {
        get().edit((p) => void (p.areas = p.areas.filter((a) => a.id !== selection.area)));
      } else if (selection.arrow) {
        get().edit((p) => ops.removeArrow(p, selection.arrow!));
      } else if (selection.belt) {
        const link = ops.traceLinks(pipeline).find((l) => l.tiles.some((t) => t.id === selection.belt));
        const ids = link ? link.tiles.map((t) => t.id) : [selection.belt];
        get().edit((p) => ops.removeTiles(p, ids));
      } else if (selection.item) {
        get().deleteItem(selection.item);
      }
      set({ selection: EMPTY_SELECTION });
    },

    duplicateSelection: () => {
      const { selection, pipeline } = get();
      if (!selection.nodes.length && !selection.tiles.length) return;
      const { dx, dy } = ops.freeOffset(pipeline, selection.nodes, selection.tiles);
      let ids = { nodes: [] as string[], tiles: [] as string[] };
      get().edit((p) => {
        ids = ops.duplicate(p, selection.nodes, selection.tiles, dx, dy);
      });
      set({ selection: { ...EMPTY_SELECTION, ...ids } });
    },

    addItem: (partial = {}) => {
      const { pipeline } = get();
      const item = makeItem({ name: `Item ${pipeline.items.length + 1}`, ...partial }, pipeline.items.length);
      get().edit((p) => {
        p.items.push(item);
      });
      return item.id;
    },

    deleteItem: (id) => {
      get().edit((p) => ops.removeItem(p, id));
      if (get().selection.item === id) set({ selection: EMPTY_SELECTION });
    },

    addBlueprint: (kind, partial) => {
      const bp: Blueprint = { id: uid('bp'), kind, name: 'Custom', description: '', technology: '', color: KIND_META[kind].color, ...partial };
      get().edit((p) => {
        p.blueprints.push(bp);
      });
      return bp.id;
    },

    deleteBlueprint: (id) => {
      get().edit((p) => void (p.blueprints = p.blueprints.filter((b) => b.id !== id)));
      const tool = get().tool;
      if (tool?.type === 'building' && tool.blueprintId === id) set({ tool: null });
    },

    toggleFlow: () => set({ flowing: !get().flowing }),
    setHighlightItem: (highlightItem) => set({ highlightItem }),

    notify: (text) => {
      const toast = { id: Date.now(), text };
      set({ toast });
      setTimeout(() => {
        if (get().toast?.id === toast.id) set({ toast: null });
      }, 2200);
    },
  };
});

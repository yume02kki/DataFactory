import { produce } from 'immer';
import { create } from 'zustand';
import { KIND_META, makeItem, makeNode } from '../model/defaults';
import { KIND_SIZE } from '../model/geometry';
import { uid } from '../model/ids';
import * as ops from '../model/ops';
import type { Blueprint, ItemType, NodeKind, Pipeline, Selection, Viewport } from '../model/types';

const HISTORY_LIMIT = 120;
const COALESCE_MS = 1200;

const EMPTY_SELECTION: Selection = { nodes: [], belt: null, item: null };

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

  loadPipeline: (p: Pipeline) => void;
  /** Applies a change to the pipeline. Edits sharing a `coalesce` key within a short window form one undo step. */
  edit: (recipe: (draft: Pipeline) => void, opts?: { coalesce?: string; history?: boolean }) => void;
  /** Records the current state as an undo step (used before continuous gestures like dragging). */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;

  setView: (v: Viewport) => void;
  select: (sel: Partial<Selection>) => void;
  selectNodes: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;

  addNode: (kind: NodeKind, cell: { x: number; y: number }, blueprint?: Blueprint) => string;
  addBelt: (from: string, to: string) => string | null;
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
  const pruneSelection = (p: Pipeline, sel: Selection): Selection => ({
    nodes: sel.nodes.filter((id) => p.nodes.some((n) => n.id === id)),
    belt: sel.belt && p.belts.some((b) => b.id === sel.belt) ? sel.belt : null,
    item: sel.item && p.items.some((i) => i.id === sel.item) ? sel.item : null,
  });

  return {
    pipeline: { id: '', name: '', description: '', items: [], blueprints: [], nodes: [], belts: [], view: { x: 0, y: 0, zoom: 1 }, createdAt: 0, updatedAt: 0 },
    view: { x: 0, y: 0, zoom: 1 },
    selection: EMPTY_SELECTION,
    past: [],
    future: [],
    lastEdit: null,
    flowing: true,
    highlightItem: null,
    toast: null,

    loadPipeline: (p) =>
      set({ pipeline: p, view: p.view, selection: EMPTY_SELECTION, past: [], future: [], lastEdit: null, highlightItem: null }),

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
      const current = get().selection.nodes;
      if (!additive) {
        set({ selection: { ...EMPTY_SELECTION, nodes: ids } });
        return;
      }
      const next = new Set(current);
      for (const id of ids) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      set({ selection: { ...EMPTY_SELECTION, nodes: [...next] } });
    },

    clearSelection: () => set({ selection: EMPTY_SELECTION }),

    addNode: (kind, cell, blueprint) => {
      const size = KIND_SIZE[kind];
      const spot = ops.findFreeSpot(get().pipeline, cell.x, cell.y, size.w, size.h, (n) => KIND_SIZE[n.kind]);
      const node = makeNode(kind, spot.x, spot.y, blueprint);
      get().edit((p) => {
        // Give duplicates of the same type distinct names so labels stay useful.
        const taken = new Set(p.nodes.map((n) => n.name));
        if (taken.has(node.name)) {
          let i = 2;
          while (taken.has(`${node.name} ${i}`)) i++;
          node.name = `${node.name} ${i}`;
        }
        p.nodes.push(node);
      });
      set({ selection: { ...EMPTY_SELECTION, nodes: [node.id] } });
      return node.id;
    },

    addBelt: (from, to) => {
      const check = ops.canConnect(get().pipeline, from, to);
      if (!check.ok) {
        if (check.reason !== 'A building cannot feed itself') get().notify(check.reason);
        return null;
      }
      let id: string | null = null;
      get().edit((p) => {
        id = ops.connect(p, from, to)?.id ?? null;
      });
      return id;
    },

    deleteSelection: () => {
      const { selection } = get();
      if (selection.nodes.length) {
        get().edit((p) => ops.removeNodes(p, selection.nodes));
      } else if (selection.belt) {
        get().edit((p) => ops.removeBelt(p, selection.belt!));
      } else if (selection.item) {
        get().deleteItem(selection.item);
      }
      set({ selection: EMPTY_SELECTION });
    },

    duplicateSelection: () => {
      const { selection } = get();
      if (!selection.nodes.length) return;
      let ids: string[] = [];
      get().edit((p) => {
        const nodes = p.nodes.filter((n) => selection.nodes.includes(n.id));
        const minY = Math.min(...nodes.map((n) => n.y));
        const maxY = Math.max(...nodes.map((n) => n.y + KIND_SIZE[n.kind].h));
        // Stamp the copy directly below the original selection.
        ids = ops.duplicateNodes(p, selection.nodes, 0, maxY - minY + 2);
      });
      set({ selection: { ...EMPTY_SELECTION, nodes: ids } });
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
      const { selection } = get();
      if (selection.item === id) set({ selection: EMPTY_SELECTION });
    },

    addBlueprint: (kind, partial) => {
      const bp: Blueprint = {
        id: uid('bp'),
        kind,
        name: 'Custom',
        description: '',
        technology: '',
        color: KIND_META[kind].color,
        ...partial,
      };
      get().edit((p) => {
        p.blueprints.push(bp);
      });
      return bp.id;
    },

    deleteBlueprint: (id) => get().edit((p) => void (p.blueprints = p.blueprints.filter((b) => b.id !== id))),

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

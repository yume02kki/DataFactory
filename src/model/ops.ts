import { KIND_META } from './defaults';
import { uid } from './ids';
import type { Belt, FactoryNode, Pipeline } from './types';

/** Pure (draft-mutating) graph operations shared by the store and tests. */

export type ConnectResult = { ok: true } | { ok: false; reason: string };

export function canConnect(p: Pipeline, fromId: string, toId: string): ConnectResult {
  const from = p.nodes.find((n) => n.id === fromId);
  const to = p.nodes.find((n) => n.id === toId);
  if (!from || !to) return { ok: false, reason: 'Missing building' };
  if (from.id === to.id) return { ok: false, reason: 'A building cannot feed itself' };
  if (!KIND_META[from.kind].hasOutput) return { ok: false, reason: `${KIND_META[from.kind].plural} have no output` };
  if (!KIND_META[to.kind].hasInput) return { ok: false, reason: `${KIND_META[to.kind].plural} have no input` };
  if (p.belts.some((b) => b.from === fromId && b.to === toId)) return { ok: false, reason: 'Already connected' };
  return { ok: true };
}

function addUnique(list: string[], id: string) {
  if (!list.includes(id)) list.push(id);
}

/** Registers the item as an output of the belt's start and an input of its end. */
function syncBeltItem(p: Pipeline, belt: Belt) {
  if (!belt.itemId) return;
  const from = p.nodes.find((n) => n.id === belt.from);
  const to = p.nodes.find((n) => n.id === belt.to);
  if (from && KIND_META[from.kind].hasOutput) addUnique(from.outputs, belt.itemId);
  if (to && KIND_META[to.kind].hasInput) addUnique(to.inputs, belt.itemId);
}

/**
 * Picks what a new belt carries: an output of the start building that is not
 * yet leaving on another belt, else its first output, else whatever the target expects.
 */
function guessBeltItem(p: Pipeline, from: FactoryNode, to: FactoryNode): string | null {
  const used = new Set(p.belts.filter((b) => b.from === from.id).map((b) => b.itemId));
  const fresh = from.outputs.find((id) => !used.has(id) && (to.inputs.length === 0 || to.inputs.includes(id)));
  return fresh ?? from.outputs.find((id) => to.inputs.includes(id)) ?? from.outputs[0] ?? to.inputs[0] ?? null;
}

export function connect(p: Pipeline, fromId: string, toId: string): Belt | null {
  if (!canConnect(p, fromId, toId).ok) return null;
  const from = p.nodes.find((n) => n.id === fromId)!;
  const to = p.nodes.find((n) => n.id === toId)!;
  const belt: Belt = { id: uid('belt'), from: fromId, to: toId, itemId: guessBeltItem(p, from, to), description: '' };
  p.belts.push(belt);
  syncBeltItem(p, belt);
  return belt;
}

export function setBeltItem(p: Pipeline, beltId: string, itemId: string | null) {
  const belt = p.belts.find((b) => b.id === beltId);
  if (!belt) return;
  belt.itemId = itemId;
  syncBeltItem(p, belt);
}

export function removeNodes(p: Pipeline, ids: string[]) {
  const set = new Set(ids);
  p.nodes = p.nodes.filter((n) => !set.has(n.id));
  p.belts = p.belts.filter((b) => !set.has(b.from) && !set.has(b.to));
}

export function removeBelt(p: Pipeline, id: string) {
  p.belts = p.belts.filter((b) => b.id !== id);
}

export function removeItem(p: Pipeline, id: string) {
  p.items = p.items.filter((i) => i.id !== id);
  for (const n of p.nodes) {
    n.inputs = n.inputs.filter((x) => x !== id);
    n.outputs = n.outputs.filter((x) => x !== id);
  }
  for (const b of p.belts) if (b.itemId === id) b.itemId = null;
}

/** Copies buildings (and the belts between them) and returns the new ids. */
export function duplicateNodes(p: Pipeline, ids: string[], dx: number, dy: number): string[] {
  const idMap = new Map<string, string>();
  const originals = p.nodes.filter((n) => ids.includes(n.id));
  for (const n of originals) {
    const copy: FactoryNode = {
      ...n,
      id: uid('node'),
      inputs: [...n.inputs],
      outputs: [...n.outputs],
      x: n.x + dx,
      y: n.y + dy,
      metadata: n.metadata.map((m) => ({ ...m, id: uid('m') })),
    };
    if (originals.length === 1) copy.name = copyName(p, n.name);
    idMap.set(n.id, copy.id);
    p.nodes.push(copy);
  }
  for (const b of [...p.belts]) {
    const from = idMap.get(b.from);
    const to = idMap.get(b.to);
    if (from && to) p.belts.push({ ...b, id: uid('belt'), from, to });
  }
  return [...idMap.values()];
}

function copyName(p: Pipeline, name: string): string {
  const base = name.replace(/ \d+$/, '');
  const taken = new Set(p.nodes.map((n) => n.name));
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Nearest free spot (in cells) around the requested one, so buildings don't stack. */
export function findFreeSpot(
  p: Pipeline,
  x: number,
  y: number,
  w: number,
  h: number,
  sizeOf: (n: FactoryNode) => { w: number; h: number },
): { x: number; y: number } {
  const free = (cx: number, cy: number) =>
    p.nodes.every((n) => {
      const s = sizeOf(n);
      return cx + w <= n.x || cx >= n.x + s.w || cy + h <= n.y || cy >= n.y + s.h;
    });
  if (free(x, y)) return { x, y };
  for (let r = 1; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (free(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return { x, y };
}

import { ARROW_COLOR, KIND_META } from './defaults';
import {
  CELL,
  DV,
  cellCenter,
  cellKey,
  connectedGroups,
  nodeCells,
  nodeRect,
  normalizeOffsets,
  opposite,
  outputCells,
  rotateDir,
  rotateOffsets,
  type Pt,
} from './geometry';
import { uid } from './ids';
import type { BeltTile, CombineMode, Dir, FactoryNode, ItemLayer, ItemType, Pipeline } from './types';

/**
 * Pure (draft-mutating) grid operations shared by the store, canvas and tests.
 * The floor is a grid where every cell holds at most one building part or one belt tile.
 */

export interface Occupant {
  node?: FactoryNode;
  tile?: BeltTile;
}

export function occupancy(p: Pipeline): Map<string, Occupant> {
  const map = new Map<string, Occupant>();
  for (const n of p.nodes) for (const c of nodeCells(n)) map.set(cellKey(c.x, c.y), { node: n });
  for (const t of p.belts) map.set(cellKey(t.x, t.y), { tile: t });
  return map;
}

/** True when every cell is free, apart from things with an ignored id. */
export function canPlaceCells(p: Pipeline, cells: Pt[], ignore: Set<string> = new Set()): boolean {
  const occ = occupancy(p);
  return cells.every((c) => {
    const o = occ.get(cellKey(c.x, c.y));
    if (!o) return true;
    const id = o.node?.id ?? o.tile?.id;
    return !!id && ignore.has(id);
  });
}

/** True when a single block fits at (x, y). */
export function canPlaceNode(p: Pipeline, x: number, y: number): boolean {
  return canPlaceCells(p, [{ x, y }]);
}

/** Sets a node's cells from absolute positions, re-anchoring at the top-left. */
export function setNodeCells(node: FactoryNode, cells: Pt[]) {
  const { cells: offsets, dx, dy } = normalizeOffsets(cells.map((c) => [c.x, c.y] as [number, number]));
  node.x = dx;
  node.y = dy;
  node.cells = offsets;
}

/**
 * The floor's one rule for structures: buildings of the same kind that touch
 * (side by side, any direction) are always a single building. Merges every
 * such pair until none are left. The larger building survives (the earlier one
 * on a tie) and keeps its name, type, technology and facing; it takes over the
 * other's cells, inputs, outputs and metadata. Returns how many merges happened.
 */
export function mergeTouching(p: Pipeline): number {
  let merges = 0;
  for (;;) {
    const owner = new Map<string, FactoryNode>();
    for (const n of p.nodes) for (const c of nodeCells(n)) owner.set(cellKey(c.x, c.y), n);
    let pair: [FactoryNode, FactoryNode] | null = null;
    search: for (const n of p.nodes) {
      for (const c of nodeCells(n)) {
        for (const [dx, dy] of DV) {
          const o = owner.get(cellKey(c.x + dx, c.y + dy));
          if (o && o !== n && o.kind === n.kind) {
            pair = [n, o];
            break search;
          }
        }
      }
    }
    if (!pair) return merges;
    const [a, b] = pair;
    const aFirst = p.nodes.indexOf(a) < p.nodes.indexOf(b);
    const keep = a.cells.length > b.cells.length || (a.cells.length === b.cells.length && aFirst) ? a : b;
    const gone = keep === a ? b : a;
    mergeInto(keep, gone);
    setNodeCells(keep, [...nodeCells(keep), ...nodeCells(gone)]);
    p.nodes = p.nodes.filter((n) => n !== gone);
    p.arrows = p.arrows
      .map((ar) => ({ ...ar, from: ar.from === gone.id ? keep.id : ar.from, to: ar.to === gone.id ? keep.id : ar.to }))
      .filter((ar, i, all) => ar.from !== ar.to && all.findIndex((x) => x.from === ar.from && x.to === ar.to) === i);
    merges++;
  }
}

/**
 * Places a 1×1 block. If it touches buildings of the same kind it becomes part
 * of them (fusing several into one if it bridges them). Returns the id of the
 * building it ends up in, or null when the cell is taken.
 */
export function placeBlock(p: Pipeline, block: FactoryNode): string | null {
  const { x, y } = block;
  if (!canPlaceNode(p, x, y)) return null;
  p.nodes.push({ ...block, cells: [[0, 0]] });
  mergeTouching(p);
  return p.nodes.find((n) => nodeCells(n).some((c) => c.x === x && c.y === y))?.id ?? null;
}

function mergeInto(target: FactoryNode, other: FactoryNode) {
  for (const id of other.inputs) if (!target.inputs.includes(id)) target.inputs.push(id);
  for (const id of other.outputs) if (!target.outputs.includes(id)) target.outputs.push(id);
  const keys = new Set(target.metadata.map((m) => m.key));
  for (const m of other.metadata) if (!keys.has(m.key)) target.metadata.push(m);
  if (!target.description && other.description) target.description = other.description;
  if (!target.technology && other.technology) target.technology = other.technology;
}

/** Lays belt tiles; existing tiles are redirected, cells covered by buildings are skipped. */
export function paintBelt(p: Pipeline, cells: Array<Pt & { dir: Dir }>): number {
  const occ = occupancy(p);
  let changed = 0;
  for (const c of cells) {
    const o = occ.get(cellKey(c.x, c.y));
    if (o?.node) continue;
    if (o?.tile) {
      if (o.tile.dir !== c.dir) {
        o.tile.dir = c.dir;
        changed++;
      }
      continue;
    }
    const tile: BeltTile = { id: uid('belt'), x: c.x, y: c.y, dir: c.dir, itemId: null, description: '' };
    p.belts.push(tile);
    occ.set(cellKey(c.x, c.y), { tile });
    changed++;
  }
  return changed;
}

/** Direction of a single grid step from `a` to the neighbouring cell `b`. */
export function stepDir(a: Pt, b: Pt): Dir {
  return b.x > a.x ? 0 : b.x < a.x ? 2 : b.y > a.y ? 1 : 3;
}

/** Neighbouring cells from `a` to `b`, one grid step at a time (fast drags can skip cells). */
export function gridSteps(a: Pt, b: Pt): Pt[] {
  const out: Pt[] = [];
  const cur = { ...a };
  while (cur.x !== b.x || cur.y !== b.y) {
    // Walk along whichever axis has further to go, so the trail hugs the cursor's path.
    if (Math.abs(b.x - cur.x) >= Math.abs(b.y - cur.y)) cur.x += Math.sign(b.x - cur.x);
    else cur.y += Math.sign(b.y - cur.y);
    out.push({ ...cur });
  }
  return out;
}

/**
 * One step of dragging a belt, the way shapez does it: the tile behind turns
 * to point into the new cell (becoming a corner if the drag changed direction)
 * and a tile pointing the way of travel is laid in the new cell. Buildings are
 * never painted over; the tile before one just points into it.
 */
export function extendBelt(p: Pipeline, from: Pt, to: Pt): boolean {
  const dir = stepDir(from, to);
  const occ = occupancy(p);
  let changed = false;
  const prev = occ.get(cellKey(from.x, from.y))?.tile;
  if (prev && prev.dir !== dir) {
    prev.dir = dir;
    changed = true;
  }
  if (occ.get(cellKey(to.x, to.y))?.node) return changed;
  return paintBelt(p, [{ ...to, dir }]) > 0 || changed;
}

/** Removes whatever sits on a cell. Returns what was removed. */
export function eraseCell(p: Pipeline, x: number, y: number): 'node' | 'tile' | null {
  const tileIdx = p.belts.findIndex((t) => t.x === x && t.y === y);
  if (tileIdx >= 0) {
    p.belts.splice(tileIdx, 1);
    return 'tile';
  }
  const node = p.nodes.find((n) => nodeCells(n).some((c) => c.x === x && c.y === y));
  if (!node) return null;
  const rest = nodeCells(node).filter((c) => c.x !== x || c.y !== y);
  if (!rest.length) {
    removeNodes(p, [node.id]);
    return 'node';
  }
  // Removing a block can cut a building in two (or more): each piece becomes its own building.
  const [keep, ...pieces] = connectedGroups(rest);
  setNodeCells(node, keep);
  for (const piece of pieces) {
    const copy: FactoryNode = {
      ...node,
      id: uid('node'),
      name: copyName(p, node.name),
      inputs: [...node.inputs],
      outputs: [...node.outputs],
      metadata: node.metadata.map((m) => ({ ...m, id: uid('m') })),
    };
    setNodeCells(copy, piece);
    p.nodes.push(copy);
  }
  return 'node';
}

export function removeNodes(p: Pipeline, ids: string[]) {
  const set = new Set(ids);
  p.nodes = p.nodes.filter((n) => !set.has(n.id));
  p.arrows = p.arrows.filter((a) => !set.has(a.from) && !set.has(a.to));
}

/* ---------- link arrows ---------- */

export type ArrowResult = { ok: true; id: string } | { ok: false; reason: string };

/** Adds an arrow between two buildings (one building may point at many). */
export function addArrow(p: Pipeline, from: string, to: string, color = ARROW_COLOR): ArrowResult {
  if (from === to) return { ok: false, reason: 'Pick another building to point at' };
  if (!p.nodes.some((n) => n.id === from) || !p.nodes.some((n) => n.id === to)) return { ok: false, reason: 'Missing building' };
  if (p.arrows.some((a) => a.from === from && a.to === to)) return { ok: false, reason: 'Those are already linked' };
  const arrow = { id: uid('arrow'), from, to, label: '', color, dashed: false };
  p.arrows.push(arrow);
  return { ok: true, id: arrow.id };
}

export function removeArrow(p: Pipeline, id: string) {
  p.arrows = p.arrows.filter((a) => a.id !== id);
}

export function removeTiles(p: Pipeline, ids: string[]) {
  const set = new Set(ids);
  p.belts = p.belts.filter((t) => !set.has(t.id));
}

export function removeItem(p: Pipeline, id: string) {
  p.items = p.items.filter((i) => i.id !== id);
  for (const n of p.nodes) {
    n.inputs = n.inputs.filter((x) => x !== id);
    n.outputs = n.outputs.filter((x) => x !== id);
  }
  for (const t of p.belts) if (t.itemId === id) t.itemId = null;
}

/* ---------- belt lines ---------- */

/** A belt line: the tiles items travel along after leaving a building. */
export interface Link {
  /** Id of the first tile. */
  id: string;
  from: string;
  /** The building the belt delivers into, or null when it ends in the open. */
  to: string | null;
  tiles: BeltTile[];
  /** What the belt carries (assigned, or inferred from the buildings). */
  itemId: string | null;
  /** Whether `itemId` was assigned by the user rather than inferred. */
  explicit: boolean;
  /** World-space path for items: out of the building, through tile centres, into the next. */
  points: Pt[];
}

function guessItem(from: FactoryNode, to: FactoryNode | null): string | null {
  if (to) {
    const shared = from.outputs.find((id) => to.inputs.includes(id));
    if (shared) return shared;
  }
  return from.outputs[0] ?? to?.inputs[0] ?? null;
}

export function traceLinks(p: Pipeline): Link[] {
  const occ = occupancy(p);
  const links: Link[] = [];
  for (const node of p.nodes) {
    if (!KIND_META[node.kind].hasOutput) continue;
    for (const cell of outputCells(node)) {
      const direct = occ.get(cellKey(cell.x, cell.y))?.node;
      if (direct) {
        // Blocks touching front-to-back hand items over directly, no belt needed.
        if (direct.id !== node.id && KIND_META[direct.kind].hasInput && direct.rotation === node.rotation) {
          const c = cellCenter(cell.x, cell.y);
          const [bx, by] = DV[node.rotation];
          const edge = { x: c.x - (bx * CELL) / 2, y: c.y - (by * CELL) / 2 };
          links.push({
            id: `${node.id}@${cell.x},${cell.y}`,
            from: node.id,
            to: direct.id,
            tiles: [],
            itemId: guessItem(node, direct),
            explicit: false,
            points: [edge, edge],
          });
        }
        continue;
      }
      const first = occ.get(cellKey(cell.x, cell.y))?.tile;
      // A belt pointing back into the building can't take anything from it.
      if (!first || first.dir === opposite(node.rotation)) continue;
      const tiles = [first];
      const seen = new Set([first.id]);
      let cur = first;
      let to: FactoryNode | null = null;
      for (;;) {
        const [dx, dy] = DV[cur.dir];
        const next = occ.get(cellKey(cur.x + dx, cur.y + dy));
        if (next?.tile) {
          if (seen.has(next.tile.id)) break;
          seen.add(next.tile.id);
          tiles.push(next.tile);
          cur = next.tile;
          continue;
        }
        const target = next?.node;
        if (target && target.id !== node.id && KIND_META[target.kind].hasInput && cur.dir === target.rotation) to = target;
        break;
      }
      const [bx, by] = DV[node.rotation];
      const start = cellCenter(first.x, first.y);
      const points: Pt[] = [{ x: start.x - (bx * CELL) / 2, y: start.y - (by * CELL) / 2 }];
      for (const t of tiles) points.push(cellCenter(t.x, t.y));
      const [ex, ey] = DV[cur.dir];
      const last = points[points.length - 1];
      const reach = to ? 0.5 : 0.35;
      points.push({ x: last.x + ex * CELL * reach, y: last.y + ey * CELL * reach });
      links.push({
        id: first.id,
        from: node.id,
        to: to?.id ?? null,
        tiles,
        itemId: first.itemId ?? guessItem(node, to),
        explicit: !!first.itemId,
        points,
      });
    }
  }
  return links;
}

/**
 * For drawing: the direction items arrive at each tile from (so a tile fed
 * from the side renders as a curve). Straight when fed from behind or not at all.
 */
export function tileInflow(p: Pipeline): Map<string, Dir> {
  const byCell = new Map(p.belts.map((t) => [cellKey(t.x, t.y), t]));
  const feeds = new Map<string, Set<Dir>>();
  const add = (x: number, y: number, d: Dir) => {
    const t = byCell.get(cellKey(x, y));
    if (!t || d === opposite(t.dir)) return;
    if (!feeds.has(t.id)) feeds.set(t.id, new Set());
    feeds.get(t.id)!.add(d);
  };
  for (const t of p.belts) add(t.x + DV[t.dir][0], t.y + DV[t.dir][1], t.dir);
  for (const n of p.nodes) if (KIND_META[n.kind].hasOutput) for (const c of outputCells(n)) add(c.x, c.y, n.rotation);
  const out = new Map<string, Dir>();
  for (const t of p.belts) {
    const f = feeds.get(t.id);
    if (!f || f.has(t.dir) || f.size !== 1) out.set(t.id, t.dir);
    else out.set(t.id, [...f][0]);
  }
  return out;
}

/** Records a belt's item on both buildings it joins, so inputs/outputs stay truthful. */
export function syncLinkItems(p: Pipeline) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  for (const link of traceLinks(p)) {
    if (!link.itemId) continue;
    const from = byId.get(link.from);
    if (from && !from.outputs.includes(link.itemId)) from.outputs.push(link.itemId);
    const to = link.to ? byId.get(link.to) : undefined;
    if (to && !to.inputs.includes(link.itemId)) to.inputs.push(link.itemId);
  }
}

export function setLinkItem(p: Pipeline, tileId: string, itemId: string | null) {
  const link = traceLinks(p).find((l) => l.tiles.some((t) => t.id === tileId));
  const first = p.belts.find((t) => t.id === (link ? link.id : tileId));
  if (!first) return;
  first.itemId = itemId;
  syncLinkItems(p);
}

/* ---------- moving, rotating, copying ---------- */

/** Whether the selection can move by (dx, dy) without landing on anything else. */
export function canMove(p: Pipeline, nodeIds: string[], tileIds: string[], dx: number, dy: number): boolean {
  const moving = new Set([...nodeIds, ...tileIds]);
  const occ = occupancy(p);
  const free = (x: number, y: number) => {
    const o = occ.get(cellKey(x, y));
    const id = o?.node?.id ?? o?.tile?.id;
    return !id || moving.has(id);
  };
  for (const n of p.nodes) if (moving.has(n.id) && !nodeCells(n).every((c) => free(c.x + dx, c.y + dy))) return false;
  for (const t of p.belts) if (moving.has(t.id) && !free(t.x + dx, t.y + dy)) return false;
  return true;
}

/** Rotates buildings (shape and facing) around their centre; ones that would collide stay put. */
export function rotateNodes(p: Pipeline, ids: string[], steps: number): number {
  let rotated = 0;
  for (const n of p.nodes) {
    if (!ids.includes(n.id)) continue;
    const before = nodeRect(n);
    const cells = rotateOffsets(n.cells, steps);
    const w = Math.max(...cells.map((c) => c[0])) + 1;
    const h = Math.max(...cells.map((c) => c[1])) + 1;
    const cx = before.x / CELL + before.w / CELL / 2;
    const cy = before.y / CELL + before.h / CELL / 2;
    const x = Math.round(cx - w / 2);
    const y = Math.round(cy - h / 2);
    const abs = cells.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
    if (!canPlaceCells(p, abs, new Set([n.id]))) continue;
    n.rotation = rotateDir(n.rotation, steps);
    n.x = x;
    n.y = y;
    n.cells = cells;
    rotated++;
  }
  return rotated;
}

/** Smallest downward shift (in cells) at which a copy of the selection fits. */
export function freeOffset(p: Pipeline, nodeIds: string[], tileIds: string[]): { dx: number; dy: number } {
  const nodes = p.nodes.filter((n) => nodeIds.includes(n.id));
  const tiles = p.belts.filter((t) => tileIds.includes(t.id));
  const ys = [...nodes.flatMap((n) => [n.y, (nodeRect(n).y + nodeRect(n).h) / CELL]), ...tiles.flatMap((t) => [t.y, t.y + 1])];
  const height = ys.length ? Math.max(...ys) - Math.min(...ys) : 1;
  const occ = occupancy(p);
  const free = (x: number, y: number) => !occ.has(cellKey(x, y));
  for (let dy = height + 1; dy < height + 200; dy++) {
    const fits =
      nodes.every((n) => nodeCells(n).every((c) => free(c.x, c.y + dy))) && tiles.every((t) => free(t.x, t.y + dy));
    if (fits) return { dx: 0, dy };
  }
  return { dx: 0, dy: height + 1 };
}

/** Copies buildings and belt tiles by an offset and returns the new ids. */
export function duplicate(p: Pipeline, nodeIds: string[], tileIds: string[], dx: number, dy: number): { nodes: string[]; tiles: string[] } {
  const nodes: string[] = [];
  const tiles: string[] = [];
  const originals = p.nodes.filter((n) => nodeIds.includes(n.id));
  for (const n of originals) {
    const copy: FactoryNode = {
      ...n,
      id: uid('node'),
      x: n.x + dx,
      y: n.y + dy,
      cells: n.cells.map((c) => [c[0], c[1]] as [number, number]),
      inputs: [...n.inputs],
      outputs: [...n.outputs],
      metadata: n.metadata.map((m) => ({ ...m, id: uid('m') })),
    };
    if (originals.length === 1) copy.name = copyName(p, n.name);
    nodes.push(copy.id);
    p.nodes.push(copy);
  }
  const idMap = new Map(originals.map((n, i) => [n.id, nodes[i]]));
  for (const ar of p.arrows.filter((x) => idMap.has(x.from) && idMap.has(x.to))) {
    p.arrows.push({ ...ar, id: uid('arrow'), from: idMap.get(ar.from)!, to: idMap.get(ar.to)! });
  }
  for (const t of p.belts.filter((b) => tileIds.includes(b.id))) {
    const copy = { ...t, id: uid('belt'), x: t.x + dx, y: t.y + dy };
    tiles.push(copy.id);
    p.belts.push(copy);
  }
  return { nodes, tiles };
}

export function copyName(p: Pipeline, name: string): string {
  const taken = new Set(p.nodes.map((n) => n.name));
  if (!taken.has(name)) return name;
  const base = name.replace(/ \d+$/, '');
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/* ---------- item looks ---------- */

export const MAX_LAYERS = 4;

/** What an item looks like: its derived layers, or its own shape and colour. */
export function lookOf(item: Pick<ItemType, 'shape' | 'color' | 'layers'>): ItemLayer[] {
  return item.layers?.length ? item.layers : [{ shape: item.shape, color: item.color }];
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Mixes colours as light, like shapez's mixer: red + green → yellow, red + blue → purple. */
export function mixColors(colors: string[]): string {
  const rgb = colors.map(parseHex).filter((c): c is [number, number, number] => !!c);
  if (!rgb.length) return colors[0] ?? '#aaaaaa';
  const out = [0, 1, 2].map((i) => Math.max(...rgb.map((c) => c[i])));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Combines input looks (A first) into an output look. */
export function combineLooks(mode: CombineMode, looks: ItemLayer[][]): ItemLayer[] | null {
  const [a, b] = looks;
  if (mode === 'own' || !a) return null;
  if (mode === 'stack') return looks.flat().slice(0, MAX_LAYERS);
  if (mode === 'paint') {
    const paint = b ? b[b.length - 1].color : a[0].color;
    return a.map((l) => ({ ...l, color: paint }));
  }
  const mixed = mixColors(looks.map((l) => l[0].color));
  return a.map((l) => ({ ...l, color: mixed }));
}

/**
 * Gives every item produced by a combining machine the look built from that
 * machine's inputs, following chains of combiners; items no machine derives
 * go back to their own look. Only writes when something actually changes.
 */
export function applyRecipes(p: Pipeline) {
  const byId = new Map(p.items.map((i) => [i.id, i]));
  const derived = new Map<string, { layers: ItemLayer[]; from: string }>();
  const look = (id: string) => {
    const item = byId.get(id);
    return derived.get(id)?.layers ?? (item ? [{ shape: item.shape, color: item.color }] : null);
  };
  const combiners = p.nodes.filter((n) => n.kind === 'machine' && n.combine && n.combine !== 'own');
  for (let pass = 0; pass <= combiners.length; pass++) {
    let changed = false;
    for (const n of combiners) {
      const looks = n.inputs.map(look).filter((l): l is ItemLayer[] => !!l);
      const result = combineLooks(n.combine!, looks);
      if (!result) continue;
      for (const out of n.outputs) {
        if (n.inputs.includes(out)) continue;
        const prev = derived.get(out);
        if (prev && prev.from !== n.id) continue; // the first machine to claim an item wins
        if (!prev || JSON.stringify(prev.layers) !== JSON.stringify(result)) {
          derived.set(out, { layers: result, from: n.id });
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  for (const item of p.items) {
    const d = derived.get(item.id);
    if (d) {
      if (item.derivedFrom !== d.from) item.derivedFrom = d.from;
      if (JSON.stringify(item.layers) !== JSON.stringify(d.layers)) item.layers = d.layers;
    } else if (item.derivedFrom || item.layers) {
      delete item.layers;
      delete item.derivedFrom;
    }
  }
}

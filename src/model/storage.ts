import { KIND_META, NODE_KINDS, ITEM_SHAPES, starterBlueprints } from './defaults';
import { uid } from './ids';
import { inputCells, lPath, normalizeOffsets, outputCells } from './geometry';
import { paintBelt } from './ops';
import type { BeltTile, Blueprint, Dir, FactoryNode, ItemType, Pipeline } from './types';

const LIBRARY_KEY = 'datafactory.library.v1';
const CURRENT_KEY = 'datafactory.current.v1';

export interface LibraryEntry {
  id: string;
  name: string;
  updatedAt: number;
  nodeCount: number;
}

function readLibrary(): Record<string, Pipeline> {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLibrary(lib: Record<string, Pipeline>): boolean {
  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
    return true;
  } catch {
    return false;
  }
}

export function listPipelines(): LibraryEntry[] {
  return Object.values(readLibrary())
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt ?? 0, nodeCount: p.nodes?.length ?? 0 }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadPipeline(id: string): Pipeline | null {
  const raw = readLibrary()[id];
  return raw ? normalizePipeline(raw) : null;
}

export function savePipeline(p: Pipeline): boolean {
  const lib = readLibrary();
  lib[p.id] = p;
  return writeLibrary(lib) && setCurrentId(p.id);
}

export function deletePipeline(id: string): void {
  const lib = readLibrary();
  delete lib[id];
  writeLibrary(lib);
}

export function getCurrentId(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

export function setCurrentId(id: string): boolean {
  try {
    localStorage.setItem(CURRENT_KEY, id);
    return true;
  } catch {
    return false;
  }
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/**
 * Turns anything that looks roughly like a pipeline (older saves, hand-edited
 * JSON) into a well-formed one, dropping belts that point nowhere.
 */
export function normalizePipeline(input: unknown): Pipeline {
  const raw = obj(input);
  const items: ItemType[] = arr(raw.items).map((v, i) => {
    const o = obj(v);
    const shape = ITEM_SHAPES.includes(o.shape as never) ? (o.shape as ItemType['shape']) : ITEM_SHAPES[i % ITEM_SHAPES.length];
    return {
      id: str(o.id) || uid('item'),
      name: str(o.name, 'Item'),
      shape,
      color: str(o.color, '#8a94a6'),
      description: str(o.description),
      fields: arr(o.fields).map((f) => {
        const fo = obj(f);
        return { id: str(fo.id) || uid('f'), name: str(fo.name), type: str(fo.type) };
      }),
    };
  });
  const itemIds = new Set(items.map((i) => i.id));
  const blueprints: Blueprint[] = raw.blueprints
    ? arr(raw.blueprints)
        .map((v) => obj(v))
        .filter((o) => NODE_KINDS.includes(o.kind as never))
        .map((o) => {
          const kind = o.kind as Blueprint['kind'];
          return {
            id: str(o.id) || uid('bp'),
            kind,
            name: str(o.name, KIND_META[kind].label),
            description: str(o.description),
            technology: str(o.technology),
            color: str(o.color, KIND_META[kind].color),
          };
        })
    : starterBlueprints();
  const nodes: FactoryNode[] = arr(raw.nodes)
    .map((v) => obj(v))
    .filter((o) => NODE_KINDS.includes(o.kind as never))
    .map((o) => {
      const kind = o.kind as FactoryNode['kind'];
      const ids = (v: unknown) => arr(v).filter((x): x is string => typeof x === 'string' && itemIds.has(x));
      return {
        id: str(o.id) || uid('node'),
        kind,
        name: str(o.name, KIND_META[kind].label),
        type: str(o.type, KIND_META[kind].label),
        technology: str(o.technology),
        description: str(o.description),
        color: str(o.color, KIND_META[kind].color),
        x: Math.round(num(o.x)),
        y: Math.round(num(o.y)),
        rotation: ([0, 1, 2, 3].includes(o.rotation as number) ? o.rotation : 0) as Dir,
        cells: readCells(o, ([0, 1, 2, 3].includes(o.rotation as number) ? o.rotation : 0) as Dir),
        inputs: KIND_META[kind].hasInput ? ids(o.inputs) : [],
        outputs: KIND_META[kind].hasOutput ? ids(o.outputs) : [],
        metadata: arr(o.metadata).map((m) => {
          const mo = obj(m);
          return { id: str(mo.id) || uid('m'), key: str(mo.key), value: str(mo.value) };
        }),
      };
    });
  const rawBelts = arr(raw.belts).map((v) => obj(v));
  const tiles: BeltTile[] = rawBelts
    .filter((o) => typeof o.x === 'number' && typeof o.y === 'number')
    .map((o) => ({
      id: str(o.id) || uid('belt'),
      x: Math.round(num(o.x)),
      y: Math.round(num(o.y)),
      dir: ([0, 1, 2, 3].includes(o.dir as number) ? o.dir : 0) as Dir,
      itemId: typeof o.itemId === 'string' && itemIds.has(o.itemId) ? o.itemId : null,
      description: str(o.description),
    }));
  // One tile per cell: later duplicates lose.
  const seenCells = new Set<string>();
  const belts = tiles.filter((t) => {
    const k = `${t.x},${t.y}`;
    if (seenCells.has(k)) return false;
    seenCells.add(k);
    return true;
  });
  const draft = { belts, nodes } as Pipeline;
  migrateLinkBelts(draft, rawBelts, itemIds);
  const view = obj(raw.view);
  const now = Date.now();
  return {
    id: str(raw.id) || uid('pipe'),
    name: str(raw.name, 'Untitled factory'),
    description: str(raw.description),
    items,
    blueprints,
    nodes,
    belts: draft.belts,
    view: { x: num(view.x), y: num(view.y), zoom: Math.min(2.5, Math.max(0.2, num(view.zoom, 1))) },
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
  };
}

/**
 * Early saves stored belts as abstract from → to links. Lay them out as
 * tiles: across from the source's output, then down/up, then into the target.
 */
function migrateLinkBelts(p: Pipeline, raw: Record<string, unknown>[], itemIds: Set<string>) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  for (const o of raw) {
    const from = byId.get(str(o.from));
    const to = byId.get(str(o.to));
    if (!from || !to || from === to || !KIND_META[from.kind].hasOutput || !KIND_META[to.kind].hasInput) continue;
    const outs = outputCells(from);
    const ins = inputCells(to);
    const a = outs[Math.floor(outs.length / 2)];
    const b = ins[Math.floor(ins.length / 2)];
    if (b.x < a.x) continue;
    const midX = Math.floor((a.x + b.x) / 2);
    const cells = [...lPath(a, { x: midX, y: b.y }, 'h', 0), ...lPath({ x: midX, y: b.y }, b, 'h', 0).slice(1)];
    // Where the two L-paths meet, point each tile at the next one.
    for (let i = 0; i < cells.length - 1; i++) {
      const [c, n] = [cells[i], cells[i + 1]];
      c.dir = n.x > c.x ? 0 : n.x < c.x ? 2 : n.y > c.y ? 1 : 3;
    }
    const before = p.belts.length;
    paintBelt(p, cells);
    const first = p.belts.find((t) => t.x === a.x && t.y === a.y);
    if (first && p.belts.length > before && typeof o.itemId === 'string' && itemIds.has(o.itemId)) first.itemId = o.itemId;
  }
}

/**
 * A building's blocks. Accepts `cells` offsets, or the older `size` (a straight
 * row across the flow); anything unusable becomes a single block.
 */
function readCells(o: Record<string, unknown>, rotation: Dir): Array<[number, number]> {
  const raw = arr(o.cells)
    .filter((c): c is [number, number] => Array.isArray(c) && c.length === 2 && c.every((v) => typeof v === 'number' && Number.isFinite(v)))
    .map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number]);
  if (raw.length) return normalizeOffsets(raw.slice(0, 1024)).cells;
  const size = Math.max(1, Math.min(64, Math.round(num(o.size, 1))));
  return Array.from({ length: size }, (_, i) => (rotation % 2 === 0 ? [0, i] : [i, 0]) as [number, number]);
}

export function downloadPipeline(p: Pipeline): void {
  const blob = new Blob([JSON.stringify({ format: 'datafactory', version: 1, pipeline: p }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${p.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'factory'}.factory.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readPipelineFile(file: File): Promise<Pipeline> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const raw = obj(parsed).pipeline ?? parsed;
  if (!Array.isArray(obj(raw).nodes)) throw new Error('This file does not look like a DataFactory pipeline.');
  const p = normalizePipeline(raw);
  // Imports never overwrite an existing factory silently.
  return { ...p, id: uid('pipe'), updatedAt: Date.now() };
}

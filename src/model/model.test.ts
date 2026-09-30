import { describe, expect, it } from 'vitest';
import { blankPipeline, examplePipeline, makeItem, makeNode } from './defaults';
import { KIND_SIZE, pathFromPoints, routeBelt } from './geometry';
import * as ops from './ops';
import { normalizePipeline } from './storage';

function tinyFactory() {
  const p = blankPipeline();
  const visit = makeItem({ name: 'Visit' });
  const src = makeNode('source', 0, 0);
  const mac = makeNode('machine', 6, 0);
  const sto = makeNode('store', 12, 0);
  src.outputs.push(visit.id);
  p.items.push(visit);
  p.nodes.push(src, mac, sto);
  return { p, visit, src, mac, sto };
}

describe('connecting buildings', () => {
  it('respects the direction of flow', () => {
    const { p, src, mac, sto } = tinyFactory();
    expect(ops.canConnect(p, src.id, mac.id).ok).toBe(true);
    expect(ops.canConnect(p, sto.id, mac.id).ok).toBe(false); // stores have no output
    expect(ops.canConnect(p, mac.id, src.id).ok).toBe(false); // sources have no input
    expect(ops.canConnect(p, mac.id, mac.id).ok).toBe(false);
  });

  it('rejects duplicate belts', () => {
    const { p, src, mac } = tinyFactory();
    expect(ops.connect(p, src.id, mac.id)).not.toBeNull();
    expect(ops.connect(p, src.id, mac.id)).toBeNull();
    expect(p.belts).toHaveLength(1);
  });

  it('carries the upstream output and registers it downstream', () => {
    const { p, src, mac, visit } = tinyFactory();
    const belt = ops.connect(p, src.id, mac.id)!;
    expect(belt.itemId).toBe(visit.id);
    expect(mac.inputs).toContain(visit.id);
  });

  it('setting a belt item updates both ends', () => {
    const { p, mac, sto } = tinyFactory();
    const order = makeItem({ name: 'Order' });
    p.items.push(order);
    const belt = ops.connect(p, mac.id, sto.id)!;
    expect(belt.itemId).toBeNull();
    ops.setBeltItem(p, belt.id, order.id);
    expect(mac.outputs).toContain(order.id);
    expect(sto.inputs).toContain(order.id);
  });
});

describe('editing the floor', () => {
  it('removing a building removes its belts', () => {
    const { p, src, mac, sto } = tinyFactory();
    ops.connect(p, src.id, mac.id);
    ops.connect(p, mac.id, sto.id);
    ops.removeNodes(p, [mac.id]);
    expect(p.nodes.map((n) => n.id)).toEqual([src.id, sto.id]);
    expect(p.belts).toHaveLength(0);
  });

  it('removing an item clears it everywhere', () => {
    const { p, src, mac, visit } = tinyFactory();
    const belt = ops.connect(p, src.id, mac.id)!;
    ops.removeItem(p, visit.id);
    expect(p.items).toHaveLength(0);
    expect(src.outputs).toHaveLength(0);
    expect(mac.inputs).toHaveLength(0);
    expect(belt.itemId).toBeNull();
  });

  it('duplicates keep internal belts but not external ones', () => {
    const { p, src, mac, sto } = tinyFactory();
    ops.connect(p, src.id, mac.id);
    ops.connect(p, mac.id, sto.id);
    const ids = ops.duplicateNodes(p, [mac.id, sto.id], 0, 5);
    expect(ids).toHaveLength(2);
    expect(p.nodes).toHaveLength(5);
    const copies = p.nodes.filter((n) => ids.includes(n.id));
    expect(copies.every((n) => n.y === 5)).toBe(true);
    const internal = p.belts.filter((b) => ids.includes(b.from) || ids.includes(b.to));
    expect(internal).toHaveLength(1);
    expect(ids).toContain(internal[0].from);
    expect(ids).toContain(internal[0].to);
  });

  it('duplicated buildings do not share arrays with the original', () => {
    const { p, src } = tinyFactory();
    const [copyId] = ops.duplicateNodes(p, [src.id], 0, 4);
    const copy = p.nodes.find((n) => n.id === copyId)!;
    copy.outputs.push('x');
    expect(src.outputs).not.toContain('x');
    expect(copy.name).toBe(`${src.name} 2`);
  });

  it('finds a free spot instead of stacking buildings', () => {
    const { p } = tinyFactory();
    const spot = ops.findFreeSpot(p, 0, 0, 3, 3, (n) => KIND_SIZE[n.kind]);
    expect(spot).not.toEqual({ x: 0, y: 0 });
  });
});

describe('belt routing', () => {
  it('goes straight when ports line up', () => {
    const pts = routeBelt({ x: 0, y: 48 }, { x: 200, y: 48 });
    expect(pts).toHaveLength(2);
  });

  it('uses an S-bend for forward belts at different heights', () => {
    const pts = routeBelt({ x: 0, y: 0 }, { x: 200, y: 100 });
    expect(pts).toHaveLength(4);
    expect(pts[1].y).toBe(0);
    expect(pts[2].y).toBe(100);
  });

  it('loops underneath both buildings for backward belts', () => {
    const from = { x: 200, y: 0, w: 96, h: 96 };
    const to = { x: 0, y: 32, w: 96, h: 96 };
    const pts = routeBelt({ x: 296, y: 48 }, { x: 0, y: 80 }, from, to);
    const lane = pts[2].y;
    expect(lane).toBeGreaterThan(128);
    expect(pts[pts.length - 1]).toEqual({ x: 0, y: 80 });
    expect(pathFromPoints(pts)).toMatch(/^M 296 48/);
  });
});

describe('loading files', () => {
  it('round-trips the example factory', () => {
    const p = examplePipeline();
    const again = normalizePipeline(JSON.parse(JSON.stringify(p)));
    expect(again).toEqual(p);
  });

  it('repairs malformed input', () => {
    const p = normalizePipeline({
      name: 'Hand written',
      items: [{ id: 'i1', name: 'Order', shape: 'blob' }],
      nodes: [
        { id: 'a', kind: 'source', x: 1.4, outputs: ['i1', 'ghost'], inputs: ['i1'] },
        { id: 'b', kind: 'teleporter' },
        { id: 'c', kind: 'store' },
      ],
      belts: [
        { from: 'a', to: 'c', itemId: 'i1' },
        { from: 'a', to: 'b' },
        { from: 'c', to: 'a' },
      ],
    });
    expect(p.items[0].shape).toBe('circle');
    expect(p.nodes.map((n) => n.id)).toEqual(['a', 'c']);
    expect(p.nodes[0]).toMatchObject({ x: 1, outputs: ['i1'], inputs: [] });
    expect(p.belts).toHaveLength(1);
    expect(p.blueprints.length).toBeGreaterThan(0);
  });
});

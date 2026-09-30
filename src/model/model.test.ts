import { describe, expect, it } from 'vitest';
import { blankPipeline, examplePipeline, makeItem, makeNode } from './defaults';
import { footprint, lPath, nodeCells } from './geometry';
import * as ops from './ops';
import { normalizePipeline } from './storage';
import type { Dir } from './types';

/** source (0..2) → belt (3..5) → machine (6..8) → belt (9..11) → store (12..14), all on row 1. */
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

const row = (x0: number, x1: number, y: number, dir: Dir = 0) =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y, dir }));

describe('laying belts', () => {
  it('follows an L shape and points each tile at the next', () => {
    const cells = lPath({ x: 0, y: 0 }, { x: 2, y: 2 }, 'h', 0);
    expect(cells.map((c) => [c.x, c.y, c.dir])).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 1],
      [2, 1, 1],
      [2, 2, 1],
    ]);
    expect(lPath({ x: 4, y: 4 }, { x: 4, y: 4 }, 'h', 3)).toEqual([{ x: 4, y: 4, dir: 3 }]);
  });

  it('never paints over buildings and redirects existing tiles', () => {
    const { p } = tinyFactory();
    ops.paintBelt(p, row(4, 7, 1));
    expect(p.belts.map((t) => t.x)).toEqual([4, 5]);
    ops.paintBelt(p, [{ x: 4, y: 1, dir: 1 }]);
    expect(p.belts).toHaveLength(2);
    expect(p.belts[0].dir).toBe(1);
  });
});

describe('tracing belt lines', () => {
  it('connects a building output to the next building input', () => {
    const { p, src, mac, visit } = tinyFactory();
    ops.paintBelt(p, row(3, 5, 1));
    const [link] = ops.traceLinks(p);
    expect(link).toMatchObject({ from: src.id, to: mac.id, itemId: visit.id, explicit: false });
    expect(link.tiles).toHaveLength(3);
  });

  it('leaves the end open when the belt misses the input side', () => {
    const { p, mac } = tinyFactory();
    ops.paintBelt(p, row(3, 4, 1));
    ops.paintBelt(p, [{ x: 5, y: 1, dir: 1 }]);
    const [link] = ops.traceLinks(p);
    expect(link.to).toBeNull();
    expect(link.to).not.toBe(mac.id);
  });

  it('respects building rotation', () => {
    const { p, mac } = tinyFactory();
    ops.paintBelt(p, row(3, 5, 1));
    mac.rotation = 2; // now faces left: its input is on the right
    expect(ops.traceLinks(p)[0].to).toBeNull();
  });

  it('ignores belts pointing back into the source and handles loops', () => {
    const { p } = tinyFactory();
    ops.paintBelt(p, [{ x: 3, y: 1, dir: 2 }]);
    expect(ops.traceLinks(p)).toHaveLength(0);
    const q = tinyFactory().p;
    ops.paintBelt(q, [
      { x: 3, y: 0, dir: 0 },
      { x: 4, y: 0, dir: 1 },
      { x: 4, y: 1, dir: 2 },
      { x: 3, y: 1, dir: 3 },
    ]);
    expect(ops.traceLinks(q)[0].tiles).toHaveLength(4);
  });

  it('draws side-fed tiles as curves', () => {
    const { p } = tinyFactory();
    ops.paintBelt(p, [
      { x: 3, y: 1, dir: 0 },
      { x: 4, y: 1, dir: 1 },
      { x: 4, y: 2, dir: 1 },
    ]);
    const inflow = ops.tileInflow(p);
    const [a, b, c] = p.belts;
    expect(inflow.get(a.id)).toBe(0);
    expect(inflow.get(b.id)).toBe(0); // enters moving right, leaves down
    expect(inflow.get(c.id)).toBe(1);
  });

  it('assigning an item records it on both buildings', () => {
    const { p, mac, sto } = tinyFactory();
    const order = makeItem({ name: 'Order' });
    p.items.push(order);
    ops.paintBelt(p, row(9, 11, 1));
    ops.setLinkItem(p, p.belts[1].id, order.id);
    expect(p.belts[0].itemId).toBe(order.id);
    expect(mac.outputs).toContain(order.id);
    expect(sto.inputs).toContain(order.id);
  });
});

describe('editing the floor', () => {
  it('only places buildings on free cells', () => {
    const { p } = tinyFactory();
    expect(ops.canPlaceNode(p, 'machine', 1, 1, 0)).toBe(false);
    expect(ops.canPlaceNode(p, 'machine', 0, 4, 0)).toBe(true);
    ops.paintBelt(p, [{ x: 1, y: 5, dir: 0 }]);
    expect(ops.canPlaceNode(p, 'machine', 0, 4, 0)).toBe(false);
  });

  it('right-click erase removes tiles first, then buildings', () => {
    const { p, mac } = tinyFactory();
    ops.paintBelt(p, row(3, 5, 1));
    expect(ops.eraseCell(p, 4, 1)).toBe('tile');
    expect(ops.eraseCell(p, 7, 2)).toBe('node');
    expect(p.nodes.find((n) => n.id === mac.id)).toBeUndefined();
    expect(ops.eraseCell(p, 40, 40)).toBeNull();
  });

  it('rotates buildings around their centre and swaps their footprint', () => {
    const p = blankPipeline();
    const buf = makeNode('buffer', 0, 0);
    p.nodes.push(buf);
    expect(ops.rotateNodes(p, [buf.id], 1)).toBe(1);
    expect(buf.rotation).toBe(1);
    expect(footprint(buf.kind, buf.rotation)).toEqual({ w: 3, h: 5 });
    expect(nodeCells(buf)).toContainEqual({ x: 2, y: 1 }); // the old centre cell stays covered
  });

  it('refuses to rotate into something else', () => {
    const p = blankPipeline();
    const buf = makeNode('buffer', 0, 0);
    p.nodes.push(buf);
    ops.paintBelt(p, [{ x: 2, y: 3, dir: 0 }]);
    expect(ops.rotateNodes(p, [buf.id], 1)).toBe(0);
    expect(buf.rotation).toBe(0);
  });

  it('moves a selection only onto free cells', () => {
    const { p, src, mac } = tinyFactory();
    expect(ops.canMove(p, [src.id], [], 4, 0)).toBe(false); // would land on the machine
    expect(ops.canMove(p, [src.id, mac.id], [], 3, 0)).toBe(true);
  });

  it('duplicates buildings and belts into free space', () => {
    const { p, src, mac } = tinyFactory();
    ops.paintBelt(p, row(3, 5, 1));
    const tileIds = p.belts.map((t) => t.id);
    const off = ops.freeOffset(p, [src.id, mac.id], tileIds);
    const ids = ops.duplicate(p, [src.id, mac.id], tileIds, off.dx, off.dy);
    expect(ids.nodes).toHaveLength(2);
    expect(ids.tiles).toHaveLength(3);
    const links = ops.traceLinks(p);
    expect(links.filter((l) => l.to)).toHaveLength(2);
    const copy = p.nodes.find((n) => n.id === ids.nodes[0])!;
    copy.outputs.push('x');
    expect(src.outputs).not.toContain('x');
  });

  it('removing an item clears it everywhere', () => {
    const { p, src, visit } = tinyFactory();
    ops.paintBelt(p, row(3, 5, 1));
    ops.setLinkItem(p, p.belts[0].id, visit.id);
    ops.removeItem(p, visit.id);
    expect(src.outputs).toHaveLength(0);
    expect(p.belts[0].itemId).toBeNull();
  });
});

describe('the example and files', () => {
  it('example belts connect every building as intended', () => {
    const p = examplePipeline();
    const name = (id: string | null) => p.nodes.find((n) => n.id === id)?.name;
    const links = ops.traceLinks(p).map((l) => [name(l.from), name(l.to), p.items.find((i) => i.id === l.itemId)?.name]);
    expect(links).toEqual(
      expect.arrayContaining([
        ['Visit Source', 'Enrichment Machine', 'Visit'],
        ['Enrichment Machine', 'Event Buffer', 'Enriched Visit'],
        ['Event Buffer', 'Validation Machine', 'Enriched Visit'],
        ['Validation Machine', 'Aggregation Machine', 'Valid Visit'],
        ['Validation Machine', 'Rejected Visits', 'Rejected Visit'],
        ['Aggregation Machine', 'Analytics Store', 'Visit Summary'],
      ]),
    );
    expect(links).toHaveLength(6);
  });

  it('round-trips the example factory', () => {
    const p = examplePipeline();
    expect(normalizePipeline(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('migrates old from → to belts into laid tiles', () => {
    const p = normalizePipeline({
      items: [{ id: 'i1', name: 'Order', shape: 'circle' }],
      nodes: [
        { id: 'a', kind: 'source', x: 0, y: 0, outputs: ['i1'] },
        { id: 'b', kind: 'store', x: 8, y: 4 },
      ],
      belts: [{ from: 'a', to: 'b', itemId: 'i1' }],
    });
    const [link] = ops.traceLinks(p);
    expect(link).toMatchObject({ from: 'a', to: 'b', itemId: 'i1', explicit: true });
  });

  it('repairs malformed input', () => {
    const p = normalizePipeline({
      items: [{ id: 'i1', name: 'Order', shape: 'blob' }],
      nodes: [
        { id: 'a', kind: 'source', x: 1.4, rotation: 7, outputs: ['i1', 'ghost'], inputs: ['i1'] },
        { id: 'b', kind: 'teleporter' },
      ],
      belts: [
        { x: 5, y: 5, dir: 9 },
        { x: 5, y: 5, dir: 1 },
      ],
    });
    expect(p.items[0].shape).toBe('circle');
    expect(p.nodes).toHaveLength(1);
    expect(p.nodes[0]).toMatchObject({ x: 1, rotation: 0, outputs: ['i1'], inputs: [] });
    expect(p.belts).toHaveLength(1);
    expect(p.belts[0].dir).toBe(0);
  });
});

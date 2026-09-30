import { uid } from './ids';
import { lPath } from './geometry';
import type { BeltTile, Blueprint, Dir, FactoryNode, ItemShape, ItemType, NodeKind, Pipeline } from './types';

export const NODE_KINDS: NodeKind[] = ['source', 'machine', 'buffer', 'store'];

export interface KindMeta {
  label: string;
  plural: string;
  color: string;
  hint: string;
  hasInput: boolean;
  hasOutput: boolean;
  hotkey: string;
}

export const KIND_META: Record<NodeKind, KindMeta> = {
  source: {
    label: 'Source',
    plural: 'Sources',
    color: '#8fd35f',
    hint: 'Where data originates',
    hasInput: false,
    hasOutput: true,
    hotkey: '2',
  },
  machine: {
    label: 'Machine',
    plural: 'Machines',
    color: '#6aa9f0',
    hint: 'Transforms, enriches, validates, filters or aggregates',
    hasInput: true,
    hasOutput: true,
    hotkey: '3',
  },
  buffer: {
    label: 'Buffer',
    plural: 'Buffers',
    color: '#f3c14f',
    hint: 'Temporarily holds or transports data',
    hasInput: true,
    hasOutput: true,
    hotkey: '4',
  },
  store: {
    label: 'Store',
    plural: 'Stores',
    color: '#b58af0',
    hint: 'Where processed data ends up',
    hasInput: true,
    hasOutput: false,
    hotkey: '5',
  },
};

/** Default colour for link arrows: stands apart from belts and buildings. */
export const ARROW_COLOR = '#ef5072';

export const ITEM_SHAPES: ItemShape[] = ['circle', 'square', 'diamond', 'triangle', 'hexagon', 'star'];

/** A restrained, colourful palette used for items and custom buildings. */
export const SWATCHES = [
  '#ff666a',
  '#ffa24d',
  '#fcf52a',
  '#78ff66',
  '#87fff5',
  '#66a7ff',
  '#dd66ff',
  '#ff8fd0',
  '#aaaaaa',
];

/**
 * Generic component types. These describe *roles*, never technologies —
 * the technology is always something the user fills in.
 */
/** Generic starter types, each with a fitting generic icon (buffers keep their item windows). */
const STARTER_BLUEPRINTS: Array<[NodeKind, string, string, string?]> = [
  ['source', 'API', 'Data pulled from or pushed by an API', 'api'],
  ['source', 'File Drop', 'Files landing somewhere', 'file'],
  ['source', 'Database', 'Rows read from an operational database', 'db'],
  ['source', 'Event Stream', 'Events emitted continuously', 'constant_signal'],
  ['machine', 'Transformer', 'Reshapes items into another form', 'rotater'],
  ['machine', 'Enricher', 'Adds information to items', 'painter'],
  ['machine', 'Validator', 'Checks items and rejects bad ones', 'analyzer'],
  ['machine', 'Filter', 'Lets only some items through', 'filter'],
  ['machine', 'Aggregator', 'Combines many items into fewer', 'stacker'],
  ['buffer', 'Queue', 'Holds items until they are consumed'],
  ['buffer', 'Stream', 'Durable, replayable log of items'],
  ['buffer', 'Staging Area', 'Temporary landing zone'],
  ['store', 'Database', 'Persistent, queryable storage', 'db'],
  ['store', 'Warehouse', 'Analytical storage', 'table'],
  ['store', 'Object Storage', 'Files and blobs', 'storage'],
];

export function starterBlueprints(): Blueprint[] {
  return STARTER_BLUEPRINTS.map(([kind, name, description, icon]) => ({
    id: uid('bp'),
    kind,
    name,
    description,
    technology: '',
    color: KIND_META[kind].color,
    ...(icon ? { icon } : {}),
  }));
}

export function makeItem(partial: Partial<ItemType> = {}, index = 0): ItemType {
  return {
    id: uid('item'),
    name: 'Item',
    shape: ITEM_SHAPES[index % ITEM_SHAPES.length],
    color: SWATCHES[index % SWATCHES.length],
    description: '',
    fields: [],
    ...partial,
  };
}

export function makeNode(
  kind: NodeKind,
  x: number,
  y: number,
  blueprint?: Pick<Blueprint, 'name' | 'technology' | 'color' | 'description' | 'icon'>,
  rotation: Dir = 0,
): FactoryNode {
  return {
    id: uid('node'),
    kind,
    name: blueprint ? blueprint.name : KIND_META[kind].label,
    type: blueprint ? blueprint.name : KIND_META[kind].label,
    technology: blueprint?.technology ?? '',
    description: '',
    color: blueprint?.color || KIND_META[kind].color,
    x,
    y,
    rotation,
    cells: [[0, 0]],
    inputs: [],
    outputs: [],
    metadata: [],
    ...(blueprint?.icon ? { icon: blueprint.icon } : {}),
  };
}

export function blankPipeline(name = 'Untitled factory'): Pipeline {
  const now = Date.now();
  return {
    id: uid('pipe'),
    name,
    description: '',
    items: [],
    blueprints: starterBlueprints(),
    nodes: [],
    belts: [],
    arrows: [],
    areas: [],
    view: { x: 0, y: 0, zoom: 1 },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The example from the brief: a visit analytics pipeline. The technologies
 * are plain strings typed in by "a user" — the app attaches no behaviour to them.
 */
export function examplePipeline(): Pipeline {
  const p = blankPipeline('Visit Analytics');
  p.description = 'Website visits are enriched, queued, validated, aggregated and landed in the warehouse.';

  const visit = makeItem(
    {
      name: 'Visit',
      shape: 'circle',
      color: '#ff666a',
      description: 'A single page visit captured by the tracker.',
      fields: [
        { id: uid('f'), name: 'visit_id', type: 'string' },
        { id: uid('f'), name: 'url', type: 'string' },
        { id: uid('f'), name: 'visited_at', type: 'timestamp' },
      ],
    },
    0,
  );
  const enriched = makeItem(
    {
      name: 'Enriched Visit',
      shape: 'diamond',
      color: '#ffa24d',
      description: 'Visit plus geo and device information.',
      fields: [
        { id: uid('f'), name: 'country', type: 'string' },
        { id: uid('f'), name: 'device', type: 'string' },
      ],
    },
    1,
  );
  const valid = makeItem(
    { name: 'Valid Visit', shape: 'square', color: '#78ff66', description: 'Visit that passed all checks.' },
    2,
  );
  const invalid = makeItem(
    { name: 'Rejected Visit', shape: 'triangle', color: '#aaaaaa', description: 'Visit that failed validation.' },
    3,
  );
  const summary = makeItem(
    {
      name: 'Visit Summary',
      shape: 'hexagon',
      color: '#66a7ff',
      description: 'Hourly visit counts per page and country.',
      fields: [
        { id: uid('f'), name: 'hour', type: 'timestamp' },
        { id: uid('f'), name: 'visits', type: 'int' },
      ],
    },
    4,
  );
  p.items = [visit, enriched, valid, invalid, summary];

  const bp = (kind: NodeKind, name: string) => {
    const found = p.blueprints.find((b) => b.kind === kind && b.name === name);
    if (!found) throw new Error(`missing blueprint ${kind}/${name}`);
    return found;
  };

  const node = (
    kind: NodeKind,
    type: string,
    name: string,
    technology: string,
    x: number,
    y: number,
    extra: Partial<FactoryNode> = {},
  ): FactoryNode => ({
    ...makeNode(kind, x, y, bp(kind, type)),
    name,
    technology,
    ...extra,
  });

  const source = node('source', 'API', 'Visit Source', 'Tracking pixel API', 0, 0, {
    icon: 'api',
    outputs: [visit.id],
    description: 'Receives page visits from the website tracker.',
  });
  const enrich = node('machine', 'Enricher', 'Enrichment Machine', 'Custom Python Service', 5, 0, {
    icon: 'python',
    inputs: [visit.id],
    outputs: [enriched.id],
    description: 'Adds geo and device info to each visit.',
    metadata: [
      { id: uid('m'), key: 'replicas', value: '3' },
      { id: uid('m'), key: 'owner', value: 'web-data team' },
    ],
  });
  const buffer = node('buffer', 'Stream', 'Event Buffer', 'Kafka', 10, 0, {
    icon: 'kafka_topic',
    inputs: [enriched.id],
    outputs: [enriched.id],
    description: 'Decouples enrichment from downstream processing.',
    metadata: [{ id: uid('m'), key: 'retention', value: '7 days' }],
  });
  const validate = node('machine', 'Validator', 'Validation Machine', 'Stream processor', 15, 0, {
    icon: 'analyzer',
    cells: [
      [0, 0],
      [0, 1],
    ],
    inputs: [enriched.id],
    outputs: [valid.id, invalid.id],
    description: 'Drops bots and malformed visits.',
  });
  const aggregate = node('machine', 'Aggregator', 'Aggregation Machine', 'Flink', 20, 0, {
    icon: 'flink',
    inputs: [valid.id],
    outputs: [summary.id],
    description: 'Rolls visits up into hourly summaries.',
  });
  const store = node('store', 'Warehouse', 'Analytics Store', 'Snowflake', 25, 0, {
    icon: 'snowflake',
    inputs: [summary.id],
    description: 'Serves dashboards and ad-hoc analysis.',
  });
  const dead = node('store', 'Object Storage', 'Rejected Visits', 'S3 bucket', 20, 5, {
    icon: 's3',
    inputs: [invalid.id],
    description: 'Kept for debugging the tracker.',
  });
  p.nodes = [source, enrich, buffer, validate, aggregate, store, dead];

  // Belts are laid by hand, tile by tile, just like in the editor.
  const lay = (itemId: string, ...waypoints: Array<[number, number]>) => {
    const tiles: BeltTile[] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const [ax, ay] = waypoints[i];
      const [bx, by] = waypoints[i + 1];
      const seg = lPath({ x: ax, y: ay }, { x: bx, y: by }, ax !== bx ? 'h' : 'v', 0);
      for (const c of i === 0 ? seg : seg.slice(1)) {
        const prev = tiles[tiles.length - 1];
        if (prev && prev.x === c.x && prev.y === c.y) continue;
        tiles.push({ id: uid('belt'), x: c.x, y: c.y, dir: c.dir, itemId: null, description: '' });
      }
    }
    // Each corner tile points towards the next segment.
    for (let i = 0; i < tiles.length - 1; i++) {
      const a = tiles[i];
      const b = tiles[i + 1];
      a.dir = b.x > a.x ? 0 : b.x < a.x ? 2 : b.y > a.y ? 1 : 3;
    }
    tiles[0].itemId = itemId;
    p.belts.push(...tiles);
  };
  lay(visit.id, [1, 0], [4, 0]);
  lay(enriched.id, [6, 0], [9, 0]);
  lay(enriched.id, [11, 0], [14, 0]);
  // The validator is two blocks: one output port per result.
  lay(valid.id, [16, 0], [19, 0]);
  lay(invalid.id, [16, 1], [17, 1], [17, 5], [19, 5]);
  lay(summary.id, [21, 0], [24, 0]);

  // Areas mark the two halves of the pipeline.
  p.areas = [
    { id: uid('area'), name: 'Ingest & enrich', color: '#66a7ff', x: -2, y: -2, w: 15, h: 5 },
    { id: uid('area'), name: 'Validate & store', color: '#78ff66', x: 14, y: -2, w: 14, h: 10 },
  ];
  return p;
}

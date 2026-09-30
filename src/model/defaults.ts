import { uid } from './ids';
import type { Blueprint, FactoryNode, ItemShape, ItemType, NodeKind, Pipeline } from './types';

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
    color: '#4cb86b',
    hint: 'Where data originates',
    hasInput: false,
    hasOutput: true,
    hotkey: '1',
  },
  machine: {
    label: 'Machine',
    plural: 'Machines',
    color: '#4d8ff0',
    hint: 'Transforms, enriches, validates, filters or aggregates',
    hasInput: true,
    hasOutput: true,
    hotkey: '2',
  },
  buffer: {
    label: 'Buffer',
    plural: 'Buffers',
    color: '#f2a93b',
    hint: 'Temporarily holds or transports data',
    hasInput: true,
    hasOutput: true,
    hotkey: '3',
  },
  store: {
    label: 'Store',
    plural: 'Stores',
    color: '#9b6ee0',
    hint: 'Where processed data ends up',
    hasInput: true,
    hasOutput: false,
    hotkey: '4',
  },
};

export const ITEM_SHAPES: ItemShape[] = ['circle', 'square', 'diamond', 'triangle', 'hexagon', 'star'];

/** A restrained, colourful palette used for items and custom buildings. */
export const SWATCHES = [
  '#e8515d',
  '#f28a3b',
  '#f2c230',
  '#4cb86b',
  '#2fb3b3',
  '#4d8ff0',
  '#9b6ee0',
  '#e069b4',
  '#8a94a6',
];

/**
 * Generic component types. These describe *roles*, never technologies —
 * the technology is always something the user fills in.
 */
const STARTER_BLUEPRINTS: Array<[NodeKind, string, string]> = [
  ['source', 'API', 'Data pulled from or pushed by an API'],
  ['source', 'File Drop', 'Files landing somewhere'],
  ['source', 'Database', 'Rows read from an operational database'],
  ['source', 'Event Stream', 'Events emitted continuously'],
  ['machine', 'Transformer', 'Reshapes items into another form'],
  ['machine', 'Enricher', 'Adds information to items'],
  ['machine', 'Validator', 'Checks items and rejects bad ones'],
  ['machine', 'Filter', 'Lets only some items through'],
  ['machine', 'Aggregator', 'Combines many items into fewer'],
  ['buffer', 'Queue', 'Holds items until they are consumed'],
  ['buffer', 'Stream', 'Durable, replayable log of items'],
  ['buffer', 'Staging Area', 'Temporary landing zone'],
  ['store', 'Database', 'Persistent, queryable storage'],
  ['store', 'Warehouse', 'Analytical storage'],
  ['store', 'Object Storage', 'Files and blobs'],
];

export function starterBlueprints(): Blueprint[] {
  return STARTER_BLUEPRINTS.map(([kind, name, description]) => ({
    id: uid('bp'),
    kind,
    name,
    description,
    technology: '',
    color: KIND_META[kind].color,
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
  blueprint?: Pick<Blueprint, 'name' | 'technology' | 'color' | 'description'>,
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
    inputs: [],
    outputs: [],
    metadata: [],
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
      color: '#e8515d',
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
      color: '#f28a3b',
      description: 'Visit plus geo and device information.',
      fields: [
        { id: uid('f'), name: 'country', type: 'string' },
        { id: uid('f'), name: 'device', type: 'string' },
      ],
    },
    1,
  );
  const valid = makeItem(
    { name: 'Valid Visit', shape: 'square', color: '#4cb86b', description: 'Visit that passed all checks.' },
    2,
  );
  const invalid = makeItem(
    { name: 'Rejected Visit', shape: 'triangle', color: '#8a94a6', description: 'Visit that failed validation.' },
    3,
  );
  const summary = makeItem(
    {
      name: 'Visit Summary',
      shape: 'hexagon',
      color: '#4d8ff0',
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
    outputs: [visit.id],
    description: 'Receives page visits from the website tracker.',
  });
  const enrich = node('machine', 'Enricher', 'Enrichment Machine', 'Custom Python Service', 8, 0, {
    inputs: [visit.id],
    outputs: [enriched.id],
    description: 'Adds geo and device info to each visit.',
    metadata: [
      { id: uid('m'), key: 'replicas', value: '3' },
      { id: uid('m'), key: 'owner', value: 'web-data team' },
    ],
  });
  const buffer = node('buffer', 'Stream', 'Event Buffer', 'Kafka', 16, 0, {
    inputs: [enriched.id],
    outputs: [enriched.id],
    description: 'Decouples enrichment from downstream processing.',
    metadata: [{ id: uid('m'), key: 'retention', value: '7 days' }],
  });
  const validate = node('machine', 'Validator', 'Validation Machine', 'Stream processor', 26, 0, {
    inputs: [enriched.id],
    outputs: [valid.id, invalid.id],
    description: 'Drops bots and malformed visits.',
  });
  const aggregate = node('machine', 'Aggregator', 'Aggregation Machine', 'Flink', 34, 0, {
    inputs: [valid.id],
    outputs: [summary.id],
    description: 'Rolls visits up into hourly summaries.',
  });
  const store = node('store', 'Warehouse', 'Analytics Store', 'Snowflake', 42, 0, {
    inputs: [summary.id],
    description: 'Serves dashboards and ad-hoc analysis.',
  });
  const dead = node('store', 'Object Storage', 'Rejected Visits', 'S3 bucket', 34, 8, {
    inputs: [invalid.id],
    description: 'Kept for debugging the tracker.',
  });
  p.nodes = [source, enrich, buffer, validate, aggregate, store, dead];

  const belt = (from: FactoryNode, to: FactoryNode, itemId: string) => ({
    id: uid('belt'),
    from: from.id,
    to: to.id,
    itemId,
    description: '',
  });
  p.belts = [
    belt(source, enrich, visit.id),
    belt(enrich, buffer, enriched.id),
    belt(buffer, validate, enriched.id),
    belt(validate, aggregate, valid.id),
    belt(aggregate, store, summary.id),
    belt(validate, dead, invalid.id),
  ];
  return p;
}

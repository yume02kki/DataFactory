/**
 * The four generic building blocks of a factory. Nothing here knows about
 * any specific technology — that is always user-supplied metadata.
 */
export type NodeKind = 'source' | 'machine' | 'buffer' | 'store';

export type ItemShape = 'circle' | 'square' | 'diamond' | 'triangle' | 'hexagon' | 'star';

/** A field of an item's schema, e.g. `visit_id: string`. */
export interface ItemField {
  id: string;
  name: string;
  type: string;
}

/** The data that flows through the factory (`Visit`, `Order`, `File`...). */
export interface ItemType {
  id: string;
  name: string;
  shape: ItemShape;
  color: string;
  description: string;
  fields: ItemField[];
}

/**
 * A user-defined component type that shows up in the palette,
 * e.g. a Machine blueprint called "Enricher" with default technology "".
 */
export interface Blueprint {
  id: string;
  kind: NodeKind;
  name: string;
  description: string;
  technology: string;
  color: string;
}

export interface MetaEntry {
  id: string;
  key: string;
  value: string;
}

/** A building placed on the factory floor. Position is in grid cells. */
export interface FactoryNode {
  id: string;
  kind: NodeKind;
  name: string;
  /** Component type, usually the name of the blueprint it was built from. */
  type: string;
  technology: string;
  description: string;
  color: string;
  x: number;
  y: number;
  /** Item type ids this component consumes. */
  inputs: string[];
  /** Item type ids this component produces. */
  outputs: string[];
  metadata: MetaEntry[];
}

/** A conveyor belt carrying one item type from one building to another. */
export interface Belt {
  id: string;
  from: string;
  to: string;
  itemId: string | null;
  description: string;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string;
  items: ItemType[];
  blueprints: Blueprint[];
  nodes: FactoryNode[];
  belts: Belt[];
  view: Viewport;
  createdAt: number;
  updatedAt: number;
}

export interface Selection {
  nodes: string[];
  belt: string | null;
  item: string | null;
}

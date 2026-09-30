/**
 * The four generic building blocks of a factory. Nothing here knows about
 * any specific technology — that is always user-supplied metadata.
 */
export type NodeKind = 'source' | 'machine' | 'buffer' | 'store';

/** Grid direction: 0 → right, 1 → down, 2 → left, 3 → up. */
export type Dir = 0 | 1 | 2 | 3;

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
  /** Direction items flow through the building: in at the back, out at the front. */
  rotation: Dir;
  /** Item type ids this component consumes. */
  inputs: string[];
  /** Item type ids this component produces. */
  outputs: string[];
  metadata: MetaEntry[];
}

/**
 * One tile of conveyor belt, placed by hand. Items move in `dir`.
 * Connections between buildings are derived by following tiles
 * from a building's output face into another building's input face.
 */
export interface BeltTile {
  id: string;
  x: number;
  y: number;
  dir: Dir;
  /** Item explicitly assigned to the belt line that starts at this tile. */
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
  belts: BeltTile[];
  view: Viewport;
  createdAt: number;
  updatedAt: number;
}

export interface Selection {
  nodes: string[];
  /** Belt tiles picked with the box select (moved and deleted with the buildings). */
  tiles: string[];
  /** A belt tile whose belt line is shown in the inspector. */
  belt: string | null;
  item: string | null;
}

/** What a left click does on the floor. `null` is plain select / move. */
export type Tool =
  | { type: 'belt' }
  | { type: 'building'; kind: NodeKind; blueprintId: string | null; template?: Partial<FactoryNode> };

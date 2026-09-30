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

/** One shape in an item's look. Layers are drawn bottom to top, each smaller than the last. */
export interface ItemLayer {
  shape: ItemShape;
  color: string;
}

/** The data that flows through the factory (`Visit`, `Order`, `File`...). */
export interface ItemType {
  id: string;
  name: string;
  shape: ItemShape;
  color: string;
  description: string;
  fields: ItemField[];
  /** Look worked out by a combining machine from its inputs; replaces shape/colour while set. */
  layers?: ItemLayer[];
  /** The machine whose combine mode produced `layers`. */
  derivedFrom?: string | null;
}

/**
 * How a machine builds the look of what it produces from what it consumes
 * (A = its first input, B = its second, ...):
 * - own:   outputs keep their own look
 * - stack: A at the bottom, B on top of it, ... (like shapez's stacker)
 * - paint: A's shape in B's colour
 * - mix:   A's shape with all input colours mixed as light
 */
export type CombineMode = 'own' | 'stack' | 'paint' | 'mix';

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
  /** Icon from the icon set, given to every building made from this type. */
  icon?: string;
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
  /**
   * The 1×1 blocks this building is made of, as [dx, dy] offsets from (x, y).
   * Any connected shape works: blocks placed next to a matching building join it.
   * Every exposed front face is an output port and every exposed back face an input port.
   */
  cells: Array<[number, number]>;
  /** Icon from the icon set shown on the building instead of its kind's symbol. */
  icon?: string;
  /** How this machine derives its outputs' look from its inputs. */
  combine?: CombineMode;
  /** Item type ids this component consumes, in order (A, B, ...). */
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

/**
 * A drawn arrow between two buildings for relationships that aren't item flow,
 * e.g. "reads from" or "looks up". One building can point at many.
 */
export interface Arrow {
  id: string;
  from: string;
  to: string;
  label: string;
  color: string;
  dashed: boolean;
}

/**
 * A coloured, see-through rectangle on the floor with a name, marking a part
 * of the factory (e.g. where one pipeline starts and another ends). Drawn under
 * everything else; position and size are in grid cells.
 */
export interface Area {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
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
  arrows: Arrow[];
  areas: Area[];
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
  arrow: string | null;
  area: string | null;
  item: string | null;
}

/** What a left click does on the floor. `null` is plain select / move. */
export type Tool =
  | { type: 'belt' }
  | { type: 'link' }
  /** Dragging out a new area. */
  | { type: 'area' }
  /** Placing the copied selection (the clipboard). */
  | { type: 'paste' }
  | { type: 'building'; kind: NodeKind; blueprintId: string | null; template?: Partial<FactoryNode> };

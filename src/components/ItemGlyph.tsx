import type { ItemLayer, ItemShape } from '../model/types';

function polygon(sides: number, r: number, rotation = -Math.PI / 2): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i * 2 * Math.PI) / sides;
    pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
  }
  return pts.join(' ');
}

function star(r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.48;
    pts.push(`${(Math.cos(a) * rr).toFixed(2)},${(Math.sin(a) * rr).toFixed(2)}`);
  }
  return pts.join(' ');
}

interface Props {
  shape: ItemShape;
  color: string;
  /** Radius of the shape in px; the glyph is centred on (0, 0). */
  r?: number;
  stroke?: string;
  strokeWidth?: number;
}

/** A simple geometric token representing one unit of an item type. */
export function ItemGlyph({ shape, color, r = 7, stroke = 'var(--ink)', strokeWidth = 1.6 }: Props) {
  const common = { fill: color, stroke, strokeWidth, strokeLinejoin: 'round' as const };
  switch (shape) {
    case 'circle':
      return <circle r={r} {...common} />;
    case 'square':
      return <rect x={-r * 0.85} y={-r * 0.85} width={r * 1.7} height={r * 1.7} rx={r * 0.2} {...common} />;
    case 'diamond':
      return <polygon points={polygon(4, r * 1.1)} {...common} />;
    case 'triangle':
      return <polygon points={polygon(3, r * 1.15, -Math.PI / 2)} transform={`translate(0 ${r * 0.18})`} {...common} />;
    case 'hexagon':
      return <polygon points={polygon(6, r * 1.02, 0)} {...common} />;
    case 'star':
      return <polygon points={star(r * 1.2)} {...common} />;
  }
}

/** Each layer up the stack is drawn smaller, so every layer stays visible. */
const LAYER_SCALE = [1, 0.62, 0.4, 0.26];

/** An item look with any number of layers: the first at the bottom, the rest stacked on top. */
export function LayeredGlyph({ layers, r = 7, strokeWidth = 1.6 }: { layers: ItemLayer[]; r?: number; strokeWidth?: number }) {
  if (layers.length === 1) return <ItemGlyph shape={layers[0].shape} color={layers[0].color} r={r} strokeWidth={strokeWidth} />;
  return (
    <g>
      {layers.slice(0, LAYER_SCALE.length).map((l, i) => (
        <ItemGlyph key={i} shape={l.shape} color={l.color} r={r * LAYER_SCALE[i]} strokeWidth={Math.max(0.8, strokeWidth * (i ? 0.8 : 1))} />
      ))}
    </g>
  );
}

/** Standalone inline SVG version for use in HTML (palette, inspector chips). */
export function ItemIcon({ shape, color, layers, size = 16 }: { shape: ItemShape; color: string; layers?: ItemLayer[]; size?: number }) {
  const r = size * 0.36;
  return (
    <svg className="item-icon" width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden>
      <LayeredGlyph layers={layers?.length ? layers : [{ shape, color }]} r={r} strokeWidth={Math.max(1.2, size / 14)} />
    </svg>
  );
}

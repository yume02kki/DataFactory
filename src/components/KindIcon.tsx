import { KIND_META } from '../model/defaults';
import { CELL, KIND_SIZE } from '../model/geometry';
import type { NodeKind } from '../model/types';
import { BuildingArt } from './BuildingArt';

/** Miniature, static rendering of a building for menus and the palette. */
export function KindIcon({ kind, color, size = 40 }: { kind: NodeKind; color?: string; size?: number }) {
  const w = KIND_SIZE[kind].w * CELL;
  const h = KIND_SIZE[kind].h * CELL;
  const pad = 8;
  const box = Math.max(w, h) + pad * 2;
  return (
    <svg
      className="kind-icon still"
      width={size}
      height={size}
      viewBox={`${(w - box) / 2} ${(h - box) / 2} ${box} ${box}`}
      aria-hidden
    >
      <BuildingArt kind={kind} w={w} h={h} color={color || KIND_META[kind].color} />
    </svg>
  );
}

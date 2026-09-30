import { KIND_META } from '../model/defaults';
import { CELL } from '../model/geometry';
import type { NodeKind } from '../model/types';
import { BuildingArt } from './BuildingArt';

const ONE = [{ x: 0, y: 0 }];

/** Miniature, static rendering of a block for menus and the palette. */
export function KindIcon({ kind, color, icon, size = 40 }: { kind: NodeKind; color?: string; icon?: string; size?: number }) {
  const box = CELL + 6;
  return (
    <svg className="kind-icon still" width={size} height={size} viewBox={`${CELL / 2 - box / 2} ${CELL / 2 - box / 2} ${box} ${box}`} aria-hidden>
      <BuildingArt kind={kind} cells={ONE} color={color || KIND_META[kind].color} icon={icon} />
    </svg>
  );
}

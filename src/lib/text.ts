let ctx: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();

/** Approximate rendered width of a label, used to size SVG pills. */
export function textWidth(text: string, font: string): number {
  const key = `${font}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (ctx === undefined) {
    try {
      ctx = document.createElement('canvas').getContext('2d');
    } catch {
      ctx = null;
    }
  }
  let width: number;
  if (ctx) {
    ctx.font = font;
    width = ctx.measureText(text).width;
  } else {
    width = text.length * 6.5;
  }
  if (cache.size > 2000) cache.clear();
  cache.set(key, width);
  return width;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

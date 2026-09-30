/**
 * The building icon set (src/assets/icons, made by generate.py there). Icons
 * are inlined as SVG markup rather than linked, so they stay sharp at any zoom
 * and survive PNG/GIF export (images linked from an SVG don't).
 */
const files = import.meta.glob('../assets/icons/*.svg', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

/** Size of the square every icon is drawn in. */
export const ICON_VIEWBOX = 128;

/** Icon name → inner SVG markup, with ids made unique per icon so they can't clash on the page. */
export const ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, svg]) => {
    const name = path.split('/').pop()!.replace(/\.svg$/, '');
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const prefixed = inner.replace(/id="([^"]+)"/g, `id="ico-${name}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#ico-${name}-$1)`);
    return [name, prefixed];
  }),
);

export const ICON_NAMES = Object.keys(ICONS).sort();

export const iconLabel = (name: string) => name.replace(/_/g, ' ');

export const hasIcon = (name: string | undefined | null): name is string => !!name && name in ICONS;

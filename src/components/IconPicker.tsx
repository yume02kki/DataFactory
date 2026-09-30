import { useEffect, useRef, useState } from 'react';
import { ICONS, ICON_NAMES, ICON_VIEWBOX, hasIcon, iconLabel } from '../lib/icons';

/** An icon from the set as a standalone HTML-embeddable SVG. */
export function IconImage({ name, size = 22 }: { name: string; size?: number }) {
  if (!hasIcon(name)) return null;
  return (
    <svg className="icon-image" width={size} height={size} viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`} aria-hidden dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
  );
}

/**
 * A button showing the current icon that opens a searchable grid of every
 * icon in the set. Picking "Default" clears it (the kind's own symbol shows).
 */
export function IconPicker({ value, onChange }: { value?: string; onChange: (icon: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase().replace(/\s+/g, '_');
  const names = q ? ICON_NAMES.filter((n) => n.includes(q)) : ICON_NAMES;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const pick = (icon: string | undefined) => {
    onChange(icon);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="icon-picker" ref={ref}>
      <button type="button" className="icon-current" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {hasIcon(value) ? <IconImage name={value} size={24} /> : <span className="icon-none">—</span>}
        <span>{hasIcon(value) ? iconLabel(value) : 'Default symbol'}</span>
        <span className="chev">▾</span>
      </button>
      {open && (
        <div className="icon-popover" role="listbox" aria-label="Icons">
          <input
            className="icon-search"
            autoFocus
            placeholder={`Search ${ICON_NAMES.length} icons…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'Enter' && names.length) pick(names[0]);
            }}
          />
          <div className="icon-grid">
            {!q && (
              <button type="button" className={`icon-cell${!hasIcon(value) ? ' on' : ''}`} onClick={() => pick(undefined)} title="Default symbol">
                <span className="icon-none">—</span>
                <span className="icon-name">default</span>
              </button>
            )}
            {names.map((n) => (
              <button type="button" key={n} className={`icon-cell${value === n ? ' on' : ''}`} onClick={() => pick(n)} title={iconLabel(n)} role="option" aria-selected={value === n}>
                <IconImage name={n} size={28} />
                <span className="icon-name">{iconLabel(n)}</span>
              </button>
            ))}
            {!names.length && <p className="muted small">No icon matches “{query}”.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

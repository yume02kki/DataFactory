import { useState } from 'react';
import { KIND_META, NODE_KINDS, SWATCHES } from '../model/defaults';
import type { Blueprint, NodeKind } from '../model/types';
import { useFactory } from '../store/useFactory';
import { DND_MIME, type DragPayload } from './Canvas';
import { ItemIcon } from './ItemGlyph';
import { KindIcon } from './KindIcon';

function setDrag(e: React.DragEvent, payload: DragPayload) {
  e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
}

export function Palette() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  return (
    <aside className="panel palette" aria-label="Component palette">
      <div className="brand">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
          <rect x="2" y="2" width="28" height="28" rx="7" fill="#4d8ff0" stroke="var(--ink)" strokeWidth="2.5" />
          <circle cx="16" cy="16" r="6" fill="#fff" stroke="var(--ink)" strokeWidth="2.5" />
        </svg>
        <span>DataFactory</span>
      </div>
      <div className="palette-scroll">
        <ItemsSection collapsed={!!collapsed.items} onToggle={() => toggle('items')} />
        {NODE_KINDS.map((kind) => (
          <KindSection key={kind} kind={kind} collapsed={!!collapsed[kind]} onToggle={() => toggle(kind)} />
        ))}
      </div>
    </aside>
  );
}

function SectionHeader({
  title,
  hint,
  collapsed,
  onToggle,
  onAdd,
  addLabel,
  icon,
}: {
  title: string;
  hint: string;
  collapsed: boolean;
  onToggle: () => void;
  onAdd: () => void;
  addLabel: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="section-header">
      <button className="section-toggle" onClick={onToggle} aria-expanded={!collapsed} title={hint}>
        <span className={`chevron${collapsed ? ' collapsed' : ''}`}>▾</span>
        {icon}
        <span className="section-title">{title}</span>
      </button>
      <button className="icon-btn" onClick={onAdd} title={addLabel} aria-label={addLabel}>
        +
      </button>
    </div>
  );
}

function ItemsSection({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const items = useFactory((s) => s.pipeline.items);
  const selectedItem = useFactory((s) => s.selection.item);
  const { addItem, select, setHighlightItem } = useFactory.getState();

  return (
    <section className="palette-section">
      <SectionHeader
        title="Items"
        hint="The data flowing through your factory"
        collapsed={collapsed}
        onToggle={onToggle}
        onAdd={() => select({ item: addItem() })}
        addLabel="New item type"
        icon={<ItemIcon shape="diamond" color="#e8515d" size={18} />}
      />
      {!collapsed && (
        <div className="item-list">
          {items.length === 0 && <p className="muted small">Define the data that flows, like Visit, Order or File. Drag an item onto a belt.</p>}
          {items.map((item) => (
            <button
              key={item.id}
              className={`item-chip${selectedItem === item.id ? ' active' : ''}`}
              draggable
              onDragStart={(e) => setDrag(e, { type: 'item', id: item.id })}
              onClick={() => select({ item: item.id })}
              onMouseEnter={() => setHighlightItem(item.id)}
              onMouseLeave={() => setHighlightItem(null)}
              title="Drag onto a belt or building · click to edit"
            >
              <ItemIcon shape={item.shape} color={item.color} size={16} />
              <span>{item.name || 'Unnamed'}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function KindSection({ kind, collapsed, onToggle }: { kind: NodeKind; collapsed: boolean; onToggle: () => void }) {
  const blueprints = useFactory((s) => s.pipeline.blueprints).filter((b) => b.kind === kind);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const meta = KIND_META[kind];

  const tool = useFactory((s) => s.tool);
  const armed = (bpId: string | null) => tool?.type === 'building' && tool.kind === kind && tool.blueprintId === bpId && !tool.template;
  const place = (bp?: Blueprint) => {
    const id = bp?.id ?? null;
    useFactory.getState().setTool(armed(id) ? null : { type: 'building', kind, blueprintId: id });
  };

  return (
    <section className="palette-section">
      <SectionHeader
        title={meta.plural}
        hint={meta.hint}
        collapsed={collapsed}
        onToggle={onToggle}
        onAdd={() => setEditing('new')}
        addLabel={`New ${meta.label.toLowerCase()} type`}
        icon={<KindIcon kind={kind} size={20} />}
      />
      {!collapsed && (
        <>
          {editing === 'new' && <BlueprintForm kind={kind} onDone={() => setEditing(null)} />}
          <div className="tile-grid">
            {blueprints.map((bp) =>
              editing === bp.id ? (
                <BlueprintForm key={bp.id} kind={kind} blueprint={bp} onDone={() => setEditing(null)} />
              ) : (
                <div
                  key={bp.id}
                  className={`tile${armed(bp.id) ? ' active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => place(bp)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && place(bp)}
                  title={`${bp.description || meta.hint}\nClick, then left-click the floor to build`}
                >
                  <KindIcon kind={kind} color={bp.color} size={38} />
                  <span className="tile-name">{bp.name}</span>
                  {bp.technology && <span className="tile-tech">{bp.technology}</span>}
                  <button
                    className="tile-edit"
                    title="Edit type"
                    aria-label={`Edit ${bp.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(bp.id);
                    }}
                  >
                    ✎
                  </button>
                </div>
              ),
            )}
            <div
              className={`tile tile-generic${armed(null) ? ' active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => place()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && place()}
              title={`A blank ${meta.label.toLowerCase()} (hotkey ${meta.hotkey})`}
            >
              <KindIcon kind={kind} color="#b9c1cf" size={38} />
              <span className="tile-name">Blank</span>
              <kbd className="tile-key">{meta.hotkey}</kbd>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function BlueprintForm({ kind, blueprint, onDone }: { kind: NodeKind; blueprint?: Blueprint; onDone: () => void }) {
  const meta = KIND_META[kind];
  const [name, setName] = useState(blueprint?.name ?? '');
  const [description, setDescription] = useState(blueprint?.description ?? '');
  const [technology, setTechnology] = useState(blueprint?.technology ?? '');
  const [color, setColor] = useState(blueprint?.color ?? meta.color);
  const { edit, addBlueprint, deleteBlueprint } = useFactory.getState();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = { name: name.trim() || `Custom ${meta.label}`, description: description.trim(), technology: technology.trim(), color };
    if (blueprint) {
      edit((p) => {
        const bp = p.blueprints.find((b) => b.id === blueprint.id);
        if (bp) Object.assign(bp, clean);
      });
    } else {
      addBlueprint(kind, clean);
    }
    onDone();
  };

  return (
    <form className="bp-form" onSubmit={save} onKeyDown={(e) => e.key === 'Escape' && onDone()}>
      <div className="bp-form-title">{blueprint ? `Edit ${meta.label.toLowerCase()} type` : `New ${meta.label.toLowerCase()} type`}</div>
      <label>
        Name
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. ${kind === 'buffer' ? 'Events Queue' : kind === 'machine' ? 'Deduplicator' : kind === 'source' ? 'Partner Feed' : 'Data Lake'}`} />
      </label>
      <label>
        Default technology
        <input value={technology} onChange={(e) => setTechnology(e.target.value)} placeholder="Anything — filled in on placement" />
      </label>
      <label>
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does it do?" />
      </label>
      <div className="swatches">
        {[meta.color, ...SWATCHES.filter((s) => s !== meta.color)].map((s) => (
          <button
            type="button"
            key={s}
            className={`swatch${s === color ? ' active' : ''}`}
            style={{ background: s }}
            onClick={() => setColor(s)}
            aria-label={`Colour ${s}`}
          />
        ))}
      </div>
      <div className="bp-form-actions">
        {blueprint && (
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              deleteBlueprint(blueprint.id);
              onDone();
            }}
          >
            Delete
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn primary">
          {blueprint ? 'Save' : 'Add'}
        </button>
      </div>
    </form>
  );
}

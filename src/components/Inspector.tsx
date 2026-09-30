import { useMemo, useState } from 'react';
import { ITEM_SHAPES, KIND_META, SWATCHES } from '../model/defaults';
import { uid } from '../model/ids';
import * as ops from '../model/ops';
import type { Belt, FactoryNode, ItemType, Pipeline } from '../model/types';
import { useFactory } from '../store/useFactory';
import { ItemIcon } from './ItemGlyph';
import { KindIcon } from './KindIcon';

const edit = (...args: Parameters<ReturnType<typeof useFactory.getState>['edit']>) => useFactory.getState().edit(...args);

export function Inspector() {
  const selection = useFactory((s) => s.selection);
  const pipeline = useFactory((s) => s.pipeline);

  let body: React.ReactNode = null;
  if (selection.nodes.length === 1) {
    const node = pipeline.nodes.find((n) => n.id === selection.nodes[0]);
    if (node) body = <NodeInspector key={node.id} node={node} pipeline={pipeline} />;
  } else if (selection.nodes.length > 1) {
    body = <MultiInspector ids={selection.nodes} pipeline={pipeline} />;
  } else if (selection.belt) {
    const belt = pipeline.belts.find((b) => b.id === selection.belt);
    if (belt) body = <BeltInspector key={belt.id} belt={belt} pipeline={pipeline} />;
  } else if (selection.item) {
    const item = pipeline.items.find((i) => i.id === selection.item);
    if (item) body = <ItemInspector key={item.id} item={item} pipeline={pipeline} />;
  }
  if (!body) return null;
  return (
    <aside className="panel inspector" aria-label="Inspector" onKeyDown={(e) => e.stopPropagation()}>
      {body}
    </aside>
  );
}

/* ---------- shared bits ---------- */

function Header({ icon, eyebrow, title }: { icon: React.ReactNode; eyebrow: string; title: string }) {
  return (
    <div className="insp-header">
      <div className="insp-icon">{icon}</div>
      <div className="insp-heading">
        <div className="eyebrow">{eyebrow}</div>
        <div className="insp-title">{title}</div>
      </div>
      <button className="icon-btn" onClick={() => useFactory.getState().clearSelection()} aria-label="Close inspector" title="Close (Esc)">
        ×
      </button>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="insp-section">
      <div className="insp-section-title">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function Swatches({ value, onChange, first }: { value: string; onChange: (c: string) => void; first?: string }) {
  const list = first ? [first, ...SWATCHES.filter((s) => s !== first)] : SWATCHES;
  return (
    <div className="swatches">
      {list.map((s) => (
        <button key={s} type="button" className={`swatch${s === value ? ' active' : ''}`} style={{ background: s }} onClick={() => onChange(s)} aria-label={`Colour ${s}`} />
      ))}
    </div>
  );
}

function ItemChip({ item, onRemove, onClick }: { item: ItemType; onRemove?: () => void; onClick?: () => void }) {
  return (
    <span className="item-chip small" onMouseEnter={() => useFactory.getState().setHighlightItem(item.id)} onMouseLeave={() => useFactory.getState().setHighlightItem(null)}>
      <button type="button" className="chip-main" onClick={onClick ?? (() => useFactory.getState().select({ item: item.id }))} title="Edit item">
        <ItemIcon shape={item.shape} color={item.color} size={14} />
        <span>{item.name || 'Unnamed'}</span>
      </button>
      {onRemove && (
        <button type="button" className="chip-x" onClick={onRemove} aria-label={`Remove ${item.name}`}>
          ×
        </button>
      )}
    </span>
  );
}

/** Choose an existing item or create a new one by name. */
function ItemPicker({ exclude, items, onPick, label = '+ Add item' }: { exclude: string[]; items: ItemType[]; onPick: (id: string) => void; label?: string }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const options = items.filter((i) => !exclude.includes(i.id));

  if (creating) {
    const commit = () => {
      if (name.trim()) {
        const id = useFactory.getState().addItem({ name: name.trim() });
        onPick(id);
      }
      setName('');
      setCreating(false);
    };
    return (
      <input
        className="inline-input"
        autoFocus
        placeholder="Item name, e.g. Order"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setCreating(false);
        }}
      />
    );
  }
  return (
    <select
      className="add-select"
      value=""
      onChange={(e) => {
        if (e.target.value === '__new') setCreating(true);
        else if (e.target.value) onPick(e.target.value);
      }}
    >
      <option value="">{label}</option>
      {options.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}
        </option>
      ))}
      <option value="__new">New item…</option>
    </select>
  );
}

function technologies(p: Pipeline): string[] {
  const set = new Set<string>();
  for (const n of p.nodes) if (n.technology.trim()) set.add(n.technology.trim());
  for (const b of p.blueprints) if (b.technology.trim()) set.add(b.technology.trim());
  return [...set].sort((a, b) => a.localeCompare(b));
}

/* ---------- node ---------- */

function NodeInspector({ node, pipeline }: { node: FactoryNode; pipeline: Pipeline }) {
  const meta = KIND_META[node.kind];
  const itemsById = useMemo(() => new Map(pipeline.items.map((i) => [i.id, i])), [pipeline.items]);
  const techs = useMemo(() => technologies(pipeline), [pipeline]);
  const types = pipeline.blueprints.filter((b) => b.kind === node.kind);
  const set = <K extends keyof FactoryNode>(key: K, value: FactoryNode[K]) =>
    edit(
      (p) => {
        const n = p.nodes.find((x) => x.id === node.id);
        if (n) n[key] = value;
      },
      { coalesce: `${node.id}:${String(key)}` },
    );
  const incoming = pipeline.belts.filter((b) => b.to === node.id);
  const outgoing = pipeline.belts.filter((b) => b.from === node.id);
  const nameOf = (id: string) => pipeline.nodes.find((n) => n.id === id)?.name ?? '?';

  const listEditor = (list: 'inputs' | 'outputs') => (
    <div className="chip-row">
      {node[list].map((id) => {
        const item = itemsById.get(id);
        return item ? <ItemChip key={id} item={item} onRemove={() => set(list, node[list].filter((x) => x !== id))} /> : null;
      })}
      <ItemPicker exclude={node[list]} items={pipeline.items} onPick={(id) => edit((p) => {
        const n = p.nodes.find((x) => x.id === node.id);
        if (n && !n[list].includes(id)) n[list].push(id);
      })} />
    </div>
  );

  return (
    <div className="insp-body">
      <Header icon={<KindIcon kind={node.kind} color={node.color} size={40} />} eyebrow={meta.label} title={node.name || meta.label} />

      <Field label="Name">
        <input value={node.name} onChange={(e) => set('name', e.target.value)} placeholder={`e.g. ${meta.label} name`} />
      </Field>
      <div className="field-pair">
        <Field label="Type" hint="role">
          <input list={`types-${node.kind}`} value={node.type} onChange={(e) => set('type', e.target.value)} placeholder={meta.label} />
          <datalist id={`types-${node.kind}`}>
            {types.map((b) => (
              <option key={b.id} value={b.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Technology" hint="anything">
          <input list="technologies" value={node.technology} onChange={(e) => set('technology', e.target.value)} placeholder="e.g. your choice" />
          <datalist id="technologies">
            {techs.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
      </div>
      <Field label="Description">
        <textarea rows={2} value={node.description} onChange={(e) => set('description', e.target.value)} placeholder="What happens here?" />
      </Field>
      <Field label="Colour">
        <Swatches value={node.color} first={meta.color} onChange={(c) => set('color', c)} />
      </Field>

      {meta.hasInput && <Section title="Inputs">{listEditor('inputs')}</Section>}
      {meta.hasOutput && <Section title="Outputs">{listEditor('outputs')}</Section>}

      <Section
        title="Metadata"
        action={
          <button className="link-btn" onClick={() => edit((p) => void p.nodes.find((x) => x.id === node.id)?.metadata.push({ id: uid('m'), key: '', value: '' }))}>
            + Add
          </button>
        }
      >
        {node.metadata.length === 0 && <p className="muted small">Owner, SLA, partitions, schedule… anything you like.</p>}
        {node.metadata.map((m) => (
          <div className="meta-row" key={m.id}>
            <input
              value={m.key}
              placeholder="key"
              onChange={(e) =>
                edit((p) => {
                  const e2 = p.nodes.find((x) => x.id === node.id)?.metadata.find((x) => x.id === m.id);
                  if (e2) e2.key = e.target.value;
                }, { coalesce: `${m.id}:k` })
              }
            />
            <input
              value={m.value}
              placeholder="value"
              onChange={(e) =>
                edit((p) => {
                  const e2 = p.nodes.find((x) => x.id === node.id)?.metadata.find((x) => x.id === m.id);
                  if (e2) e2.value = e.target.value;
                }, { coalesce: `${m.id}:v` })
              }
            />
            <button className="icon-btn small" aria-label="Remove entry" onClick={() => set('metadata', node.metadata.filter((x) => x.id !== m.id))}>
              ×
            </button>
          </div>
        ))}
      </Section>

      {(incoming.length > 0 || outgoing.length > 0) && (
        <Section title="Connections">
          <div className="conn-list">
            {incoming.map((b) => (
              <ConnRow key={b.id} belt={b} dir="in" other={nameOf(b.from)} item={b.itemId ? itemsById.get(b.itemId) : undefined} />
            ))}
            {outgoing.map((b) => (
              <ConnRow key={b.id} belt={b} dir="out" other={nameOf(b.to)} item={b.itemId ? itemsById.get(b.itemId) : undefined} />
            ))}
          </div>
        </Section>
      )}

      <div className="insp-actions">
        <button className="btn" onClick={() => useFactory.getState().duplicateSelection()}>
          Duplicate <kbd>Ctrl D</kbd>
        </button>
        <button className="btn danger" onClick={() => useFactory.getState().deleteSelection()}>
          Delete <kbd>Del</kbd>
        </button>
      </div>
    </div>
  );
}

function ConnRow({ belt, dir, other, item }: { belt: Belt; dir: 'in' | 'out'; other: string; item?: ItemType }) {
  return (
    <button className="conn-row" onClick={() => useFactory.getState().select({ belt: belt.id })}>
      <span className="conn-dir">{dir === 'in' ? '←' : '→'}</span>
      <span className="conn-name">{other}</span>
      {item ? <ItemIcon shape={item.shape} color={item.color} size={14} /> : <span className="muted small">nothing</span>}
    </button>
  );
}

/* ---------- multi ---------- */

function MultiInspector({ ids, pipeline }: { ids: string[]; pipeline: Pipeline }) {
  const nodes = pipeline.nodes.filter((n) => ids.includes(n.id));
  const internal = pipeline.belts.filter((b) => ids.includes(b.from) && ids.includes(b.to)).length;
  return (
    <div className="insp-body">
      <Header icon={<KindIcon kind="machine" color="#8a94a6" size={40} />} eyebrow="Selection" title={`${nodes.length} buildings`} />
      <div className="kind-counts">
        {(['source', 'machine', 'buffer', 'store'] as const).map((k) => {
          const count = nodes.filter((n) => n.kind === k).length;
          return count ? (
            <span key={k} className="kind-count">
              <KindIcon kind={k} size={18} /> {count} {count === 1 ? KIND_META[k].label : KIND_META[k].plural}
            </span>
          ) : null;
        })}
      </div>
      <p className="muted small">
        {internal} belt{internal === 1 ? '' : 's'} between them. Drag any selected building to move the group; duplicating keeps their belts.
      </p>
      <div className="insp-actions">
        <button className="btn" onClick={() => useFactory.getState().duplicateSelection()}>
          Duplicate <kbd>Ctrl D</kbd>
        </button>
        <button className="btn danger" onClick={() => useFactory.getState().deleteSelection()}>
          Delete <kbd>Del</kbd>
        </button>
      </div>
    </div>
  );
}

/* ---------- belt ---------- */

function BeltInspector({ belt, pipeline }: { belt: Belt; pipeline: Pipeline }) {
  const from = pipeline.nodes.find((n) => n.id === belt.from);
  const to = pipeline.nodes.find((n) => n.id === belt.to);
  const item = pipeline.items.find((i) => i.id === belt.itemId);
  if (!from || !to) return null;
  const setItem = (id: string | null) => edit((p) => ops.setBeltItem(p, belt.id, id));
  const suggested = [...new Set([...from.outputs, ...to.inputs])];

  return (
    <div className="insp-body">
      <Header
        icon={
          <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
            <rect x="2" y="13" width="36" height="14" rx="4" fill="var(--belt)" stroke="var(--ink)" strokeWidth="2" />
            <path d="M 12 16 L 17 20 L 12 24 M 22 16 L 27 20 L 22 24" stroke="var(--belt-tread)" strokeWidth="2" fill="none" />
          </svg>
        }
        eyebrow="Belt"
        title={item ? `${item.name} belt` : 'Empty belt'}
      />
      <div className="belt-route">
        <button className="route-end" onClick={() => useFactory.getState().selectNodes([from.id])}>
          <KindIcon kind={from.kind} color={from.color} size={24} />
          <span>{from.name}</span>
        </button>
        <span className="route-arrow">→</span>
        <button className="route-end" onClick={() => useFactory.getState().selectNodes([to.id])}>
          <KindIcon kind={to.kind} color={to.color} size={24} />
          <span>{to.name}</span>
        </button>
      </div>

      <Section title="Carries">
        <div className="chip-row">
          {pipeline.items.map((i) => (
            <button
              key={i.id}
              className={`item-chip small selectable${belt.itemId === i.id ? ' active' : ''}${suggested.includes(i.id) ? '' : ' faint'}`}
              onClick={() => setItem(belt.itemId === i.id ? null : i.id)}
            >
              <ItemIcon shape={i.shape} color={i.color} size={14} />
              <span>{i.name}</span>
            </button>
          ))}
          <ItemPicker exclude={pipeline.items.map((i) => i.id)} items={pipeline.items} onPick={setItem} label="+ New item" />
        </div>
        <p className="muted small">Picking an item adds it to the outputs of “{from.name}” and the inputs of “{to.name}”.</p>
      </Section>

      <Field label="Notes">
        <textarea
          rows={2}
          value={belt.description}
          placeholder="e.g. pushed over HTTP, hourly batch, CDC…"
          onChange={(e) =>
            edit((p) => {
              const b = p.belts.find((x) => x.id === belt.id);
              if (b) b.description = e.target.value;
            }, { coalesce: `${belt.id}:desc` })
          }
        />
      </Field>

      <div className="insp-actions">
        <button className="btn danger" onClick={() => useFactory.getState().deleteSelection()}>
          Remove belt <kbd>Del</kbd>
        </button>
      </div>
    </div>
  );
}

/* ---------- item ---------- */

function ItemInspector({ item, pipeline }: { item: ItemType; pipeline: Pipeline }) {
  const set = <K extends keyof ItemType>(key: K, value: ItemType[K]) =>
    edit(
      (p) => {
        const i = p.items.find((x) => x.id === item.id);
        if (i) i[key] = value;
      },
      { coalesce: `${item.id}:${String(key)}` },
    );
  const producers = pipeline.nodes.filter((n) => n.outputs.includes(item.id));
  const consumers = pipeline.nodes.filter((n) => n.inputs.includes(item.id));
  const belts = pipeline.belts.filter((b) => b.itemId === item.id).length;

  const setField = (fid: string, key: 'name' | 'type', value: string) =>
    edit((p) => {
      const f = p.items.find((x) => x.id === item.id)?.fields.find((x) => x.id === fid);
      if (f) f[key] = value;
    }, { coalesce: `${fid}:${key}` });

  return (
    <div className="insp-body">
      <Header icon={<ItemIcon shape={item.shape} color={item.color} size={36} />} eyebrow="Item" title={item.name || 'Unnamed'} />
      <Field label="Name">
        <input value={item.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Visit, Order, File" />
      </Field>
      <Field label="Shape">
        <div className="shape-picker">
          {ITEM_SHAPES.map((s) => (
            <button key={s} type="button" className={`shape-btn${item.shape === s ? ' active' : ''}`} onClick={() => set('shape', s)} aria-label={s} title={s}>
              <ItemIcon shape={s} color={item.color} size={20} />
            </button>
          ))}
        </div>
      </Field>
      <Field label="Colour">
        <Swatches value={item.color} onChange={(c) => set('color', c)} />
      </Field>
      <Field label="Description">
        <textarea rows={2} value={item.description} onChange={(e) => set('description', e.target.value)} placeholder="What does one of these represent?" />
      </Field>

      <Section
        title="Fields"
        action={
          <button className="link-btn" onClick={() => edit((p) => void p.items.find((x) => x.id === item.id)?.fields.push({ id: uid('f'), name: '', type: '' }))}>
            + Add
          </button>
        }
      >
        {item.fields.length === 0 && <p className="muted small">Optional schema, e.g. visit_id: string.</p>}
        {item.fields.map((f) => (
          <div className="meta-row" key={f.id}>
            <input value={f.name} placeholder="field" onChange={(e) => setField(f.id, 'name', e.target.value)} />
            <input value={f.type} placeholder="type" onChange={(e) => setField(f.id, 'type', e.target.value)} />
            <button className="icon-btn small" aria-label="Remove field" onClick={() => set('fields', item.fields.filter((x) => x.id !== f.id))}>
              ×
            </button>
          </div>
        ))}
      </Section>

      <Section title="Where it flows">
        <div className="usage">
          <div>
            <span className="muted small">Produced by</span>
            <NodeLinks nodes={producers} />
          </div>
          <div>
            <span className="muted small">Consumed by</span>
            <NodeLinks nodes={consumers} />
          </div>
          <div className="muted small">
            On {belts} belt{belts === 1 ? '' : 's'}
          </div>
        </div>
      </Section>

      <div className="insp-actions">
        <button className="btn danger" onClick={() => useFactory.getState().deleteItem(item.id)}>
          Delete item
        </button>
      </div>
    </div>
  );
}

function NodeLinks({ nodes }: { nodes: FactoryNode[] }) {
  if (!nodes.length) return <div className="small">—</div>;
  return (
    <div className="chip-row">
      {nodes.map((n) => (
        <button key={n.id} className="node-link" onClick={() => useFactory.getState().selectNodes([n.id])}>
          <KindIcon kind={n.kind} color={n.color} size={16} />
          {n.name}
        </button>
      ))}
    </div>
  );
}

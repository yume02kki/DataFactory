import { useMemo, useState } from 'react';
import { ARROW_COLOR, ITEM_SHAPES, KIND_META, SWATCHES } from '../model/defaults';
import { uid } from '../model/ids';
import * as ops from '../model/ops';
import type { Arrow, CombineMode, FactoryNode, ItemType, Pipeline } from '../model/types';
import { BeltIcon, LinkIcon } from './Hotbar';
import { IconPicker } from './IconPicker';
import { ICON_NAMES } from '../lib/icons';
import { inputCells, outputCells } from '../model/geometry';
import { useFactory } from '../store/useFactory';
import { ItemIcon } from './ItemGlyph';
import { KindIcon } from './KindIcon';

const edit = (...args: Parameters<ReturnType<typeof useFactory.getState>['edit']>) => useFactory.getState().edit(...args);

export function Inspector() {
  const selection = useFactory((s) => s.selection);
  const pipeline = useFactory((s) => s.pipeline);

  const links = useMemo(() => ops.traceLinks(pipeline), [pipeline]);

  let body: React.ReactNode = null;
  const count = selection.nodes.length + selection.tiles.length;
  if (selection.nodes.length === 1 && selection.tiles.length === 0) {
    const node = pipeline.nodes.find((n) => n.id === selection.nodes[0]);
    if (node) body = <NodeInspector key={node.id} node={node} pipeline={pipeline} links={links} />;
  } else if (count > 0) {
    body = <MultiInspector nodeIds={selection.nodes} tileIds={selection.tiles} pipeline={pipeline} />;
  } else if (selection.belt) {
    const tile = pipeline.belts.find((t) => t.id === selection.belt);
    const link = links.find((l) => l.tiles.some((t) => t.id === selection.belt));
    if (tile) body = <BeltInspector key={link?.id ?? tile.id} tileId={tile.id} link={link} pipeline={pipeline} />;
  } else if (selection.arrow) {
    const arrow = pipeline.arrows.find((a) => a.id === selection.arrow);
    if (arrow) body = <ArrowInspector key={arrow.id} arrow={arrow} pipeline={pipeline} />;
  } else if (selection.item) {
    const item = pipeline.items.find((i) => i.id === selection.item);
    if (item) body = <ItemInspector key={item.id} item={item} pipeline={pipeline} links={links} />;
  }
  if (!body) return null;
  return (
    <aside
      className="panel inspector"
      aria-label="Inspector"
      onKeyDown={(e) => {
        // Keys typed into fields stay there; Esc leaves the field so hotkeys work again.
        if (e.key === 'Escape') (e.target as HTMLElement).blur?.();
        e.stopPropagation();
      }}
    >
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

function ItemChip({ item, onRemove, onClick, badge }: { item: ItemType; onRemove?: () => void; onClick?: () => void; badge?: string }) {
  return (
    <span className="item-chip small" onMouseEnter={() => useFactory.getState().setHighlightItem(item.id)} onMouseLeave={() => useFactory.getState().setHighlightItem(null)}>
      <button type="button" className="chip-main" onClick={onClick ?? (() => useFactory.getState().select({ item: item.id }))} title="Edit item">
        {badge && <span className="chip-badge">{badge}</span>}
        <ItemIcon shape={item.shape} color={item.color} layers={item.layers} size={14} />
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

/* ---------- combining ---------- */

const COMBINE_MODES: Array<{ mode: CombineMode; label: string; hint: string }> = [
  { mode: 'own', label: 'Own', hint: 'Outputs keep the look you give them.' },
  { mode: 'stack', label: 'Stack', hint: 'A at the bottom, B stacked on top of it (and C on B…).' },
  { mode: 'paint', label: 'Paint', hint: "A's shape in B's colour." },
  { mode: 'mix', label: 'Mix', hint: "A's shape with every input's colour mixed like light." },
];

/** Picks how a machine builds its outputs' look from its inputs, with a live preview. */
function CombineEditor({ node, itemsById, onChange }: { node: FactoryNode; itemsById: Map<string, ItemType>; onChange: (mode: CombineMode) => void }) {
  const mode = node.combine ?? 'own';
  const inputs = node.inputs.map((id) => itemsById.get(id)).filter((i): i is ItemType => !!i);
  const result = ops.combineLooks(mode, inputs.map(ops.lookOf));
  const produced = node.outputs.filter((id) => !node.inputs.includes(id)).map((id) => itemsById.get(id)).filter((i): i is ItemType => !!i);
  const hint = COMBINE_MODES.find((m) => m.mode === mode)!.hint;
  return (
    <Section title="Combine">
      <div className="segmented" role="radiogroup" aria-label="How outputs look">
        {COMBINE_MODES.map((m) => (
          <button key={m.mode} role="radio" aria-checked={mode === m.mode} className={mode === m.mode ? 'on' : ''} onClick={() => onChange(m.mode)} title={m.hint}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="muted small">{hint}</p>
      {result && (
        <div className="recipe">
          {inputs.map((it, i) => (
            <span key={it.id} className="recipe-part">
              {i > 0 && <span className="recipe-op">+</span>}
              <ItemIcon shape={it.shape} color={it.color} layers={it.layers} size={26} />
            </span>
          ))}
          <span className="recipe-op">→</span>
          <ItemIcon shape={result[0].shape} color={result[0].color} layers={result} size={34} />
          <span className="muted small">
            {produced.length ? `becomes ${produced.map((p) => p.name).join(', ')}` : 'add an output item to see it on the belts'}
          </span>
        </div>
      )}
      {mode !== 'own' && inputs.length === 0 && <p className="muted small">Add inputs to combine.</p>}
    </Section>
  );
}

/* ---------- node ---------- */

function portSummary(node: FactoryNode): string {
  const meta = KIND_META[node.kind];
  const parts: string[] = [];
  if (meta.hasInput) parts.push(`${inputCells(node).length} in`);
  if (meta.hasOutput) parts.push(`${outputCells(node).length} out`);
  return parts.join(' / ');
}

function NodeInspector({ node, pipeline, links }: { node: FactoryNode; pipeline: Pipeline; links: ops.Link[] }) {
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
  const incoming = links.filter((l) => l.to === node.id);
  const arrowsOut = pipeline.arrows.filter((a) => a.from === node.id);
  const arrowsIn = pipeline.arrows.filter((a) => a.to === node.id);
  const outgoing = links.filter((l) => l.from === node.id);
  const nameOf = (id: string) => pipeline.nodes.find((n) => n.id === id)?.name ?? '?';

  const combining = node.kind === 'machine' && !!node.combine && node.combine !== 'own';
  const listEditor = (list: 'inputs' | 'outputs') => (
    <div className="chip-row">
      {node[list].map((id, i) => {
        const item = itemsById.get(id);
        const badge = combining && list === 'inputs' ? String.fromCharCode(65 + i) : undefined;
        return item ? <ItemChip key={id} item={item} badge={badge} onRemove={() => set(list, node[list].filter((x) => x !== id))} /> : null;
      })}
      <ItemPicker exclude={node[list]} items={pipeline.items} onPick={(id) => edit((p) => {
        const n = p.nodes.find((x) => x.id === node.id);
        if (n && !n[list].includes(id)) n[list].push(id);
      })} />
    </div>
  );

  return (
    <div className="insp-body">
      <Header icon={<KindIcon kind={node.kind} color={node.color} icon={node.icon} size={40} />} eyebrow={node.cells.length > 1 ? `${meta.label} · ${node.cells.length} blocks · ${portSummary(node)}` : meta.label} title={node.name || meta.label} />

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
      <Field label="Icon" hint={`${ICON_NAMES.length} to pick from`}>
        <IconPicker value={node.icon} onChange={(icon) => set('icon', icon)} />
      </Field>
      <Field label="Colour">
        <Swatches value={node.color} first={meta.color} onChange={(c) => set('color', c)} />
      </Field>
      <Field label="Facing" hint="R / Shift R">
        <div className="rotate-row">
          <button className="btn" onClick={() => useFactory.getState().rotate(-1)} aria-label="Rotate left">
            ⟲
          </button>
          <span className="facing">
            <span style={{ display: 'inline-block', transform: `rotate(${node.rotation * 90}deg)` }}>➜</span> {['right', 'down', 'left', 'up'][node.rotation]}
          </span>
          <button className="btn" onClick={() => useFactory.getState().rotate(1)} aria-label="Rotate right">
            ⟳
          </button>
        </div>
      </Field>

      {meta.hasInput && (
        <Section
          title={combining ? 'Inputs · A, B, …' : 'Inputs'}
          action={
            combining && node.inputs.length > 1 ? (
              <button className="link-btn" title="Move A to the end so B becomes A" onClick={() => set('inputs', [...node.inputs.slice(1), node.inputs[0]])}>
                ⇄ Reorder
              </button>
            ) : undefined
          }
        >
          {listEditor('inputs')}
        </Section>
      )}
      {meta.hasOutput && <Section title="Outputs">{listEditor('outputs')}</Section>}
      {node.kind === 'machine' && <CombineEditor node={node} itemsById={itemsById} onChange={(mode) => set('combine', mode)} />}

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

      {(incoming.length > 0 || outgoing.length > 0 || arrowsOut.length > 0 || arrowsIn.length > 0) && (
        <Section title="Connections">
          <div className="conn-list">
            {arrowsOut.map((a) => (
              <ArrowRow key={a.id} arrow={a} text={`points at ${nameOf(a.to)}`} />
            ))}
            {arrowsIn.map((a) => (
              <ArrowRow key={a.id} arrow={a} text={`${nameOf(a.from)} points here`} />
            ))}
            {incoming.map((l) => (
              <ConnRow key={l.id} tileId={l.id} dir="in" other={nameOf(l.from)} item={l.itemId ? itemsById.get(l.itemId) : undefined} />
            ))}
            {outgoing.map((l) => (
              <ConnRow key={l.id} tileId={l.id} dir="out" other={l.to ? nameOf(l.to) : 'nowhere (open end)'} item={l.itemId ? itemsById.get(l.itemId) : undefined} />
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

function ConnRow({ tileId, dir, other, item }: { tileId: string; dir: 'in' | 'out'; other: string; item?: ItemType }) {
  return (
    <button className="conn-row" onClick={() => useFactory.getState().select({ belt: tileId })}>
      <span className="conn-dir">{dir === 'in' ? '←' : '→'}</span>
      <span className="conn-name">{other}</span>
      {item ? <ItemIcon shape={item.shape} color={item.color} layers={item.layers} size={14} /> : <span className="muted small">nothing</span>}
    </button>
  );
}

/* ---------- multi ---------- */

function MultiInspector({ nodeIds, tileIds, pipeline }: { nodeIds: string[]; tileIds: string[]; pipeline: Pipeline }) {
  const nodes = pipeline.nodes.filter((n) => nodeIds.includes(n.id));
  return (
    <div className="insp-body">
      <Header icon={<KindIcon kind="machine" color="#aaaaaa" size={40} />} eyebrow="Selection" title={`${nodes.length} buildings · ${tileIds.length} belt tiles`} />
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
        Drag any selected building or belt to move the whole group. Copy or cut it, then <kbd>Ctrl V</kbd> to place copies: <kbd>R</kbd> rotates the copy
        and each click stamps another.
      </p>
      <div className="insp-actions wrap">
        <button className="btn" onClick={() => useFactory.getState().copySelection()}>
          Copy <kbd>Ctrl C</kbd>
        </button>
        <button className="btn" onClick={() => useFactory.getState().cutSelection()}>
          Cut <kbd>Ctrl X</kbd>
        </button>
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

function BeltInspector({ tileId, link, pipeline }: { tileId: string; link?: ops.Link; pipeline: Pipeline }) {
  const from = link && pipeline.nodes.find((n) => n.id === link.from);
  const to = link?.to ? pipeline.nodes.find((n) => n.id === link.to) : undefined;
  const item = link?.itemId ? pipeline.items.find((i) => i.id === link.itemId) : undefined;
  const first = pipeline.belts.find((t) => t.id === (link?.id ?? tileId));
  const setItem = (id: string | null) => edit((p) => ops.setLinkItem(p, tileId, id));
  const suggested = [...new Set([...(from?.outputs ?? []), ...(to?.inputs ?? [])])];

  if (!link || !from) {
    return (
      <div className="insp-body">
        <Header icon={<BeltIcon size={36} />} eyebrow="Belt" title="Loose belt" />
        <p className="muted small">No building feeds this belt yet. Lay it so it starts at a building's output side (the tabs with outward arrows).</p>
        <div className="insp-actions">
          <button className="btn danger" onClick={() => useFactory.getState().deleteSelection()}>
            Remove tile <kbd>Del</kbd>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="insp-body">
      <Header icon={<BeltIcon size={36} />} eyebrow={`Belt · ${link.tiles.length} tiles`} title={item ? `${item.name} belt` : 'Empty belt'} />
      <div className="belt-route">
        <button className="route-end" onClick={() => useFactory.getState().selectNodes([from.id])}>
          <KindIcon kind={from.kind} color={from.color} size={24} />
          <span>{from.name}</span>
        </button>
        <span className="route-arrow">→</span>
        {to ? (
          <button className="route-end" onClick={() => useFactory.getState().selectNodes([to.id])}>
            <KindIcon kind={to.kind} color={to.color} size={24} />
            <span>{to.name}</span>
          </button>
        ) : (
          <span className="route-end open-end">Open end</span>
        )}
      </div>
      {!to && <p className="muted small">This belt doesn't reach a building's input side yet, so items fall off the end.</p>}

      <Section title="Carries">
        <div className="chip-row">
          {pipeline.items.map((i) => (
            <button
              key={i.id}
              className={`item-chip small selectable${link.itemId === i.id ? ' active' : ''}${suggested.includes(i.id) ? '' : ' faint'}`}
              onClick={() => setItem(link.explicit && link.itemId === i.id ? null : i.id)}
            >
              <ItemIcon shape={i.shape} color={i.color} layers={i.layers} size={14} />
              <span>{i.name}</span>
            </button>
          ))}
          <ItemPicker exclude={pipeline.items.map((i) => i.id)} items={pipeline.items} onPick={setItem} label="+ New item" />
        </div>
        <p className="muted small">
          {link.explicit ? 'Chosen by you. ' : link.itemId ? `Guessed from “${from.name}”. ` : ''}
          Picking an item adds it to the outputs of “{from.name}”{to ? ` and the inputs of “${to.name}”` : ''}.
        </p>
      </Section>

      <Field label="Notes">
        <textarea
          rows={2}
          value={first?.description ?? ''}
          placeholder="e.g. pushed over HTTP, hourly batch, CDC…"
          onChange={(e) =>
            edit((p) => {
              const t = p.belts.find((x) => x.id === link.id);
              if (t) t.description = e.target.value;
            }, { coalesce: `${link.id}:desc` })
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

/* ---------- arrows ---------- */

function ArrowRow({ arrow, text }: { arrow: Arrow; text: string }) {
  return (
    <button className="conn-row" onClick={() => useFactory.getState().select({ arrow: arrow.id })}>
      <span className="conn-dir" style={{ color: arrow.color }}>
        ➜
      </span>
      <span className="conn-name">{text}</span>
      {arrow.label && <span className="muted small">{arrow.label}</span>}
    </button>
  );
}

function ArrowInspector({ arrow, pipeline }: { arrow: Arrow; pipeline: Pipeline }) {
  const from = pipeline.nodes.find((n) => n.id === arrow.from);
  const to = pipeline.nodes.find((n) => n.id === arrow.to);
  if (!from || !to) return null;
  const set = <K extends keyof Arrow>(key: K, value: Arrow[K], coalesce = false) =>
    edit(
      (p) => {
        const a = p.arrows.find((x) => x.id === arrow.id);
        if (a) a[key] = value;
      },
      coalesce ? { coalesce: `${arrow.id}:${String(key)}` } : {},
    );
  const reversed = pipeline.arrows.some((a) => a.from === arrow.to && a.to === arrow.from);
  return (
    <div className="insp-body">
      <Header icon={<LinkIcon size={34} />} eyebrow="Link" title={arrow.label || `${from.name} → ${to.name}`} />
      <div className="belt-route">
        <button className="route-end" onClick={() => useFactory.getState().selectNodes([from.id])}>
          <KindIcon kind={from.kind} color={from.color} size={24} />
          <span>{from.name}</span>
        </button>
        <span className="route-arrow" style={{ color: arrow.color }}>
          ➜
        </span>
        <button className="route-end" onClick={() => useFactory.getState().selectNodes([to.id])}>
          <KindIcon kind={to.kind} color={to.color} size={24} />
          <span>{to.name}</span>
        </button>
      </div>
      <Field label="Label" hint="optional">
        <input value={arrow.label} placeholder="e.g. reads from, looks up, triggers" onChange={(e) => set('label', e.target.value, true)} />
      </Field>
      <Field label="Colour">
        <Swatches value={arrow.color} first={ARROW_COLOR} onChange={(c) => set('color', c)} />
      </Field>
      <Field label="Line">
        <div className="segmented">
          <button className={arrow.dashed ? '' : 'on'} onClick={() => set('dashed', false)}>
            Solid
          </button>
          <button className={arrow.dashed ? 'on' : ''} onClick={() => set('dashed', true)}>
            Dashed
          </button>
        </div>
      </Field>
      <div className="insp-actions">
        <button
          className="btn"
          disabled={reversed}
          title={reversed ? 'An arrow already points the other way' : 'Point the arrow the other way'}
          onClick={() =>
            edit((p) => {
              const a = p.arrows.find((x) => x.id === arrow.id);
              if (a) [a.from, a.to] = [a.to, a.from];
            })
          }
        >
          ⇄ Flip
        </button>
        <button className="btn danger" onClick={() => useFactory.getState().deleteSelection()}>
          Delete <kbd>Del</kbd>
        </button>
      </div>
    </div>
  );
}

/* ---------- item ---------- */

function ItemInspector({ item, pipeline, links }: { item: ItemType; pipeline: Pipeline; links: ops.Link[] }) {
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
  const belts = links.filter((l) => l.itemId === item.id).length;

  const setField = (fid: string, key: 'name' | 'type', value: string) =>
    edit((p) => {
      const f = p.items.find((x) => x.id === item.id)?.fields.find((x) => x.id === fid);
      if (f) f[key] = value;
    }, { coalesce: `${fid}:${key}` });

  return (
    <div className="insp-body">
      <Header icon={<ItemIcon shape={item.shape} color={item.color} layers={item.layers} size={36} />} eyebrow="Item" title={item.name || 'Unnamed'} />
      <Field label="Name">
        <input value={item.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Visit, Order, File" />
      </Field>
      {item.derivedFrom ? (
        <DerivedNote item={item} pipeline={pipeline} />
      ) : (
        <>
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
        </>
      )}
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

function DerivedNote({ item, pipeline }: { item: ItemType; pipeline: Pipeline }) {
  const machine = pipeline.nodes.find((n) => n.id === item.derivedFrom);
  const label = COMBINE_MODES.find((m) => m.mode === machine?.combine)?.label.toLowerCase() ?? 'combine';
  return (
    <div className="derived-note">
      <ItemIcon shape={item.shape} color={item.color} layers={item.layers} size={30} />
      <p className="small">
        This look is made by{' '}
        {machine ? (
          <button className="link-btn" onClick={() => useFactory.getState().selectNodes([machine.id])}>
            {machine.name}
          </button>
        ) : (
          'a machine'
        )}{' '}
        ({label}) from its inputs. Set that machine to <i>Own</i> to style this item yourself.
      </p>
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

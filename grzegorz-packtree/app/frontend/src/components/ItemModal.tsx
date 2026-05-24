import { useState, useEffect } from 'react';
import type { Element, Category } from '../types';
import { createItem, updateItem, getItems } from '../utils/api';

const CATEGORIES: Category[] = ['Electronics', 'Clothing', 'Food', 'Tools', 'Hygiene', 'Documents', 'Other'];

interface Props {
  item: Element | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  name: string;
  description: string;
  weight: number;
  categories: Category[];
  isContainer: boolean;
  isReturnable: boolean;
  isLastMinute: boolean;
  defaultContents: string[];
}

export default function ItemModal({ item, onClose, onSaved }: Props) {
  const isEdit = !!item;

  const [form, setForm] = useState<FormState>({
    name:            item?.name            ?? '',
    description:     item?.description     ?? '',
    weight:          item?.weight          ?? 0,
    categories:      item?.categories      ?? [],
    isContainer:     item?.isContainer     ?? false,
    isReturnable:    item?.isReturnable    ?? true,
    isLastMinute:    item?.isLastMinute    ?? false,
    defaultContents: item?.defaultContents?.map((e) =>
      typeof e === 'string' ? e : (e as Element)._id
    ) ?? [],
  });

  const [imageFile, setImageFile]     = useState<File | null>(null);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [allItems, setAllItems]       = useState<Element[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [contentsSearch, setContentsSearch] = useState('');

  // Load items whenever this is a container (on mount if editing, on toggle if creating)
  useEffect(() => {
    if (form.isContainer) {
      setLoadingItems(true);
      getItems().then(setAllItems).catch(() => {}).finally(() => setLoadingItems(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount — toggle also triggers via handleContainerToggle

  const toggle = (field: 'isContainer' | 'isReturnable' | 'isLastMinute') =>
    setForm((f) => ({ ...f, [field]: !f[field] }));

  const toggleCat = (cat: Category) =>
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(cat)
        ? f.categories.filter((c) => c !== cat)
        : [...f.categories, cat],
    }));

  const toggleDefaultContent = (id: string) =>
    setForm((f) => ({
      ...f,
      defaultContents: f.defaultContents.includes(id)
        ? f.defaultContents.filter((c) => c !== id)
        : [...f.defaultContents, id],
    }));

  const handleContainerToggle = () => {
    const next = !form.isContainer;
    setForm((f) => ({ ...f, isContainer: next }));
    if (next && allItems.length === 0) {
      setLoadingItems(true);
      getItems().then(setAllItems).catch(() => {}).finally(() => setLoadingItems(false));
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return setError('Name is required');
    setSaving(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('data', JSON.stringify(form));
      if (imageFile) fd.append('image', imageFile);
      if (isEdit) await updateItem(item._id, fd);
      else await createItem(fd);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Items eligible as default contents:
  // - not this item itself
  // - not already a default content of another container (pulled from allItems)
  // Collect all IDs already claimed as defaultContents by other items
  const claimedByOthers = new Set<string>(
    allItems
      .filter((i) => i._id !== item?._id && i.isContainer)
      .flatMap((i) => i.defaultContents?.map((d) =>
        typeof d === 'string' ? d : (d as Element)._id
      ) ?? [])
  );

  const filteredAll = allItems.filter(
    (i) =>
      i._id !== item?._id &&
      !claimedByOthers.has(i._id) &&
      (contentsSearch === '' || i.name.toLowerCase().includes(contentsSearch.toLowerCase()))
  );

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: '100%', maxWidth: 500, maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{isEdit ? 'Edit item' : 'New item'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {error && (
          <div style={{ background: '#3b1a1a', border: '1px solid #5a2020', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        <label style={L}>
          Name *
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Toothbrush" />
        </label>

        <label style={L}>
          Description
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Optional notes…" />
        </label>

        <label style={L}>
          Weight (grams)
          <input type="number" min={0} value={form.weight}
            onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} />
        </label>

        <div style={L}>
          Categories
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {CATEGORIES.map((cat) => (
              <button key={cat}
                className={`btn btn-sm ${form.categories.includes(cat) ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => toggleCat(cat)}>{cat}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {([
            { field: 'isContainer',  label: '📦 Container' },
            { field: 'isReturnable', label: '↩ Returnable' },
            { field: 'isLastMinute', label: '⚡ Last-minute' },
          ] as const).map(({ field, label }) => (
            <label key={field} style={CB}>
              <input type="checkbox" checked={form[field]}
                onChange={field === 'isContainer' ? handleContainerToggle : () => toggle(field)}
                style={CBInput} />
              {label}
            </label>
          ))}
        </div>

        {/* Default contents — only for containers */}
        {form.isContainer && (
          <div style={L}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Default contents</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
              Items auto-added when this container is placed into a plan.
              Items already assigned to another container are hidden.
            </div>
            <input
              placeholder="Search items…"
              value={contentsSearch}
              onChange={(e) => setContentsSearch(e.target.value)}
              style={{ fontSize: 12, marginBottom: 8 }}
            />
            {loadingItems ? (
              <div style={{ padding: 12, textAlign: 'center' }}><span className="spinner" style={{ width: 16, height: 16 }} /></div>
            ) : filteredAll.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', padding: 8 }}>No available items</div>
            ) : (
              <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredAll.map((i) => {
                  const checked = form.defaultContents.includes(i._id);
                  return (
                    <label key={i._id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                      background: checked ? 'rgba(110,231,183,0.08)' : 'var(--bg3)',
                      border: `1px solid ${checked ? 'rgba(110,231,183,0.3)' : 'var(--border)'}`,
                      borderRadius: 7, cursor: 'pointer', fontSize: 13, transition: 'all .12s',
                    }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => toggleDefaultContent(i._id)} style={CBInput} />
                      <span>{i.isContainer ? '📦' : '🔹'}</span>
                      <span style={{ flex: 1 }}>{i.name}</span>
                      {checked && <span className="badge badge-accent" style={{ fontSize: 10 }}>default</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <label style={L}>
          Photo
          <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            style={{ padding: '6px 0', background: 'none', border: 'none' }} />
          {isEdit && item.imagePath && !imageFile && (
            <img src={`/uploads/${item.imagePath}`} alt="current"
              style={{ marginTop: 8, width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }} />
          )}
        </label>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving
              ? <span className="spinner" style={{ width: 16, height: 16 }} />
              : isEdit ? 'Save changes' : 'Create item'}
          </button>
        </div>
      </div>
    </div>
  );
}

const L: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--text2)' };
const CB: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 };
const CBInput: React.CSSProperties = { width: 'auto', accentColor: 'var(--accent)' };

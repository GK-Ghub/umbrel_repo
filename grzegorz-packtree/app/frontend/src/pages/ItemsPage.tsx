import { useEffect, useState } from 'react';
import type { Element, Category } from '../types';
import { getItems, deleteItem } from '../utils/api';
import { formatWeight } from '../utils/weight';
import ItemModal from '../components/ItemModal';

const CATEGORIES: Category[] = ['Electronics', 'Clothing', 'Food', 'Tools', 'Hygiene', 'Documents', 'Other'];

export default function ItemsPage() {
  const [items, setItems]         = useState<Element[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterContainer, setFilterContainer] = useState('');
  const [search, setSearch]       = useState('');
  const [modal, setModal]         = useState<Element | 'create' | null>(null);

  const load = () => {
    setLoading(true); setError('');
    const params: Record<string, string> = {};
    if (filterCat) params.category = filterCat;
    if (filterContainer !== '') params.isContainer = filterContainer;
    if (search) params.q = search;
    getItems(params).then(setItems).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [filterCat, filterContainer, search]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    try { await deleteItem(id); load(); } catch (e) { alert((e as Error).message); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Items & Containers</h1>
        <button className="btn btn-primary" onClick={() => setModal('create')}>+ New Item</button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 260 }} />
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={filterContainer} onChange={(e) => setFilterContainer(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Items & containers</option>
          <option value="true">Containers only</option>
          <option value="false">Items only</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
      ) : error ? (
        <div style={{ padding: 20 }}>
          <div style={{ color: 'var(--danger)', marginBottom: 12 }}>Failed to load: {error}</div>
          <button className="btn btn-ghost" onClick={load}>Retry</button>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state"><div className="icon">📦</div><div>No items found</div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {items.map((item) => (
            <div key={item._id} className="card" style={{ display: 'flex', gap: 12 }}>
              {item.imagePath ? (
                <img src={`/uploads/${item.imagePath}`} alt={item.name} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 56, height: 56, background: 'var(--bg3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                  {item.isContainer ? '📦' : '🔹'}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  {item.isContainer && <span className="badge badge-accent">container</span>}
                  {item.isReturnable && <span className="badge">↩ returnable</span>}
                  {item.isLastMinute && <span className="badge badge-warn">⚡ last-min</span>}
                  {(item.categories ?? []).map((c) => <span key={c} className="tag">{c}</span>)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>{formatWeight(item.weight)}</div>
                {item.isContainer && item.defaultContents?.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                    Defaults: {item.defaultContents.map((d) => (typeof d === 'object' ? d.name : d)).join(', ')}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setModal(item)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item._id)}>Del</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ItemModal
          item={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}

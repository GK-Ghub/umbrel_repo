import { useState } from 'react';
import type { SearchResult } from '../types';
import { searchItems } from '../utils/api';

export default function SearchPage() {
  const [q, setQ]               = useState('');
  const [results, setResults]   = useState<SearchResult[]>([]);
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    try {
      const data = await searchItems(q.trim());
      setResults(data);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Deep Search</h1>
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, marginBottom: 24, maxWidth: 500 }}>
        <input placeholder="Search for an item across all plans…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Search'}
        </button>
      </form>

      {searched && results.length === 0 && (
        <div className="empty-state">
          <div className="icon">🔍</div>
          <div>No results for <strong>"{q}"</strong></div>
        </div>
      )}

      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 4 }}>
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </div>
          {results.map((r, i) => (
            <div key={i} className="card">
              <div style={{ fontWeight: 500, marginBottom: 8 }}>{r.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {r.breadcrumb.map((crumb, ci) => (
                  <span key={ci} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 12, padding: '2px 8px', borderRadius: 6,
                      background: ci === r.breadcrumb.length - 1 ? 'rgba(110,231,183,0.12)' : 'var(--bg3)',
                      color: ci === r.breadcrumb.length - 1 ? 'var(--accent)' : 'var(--text2)',
                      border: `1px solid ${ci === r.breadcrumb.length - 1 ? 'rgba(110,231,183,0.3)' : 'var(--border)'}`,
                      fontWeight: ci === r.breadcrumb.length - 1 ? 600 : 400,
                    }}>{crumb}</span>
                    {ci < r.breadcrumb.length - 1 && <span style={{ color: 'var(--text3)', fontSize: 12 }}>›</span>}
                  </span>
                ))}
              </div>
              {r.state && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--warn)' }}>State: {r.state}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

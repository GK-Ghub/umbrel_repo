import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PlanTemplate, TreeNode } from '../types';
import { getTemplates, createTemplate, deleteTemplate } from '../utils/api';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [creating,  setCreating]  = useState(false);
  const [newName,   setNewName]   = useState('');
  const [newDesc,   setNewDesc]   = useState('');

  const load = () => {
    setLoading(true); setError('');
    getTemplates()
      .then(setTemplates)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const t = await createTemplate({ name: newName.trim(), description: newDesc.trim() });
      setNewName(''); setNewDesc(''); setCreating(false);
      load();
      // Navigate to editor immediately
      window.location.href = `/templates/${t._id}`;
    } catch (e) { alert((e as Error).message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    try { await deleteTemplate(id); load(); }
    catch (e) { alert((e as Error).message); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Templates 🧩</h1>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New Template</button>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20, maxWidth: 560 }}>
        Templates are reusable packing structures. Build them just like plans, then inject into any plan with one click.
      </p>

      {creating && (
        <div className="card" style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>New template</h3>
          <input placeholder="Template name *" value={newName}
            onChange={(e) => setNewName(e.target.value)} autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
          <input placeholder="Description (optional)" value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleCreate}>Create & Edit</button>
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
      ) : error ? (
        <div style={{ color: 'var(--danger)', padding: 20 }}>{error} <button className="btn btn-ghost btn-sm" onClick={load}>Retry</button></div>
      ) : templates.length === 0 ? (
        <div className="empty-state"><div className="icon">🧩</div><div>No templates yet</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {templates.map((t) => (
            <TemplateCard key={t._id} t={t} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}


function TemplateCard({ t, onDelete }: { t: import('../types').PlanTemplate; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const nodeCount = countNodes(t.tree);
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: t.tree.length > 0 ? 'pointer' : 'default' }}
        onClick={() => t.tree.length > 0 && setExpanded((v) => !v)}>
        {t.tree.length > 0 ? (
          <span style={{ fontSize: 12, color: 'var(--text3)', minWidth: 14 }}>{expanded ? '▾' : '▸'}</span>
        ) : <span style={{ minWidth: 14 }} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{t.name}</div>
          {t.description && <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{t.description}</div>}
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            {nodeCount} item{nodeCount !== 1 ? 's' : ''} · Updated {new Date(t.updatedAt).toLocaleDateString()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <Link to={`/templates/${t._id}`} className="btn btn-ghost btn-sm">✏️ Edit</Link>
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(t._id)}>Del</button>
        </div>
      </div>

      {/* Collapsible tree preview */}
      {expanded && t.tree.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', background: 'var(--bg3)' }}>
          <TemplatePreview nodes={t.tree} depth={0} />
        </div>
      )}
    </div>
  );
}

function TemplatePreview({ nodes, depth }: { nodes: TreeNode[]; depth: number }) {
  const visible = nodes.slice(0, depth === 0 ? 6 : 4);
  return (
    <>
      {visible.map((node) => (
        <div key={node._id}>
          <div style={{ marginLeft: depth * 16, marginBottom: 3, fontSize: 13, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text3)', fontSize: 10 }}>{depth > 0 ? '└' : '•'}</span>
            <span>{node.name}</span>
            {node.children?.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>({node.children.length})</span>
            )}
          </div>
          {node.children?.length > 0 && <TemplatePreview nodes={node.children} depth={depth + 1} />}
        </div>
      ))}
      {nodes.length > visible.length && (
        <div style={{ marginLeft: depth * 16, fontSize: 12, color: 'var(--text3)' }}>
          +{nodes.length - visible.length} more…
        </div>
      )}
    </>
  );
}

function countNodes(nodes: TreeNode[]): number {
  let c = nodes.length;
  for (const n of nodes) c += countNodes(n.children ?? []);
  return c;
}

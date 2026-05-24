import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Plan, PlanTemplate, TreeNode } from '../types';
import { getPlans, createPlan, deletePlan, getTemplates, injectTemplate } from '../utils/api';

export default function PlansPage() {
  const navigate = useNavigate();
  const [plans,       setPlans]       = useState<Plan[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [creating,    setCreating]    = useState(false);
  const [newName,     setNewName]     = useState('');
  const [newDesc,     setNewDesc]     = useState('');
  const [showGallery, setShowGallery] = useState(false);

  const load = () => {
    setLoading(true); setError('');
    getPlans().then(setPlans).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const plan = await createPlan({ name: newName.trim(), description: newDesc.trim() });
      setNewName(''); setNewDesc(''); setCreating(false);
      navigate('/plans/' + plan._id);
    } catch (e) { alert((e as Error).message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this plan?')) return;
    try { await deletePlan(id); load(); } catch (e) { alert((e as Error).message); }
  };

  const STATUS_COLOR: Record<string, string> = { active: 'badge-accent', draft: '', archived: '' };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Packing Plans</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowGallery(true)}>🧩 From template</button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New Plan</button>
        </div>
      </div>

      {creating && (
        <div className="card" style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>New plan</h3>
          <input placeholder="Plan name" value={newName} onChange={(e) => setNewName(e.target.value)}
            autoFocus onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
          <input placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleCreate}>Create</button>
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
      ) : error ? (
        <div style={{ padding: 20 }}>
          <div style={{ color: 'var(--danger)', marginBottom: 12 }}>Failed: {error}</div>
          <button className="btn btn-ghost" onClick={load}>Retry</button>
        </div>
      ) : plans.length === 0 ? (
        <div className="empty-state"><div className="icon">🗂</div><div>No plans yet</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plans.map((plan) => (
            <div key={plan._id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{plan.name}</div>
                {plan.description && <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{plan.description}</div>}
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Updated {new Date(plan.updatedAt).toLocaleDateString()}</div>
              </div>
              <span className={'badge ' + (STATUS_COLOR[plan.status] ?? '')}>{plan.status}</span>
              <Link to={'/play/' + plan._id} className="btn btn-primary btn-sm">▶ Play</Link>
              <Link to={'/plans/' + plan._id} className="btn btn-ghost btn-sm">✏️ Edit</Link>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(plan._id)}>Del</button>
            </div>
          ))}
        </div>
      )}

      {showGallery && (
        <TemplateGallery
          onClose={() => setShowGallery(false)}
          onCreated={(planId) => { setShowGallery(false); navigate('/plans/' + planId); }}
        />
      )}
    </div>
  );
}

function TemplateGallery({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (planId: string) => void;
}) {
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [planName,  setPlanName]  = useState('');
  const [creating,  setCreating]  = useState(false);

  useEffect(() => {
    getTemplates().then(setTemplates).finally(() => setLoading(false));
  }, []);

  const handleSelectTemplate = (t: PlanTemplate) => {
    setSelected(t._id);
    if (!planName) setPlanName(t.name);
  };

  const handleCreate = async () => {
    if (!planName.trim() || !selected) return;
    setCreating(true);
    try {
      const plan = await createPlan({ name: planName.trim(), description: '' });
      await injectTemplate(plan._id, { templateId: selected });
      onCreated(plan._id);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width: '100%', maxWidth: 620, maxHeight: '88vh', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>🧩 Choose a template</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
        ) : templates.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No templates yet. <Link to="/templates" style={{ color: 'var(--accent)' }}>Create some first →</Link>
          </div>
        ) : (
          <>
            <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10, flex: 1 }}>
              {templates.map((t) => {
                const isSelected = selected === t._id;
                return (
                  <div key={t._id} onClick={() => handleSelectTemplate(t)}
                    style={{
                      padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                      border: '2px solid ' + (isSelected ? 'var(--accent2)' : 'var(--border)'),
                      background: isSelected ? 'rgba(110,231,183,0.08)' : 'var(--bg3)',
                      transition: 'all .15s',
                    }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                      {isSelected && <span style={{ color: 'var(--accent)', marginRight: 5 }}>✓</span>}
                      {t.name}
                    </div>
                    {t.description && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>{t.description}</div>}
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: t.tree.length ? 8 : 0 }}>
                      {countNodes(t.tree)} item{countNodes(t.tree) !== 1 ? 's' : ''}
                    </div>
                    {t.tree.slice(0, 4).map((node) => (
                      <div key={node._id} style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                        <span>{node.children?.length ? '📦' : '🔹'}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
                        {node.children?.length > 0 && <span style={{ color: 'var(--text3)', fontSize: 10, flexShrink: 0 }}>({node.children.length})</span>}
                      </div>
                    ))}
                    {t.tree.length > 4 && <div style={{ fontSize: 11, color: 'var(--text3)' }}>+{t.tree.length - 4} more…</div>}
                  </div>
                );
              })}
            </div>

            {selected && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                <input placeholder="Plan name *" value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  style={{ flex: 1, fontSize: 14 }} autoFocus />
                <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !planName.trim()}>
                  {creating ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Create plan →'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function countNodes(nodes: TreeNode[]): number {
  let c = nodes.length;
  for (const n of nodes) c += countNodes(n.children ?? []);
  return c;
}

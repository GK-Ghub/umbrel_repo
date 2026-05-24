import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Plan } from '../types';
import { getPlans, getItems } from '../utils/api';

export default function HomePage() {
  const [plans, setPlans]       = useState<Plan[]>([]);
  const [itemCount, setItemCount] = useState(0);
  const [error, setError]       = useState('');

  useEffect(() => {
    Promise.all([getPlans(), getItems()])
      .then(([p, items]) => { setPlans(p); setItemCount(items.length); })
      .catch((e: Error) => setError(e.message));
  }, []);

  const activePlans = plans.filter((p) => p.status === 'active');
  const draftPlans  = plans.filter((p) => p.status === 'draft');

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Welcome to PackTree</h1>
        <Link to="/plans" className="btn btn-primary">+ New Plan</Link>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#3b1a1a', border: '1px solid #5a2020', borderRadius: 8, color: 'var(--danger)', fontSize: 13 }}>
          Backend unreachable: {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 32 }}>
        {([
          { label: 'Total plans', value: plans.length,        icon: '🗂' },
          { label: 'Active',      value: activePlans.length,  icon: '✈️' },
          { label: 'Drafts',      value: draftPlans.length,   icon: '📝' },
          { label: 'Total items', value: itemCount,            icon: '📦' },
        ] as const).map(({ label, value, icon }) => (
          <div key={label} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 28 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--text2)' }}>Recent plans</h2>
      {plans.length === 0 && !error ? (
        <div className="empty-state"><div className="icon">🗂</div><div>No plans yet — <Link to="/plans">create your first</Link></div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {plans.slice(0, 6).map((plan) => (
            <Link key={plan._id} to={`/plans/${plan._id}`} style={{ textDecoration: 'none' }}>
              <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'border-color .15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border2)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <div>
                  <div style={{ fontWeight: 500 }}>{plan.name}</div>
                  {plan.description && <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{plan.description}</div>}
                </div>
                <span className={`badge ${plan.status === 'active' ? 'badge-accent' : ''}`}>{plan.status}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

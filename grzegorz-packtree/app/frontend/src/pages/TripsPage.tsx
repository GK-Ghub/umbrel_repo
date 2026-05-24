import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Trip, Plan, TripPlan } from '../types';
import { getTrips, createTrip, deleteTrip, getPlans, addPlanToTrip, removePlanFromTrip } from '../utils/api';

export default function TripsPage() {
  const [trips,   setTrips]   = useState<Trip[]>([]);
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  const load = () => {
    setLoading(true); setError('');
    Promise.all([getTrips(), getPlans()])
      .then(([t, p]) => { setTrips(t); setPlans(p); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    try {
      await createTrip({ name: form.name.trim(), description: form.description.trim() });
      setForm({ name: '', description: '' }); setCreating(false); load();
    } catch (e) { alert((e as Error).message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this trip?')) return;
    try { await deleteTrip(id); load(); }
    catch (e) { alert((e as Error).message); }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Trips 🧳</h1>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New Trip</button>
      </div>

      <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 24, maxWidth: 560 }}>
        A trip groups independent copies of plans. 
        Modifying items within a trip <strong>does not affect</strong> your original plans.
      </p>

      {creating && (
        <div className="card" style={{ marginBottom: 20, maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>New trip</h3>
          <input placeholder="Trip name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          <input placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleCreate}>Create</button>
            <button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
      ) : error ? (
        <div style={{ color: 'var(--danger)', padding: 20 }}>{error}</div>
      ) : trips.length === 0 ? (
        <div className="empty-state"><div className="icon">🧳</div><div>No trips yet</div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {trips.map((trip) => (
            <TripCard
              key={trip._id}
              trip={trip}
              allPlans={plans}
              onDelete={() => handleDelete(trip._id)}
              onAddPlan={async (planId) => { await addPlanToTrip(trip._id, planId); load(); }}
              onRemovePlan={async (planId) => { await removePlanFromTrip(trip._id, planId); load(); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TripCard({ trip, allPlans, onDelete, onAddPlan, onRemovePlan }: {
  trip: Trip;
  allPlans: Plan[];
  onDelete: () => void;
  onAddPlan: (planId: string) => Promise<void>;
  onRemovePlan: (planId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [addingPlan, setAddingPlan] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');

  // Filtering available plans is less strict now since we clone them
  const available = allPlans; 

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}>
        <span style={{ fontSize: 12, color: 'var(--text3)', minWidth: 14 }}>{expanded ? '▾' : '▸'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{trip.name}</div>
          {trip.description && <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{trip.description}</div>}
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            {(trip.plans || []).length} plan{(trip.plans || []).length !== 1 ? 's' : ''} · Updated {new Date(trip.updatedAt).toLocaleDateString()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
          <Link to={`/trips/${trip._id}/play`} className="btn btn-primary btn-sm">▶ Play</Link>
          <Link to={`/trips/${trip._id}`} className="btn btn-ghost btn-sm">Open</Link>
          <button className="btn btn-danger btn-sm" onClick={onDelete}>Del</button>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg3)' }}>
          {(!trip.plans || trip.plans.length === 0) ? (
            <div style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>
              No plans added yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {trip.plans.map((plan, i) => (
                <div key={plan._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px 10px 32px', borderBottom: i < trip.plans.length - 1 ? '1px solid var(--border)' : undefined }}>
                  <span style={{ fontSize: 16 }}>🗂</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{plan.name}</div>
                    {plan.description && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{plan.description}</div>}
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: 'var(--danger)' }}
                    onClick={() => onRemovePlan(plan._id)}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            {addingPlan ? (
              <>
                <select value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)}
                  style={{ flex: 1, fontSize: 13 }}>
                  <option value="">— Select a plan to copy —</option>
                  {available.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
                <button className="btn btn-primary btn-sm"
                  disabled={!selectedPlan}
                  onClick={async () => {
                    if (!selectedPlan) return;
                    await onAddPlan(selectedPlan);
                    setSelectedPlan(''); setAddingPlan(false);
                  }}>Add Copy</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAddingPlan(false)}>Cancel</button>
              </>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => setAddingPlan(true)}>
                + Add plan copy to trip
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

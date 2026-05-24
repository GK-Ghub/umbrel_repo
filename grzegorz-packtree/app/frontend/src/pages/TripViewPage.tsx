import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Trip, TripPlan, Element, TreeNode } from '../types';
import { getTrip, getItems, removeElementFromTrip, resolveTripConflict, syncTripPlans } from '../utils/api';
import { formatWeight, calcTreeWeight } from '../utils/weight';
import { detectConflicts, type ConflictInfo } from '../utils/conflicts';

export default function TripViewPage() {
  const { id } = useParams<{ id: string }>();
  const [trip,       setTrip]       = useState<Trip | null>(null);
  const [elementMap, setElementMap] = useState<Record<string, Element>>({});
  const [loading,    setLoading]    = useState(true);
  const [syncing,    setSyncing]    = useState(false);
  const [error,      setError]      = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);

  const loadData = useCallback(() => {
    Promise.all([getTrip(id!), getItems()])
      .then(([t, items]) => {
        setTrip(t);
        const map: Record<string, Element> = {};
        items.forEach((i) => { map[i._id] = i; });
        setElementMap(map);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRemoveElement = async (nodeId: string) => {
    if (!trip) return;
    if (!confirm('Remove this item from the trip? (Original plan will not be affected)')) return;
    try {
      const updated = await removeElementFromTrip(trip._id, nodeId);
      setTrip(updated);
    } catch (err: any) { alert(err.message); }
  };

  const handleResolveConflict = async (elementId: string, keepInPlanId: string) => {
    if (!trip) return;
    try {
      const updated = await resolveTripConflict(trip._id, elementId, keepInPlanId);
      setTrip(updated);
      return updated;
    } catch (err: any) { alert(err.message); throw err; }
  };

  const handleSyncPlans = async () => {
    if (!trip || syncing) return;
    if (!confirm('This will update all plans in this trip to their latest versions. New items will be added, but you might need to re-resolve some conflicts. Continue?')) return;
    setSyncing(true);
    try {
      const updated = await syncTripPlans(trip._id);
      setTrip(updated);
      alert('Plans synchronized successfully!');
    } catch (err: any) {
      alert('Failed to sync: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;
  if (error || !trip) return (
    <div className="page"><div style={{ color: 'var(--danger)', padding: 20 }}>{error || 'Trip not found'}</div></div>
  );

  const plans     = trip.plans || [];
  const conflicts = detectConflicts(plans as any, [], elementMap); 
  const totalWeight = plans.reduce((sum, p) => sum + calcTreeWeight(p.tree || [], elementMap), 0);
  const totalItems  = plans.reduce((sum, p) => sum + countNodes(p.tree || []), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link to="/trips" style={{ fontSize: 13, color: 'var(--text3)' }}>← Trips</Link>
          <h1 className="page-title" style={{ marginTop: 4 }}>🧳 {trip.name}</h1>
          {trip.description && <div style={{ fontSize: 14, color: 'var(--text3)', marginTop: 4 }}>{trip.description}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button 
            className="btn btn-ghost" 
            onClick={handleSyncPlans} 
            disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {syncing ? '⌛' : '🔄'} Sync Plans
          </button>
          {conflicts.conflictCount > 0 && (
            <button className="btn btn-warn" onClick={() => setWizardOpen(true)}>⚠️ Resolve Conflicts</button>
          )}
          <Link to={`/trips/${id}/play`} className="btn btn-primary">▶ Play trip</Link>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Plans',        value: plans.length,           icon: '🗂' },
          { label: 'Total items',  value: totalItems,             icon: '📦' },
          { label: 'Total weight', value: formatWeight(totalWeight), icon: '⚖️' },
        ].map(({ label, value, icon }) => (
          <div key={label} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 140 }}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{label}</div>
            </div>
          </div>
        ))}

        {/* Conflict count badge */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 140, borderColor: conflicts.conflictCount > 0 ? 'rgba(251,191,36,0.4)' : undefined }}>
          <span style={{ fontSize: 22 }}>{conflicts.conflictCount > 0 ? '⚠️' : '✅'}</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: conflicts.conflictCount > 0 ? 'var(--warn)' : 'var(--accent)' }}>
              {conflicts.conflictCount}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {conflicts.conflictCount > 0 ? 'Conflicts' : 'No conflicts'}
            </div>
          </div>
        </div>
      </div>

      {conflicts.conflictCount > 0 && (
        <ConflictPanel conflicts={conflicts} onOpenWizard={() => setWizardOpen(true)} />
      )}

      {/* Plans */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {plans.map((plan, i) => (
          <PlanSection
            key={plan._id}
            plan={plan}
            elementMap={elementMap}
            conflicts={conflicts}
            index={i}
            onRemoveElement={handleRemoveElement}
          />
        ))}
      </div>

      {wizardOpen && (
        <ConflictWizardModal 
          conflicts={conflicts} 
          elementMap={elementMap} 
          plans={plans}
          onResolve={handleResolveConflict}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </div>
  );
}

// ── Conflict Panel (Simplified) ───────────────────────────────────────────────

function ConflictPanel({ conflicts, onOpenWizard }: { 
  conflicts: ConflictInfo; 
  onOpenWizard: () => void; 
}) {
  return (
    <div style={{ marginBottom: 20, border: '1px solid rgba(251,191,36,0.35)', borderRadius: 12, overflow: 'hidden', background: 'rgba(251,191,36,0.06)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <span style={{ fontSize: 24 }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: 'var(--warn)' }}>{conflicts.conflictCount} items are duplicated</div>
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>You should decide which plan each item belongs to for this trip.</div>
      </div>
      <button className="btn btn-primary" onClick={onOpenWizard}>Resolve Now</button>
    </div>
  );
}

// ── Conflict Wizard Modal ─────────────────────────────────────────────────────

function ConflictWizardModal({ conflicts, elementMap, plans, onResolve, onClose }: {
  conflicts: ConflictInfo;
  elementMap: Record<string, Element>;
  plans: TripPlan[];
  onResolve: (elementId: string, keepInPlanId: string) => Promise<any>;
  onClose: () => void;
}) {
  const entries = Object.entries(conflicts.elementConflicts);
  const total = entries.length;
  // Keep track of total conflicts when the wizard was opened
  const [initialTotal] = useState(total);
  const [busy, setBusy] = useState(false);

  if (total === 0) {
    return (
      <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card modal-content" style={{ textAlign: 'center', padding: 30, width: '100%', maxWidth: 400 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
          <h3>All conflicts resolved!</h3>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  // Always resolve the first one in the remaining list
  const [elementId, planNames] = entries[0];
  const element = elementMap[elementId];
  const nameToId = Object.fromEntries(plans.map(p => [p.name, p._id]));

  const handleChoice = async (planName: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const planId = nameToId[planName];
      await onResolve(elementId, planId);
      // No need to increment index: the resolved conflict will be removed from 'entries' 
      // by the parent's state update, and the next one will move to index 0.
    } finally {
      setBusy(false);
    }
  };

  const currentStep = Math.min(initialTotal, initialTotal - total + 1);

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 500, padding: 0, overflow: 'hidden', opacity: busy ? 0.7 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg2)' }}>
          <h3 style={{ margin: 0 }}>Resolve Conflict</h3>
          <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{currentStep} of {initialTotal}</span>
        </div>

        <div style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{element?.isContainer ? '📦' : '🔹'}</div>
          <h2 style={{ marginBottom: 4 }}>{element?.name || 'Unknown Item'}</h2>
          <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 24 }}>
            This item appears in multiple plans. <br/>
            <strong>Where should it stay for this trip?</strong>
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {planNames.map(name => (
              <button 
                key={name} 
                className="btn btn-ghost" 
                style={{ padding: '14px', fontSize: 16, border: '1px solid var(--border)', background: 'var(--bg3)' }}
                onClick={() => handleChoice(name)}
              >
                Keep in: <strong>{name}</strong>
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', background: 'var(--bg2)' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel / Resolve Later</button>
        </div>
      </div>
    </div>
  );
}

// ── Plan section ──────────────────────────────────────────────────────────────

function PlanSection({ plan, elementMap, conflicts, index, onRemoveElement }: {
  plan: TripPlan; elementMap: Record<string, Element>;
  conflicts: ConflictInfo; index: number;
  onRemoveElement: (nodeId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const weight = calcTreeWeight(plan.tree || [], elementMap);
  const planConflicts = plan.tree ? countConflictsInTree(plan.tree, conflicts.nodeConflictMap) : 0;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'var(--bg2)', cursor: 'pointer', borderBottom: collapsed ? 'none' : '1px solid var(--border)' }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 14 }}>{collapsed ? '▸' : '▾'}</span>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)', minWidth: 28 }}>
          #{index + 1}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{plan.name}</div>
          {plan.description && <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 1 }}>{plan.description}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {planConflicts > 0 && (
            <span className="badge badge-warn" style={{ fontSize: 11 }}>
              ⚠️ {planConflicts} conflict{planConflicts !== 1 ? 's' : ''}
            </span>
          )}
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{formatWeight(weight)}</span>
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: 16 }}>
          {(!plan.tree || plan.tree.length === 0) ? (
            <div style={{ color: 'var(--text3)', fontSize: 13, fontStyle: 'italic' }}>Empty plan</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {plan.tree.map((node) => (
                <ReadOnlyNode key={node._id} node={node} elementMap={elementMap}
                  conflicts={conflicts} depth={0} onRemove={onRemoveElement} />
              ))}
            </div>
          )}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text3)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{countNodes(plan.tree || [])} item{countNodes(plan.tree || []) !== 1 ? 's' : ''}</span>
            <span>{formatWeight(weight)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ReadOnlyNode({ node, elementMap, conflicts, depth, onRemove }: {
  node: TreeNode; elementMap: Record<string, Element>;
  conflicts: ConflictInfo; depth: number;
  onRemove: (nodeId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const el = elementMap[node.elementId];
  const isContainer  = el?.isContainer ?? (node.children?.length > 0);
  const conflictPlan = conflicts.nodeConflictMap[node._id];
  const childWeight  = calcTreeWeight(node.children ?? [], elementMap);
  const ownWeight    = (el?.weight ?? 0) * (node.quantity ?? 1);

  return (
    <div style={{ marginLeft: depth * 18 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px',
        background: conflictPlan ? 'rgba(251,191,36,0.06)' : depth === 0 ? 'var(--bg2)' : 'var(--bg3)',
        border: `1px solid ${conflictPlan ? 'rgba(251,191,36,0.3)' : 'var(--border)'}`,
        borderLeft: depth > 0 ? `2px solid rgba(110,231,183,${0.1 + depth * 0.08})` : undefined,
        borderRadius: 8, marginBottom: 4,
      }}>
        {isContainer ? (
          <span style={{ fontSize: 11, color: 'var(--text3)', cursor: 'pointer', minWidth: 14 }}
            onClick={() => setOpen((v) => !v)}>
            {open ? '▾' : '▸'}
          </span>
        ) : <span style={{ minWidth: 14 }} />}

        <span>{isContainer ? '📦' : '🔹'}</span>
        <span style={{ flex: 1, fontWeight: isContainer ? 600 : 400, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>

        <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
          {formatWeight(ownWeight + childWeight)}
        </span>

        {conflictPlan && (
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(251,191,36,0.15)', color: 'var(--warn)', border: '1px solid rgba(251,191,36,0.3)', flexShrink: 0 }}>
            ⚠️ duplicate
          </span>
        )}

        <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', color: 'var(--danger)' }}
          onClick={() => onRemove(node._id)}>✕</button>
      </div>

      {open && node.children?.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          {node.children.map((child) => (
            <ReadOnlyNode key={child._id} node={child} elementMap={elementMap}
              conflicts={conflicts} depth={depth + 1} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

function countNodes(nodes: TreeNode[]): number {
  let c = nodes.length;
  for (const n of nodes) c += countNodes(n.children ?? []);
  return c;
}

function countConflictsInTree(nodes: TreeNode[], nodeConflictMap: Record<string, string>): number {
  let c = 0;
  for (const n of nodes) {
    if (nodeConflictMap[n._id]) c++;
    if (n.children?.length) c += countConflictsInTree(n.children, nodeConflictMap);
  }
  return c;
}

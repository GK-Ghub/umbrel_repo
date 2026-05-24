import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Trip, TripPlan, Element, TreeNode } from '../types';
import { detectConflicts, type ConflictInfo } from '../utils/conflicts';
import { getTrip, getItems, saveTripProgress } from '../utils/api';
import { formatWeight, calcTreeWeight } from '../utils/weight';

export default function TripPlayPage() {
  const { id } = useParams<{ id: string }>();
  const [trip,       setTrip]       = useState<Trip | null>(null);
  const [elementMap, setElementMap] = useState<Record<string, Element>>({});
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [checked,    setChecked]    = useState<Record<string, boolean>>({});
  const [conflicts,  setConflicts]  = useState<ConflictInfo>({ elementConflicts: {}, nodeConflictMap: {}, conflictCount: 0 });
  
  const [activeTab, setActiveTab] = useState<'plans' | 'containers'>('plans');
  const [hidePacked, setHidePacked] = useState(false);

  useEffect(() => {
    Promise.all([getTrip(id!), getItems()])
      .then(([t, items]) => {
        setTrip(t);
        const map: Record<string, Element> = {};
        items.forEach((i) => { map[i._id] = i; });
        setElementMap(map);

        setConflicts(detectConflicts(t.plans as any, [], map));
        if (t.packingProgress && Object.keys(t.packingProgress).length > 0) {
          setChecked(t.packingProgress);
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const plans = trip?.plans ?? [];
  const allTrees  = plans.map((p) => p.tree || []);
  const allLeaves = plans.reduce((s, p) => s + countLeaves(p.tree || []), 0);
  const doneleaves = plans.reduce((s, p) => s + countCheckedLeaves(p.tree || [], checked), 0);
  const progress  = allLeaves > 0 ? Math.round((doneleaves / allLeaves) * 100) : 0;
  const totalWeight = plans.reduce((s, p) => s + calcTreeWeight(p.tree || [], elementMap), 0);

  const saveProgress = useCallback((progress: Record<string, boolean>) => {
    if (id) saveTripProgress(id, progress).catch(() => {});
  }, [id]);

  const handleToggle = useCallback((node: TreeNode) => {
    setChecked((prev) => {
      const next = { ...prev };
      const descendants = collectDescendantIds(node);
      const selfDone = prev[node._id];
      next[node._id] = !selfDone;
      for (const nid of descendants) next[nid] = !selfDone;
      for (const tree of allTrees) deriveContainers(tree, next);
      setTimeout(() => saveProgress(next), 0);
      return next;
    });
  }, [allTrees, saveProgress]);

  const resetAll = () => {
    if (!confirm('Reset all packing progress?')) return;
    setChecked({});
    saveProgress({});
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <span className="spinner" />
    </div>
  );
  if (error || !trip) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)', color: 'var(--danger)' }}>
      {error || 'Trip not found'}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Sticky header */}
      <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', padding: '14px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Link to={`/trips/${id}`} style={{ color: 'var(--text3)', fontSize: 13, textDecoration: 'none' }}>
            ✏️ View
          </Link>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>🧳 {trip.name}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={resetAll}>Reset</button>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 99, background: progress === 100 ? 'var(--accent)' : 'var(--accent2)', width: `${progress}%`, transition: 'width .3s ease' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, minWidth: 40, textAlign: 'right', color: progress === 100 ? 'var(--accent)' : 'var(--text2)' }}>
            {progress}%
          </span>
        </div>

        {/* Tabs and Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', background: 'var(--bg3)', borderRadius: 8, padding: 3, gap: 2 }}>
            <TabBtn active={activeTab === 'plans'} onClick={() => setActiveTab('plans')}>🗂 Plans</TabBtn>
            <TabBtn active={activeTab === 'containers'} onClick={() => setActiveTab('containers')}>📦 Containers</TabBtn>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text3)', userSelect: 'none' }}>
            <input type="checkbox" checked={hidePacked} onChange={e => setHidePacked(e.target.checked)} />
            Hide packed
          </label>
        </div>
      </div>

      {/* Conflict warning banner */}
      {conflicts.conflictCount > 0 && (
        <div style={{ background: 'rgba(251,191,36,0.08)', borderBottom: '1px solid rgba(251,191,36,0.25)', padding: '10px 16px', fontSize: 13, color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⚠️</span>
          <span style={{ fontSize: 12 }}>
            <strong>{conflicts.conflictCount} items</strong> duplicate across plans.
          </span>
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, padding: '16px', maxWidth: 600, width: '100%', margin: '0 auto' }}>
        {activeTab === 'plans' ? (
          plans.map((plan, i) => (
            <PlanPlaySection
              key={plan._id}
              plan={plan}
              elementMap={elementMap}
              checked={checked}
              conflicts={conflicts}
              onToggle={handleToggle}
              index={i}
              hidePacked={hidePacked}
            />
          ))
        ) : (
          <ContainerMergedView 
            plans={plans} 
            elementMap={elementMap} 
            checked={checked} 
            conflicts={conflicts} 
            onToggle={handleToggle}
            hidePacked={hidePacked}
          />
        )}
      </div>
    </div>
  );
}

function TabBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      style={{
        border: 'none',
        borderRadius: 6,
        padding: '6px 12px',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        background: active ? 'var(--bg2)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text3)',
        transition: 'all 0.2s',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
      }}
    >
      {children}
    </button>
  );
}

// ── Plan Section ──────────────────────────────────────────────────────────────

function PlanPlaySection({ plan, elementMap, checked, conflicts, onToggle, index, hidePacked }: {
  plan: TripPlan; elementMap: Record<string, Element>;
  checked: Record<string, boolean>; conflicts: ConflictInfo; onToggle: (node: TreeNode) => void;
  index: number; hidePacked: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const leaves = countLeaves(plan.tree);
  const done   = countCheckedLeaves(plan.tree, checked);
  const weight = calcTreeWeight(plan.tree, elementMap);

  // Filter tree based on hidePacked
  const filteredTree = hidePacked ? filterPackedNodes(plan.tree, checked) : plan.tree;
  if (hidePacked && filteredTree.length === 0 && done === leaves && leaves > 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: collapsed ? 12 : '12px 12px 0 0', cursor: 'pointer', marginBottom: collapsed ? 0 : -1 }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 14 }}>{collapsed ? '▸' : '▾'}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent)', fontWeight: 700, minWidth: 24 }}>#{index + 1}</span>
        <span style={{ fontWeight: 700, flex: 1, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.name}</span>
        <span style={{ fontSize: 12, color: done === leaves ? 'var(--accent)' : 'var(--text3)', fontWeight: 500 }}>
          {done}/{leaves}
        </span>
      </div>

      {!collapsed && (
        <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
          {filteredTree.length === 0 ? (
            <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>
              {hidePacked ? 'All items packed' : 'Empty plan'}
            </div>
          ) : filteredTree.map((node) => (
            <PlayNode key={node._id} node={node} elementMap={elementMap}
              checked={checked} conflicts={conflicts} onToggle={onToggle} depth={0} hidePacked={hidePacked} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Merged Container View ─────────────────────────────────────────────────────

function ContainerMergedView({ plans, elementMap, checked, conflicts, onToggle, hidePacked }: {
  plans: TripPlan[]; elementMap: Record<string, Element>;
  checked: Record<string, boolean>; conflicts: ConflictInfo; onToggle: (node: TreeNode) => void;
  hidePacked: boolean;
}) {
  // Grouping logic: Container ElementId -> List of nodes (which are children of this container type)
  // Actually, better: Container Name -> List of all nodes under it across all plans
  const containerMap: Record<string, { elementId: string, nodes: TreeNode[] }> = {};
  const looseItems: TreeNode[] = [];

  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      const el = elementMap[node.elementId];
      const isContainer = el?.isContainer ?? (node.children?.length > 0);
      
      if (isContainer) {
        const key = el?.name || node.name;
        if (!containerMap[key]) containerMap[key] = { elementId: node.elementId, nodes: [] };
        containerMap[key].nodes.push(...(node.children || []));
        // We don't walk deeper here because we want to show Top-level containers
        // If there are nested containers, they will stay inside their parent's 'nodes' list
      } else {
        looseItems.push(node);
      }
    }
  };

  plans.forEach(p => walk(p.tree || []));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Object.entries(containerMap).map(([name, data]) => {
        const total = countLeaves(data.nodes);
        const done  = countCheckedLeaves(data.nodes, checked);
        const filteredNodes = hidePacked ? filterPackedNodes(data.nodes, checked) : data.nodes;
        
        if (hidePacked && filteredNodes.length === 0 && total > 0) return null;

        return (
          <div key={name} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg2)' }}>
            <div style={{ padding: '12px 16px', background: 'var(--bg3)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>📦</span>
              <span style={{ flex: 1, fontWeight: 700 }}>{name}</span>
              <span style={{ fontSize: 12, color: done === total ? 'var(--accent)' : 'var(--text3)', fontWeight: 600 }}>
                {done}/{total}
              </span>
            </div>
            <div>
              {filteredNodes.length === 0 ? (
                 <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>Packed</div>
              ) : filteredNodes.map(node => (
                <PlayNode key={node._id} node={node} elementMap={elementMap}
                  checked={checked} conflicts={conflicts} onToggle={onToggle} depth={0} hidePacked={hidePacked} />
              ))}
            </div>
          </div>
        );
      })}

      {looseItems.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: 'var(--bg3)', fontSize: 13, fontWeight: 600, color: 'var(--text3)' }}>
            Individual Items
          </div>
          { (hidePacked ? filterPackedNodes(looseItems, checked) : looseItems).map(node => (
            <PlayNode key={node._id} node={node} elementMap={elementMap}
              checked={checked} conflicts={conflicts} onToggle={onToggle} depth={0} hidePacked={hidePacked} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Play Node (Single Item) ───────────────────────────────────────────────────

function PlayNode({ node, elementMap, checked, conflicts, onToggle, depth, hidePacked }: {
  node: TreeNode; elementMap: Record<string, Element>;
  checked: Record<string, boolean>; conflicts: ConflictInfo; onToggle: (n: TreeNode) => void;
  depth: number; hidePacked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const el = elementMap[node.elementId];
  const isContainer = el?.isContainer ?? (node.children?.length > 0);
  const isDone = !!checked[node._id];
  const leafTotal  = countLeaves(node.children ?? []);
  const leafDone   = countCheckedLeaves(node.children ?? [], checked);
  const conflict   = conflicts.nodeConflictMap[node._id];

  const filteredChildren = hidePacked ? filterPackedNodes(node.children ?? [], checked) : (node.children ?? []);

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: `9px 14px 9px ${14 + depth * 18}px`,
        background: conflict ? 'rgba(251,191,36,0.06)' : isDone ? 'rgba(255,255,255,0.01)' : 'transparent',
        borderBottom: '1px solid var(--border)',
        opacity: isDone ? 0.48 : 1, transition: 'opacity .2s',
        userSelect: 'none',
      }}>
        {isContainer ? (
          <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 14, cursor: 'pointer' }}
            onClick={() => setOpen((v) => !v)}>
            {open ? '▾' : '▸'}
          </span>
        ) : <span style={{ minWidth: 14 }} />}

        <div onClick={() => !conflict && onToggle(node)}
          style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, border: `2px solid ${isDone ? 'var(--accent)' : 'var(--border2)'}`, background: isDone ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s' }}>
          {isDone && <span style={{ color: '#0e0f11', fontSize: 13, fontWeight: 700 }}>✓</span>}
        </div>

        <span style={{ cursor: isContainer ? 'pointer' : 'default' }}
          onClick={isContainer ? () => setOpen((v) => !v) : undefined}>
          {isContainer ? '📦' : '🔹'}
        </span>

        <span style={{ flex: 1, fontSize: 14, fontWeight: isContainer ? 600 : 400, textDecoration: isDone ? 'line-through' : 'none', color: isDone ? 'var(--text3)' : conflict ? 'var(--warn)' : 'var(--text)', cursor: isContainer ? 'pointer' : 'default', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          onClick={isContainer ? () => setOpen((v) => !v) : undefined}>
          {node.name}
        </span>

        {isContainer && leafTotal > 0 && (
          <span style={{ fontSize: 11, flexShrink: 0, padding: '1px 6px', borderRadius: 99, background: leafDone === leafTotal ? 'rgba(110,231,183,0.15)' : 'var(--bg3)', color: leafDone === leafTotal ? 'var(--accent)' : 'var(--text3)', border: `1px solid ${leafDone === leafTotal ? 'rgba(110,231,183,0.3)' : 'var(--border)'}` }}>
            {leafDone}/{leafTotal}
          </span>
        )}
      </div>

      {open && filteredChildren.length > 0 && filteredChildren.map((child) => (
        <PlayNode key={child._id} node={child} elementMap={elementMap}
          checked={checked} conflicts={conflicts} onToggle={onToggle} depth={depth + 1} hidePacked={hidePacked} />
      ))}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function filterPackedNodes(nodes: TreeNode[], checked: Record<string, boolean>): TreeNode[] {
  return nodes
    .filter(n => !checked[n._id] || (n.children?.length > 0 && countCheckedLeaves([n], checked) < countLeaves([n])))
    .map(n => ({
      ...n,
      children: filterPackedNodes(n.children || [], checked)
    }));
}

function collectDescendantIds(node: TreeNode): string[] {
  const ids: string[] = [];
  for (const c of node.children ?? []) { ids.push(c._id); ids.push(...collectDescendantIds(c)); }
  return ids;
}

function deriveContainers(nodes: TreeNode[], checked: Record<string, boolean>): void {
  for (const node of nodes) {
    if (!node.children?.length) continue;
    deriveContainers(node.children, checked);
    const total = countLeaves(node.children);
    const done  = countCheckedLeaves(node.children, checked);
    checked[node._id] = total > 0 && done === total;
  }
}

function countLeaves(nodes: TreeNode[]): number {
  let c = 0;
  for (const n of nodes) { if (!n.children?.length) c++; else c += countLeaves(n.children); }
  return c;
}

function countCheckedLeaves(nodes: TreeNode[], checked: Record<string, boolean>): number {
  let c = 0;
  for (const n of nodes) {
    if (!n.children?.length) { if (checked[n._id]) c++; }
    else c += countCheckedLeaves(n.children, checked);
  }
  return c;
}

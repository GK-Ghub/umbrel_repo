import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { Plan, TreeNode, Element } from '../types';
import { getPlan, getItems, savePackingProgress } from '../utils/api';
import { formatWeight, calcTreeWeight } from '../utils/weight';

export default function PlayModePage() {
  const { id } = useParams<{ id: string }>();
  const [plan,       setPlan]       = useState<Plan | null>(null);
  const [elementMap, setElementMap] = useState<Record<string, Element>>({});
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [checked,    setChecked]    = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([getPlan(id!), getItems()])
      .then(([p, items]) => {
        setPlan(p);
        // Restore saved packing progress
        if (p.packingProgress && Object.keys(p.packingProgress).length > 0) {
          setChecked(p.packingProgress as Record<string, boolean>);
        }
        const map: Record<string, Element> = {};
        items.forEach((i) => { map[i._id] = i; });
        setElementMap(map);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  /**
   * Toggle a node:
   * - If it's a container: cascade to ALL descendants, then re-derive
   *   ancestor containers' state from their children.
   * - If it's a leaf: flip it, then re-derive all ancestor containers.
   */
  const handleToggle = useCallback((node: TreeNode, tree: TreeNode[]) => {
    setChecked((prev) => {
      const next = { ...prev };
      const descendants = collectDescendantIds(node); // children only, not self
      const selfDone = prev[node._id];

      if (descendants.length > 0) {
        // Container: set self + all descendants to !selfDone
        next[node._id] = !selfDone;
        for (const nid of descendants) next[nid] = !selfDone;
      } else {
        // Leaf: just flip
        next[node._id] = !selfDone;
      }

      // Re-derive every container in the tree bottom-up
      deriveContainers(tree, next);
      // Persist after state update
      if (id) setTimeout(() => savePackingProgress(id, next).catch(() => {}), 0);
      return next;
    });
  }, [id]);

  const saveProgress = (progress: Record<string, boolean>) => {
    if (id) savePackingProgress(id, progress).catch(() => {});
  };

  const resetAll = () => {
    setChecked({});
    saveProgress({});
  };

  // Progress counts only leaf nodes (items without children)
  const totalLeaves = plan ? countLeaves(plan.tree) : 0;
  const doneLeaves  = plan ? countCheckedLeaves(plan.tree, checked) : 0;
  const progress    = totalLeaves > 0 ? Math.round((doneLeaves / totalLeaves) * 100) : 0;
  const totalWeight = calcTreeWeight(plan?.tree ?? [], elementMap);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <span className="spinner" />
    </div>
  );
  if (error || !plan) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center', color: 'var(--danger)' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
        <div>{error || 'Plan not found'}</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', padding: '14px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <Link to={`/plans/${id}`} style={{ color: 'var(--text3)', fontSize: 13, textDecoration: 'none' }}>
            ✏️ Edit
          </Link>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{plan.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {formatWeight(totalWeight)} · {totalLeaves} items
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={resetAll}>↺ Reset</button>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 6, background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              background: progress === 100 ? 'var(--accent)' : 'var(--accent2)',
              width: `${progress}%`, transition: 'width .3s ease',
            }} />
          </div>
          <span style={{ fontSize: 12, color: progress === 100 ? 'var(--accent)' : 'var(--text2)', fontWeight: 600, minWidth: 40, textAlign: 'right' }}>
            {progress}%
          </span>
        </div>
        {progress === 100 && (
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--accent)', textAlign: 'center', fontWeight: 600 }}>
            🎉 All packed! Have a great trip.
          </div>
        )}
      </div>

      {/* Tree */}
      <div style={{ flex: 1, padding: '12px 16px', maxWidth: 600, width: '100%', margin: '0 auto' }}>
        {plan.tree.length === 0 ? (
          <div className="empty-state"><div className="icon">📦</div><div>This plan is empty</div></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {plan.tree.map((node) => (
              <PlayNode
                key={node._id}
                node={node}
                elementMap={elementMap}
                checked={checked}
                onToggle={(n) => handleToggle(n, plan.tree)}
                depth={0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── PlayNode ──────────────────────────────────────────────────────────────────

interface PlayNodeProps {
  node: TreeNode;
  elementMap: Record<string, Element>;
  checked: Record<string, boolean>;
  onToggle: (node: TreeNode) => void;
  depth: number;
}

function PlayNode({ node, elementMap, checked, onToggle, depth }: PlayNodeProps) {
  const [open, setOpen] = useState(false);
  const el          = elementMap[node.elementId];
  const isContainer = el?.isContainer ?? (node.children?.length > 0);
  const isDone      = !!checked[node._id];

  // For containers: show x/y of direct leaf descendants (for the badge)
  const leafTotal   = countLeaves(node.children ?? []);
  const leafDone    = countCheckedLeaves(node.children ?? [], checked);

  const indentPx = depth * 18;

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: `10px 12px 10px ${12 + indentPx}px`,
          background: isDone
            ? 'rgba(255,255,255,0.02)'
            : depth === 0 ? 'var(--bg2)' : 'var(--bg3)',
          border: '1px solid var(--border)',
          borderLeft: depth > 0
            ? `2px solid rgba(110,231,183,${0.1 + depth * 0.07})`
            : '1px solid var(--border)',
          borderRadius: 10, marginBottom: 4,
          opacity: isDone ? 0.48 : 1,
          transition: 'opacity .2s',
          userSelect: 'none',
        }}
      >
        {/* Container expand toggle */}
        {isContainer ? (
          <span
            style={{ fontSize: 12, color: 'var(--text3)', minWidth: 14, cursor: 'pointer', padding: '2px 0' }}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? '▾' : '▸'}
          </span>
        ) : (
          <span style={{ minWidth: 14 }} />
        )}

        {/* Custom checkbox */}
        <div
          onClick={() => onToggle(node)}
          style={{
            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
            border: `2px solid ${isDone ? 'var(--accent)' : 'var(--border2)'}`,
            background: isDone ? 'var(--accent)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all .15s',
          }}
        >
          {isDone && <span style={{ color: '#0e0f11', fontSize: 13, fontWeight: 700 }}>✓</span>}
        </div>

        {/* Icon — click also opens container */}
        <span
          style={{ fontSize: 16, cursor: isContainer ? 'pointer' : 'default' }}
          onClick={isContainer ? () => setOpen((v) => !v) : undefined}
        >
          {isContainer ? '📦' : '🔹'}
        </span>

        {/* Name — click opens container */}
        <span
          style={{
            flex: 1, fontSize: 15, fontWeight: isContainer ? 600 : 400,
            textDecoration: isDone ? 'line-through' : 'none',
            color: isDone ? 'var(--text3)' : 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            cursor: isContainer ? 'pointer' : 'default',
          }}
          onClick={isContainer ? () => setOpen((v) => !v) : undefined}
        >
          {node.name}
        </span>

        {/* Container progress badge */}
        {isContainer && leafTotal > 0 && (
          <span style={{
            fontSize: 11, flexShrink: 0, padding: '2px 7px', borderRadius: 99,
            background: leafDone === leafTotal ? 'rgba(110,231,183,0.15)' : 'var(--bg)',
            color: leafDone === leafTotal ? 'var(--accent)' : 'var(--text3)',
            border: `1px solid ${leafDone === leafTotal ? 'rgba(110,231,183,0.3)' : 'var(--border)'}`,
            transition: 'all .2s',
          }}>
            {leafDone}/{leafTotal}
          </span>
        )}

        {/* Weight */}
        {el?.weight ? (
          <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
            {formatWeight(el.weight)}
          </span>
        ) : null}

        {el?.isLastMinute && (
          <span className="badge badge-warn" style={{ fontSize: 10, flexShrink: 0 }}>⚡</span>
        )}
      </div>

      {/* Children */}
      {open && node.children?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {node.children.map((child) => (
            <PlayNode
              key={child._id}
              node={child}
              elementMap={elementMap}
              checked={checked}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** IDs of all descendants (children, grandchildren…) — NOT including the node itself */
function collectDescendantIds(node: TreeNode): string[] {
  const ids: string[] = [];
  for (const c of node.children ?? []) {
    ids.push(c._id);
    ids.push(...collectDescendantIds(c));
  }
  return ids;
}

/**
 * Bottom-up: for every container node, set checked = (all leaves under it are checked).
 * This is derived state — we never "store" a container's checked state independently
 * of its children; we always re-derive it after any toggle.
 */
function deriveContainers(nodes: TreeNode[], checked: Record<string, boolean>): void {
  for (const node of nodes) {
    if (!node.children?.length) continue;          // leaf — skip
    deriveContainers(node.children, checked);       // recurse first (bottom-up)
    const leavesTotal  = countLeaves(node.children);
    const leavesDone   = countCheckedLeaves(node.children, checked);
    // Container is "checked" iff all its leaf descendants are checked
    checked[node._id] = leavesTotal > 0 && leavesDone === leavesTotal;
  }
}

/** Count leaf nodes (nodes with no children) */
function countLeaves(nodes: TreeNode[]): number {
  let c = 0;
  for (const n of nodes) {
    if (!n.children?.length) c++;
    else c += countLeaves(n.children);
  }
  return c;
}

/** Count checked leaf nodes */
function countCheckedLeaves(nodes: TreeNode[], checked: Record<string, boolean>): number {
  let c = 0;
  for (const n of nodes) {
    if (!n.children?.length) { if (checked[n._id]) c++; }
    else c += countCheckedLeaves(n.children, checked);
  }
  return c;
}

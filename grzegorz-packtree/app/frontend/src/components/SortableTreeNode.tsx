import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { TreeNode as TNode, Element } from '../types';
import { formatWeight, calcTreeWeight } from '../utils/weight';
import { getQrUrl } from '../utils/api';

export interface TreeNodeCallbacks {
  onAddToNode:    (elementId: string, parentNodeId: string) => void;
  onRemoveNode:   (nodeId: string) => void;
  onReorder:      (parentNodeId: string | null, orderedIds: string[]) => void;
  onSetQuantity?: (nodeId: string, qty: number) => void;
}

interface Props extends TreeNodeCallbacks {
  node:           TNode;
  elementMap:     Record<string, Element>;
  planId:         string;
  availableItems: Element[];
  depth:          number;
  /** ID currently being dragged-over (from parent DndContext) */
  activeOverId?:  string | null;
}

// ── Sortable wrapper ──────────────────────────────────────────────────────────
export function SortableTreeNode(props: Props) {
  const { node } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node._id });

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}>
      <TreeNodeInner {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ── Inner node ────────────────────────────────────────────────────────────────
interface InnerProps extends Props {
  dragHandleProps: Record<string, unknown>;
}

export function TreeNodeInner({
  node, elementMap, planId,
  onAddToNode, onRemoveNode, onSetQuantity,
  availableItems, depth, dragHandleProps, activeOverId,
}: InnerProps) {
  const [expanded,   setExpanded]   = useState(true);
  const [addingHere, setAddingHere] = useState(false);
  const [subSearch,  setSubSearch]  = useState('');
  const [showQr,     setShowQr]     = useState(false);
  const [editQty,    setEditQty]    = useState(false);

  const el          = elementMap[node.elementId];
  const ownWeight   = el?.weight ?? 0;
  const childWeight = calcTreeWeight(node.children ?? [], elementMap);
  const totalWeight = (ownWeight * (node.quantity ?? 1)) + childWeight;
  const isContainer = el?.isContainer ?? false;
  const childCount  = countDescendants(node);
  const qty         = node.quantity ?? 1;

  // Drop highlight — this node is being dragged over
  const isDropTarget = activeOverId === node._id;

  const filtered = availableItems.filter(
    (i) => subSearch === '' || i.name.toLowerCase().includes(subSearch.toLowerCase())
  );

  const bgColors = ['var(--bg2)', 'var(--bg3)', '#1a1d24', '#14161b'];
  const bg = bgColors[Math.min(depth, bgColors.length - 1)];
  const accentOpacity = 0.12 + depth * 0.08;

  // Container gets a droppable zone for highlighting
  const { setNodeRef: setDropRef, isOver: isOverDroppable } = useDroppable({ id: node._id });

  const showDropHighlight = isContainer && (isDropTarget || isOverDroppable);

  return (
    <div style={{ marginLeft: depth > 0 ? 18 : 0 }}>
      {/* Node row */}
      <div
        ref={isContainer ? setDropRef : undefined}
        style={{
          background: showDropHighlight ? 'rgba(110,231,183,0.1)' : bg,
          border: `1px solid ${showDropHighlight ? 'var(--accent2)' : 'var(--border)'}`,
          borderLeft: depth > 0 ? `2px solid rgba(110,231,183,${accentOpacity})` : undefined,
          borderRadius: 10,
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          transition: 'background .15s, border-color .15s',
          boxShadow: showDropHighlight ? '0 0 0 2px rgba(110,231,183,0.2)' : undefined,
        }}
      >
        {/* Drag handle */}
        <span {...dragHandleProps}
          style={{ cursor: 'grab', color: 'var(--text3)', fontSize: 14, padding: '0 2px', userSelect: 'none', touchAction: 'none', flexShrink: 0 }}
          title="Drag to reorder or move between containers">⠿</span>

        {/* Expand */}
        <button className="btn btn-ghost btn-sm"
          style={{ padding: '1px 4px', fontSize: 10, minWidth: 18, opacity: node.children?.length ? 1 : 0.25, flexShrink: 0 }}
          onClick={() => setExpanded((v) => !v)}
          disabled={!node.children?.length}>
          {expanded ? '▾' : '▸'}
        </button>

        <span style={{ fontSize: 15, flexShrink: 0 }}>{isContainer ? '📦' : '🔹'}</span>

        {/* Name + description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.name}
          </div>
          {el?.description && (
            <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
              {el.description}
            </div>
          )}
        </div>

        {/* Item count badge */}
        {isContainer && childCount > 0 && (
          <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99, background: showDropHighlight ? 'rgba(110,231,183,0.2)' : 'rgba(110,231,183,0.1)', color: 'var(--accent)', border: '1px solid rgba(110,231,183,0.25)', flexShrink: 0 }}>
            {childCount} item{childCount !== 1 ? 's' : ''}
          </span>
        )}

        {/* Quantity — only for non-containers */}
        {!isContainer && (
          editQty ? (
            <input
              type="number" min={1} max={999}
              defaultValue={qty}
              autoFocus
              onBlur={(e) => {
                const v = Math.max(1, parseInt(e.target.value) || 1);
                onSetQuantity?.(node._id, v);
                setEditQty(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditQty(false);
              }}
              style={{ width: 48, fontSize: 12, padding: '2px 6px', flexShrink: 0 }}
            />
          ) : (
            <span
              title="Click to set quantity"
              onClick={() => setEditQty(true)}
              style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: qty > 1 ? 'rgba(110,231,183,0.12)' : 'var(--bg3)', color: qty > 1 ? 'var(--accent)' : 'var(--text3)', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0, userSelect: 'none' }}
            >
              ×{qty}
            </span>
          )
        )}

        {/* Weight */}
        <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>
          {childWeight > 0 ? `${formatWeight(totalWeight)} total` : formatWeight(ownWeight * qty)}
        </span>

        {el?.isReturnable && <span className="badge"            style={{ fontSize: 10, flexShrink: 0 }}>↩</span>}
        {el?.isLastMinute && <span className="badge badge-warn" style={{ fontSize: 10, flexShrink: 0 }}>⚡</span>}

        {isContainer && (
          <button className="btn btn-ghost btn-sm" title="QR code"
            onClick={() => setShowQr((v) => !v)}
            style={{ fontSize: 12, padding: '2px 5px', flexShrink: 0 }}>⊞</button>
        )}

        {isContainer && (
          <button className="btn btn-ghost btn-sm"
            onClick={() => setAddingHere((v) => !v)}
            style={{ flexShrink: 0, fontSize: 12 }}>
            {addingHere ? '✕' : '+ Add'}
          </button>
        )}

        <button className="btn btn-danger btn-sm" title="Remove from plan"
          onClick={() => onRemoveNode(node._id)}
          style={{ flexShrink: 0, padding: '2px 6px', fontSize: 12 }}>✕</button>
      </div>

      {/* Drop hint label — show inside container when dragging over */}
      {showDropHighlight && (
        <div style={{ marginLeft: 18, marginTop: 2, padding: '4px 10px', fontSize: 11, color: 'var(--accent)', background: 'rgba(110,231,183,0.07)', borderRadius: 6, border: '1px dashed rgba(110,231,183,0.3)' }}>
          ↳ Drop inside "{node.name}"
        </div>
      )}

      {/* QR panel */}
      {showQr && (
        <div style={{ margin: '6px 0 4px 20px', padding: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <img src={getQrUrl(planId, node._id)} alt="QR" style={{ width: 150, height: 150, borderRadius: 6 }} />
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Scan to open this container</div>
        </div>
      )}

      {/* Add picker */}
      {addingHere && (
        <div style={{ margin: '4px 0 4px 20px', padding: 10, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <input placeholder="Search items to add…" value={subSearch}
            onChange={(e) => setSubSearch(e.target.value)}
            style={{ fontSize: 12, marginBottom: 8 }} autoFocus />
          <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filtered.length === 0
              ? <div style={{ color: 'var(--text3)', fontSize: 12, padding: 8 }}>No available items</div>
              : filtered.map((item) => (
                <div key={item._id}
                  style={{ padding: '6px 8px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, transition: 'border-color .12s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                  onClick={() => { onAddToNode(item._id, node._id); setAddingHere(false); setSubSearch(''); }}
                >
                  <span>{item.isContainer ? '📦' : '🔹'}</span>
                  <span style={{ flex: 1 }}>{item.name}</span>
                  {item.description && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{item.description}</span>}
                  <span style={{ color: 'var(--text3)', fontSize: 11 }}>{formatWeight(item.weight)}</span>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* Children */}
      {expanded && node.children?.length > 0 && (
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SortableContext items={node.children.map((c) => c._id)} strategy={verticalListSortingStrategy}>
            {node.children.map((child) => (
              <SortableTreeNode key={child._id} node={child} elementMap={elementMap}
                planId={planId} onAddToNode={onAddToNode} onRemoveNode={onRemoveNode}
                onReorder={() => {}} onSetQuantity={onSetQuantity}
                availableItems={availableItems} depth={depth + 1} activeOverId={activeOverId} />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

function countDescendants(node: TNode): number {
  let count = node.children?.length ?? 0;
  for (const child of node.children ?? []) count += countDescendants(child);
  return count;
}

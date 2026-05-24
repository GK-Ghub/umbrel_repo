import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragOverlay, DragStartEvent, DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Plan, Element, ReturnableResponse, ReturnableItem, TreeNode, PlanTemplate } from '../types';
import {
  getPlan, getItems, getPlans, addElementToPlan, removeElementFromPlan,
  reorderPlan, updatePlan, getReturnableList, moveNode,
  getTemplates, injectTemplate,
  savePackingProgress, setNodeQuantity, mergePlans,
} from '../utils/api';
import { formatWeight, calcTreeWeight } from '../utils/weight';
import { SortableTreeNode, TreeNodeInner } from '../components/SortableTreeNode';

const NOT_FOUND = Symbol('not_found');
const ROOT_DROP_ID   = '__root__';
const AVAILABLE_PREFIX = 'avail__';

const CATEGORIES = ['Electronics', 'Clothing', 'Food', 'Tools', 'Hygiene', 'Documents', 'Other'] as const;

export default function PlanEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [plan,         setPlan]         = useState<Plan | null>(null);
  const [allItems,     setAllItems]     = useState<Element[]>([]);
  const [elementMap,   setElementMap]   = useState<Record<string, Element>>({});
  const [returnable,   setReturnable]   = useState<ReturnableResponse | null>(null);
  const [view,         setView]         = useState<'tree' | 'returnable'>('tree');
  const [search,       setSearch]       = useState('');
  const [catFilter,    setCatFilter]    = useState('');
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [activeNode,   setActiveNode]   = useState<TreeNode | null>(null);
  const [activeAvail,  setActiveAvail]  = useState<Element | null>(null);
  const [currentOverId, setCurrentOverId] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showMergeModal,    setShowMergeModal]    = useState(false);
  const progressSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, items] = await Promise.all([getPlan(id!), getItems()]);
      setPlan(p);
      setAllItems(items);
      const map: Record<string, Element> = {};
      items.forEach((i) => { map[i._id] = i; });
      setElementMap(map);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const usedIds = new Set<string>(collectUsedIds(plan?.tree ?? []));

  const availableItems = allItems.filter((item) => {
    if (usedIds.has(item._id)) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (catFilter && !(item.categories ?? []).includes(catFilter as typeof CATEGORIES[number])) return false;
    return true;
  });

  const handleAddToRoot  = async (elementId: string) => {
    try { setPlan(await addElementToPlan(id!, { elementId })); }
    catch (err) { alert((err as Error).message); }
  };
  const handleAddToNode  = async (elementId: string, parentNodeId: string) => {
    try { setPlan(await addElementToPlan(id!, { elementId, parentNodeId })); }
    catch (err) { alert((err as Error).message); }
  };
  const handleRemoveNode = async (nodeId: string) => {
    try { setPlan(await removeElementFromPlan(id!, { nodeId })); }
    catch (err) { alert((err as Error).message); }
  };
  const handleSetQuantity = async (nodeId: string, quantity: number) => {
    try { setPlan(await setNodeQuantity(id!, { nodeId, quantity })); }
    catch (err) { alert((err as Error).message); }
  };
  const handleUpdateStatus = async (status: Plan['status']) => {
    try { setPlan(await updatePlan(id!, { status })); }
    catch (err) { alert((err as Error).message); }
  };
  const handleLoadReturnable = async () => {
    try { setReturnable(await getReturnableList(id!)); setView('returnable'); }
    catch (err) { alert((err as Error).message); }
  };

  // ── DnD ──────────────────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragStart = (e: DragStartEvent) => {
    if (!plan) return;
    const aid = e.active.id as string;
    if (aid.startsWith(AVAILABLE_PREFIX)) {
      setActiveAvail(elementMap[aid.slice(AVAILABLE_PREFIX.length)] ?? null);
    } else {
      setActiveNode(findNodeById(plan.tree, aid));
    }
  };

  const handleDragOver = (e: DragOverEvent) => {
    setCurrentOverId(e.over?.id as string ?? null);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveNode(null); setActiveAvail(null); setCurrentOverId(null);
    const { active, over } = e;
    if (!over || !plan) return;

    const activeId = active.id as string;
    const overId   = over.id   as string;

    // ── From available list ───────────────────────────────────────────────
    if (activeId.startsWith(AVAILABLE_PREFIX)) {
      const elementId = activeId.slice(AVAILABLE_PREFIX.length);
      if (overId === ROOT_DROP_ID) {
        await handleAddToRoot(elementId);
      } else {
        const overNode = findNodeById(plan.tree, overId);
        const overEl   = overNode ? elementMap[overNode.elementId] : undefined;
        const isCont   = overEl?.isContainer ?? (overNode?.children?.length ?? 0) > 0;
        if (isCont) {
          await handleAddToNode(elementId, overId);
        } else {
          const par = findParentId(plan.tree, overId);
          if (par !== NOT_FOUND && par !== null) await handleAddToNode(elementId, par as string);
          else await handleAddToRoot(elementId);
        }
      }
      return;
    }

    if (activeId === overId) return;

    // ── Move to root zone ─────────────────────────────────────────────────
    if (overId === ROOT_DROP_ID) {
      const ap = findParentId(plan.tree, activeId);
      if (ap === NOT_FOUND || ap === null) return;
      setPlan((prev) => {
        if (!prev) return prev;
        const tree = JSON.parse(JSON.stringify(prev.tree)) as TreeNode[];
        let moved: TreeNode | null = null;
        const pruned = extractNodeJs(tree, activeId, (n) => { moved = n; });
        if (!moved) return prev;
        pruned.push(moved!);
        return { ...prev, tree: pruned };
      });
      try { setPlan(await moveNode(id!, { nodeId: activeId, targetParentId: null, targetIndex: plan.tree.length })); }
      catch { void load(); }
      return;
    }

    // ── Tree node drag ────────────────────────────────────────────────────
    const apRaw = findParentId(plan.tree, activeId);
    const opRaw = findParentId(plan.tree, overId);
    if (apRaw === NOT_FOUND || opRaw === NOT_FOUND) return;

    const ap = apRaw as string | null;
    const op = opRaw as string | null;
    const overNode = findNodeById(plan.tree, overId);
    const overEl   = overNode ? elementMap[overNode.elementId] : undefined;
    const dropOnCont = overEl?.isContainer ?? (overNode?.children?.length ?? 0) > 0;

    if (dropOnCont && isDescendantOf(activeId, overId, plan.tree)) return;

    if (ap === op && !dropOnCont) {
      const siblings  = ap ? findNodeById(plan.tree, ap)?.children ?? [] : plan.tree;
      const ids       = siblings.map((n) => n._id);
      const reordered = arrayMove(ids, ids.indexOf(activeId), ids.indexOf(overId));
      setPlan((prev) => {
        if (!prev) return prev;
        if (!ap) { const byId = Object.fromEntries(prev.tree.map((n) => [n._id, n])); return { ...prev, tree: reordered.map((nid) => byId[nid]).filter(Boolean) }; }
        return { ...prev, tree: reorderInTree(prev.tree, ap, reordered) };
      });
      try { await reorderPlan(id!, { parentNodeId: ap, orderedNodeIds: reordered }); }
      catch { void load(); }
    } else {
      let targetParentId: string | null;
      let targetIndex: number;
      if (dropOnCont) {
        targetParentId = overId;
        targetIndex    = overNode?.children?.length ?? 0;
      } else {
        targetParentId = op;
        const sib = targetParentId ? findNodeById(plan.tree, targetParentId)?.children ?? [] : plan.tree;
        targetIndex = Math.max(0, sib.findIndex((n) => n._id === overId));
      }
      setPlan((prev) => {
        if (!prev) return prev;
        const tree = JSON.parse(JSON.stringify(prev.tree)) as TreeNode[];
        let moved: TreeNode | null = null;
        const pruned = extractNodeJs(tree, activeId, (n) => { moved = n; });
        if (!moved) return prev;
        if (!targetParentId) { pruned.splice(Math.min(targetIndex, pruned.length), 0, moved!); return { ...prev, tree: pruned }; }
        insertNodeAtJs(pruned, targetParentId, moved!, targetIndex);
        return { ...prev, tree: pruned };
      });
      try { setPlan(await moveNode(id!, { nodeId: activeId, targetParentId, targetIndex })); }
      catch { void load(); }
    }
  };

  const totalWeight = calcTreeWeight(plan?.tree ?? [], elementMap);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;
  if (error)   return <div className="page"><div style={{ color: 'var(--danger)', padding: 20 }}>Error: {error}</div></div>;
  if (!plan)   return <div className="page"><div className="empty-state">Plan not found</div></div>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter}
      onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

        {/* Top bar */}
        <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
          <Link to="/plans" style={{ color: 'var(--text3)', fontSize: 13 }}>← Plans</Link>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{plan.name}</div>
            {plan.description && <div style={{ fontSize: 12, color: 'var(--text3)' }}>{plan.description}</div>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>Total: <strong>{formatWeight(totalWeight)}</strong></div>
          <span className={`badge ${plan.status === 'active' ? 'badge-accent' : ''}`}>{plan.status}</span>
          {plan.status === 'draft' && (
            <button className="btn btn-primary btn-sm" onClick={() => handleUpdateStatus('active')}>Set active</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowMergeModal(true)}>⊕ Merge</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowTemplateModal(true)}>🧩 Template</button>
          <button className="btn btn-ghost btn-sm" onClick={handleLoadReturnable}>↩ Checklist</button>
          <Link to={`/play/${id}`} className="btn btn-primary btn-sm">▶ Play</Link>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: Available items */}
          <div style={{ width: 280, borderRight: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>
                Available ({availableItems.length})
              </div>
              <input placeholder="Search…" value={search}
                onChange={(e) => setSearch(e.target.value)} style={{ fontSize: 12 }} />
              <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
                style={{ fontSize: 12, width: '100%' }}>
                <option value="">All categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {availableItems.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                  {allItems.length === 0 ? 'No items yet' : 'No matching items'}
                </div>
              ) : availableItems.map((item) => (
                <AvailableItem key={item._id} item={item} elementMap={elementMap}
                  onAdd={handleAddToRoot}
                  isHighlighted={currentOverId === AVAILABLE_PREFIX + item._id} />
              ))}
            </div>
          </div>

          {/* Right: workspace */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {view === 'returnable' && returnable ? (
              <ReturnableView data={returnable} onBack={() => setView('tree')} />
            ) : (
              <>
                <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text3)' }}>
                  Click or drag items from the left. <strong>⠿</strong> reorders/moves. <strong>+ Add</strong> nests. <strong>✕</strong> returns to list. Drop to root zone below to ungroup.
                </div>
                <SortableContext items={plan.tree.map((n) => n._id)} strategy={verticalListSortingStrategy}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {plan.tree.map((node) => (
                      <SortableTreeNode key={node._id} node={node} elementMap={elementMap}
                        planId={id!} onAddToNode={handleAddToNode} onRemoveNode={handleRemoveNode}
                        onReorder={() => {}} onSetQuantity={handleSetQuantity}
                        availableItems={availableItems} depth={0} activeOverId={currentOverId} />
                    ))}
                  </div>
                </SortableContext>
                <RootDropZone isOver={currentOverId === ROOT_DROP_ID} />
              </>
            )}
          </div>
        </div>
      </div>

      {showTemplateModal && (
        <TemplateInjectModal planId={id!}
          onClose={() => setShowTemplateModal(false)}
          onDone={(u) => { setPlan(u); setShowTemplateModal(false); }} />
      )}
      {showMergeModal && (
        <MergePlanModal currentPlanId={id!}
          onClose={() => setShowMergeModal(false)}
          onDone={(u) => { setPlan(u); setShowMergeModal(false); }} />
      )}

      <DragOverlay>
        {activeNode ? (
          <div style={{ opacity: 0.9, pointerEvents: 'none' }}>
            <TreeNodeInner node={activeNode} elementMap={elementMap} planId={id!}
              onAddToNode={() => {}} onRemoveNode={() => {}} onReorder={() => {}}
              availableItems={[]} depth={0} dragHandleProps={{}} />
          </div>
        ) : activeAvail ? (
          <div style={{ opacity: 0.9, pointerEvents: 'none', padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--accent2)', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{activeAvail.isContainer ? '📦' : '🔹'}</span>
            <span>{activeAvail.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ── AvailableItem — expandable for ALL containers ─────────────────────────────

function AvailableItem({ item, elementMap, onAdd, isHighlighted }: {
  item: Element; elementMap: Record<string, Element>;
  onAdd: (id: string) => void; isHighlighted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dndId = AVAILABLE_PREFIX + item._id;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: dndId, data: { type: 'available', elementId: item._id } });

  // Show expand toggle for ANY container (not just ones with defaultContents)
  const canExpand = item.isContainer;

  // Children to show when expanded — defaultContents if defined, else just the label
  const defaultContents = (item.defaultContents ?? []).map((d) => {
    const eid = typeof d === 'string' ? d : (d as Element)._id;
    return elementMap[eid] ?? (typeof d === 'object' ? d as Element : null);
  }).filter(Boolean) as Element[];

  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.4 : 1, transform: CSS.Transform.toString(transform), transition }}>
      <div style={{
        padding: '7px 10px',
        background: isHighlighted ? 'rgba(110,231,183,0.1)' : 'var(--bg3)',
        border: `1px solid ${isHighlighted ? 'var(--accent2)' : 'var(--border)'}`,
        borderRadius: 8, display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, transition: 'all .12s',
      }}>
        <span {...attributes} {...listeners}
          style={{ cursor: 'grab', color: 'var(--text3)', fontSize: 13, touchAction: 'none', userSelect: 'none', flexShrink: 0 }}>⠿</span>

        {canExpand ? (
          <span onClick={() => setOpen((v) => !v)}
            style={{ cursor: 'pointer', fontSize: 11, color: 'var(--text3)', minWidth: 12, flexShrink: 0, userSelect: 'none' }}>
            {open ? '▾' : '▸'}
          </span>
        ) : <span style={{ minWidth: 12, flexShrink: 0 }} />}

        <span style={{ flexShrink: 0 }}>{item.isContainer ? '📦' : '🔹'}</span>

        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onAdd(item._id)}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
            {item.name}
          </div>
          {item.description && (
            <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.description}
            </div>
          )}
        </div>

        <span style={{ color: 'var(--text3)', fontSize: 11, flexShrink: 0 }}>{formatWeight(item.weight)}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => onAdd(item._id)}
          style={{ padding: '1px 7px', fontSize: 12, flexShrink: 0 }}>+</button>
      </div>

      {open && canExpand && (
        <div style={{ marginLeft: 18, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {defaultContents.length > 0 ? defaultContents.map((child) => (
            <div key={child._id} style={{ padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderLeft: '2px solid rgba(110,231,183,0.2)', borderRadius: 6, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text3)' }}>
              <span>{child.isContainer ? '📦' : '🔹'}</span>
              <span style={{ flex: 1 }}>{child.name}</span>
              <span>{formatWeight(child.weight)}</span>
            </div>
          )) : (
            <div style={{ padding: '4px 8px', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>
              Empty container — no default contents
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Root drop zone ────────────────────────────────────────────────────────────
function RootDropZone({ isOver }: { isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id: ROOT_DROP_ID });
  return (
    <div ref={setNodeRef} style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, border: `2px dashed ${isOver ? 'var(--accent2)' : 'var(--border)'}`, background: isOver ? 'rgba(110,231,183,0.07)' : 'transparent', textAlign: 'center', fontSize: 13, color: isOver ? 'var(--accent)' : 'var(--text3)', transition: 'all .15s', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <span style={{ fontSize: 16 }}>📤</span>
      {isOver ? 'Release to move to root level' : 'Drop here to ungroup (move to root)'}
    </div>
  );
}

// ── Merge plan modal ──────────────────────────────────────────────────────────
function MergePlanModal({ currentPlanId, onClose, onDone }: {
  currentPlanId: string; onClose: () => void; onDone: (u: Plan) => void;
}) {
  const [plans,   setPlans]   = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState('');
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    getPlans()
      .then((ps) => {
        const others = ps.filter((p) => p._id !== currentPlanId);
        setPlans(others);
        if (others.length) setSelected(others[0]._id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentPlanId]);

  const handleMerge = async () => {
    if (!selected) return;
    setSaving(true);
    try { onDone(await mergePlans(currentPlanId, { sourcePlanId: selected })); }
    catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>⊕ Merge plan</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>
          The selected plan's tree will be appended to this plan. Items that already exist here will be removed first to avoid duplicates.
        </p>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20 }}><span className="spinner" /></div>
        ) : plans.length === 0 ? (
          <div style={{ color: 'var(--text3)', fontSize: 13 }}>No other plans to merge from.</div>
        ) : (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--text2)' }}>
              Merge from
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                {plans.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleMerge} disabled={saving || !selected}>
                {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '⊕ Merge'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Template inject modal ─────────────────────────────────────────────────────
function TemplateInjectModal({ planId, onClose, onDone }: {
  planId: string; onClose: () => void; onDone: (u: Plan) => void;
}) {
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState('');
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    getTemplates().then((t) => { setTemplates(t); if (t.length) setSelected(t[0]._id); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleInject = async () => {
    if (!selected) return;
    setSaving(true);
    try { onDone(await injectTemplate(planId, { templateId: selected })); }
    catch (e) { alert((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>🧩 Inject template</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        {loading ? <div style={{ padding: 20, textAlign: 'center' }}><span className="spinner" /></div>
         : templates.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>No templates yet.</div>
         : <>
            <p style={{ fontSize: 13, color: 'var(--text3)' }}>
              Conflicting elements will be removed first to avoid duplicates.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
              {templates.map((t) => (
                <label key={t._id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${selected === t._id ? 'var(--accent2)' : 'var(--border)'}`, background: selected === t._id ? 'rgba(110,231,183,0.07)' : 'var(--bg3)', transition: 'all .12s' }}>
                  <input type="radio" name="tmpl" checked={selected === t._id} onChange={() => setSelected(t._id)} style={{ marginTop: 3, accentColor: 'var(--accent)' }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                    {t.description && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{t.description}</div>}
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{countNodes(t.tree)} items</div>
                  </div>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={handleInject} disabled={saving || !selected}>
                {saving ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '⬇ Inject'}
              </button>
            </div>
          </>}
      </div>
    </div>
  );
}

function countNodes(nodes: TreeNode[]): number {
  let c = nodes.length;
  for (const n of nodes) c += countNodes(n.children ?? []);
  return c;
}

// ── Returnable checklist ──────────────────────────────────────────────────────
function ReturnableView({ data, onBack }: { data: ReturnableResponse; onBack: () => void }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Back to tree</button>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Return-home checklist</h2>
      </div>
      {data.lastMinute.length > 0 && (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span className="badge badge-warn">⚡ Last minute</span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Pack right before departure</span>
        </div>
        <CheckList items={data.lastMinute} />
        <div style={{ margin: '20px 0', height: 1, background: 'var(--border)' }} />
      </>)}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Regular returnables</div>
      {data.regular.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>None</div> : <CheckList items={data.regular} />}
    </div>
  );
}
function CheckList({ items }: { items: ReturnableItem[] }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const groups: Record<string, ReturnableItem[]> = {};
  for (const item of items) { const k = item.path[0] ?? '— No container'; if (!groups[k]) groups[k] = []; groups[k].push(item); }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Object.entries(groups).map(([g, gi]) => (
        <div key={g} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg3)' }}>
            <span style={{ fontSize: 16 }}>📦</span>
            <span style={{ fontWeight: 600, flex: 1, fontSize: 14 }}>{g}</span>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{gi.filter((i) => checked[i._id]).length}/{gi.length}</span>
          </div>
          <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {gi.map((item) => (
              <label key={item._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 7, cursor: 'pointer', fontSize: 14, textDecoration: checked[item._id] ? 'line-through' : 'none', color: checked[item._id] ? 'var(--text3)' : 'var(--text)' }}>
                <input type="checkbox" checked={!!checked[item._id]} onChange={() => setChecked((c) => ({ ...c, [item._id]: !c[item._id] }))} style={{ width: 'auto', accentColor: 'var(--accent)' }} />
                <span style={{ flex: 1 }}>{item.name}</span>
                {item.path.length > 1 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{item.path.slice(1).join(' › ')}</span>}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tree helpers ──────────────────────────────────────────────────────────────
function collectUsedIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];
  for (const n of nodes) { ids.push(n.elementId); if (n.children?.length) ids.push(...collectUsedIds(n.children)); }
  return ids;
}
function findNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) { if (n._id === id) return n; const f = findNodeById(n.children ?? [], id); if (f) return f; }
  return null;
}
function findParentId(nodes: TreeNode[], nodeId: string, parentId: string | null = null): string | null | symbol {
  for (const n of nodes) {
    if (n._id === nodeId) return parentId;
    const f = findParentId(n.children ?? [], nodeId, n._id);
    if (f !== NOT_FOUND) return f;
  }
  return NOT_FOUND;
}
function isDescendantOf(activeId: string, containerId: string, nodes: TreeNode[]): boolean {
  const c = findNodeById(nodes, containerId);
  return c ? findNodeById(c.children ?? [], activeId) !== null : false;
}
function reorderInTree(nodes: TreeNode[], parentId: string, orderedIds: string[]): TreeNode[] {
  return nodes.map((n) => {
    if (n._id === parentId) { const b = Object.fromEntries(n.children.map((c) => [c._id, c])); return { ...n, children: orderedIds.map((cid) => b[cid]).filter(Boolean) }; }
    return { ...n, children: reorderInTree(n.children, parentId, orderedIds) };
  });
}
function extractNodeJs(nodes: TreeNode[], targetId: string, cb: (n: TreeNode) => void): TreeNode[] {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i]._id === targetId) { cb(nodes[i]); nodes.splice(i, 1); return nodes; }
    nodes[i] = { ...nodes[i], children: extractNodeJs(nodes[i].children ?? [], targetId, cb) };
  }
  return nodes;
}
function insertNodeAtJs(nodes: TreeNode[], parentId: string, node: TreeNode, index: number): boolean {
  for (const n of nodes) {
    if (n._id === parentId) { n.children.splice(Math.min(index, n.children.length), 0, node); return true; }
    if (n.children?.length && insertNodeAtJs(n.children, parentId, node, index)) return true;
  }
  return false;
}

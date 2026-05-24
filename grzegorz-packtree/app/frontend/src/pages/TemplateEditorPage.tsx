import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  DndContext, closestCenter,
  PointerSensor, useSensor, useSensors,
  DragEndEvent, DragOverlay, DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import type { PlanTemplate, Element, TreeNode } from '../types';
import {
  getTemplate, getItems,
  addElementToTemplate, removeElementFromTemplate,
  reorderTemplate, moveTemplateNode, updateTemplate,
} from '../utils/api';
import { formatWeight, calcTreeWeight } from '../utils/weight';
import { SortableTreeNode, TreeNodeInner } from '../components/SortableTreeNode';

const NOT_FOUND = Symbol('not_found');

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [tmpl,        setTmpl]        = useState<PlanTemplate | null>(null);
  const [allItems,    setAllItems]    = useState<Element[]>([]);
  const [elementMap,  setElementMap]  = useState<Record<string, Element>>({});
  const [search,      setSearch]      = useState('');
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [activeNode,  setActiveNode]  = useState<TreeNode | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameVal,     setNameVal]     = useState('');

  const load = useCallback(async () => {
    try {
      const [t, items] = await Promise.all([getTemplate(id!), getItems()]);
      setTmpl(t);
      setNameVal(t.name);
      const map: Record<string, Element> = {};
      items.forEach((i) => { map[i._id] = i; });
      setAllItems(items);
      setElementMap(map);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const usedIds = new Set<string>(collectUsedIds(tmpl?.tree ?? []));
  const defaultContentIds = new Set<string>(
    allItems.filter((i) => i.isContainer)
      .flatMap((i) => (i.defaultContents ?? []).map((d) => typeof d === 'string' ? d : (d as Element)._id))
  );
  const availableItems = allItems.filter(
    (item) => !usedIds.has(item._id) && !defaultContentIds.has(item._id) &&
      (search === '' || item.name.toLowerCase().includes(search.toLowerCase()))
  );

  const handleAddToRoot  = async (elementId: string) => {
    try { setTmpl(await addElementToTemplate(id!, { elementId })); }
    catch (err) { alert((err as Error).message); }
  };
  const handleAddToNode  = async (elementId: string, parentNodeId: string) => {
    try { setTmpl(await addElementToTemplate(id!, { elementId, parentNodeId })); }
    catch (err) { alert((err as Error).message); }
  };
  const handleRemoveNode = async (nodeId: string) => {
    try { setTmpl(await removeElementFromTemplate(id!, { nodeId })); }
    catch (err) { alert((err as Error).message); }
  };
  const handleSaveName = async () => {
    if (!nameVal.trim()) return;
    try { setTmpl(await updateTemplate(id!, { name: nameVal.trim() })); setEditingName(false); }
    catch (err) { alert((err as Error).message); }
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragStart = (event: DragStartEvent) => {
    if (!tmpl) return;
    setActiveNode(findNodeById(tmpl.tree, event.active.id as string));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveNode(null);
    const { active, over } = event;
    if (!over || active.id === over.id || !tmpl) return;

    const activeId = active.id as string;
    const overId   = over.id   as string;
    const activeParentRaw = findParentId(tmpl.tree, activeId);
    const overParentRaw   = findParentId(tmpl.tree, overId);
    if (activeParentRaw === NOT_FOUND || overParentRaw === NOT_FOUND) return;

    const activeParentId = activeParentRaw as string | null;
    const overParentId   = overParentRaw   as string | null;
    const overNode       = findNodeById(tmpl.tree, overId);
    const overEl         = overNode ? elementMap[overNode.elementId] : undefined;
    const droppingOnContainer = overEl?.isContainer ?? false;

    if (droppingOnContainer && isDescendantOf(activeId, overId, tmpl.tree)) return;

    if (activeParentId === overParentId && !droppingOnContainer) {
      const siblings  = activeParentId ? findNodeById(tmpl.tree, activeParentId)?.children ?? [] : tmpl.tree;
      const ids       = siblings.map((n) => n._id);
      const reordered = arrayMove(ids, ids.indexOf(activeId), ids.indexOf(overId));
      setTmpl((prev) => {
        if (!prev) return prev;
        if (!activeParentId) {
          const byId = Object.fromEntries(prev.tree.map((n) => [n._id, n]));
          return { ...prev, tree: reordered.map((nid) => byId[nid]).filter(Boolean) };
        }
        return { ...prev, tree: reorderInTree(prev.tree, activeParentId, reordered) };
      });
      try { await reorderTemplate(id!, { parentNodeId: activeParentId, orderedNodeIds: reordered }); }
      catch { void load(); }
    } else {
      let targetParentId: string | null;
      let targetIndex: number;
      if (droppingOnContainer) {
        targetParentId = overId;
        targetIndex    = overNode?.children?.length ?? 0;
      } else {
        targetParentId = overParentId;
        const siblings = targetParentId ? findNodeById(tmpl.tree, targetParentId)?.children ?? [] : tmpl.tree;
        targetIndex    = Math.max(0, siblings.findIndex((n) => n._id === overId));
      }
      setTmpl((prev) => {
        if (!prev) return prev;
        const tree = JSON.parse(JSON.stringify(prev.tree)) as TreeNode[];
        let moved: TreeNode | null = null;
        const pruned = extractNodeJs(tree, activeId, (n) => { moved = n; });
        if (!moved) return prev;
        if (!targetParentId) { pruned.splice(Math.min(targetIndex, pruned.length), 0, moved!); return { ...prev, tree: pruned }; }
        insertNodeAtJs(pruned, targetParentId, moved!, targetIndex);
        return { ...prev, tree: pruned };
      });
      try { await moveTemplateNode(id!, { nodeId: activeId, targetParentId, targetIndex }); }
      catch { void load(); }
    }
  };

  const totalWeight = calcTreeWeight(tmpl?.tree ?? [], elementMap);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;
  if (error)   return <div className="page"><div style={{ color: 'var(--danger)', padding: 20 }}>Error: {error}</div></div>;
  if (!tmpl)   return <div className="page"><div className="empty-state">Template not found</div></div>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter}
      onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

        {/* Top bar */}
        <div style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap' }}>
          <Link to="/templates" style={{ color: 'var(--text3)', fontSize: 13 }}>← Templates</Link>

          <div style={{ flex: 1, minWidth: 120 }}>
            {editingName ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={nameVal} onChange={(e) => setNameVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                  style={{ fontSize: 15, fontWeight: 600, maxWidth: 280 }} autoFocus />
                <button className="btn btn-primary btn-sm" onClick={() => void handleSaveName()}>Save</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingName(false)}>✕</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => setEditingName(true)} title="Click to rename">
                <span style={{ fontWeight: 600, fontSize: 16 }}>{tmpl.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>✏️</span>
              </div>
            )}
          </div>

          <span className="badge">template</span>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            Total: <strong>{formatWeight(totalWeight)}</strong>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left: available items */}
          <div style={{ width: 260, borderRight: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>
                Available ({availableItems.length})
              </div>
              <input placeholder="Filter…" value={search}
                onChange={(e) => setSearch(e.target.value)} style={{ fontSize: 13 }} />
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {availableItems.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                  {allItems.length === 0 ? 'No items yet' : 'All items used'}
                </div>
              ) : availableItems.map((item) => (
                <div key={item._id}
                  style={{ padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, transition: 'border-color .15s' }}
                  onClick={() => handleAddToRoot(item._id)}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <span>{item.isContainer ? '📦' : '🔹'}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                  <span style={{ color: 'var(--text3)', fontSize: 11 }}>{formatWeight(item.weight)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: tree workspace */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text3)' }}>
              Build the template tree exactly like a plan. Drag <strong>⠿</strong> to reorder or move between containers.
            </div>
            {tmpl.tree.length === 0 ? (
              <div className="empty-state">
                <div className="icon">🧩</div>
                <div>Click items on the left to build the template</div>
              </div>
            ) : (
              <SortableContext items={tmpl.tree.map((n) => n._id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tmpl.tree.map((node) => (
                    <SortableTreeNode
                      key={node._id}
                      node={node}
                      elementMap={elementMap}
                      planId={id!}
                      onAddToNode={handleAddToNode}
                      onRemoveNode={handleRemoveNode}
                      onReorder={() => {}}
                      availableItems={availableItems}
                      depth={0}
                    />
                  ))}
                </div>
              </SortableContext>
            )}
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeNode ? (
          <div style={{ opacity: 0.9, pointerEvents: 'none' }}>
            <TreeNodeInner node={activeNode} elementMap={elementMap} planId={id!}
              onAddToNode={() => {}} onRemoveNode={() => {}} onReorder={() => {}}
              availableItems={[]} depth={0} dragHandleProps={{}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

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
    if (n._id === parentId) { const byId = Object.fromEntries(n.children.map((c) => [c._id, c])); return { ...n, children: orderedIds.map((cid) => byId[cid]).filter(Boolean) }; }
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

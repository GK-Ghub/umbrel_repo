import { Router } from 'express';
import mongoose from 'mongoose';
import Plan from '../models/Plan.js';
import Element from '../models/Element.js';
import { Template } from '../models/Plan.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: All static routes (/templates/*, etc.) MUST come before /:id
// wildcards, otherwise Express matches "templates" as an :id value.
// ─────────────────────────────────────────────────────────────────────────────

// ── Static plan routes ────────────────────────────────────────────────────────

router.get('/', async (_req, res) => {
  try { res.json(await Plan.find().select('name description status createdAt updatedAt').sort({ updatedAt: -1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try { res.status(201).json(await Plan.create(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// ── Template routes (before /:id wildcard) ───────────────────────────────────

router.get('/templates/list', async (_req, res) => {
  try { res.json(await Template.find().sort({ updatedAt: -1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/templates/create', async (req, res) => {
  try {
    const { name, description = '', sourcePlanId } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    let tree = [];
    if (sourcePlanId) {
      const plan = await Plan.findById(sourcePlanId);
      if (plan) tree = JSON.parse(JSON.stringify(plan.tree));
    }
    res.status(201).json(await Template.create({ name, description, tree }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/templates/:id/add-element', async (req, res) => {
  try {
    const { elementId, parentNodeId } = req.body;
    const [tmpl, element] = await Promise.all([Template.findById(req.params.id), Element.findById(elementId).populate('defaultContents')]);
    if (!tmpl || !element) return res.status(404).json({ error: 'Not found' });
    const newNode = makeNode(element, element.defaultContents);
    const tree = JSON.parse(JSON.stringify(tmpl.tree));
    if (!parentNodeId) tree.push(newNode);
    else if (!insertNode(tree, parentNodeId, newNode)) return res.status(400).json({ error: 'Parent not found' });
    tmpl.tree = tree; tmpl.markModified('tree'); await tmpl.save();
    res.json(tmpl);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/templates/:id/remove-element', async (req, res) => {
  try {
    const { nodeId } = req.body;
    if (!nodeId) return res.status(400).json({ error: 'nodeId required' });
    const tmpl = await Template.findById(req.params.id);
    if (!tmpl) return res.status(404).json({ error: 'Not found' });
    let tree = JSON.parse(JSON.stringify(tmpl.tree));
    tree = removeNodeById(tree, nodeId);
    tmpl.tree = tree; tmpl.markModified('tree'); await tmpl.save();
    res.json(tmpl);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/templates/:id/reorder', async (req, res) => {
  try {
    const { parentNodeId, orderedNodeIds } = req.body;
    const tmpl = await Template.findById(req.params.id);
    if (!tmpl) return res.status(404).json({ error: 'Not found' });
    let tree = JSON.parse(JSON.stringify(tmpl.tree));
    if (!parentNodeId) tree = reorderChildren(tree, orderedNodeIds);
    else reorderInTree(tree, parentNodeId, orderedNodeIds);
    tmpl.tree = tree; tmpl.markModified('tree'); await tmpl.save();
    res.json(tmpl);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/templates/:id/move-node', async (req, res) => {
  try {
    const { nodeId, targetParentId, targetIndex = 0 } = req.body;
    if (!nodeId) return res.status(400).json({ error: 'nodeId required' });
    const tmpl = await Template.findById(req.params.id);
    if (!tmpl) return res.status(404).json({ error: 'Not found' });
    let tree = JSON.parse(JSON.stringify(tmpl.tree));
    let extracted = null;
    tree = extractNode(tree, nodeId, (n) => { extracted = n; });
    if (!extracted) return res.status(400).json({ error: 'Node not found' });
    if (!targetParentId) tree.splice(Math.min(targetIndex, tree.length), 0, extracted);
    else if (!insertNodeAt(tree, targetParentId, extracted, targetIndex))
      return res.status(400).json({ error: 'Target parent not found' });
    tmpl.tree = tree; tmpl.markModified('tree'); await tmpl.save();
    res.json(tmpl);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/templates/:id', async (req, res) => {
  try {
    const t = await Template.findById(req.params.id);
    if (!t) return res.status(404).json({ error: 'Not found' });
    res.json(t);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/templates/:id', async (req, res) => {
  try {
    const t = await Template.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!t) return res.status(404).json({ error: 'Not found' });
    res.json(t);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/templates/:id', async (req, res) => {
  try { await Template.findByIdAndDelete(req.params.id); res.json({ deleted: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Plan wildcard routes (/:id must come AFTER all static paths) ──────────────

router.get('/:id', async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Not found' });
    res.json(plan);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!plan) return res.status(404).json({ error: 'Not found' });
    res.json(plan);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const plan = await Plan.findByIdAndDelete(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/add-element', async (req, res) => {
  try {
    const { elementId, parentNodeId } = req.body;
    const [plan, element] = await Promise.all([Plan.findById(req.params.id), Element.findById(elementId).populate('defaultContents')]);
    if (!plan || !element) return res.status(404).json({ error: 'Not found' });
    const newNode = makeNode(element, element.defaultContents);
    const tree = JSON.parse(JSON.stringify(plan.tree));
    if (!parentNodeId) tree.push(newNode);
    else if (!insertNode(tree, parentNodeId, newNode)) return res.status(400).json({ error: 'Parent not found' });
    [element._id, ...element.defaultContents.map((c) => c._id)].forEach((id) => plan.usedElementIds.addToSet(id));
    plan.tree = tree; plan.markModified('tree'); plan.markModified('usedElementIds');
    await plan.save(); res.json(plan);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:id/remove-element', async (req, res) => {
  try {
    const { nodeId } = req.body;
    if (!nodeId) return res.status(400).json({ error: 'nodeId required' });
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Not found' });
    let tree = JSON.parse(JSON.stringify(plan.tree));
    if (collectElementIdsUnder(tree, nodeId).length === 0)
      return res.status(400).json({ error: 'Node not found in tree' });
    tree = removeNodeById(tree, nodeId);
    plan.tree = tree;
    plan.usedElementIds = collectAllElementIds(tree);
    plan.markModified('tree'); plan.markModified('usedElementIds');
    await plan.save(); res.json(plan);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:id/reorder', async (req, res) => {
  try {
    const { parentNodeId, orderedNodeIds } = req.body;
    if (!Array.isArray(orderedNodeIds)) return res.status(400).json({ error: 'orderedNodeIds must be array' });
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Not found' });
    let tree = JSON.parse(JSON.stringify(plan.tree));
    if (!parentNodeId) tree = reorderChildren(tree, orderedNodeIds);
    else if (!reorderInTree(tree, parentNodeId, orderedNodeIds)) return res.status(400).json({ error: 'Parent not found' });
    plan.tree = tree; plan.markModified('tree'); await plan.save(); res.json(plan);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:id/move-node', async (req, res) => {
  try {
    const { nodeId, targetParentId, targetIndex = 0 } = req.body;
    if (!nodeId) return res.status(400).json({ error: 'nodeId required' });
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Not found' });
    let tree = JSON.parse(JSON.stringify(plan.tree));
    if (targetParentId) {
      const descIds = gatherAllNodeIds(findNodeInTree(tree, nodeId));
      if (descIds.includes(targetParentId)) return res.status(400).json({ error: 'Cannot move into own descendant' });
    }
    let extracted = null;
    tree = extractNode(tree, nodeId, (n) => { extracted = n; });
    if (!extracted) return res.status(400).json({ error: 'Node not found' });
    if (!targetParentId) tree.splice(Math.min(targetIndex, tree.length), 0, extracted);
    else if (!insertNodeAt(tree, targetParentId, extracted, targetIndex)) return res.status(400).json({ error: 'Target parent not found' });
    plan.tree = tree; plan.markModified('tree'); await plan.save(); res.json(plan);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:id/inject-template', async (req, res) => {
  try {
    const { templateId, parentNodeId } = req.body;
    if (!templateId) return res.status(400).json({ error: 'templateId required' });
    const [plan, template] = await Promise.all([Plan.findById(req.params.id), Template.findById(templateId)]);
    if (!plan || !template) return res.status(404).json({ error: 'Not found' });
    const cloned = deepCloneTree(template.tree);
    let tree = JSON.parse(JSON.stringify(plan.tree));
    // Remove conflicting elements first
    const newElemIds = collectAllElementIds(cloned).map(String);
    for (const eid of newElemIds) {
      for (const nid_ of findNodesByElementId(tree, eid)) tree = removeNodeById(tree, nid_);
    }
    if (!parentNodeId) tree.push(...cloned);
    else for (const node of cloned) if (!insertNode(tree, parentNodeId, node)) return res.status(400).json({ error: 'Parent not found' });
    plan.tree = tree;
    plan.usedElementIds = collectAllElementIds(tree);
    plan.markModified('tree'); plan.markModified('usedElementIds');
    await plan.save(); res.json(plan);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.patch('/:id/packing-progress', async (req, res) => {
  try {
    const { progress } = req.body;
    if (typeof progress !== 'object' || progress === null) return res.status(400).json({ error: 'progress must be object' });
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Not found' });
    plan.packingProgress = progress;
    plan.markModified('packingProgress');
    await plan.save(); res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.patch('/:id/node-quantity', async (req, res) => {
  try {
    const { nodeId, quantity } = req.body;
    if (!nodeId || quantity < 1) return res.status(400).json({ error: 'nodeId and quantity >= 1 required' });
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Not found' });
    const tree = JSON.parse(JSON.stringify(plan.tree));
    if (!setNodeQuantity(tree, nodeId, quantity)) return res.status(400).json({ error: 'Node not found' });
    plan.tree = tree; plan.markModified('tree'); await plan.save(); res.json(plan);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:id/merge', async (req, res) => {
  try {
    const { sourcePlanId } = req.body;
    if (!sourcePlanId) return res.status(400).json({ error: 'sourcePlanId required' });
    const [plan, source] = await Promise.all([Plan.findById(req.params.id), Plan.findById(sourcePlanId)]);
    if (!plan || !source) return res.status(404).json({ error: 'Plan not found' });
    const cloned = deepCloneTree(source.tree);
    let tree = JSON.parse(JSON.stringify(plan.tree));
    const sourceElemIds = collectAllElementIds(cloned).map(String);
    for (const eid of sourceElemIds) {
      for (const nid_ of findNodesByElementId(tree, eid)) tree = removeNodeById(tree, nid_);
    }
    tree.push(...cloned);
    plan.tree = tree;
    plan.usedElementIds = collectAllElementIds(tree);
    plan.markModified('tree'); plan.markModified('usedElementIds');
    await plan.save(); res.json(plan);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/:id/returnable', async (req, res) => {
  try {
    const plan = await Plan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Not found' });
    const tree = JSON.parse(JSON.stringify(plan.tree));
    const pathMap = buildPathMap(tree, []);
    const elements = await Element.find({ _id: { $in: collectAllElementIds(tree) }, isReturnable: true }).select('name isLastMinute imagePath');
    const toItem = (e) => ({ _id: e._id, name: e.name, isLastMinute: e.isLastMinute, imagePath: e.imagePath, path: pathMap[e._id.toString()] ?? [] });
    res.json({ lastMinute: elements.filter((e) => e.isLastMinute).map(toItem), regular: elements.filter((e) => !e.isLastMinute).map(toItem) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeNode(element, defaultContents = []) {
  return {
    _id: new mongoose.Types.ObjectId().toString(),
    elementId: element._id.toString(),
    name: element.name,
    state: '',
    quantity: 1,
    children: defaultContents.map((child) => ({
      _id: new mongoose.Types.ObjectId().toString(),
      elementId: child._id.toString(),
      name: child.name,
      state: '',
      quantity: 1,
      children: [],
    })),
  };
}

const nid = (n) => (n._id ?? '').toString();

function findNodeInTree(nodes, targetId) {
  for (const n of nodes) {
    if (nid(n) === targetId) return n;
    const found = findNodeInTree(n.children ?? [], targetId);
    if (found) return found;
  }
  return null;
}

function gatherAllNodeIds(node) {
  if (!node) return [];
  return [nid(node), ...(node.children ?? []).flatMap(gatherAllNodeIds)];
}

function insertNode(nodes, targetId, newNode) {
  for (const node of nodes) {
    if (nid(node) === targetId) { node.children.push(newNode); return true; }
    if (node.children?.length && insertNode(node.children, targetId, newNode)) return true;
  }
  return false;
}

function removeNodeById(nodes, targetId) {
  return nodes
    .filter((n) => nid(n) !== targetId)
    .map((n) => ({ ...n, children: removeNodeById(n.children ?? [], targetId) }));
}

function collectElementIdsUnder(nodes, targetId) {
  for (const node of nodes) {
    if (nid(node) === targetId) return gatherElementIds(node);
    const found = collectElementIdsUnder(node.children ?? [], targetId);
    if (found.length) return found;
  }
  return [];
}

function gatherElementIds(node) {
  const ids = [node.elementId?.toString()].filter(Boolean);
  for (const c of node.children ?? []) ids.push(...gatherElementIds(c));
  return ids;
}

function collectAllElementIds(nodes) {
  const ids = [];
  for (const n of nodes) {
    if (n.elementId) ids.push(n.elementId);
    if (n.children?.length) ids.push(...collectAllElementIds(n.children));
  }
  return ids;
}

function reorderChildren(nodes, orderedIds) {
  const byId = Object.fromEntries(nodes.map((n) => [nid(n), n]));
  return orderedIds.map((id) => byId[id]).filter(Boolean);
}

function reorderInTree(nodes, parentId, orderedIds) {
  for (const node of nodes) {
    if (nid(node) === parentId) { node.children = reorderChildren(node.children ?? [], orderedIds); return true; }
    if (node.children?.length && reorderInTree(node.children, parentId, orderedIds)) return true;
  }
  return false;
}

function extractNode(nodes, targetId, cb) {
  for (let i = 0; i < nodes.length; i++) {
    if (nid(nodes[i]) === targetId) { const [r] = nodes.splice(i, 1); cb(r); return nodes; }
    nodes[i].children = extractNode(nodes[i].children ?? [], targetId, cb);
  }
  return nodes;
}

function insertNodeAt(nodes, targetParentId, node, index) {
  for (const n of nodes) {
    if (nid(n) === targetParentId) { n.children.splice(Math.min(index, n.children.length), 0, node); return true; }
    if (n.children?.length && insertNodeAt(n.children, targetParentId, node, index)) return true;
  }
  return false;
}

function buildPathMap(nodes, parentPath) {
  const map = {};
  for (const node of nodes) {
    const myPath = [...parentPath, node.name];
    map[(node.elementId ?? '').toString()] = parentPath;
    if (node.children?.length) Object.assign(map, buildPathMap(node.children, myPath));
  }
  return map;
}

function deepCloneTree(nodes) {
  return (nodes ?? []).map((node) => ({
    _id: new mongoose.Types.ObjectId().toString(),
    elementId: node.elementId,
    name: node.name,
    state: '',
    quantity: node.quantity ?? 1,
    children: deepCloneTree(node.children),
  }));
}

function setNodeQuantity(nodes, targetId, quantity) {
  for (const node of nodes) {
    if (nid(node) === targetId) { node.quantity = quantity; return true; }
    if (node.children?.length && setNodeQuantity(node.children, targetId, quantity)) return true;
  }
  return false;
}

function findNodesByElementId(nodes, elementId, result = []) {
  for (const node of nodes) {
    if (String(node.elementId) === String(elementId)) result.push(String(node._id));
    if (node.children?.length) findNodesByElementId(node.children, elementId, result);
  }
  return result;
}

export default router;

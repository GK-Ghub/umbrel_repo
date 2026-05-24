import { Router } from 'express';
import mongoose from 'mongoose';
import Trip from '../models/Trip.js';
import Plan from '../models/Plan.js';

const router = Router();

const nid = (n) => (n._id ?? '').toString();

/**
 * Deep clone a plan tree into a trip plan tree.
 * We store the original node's ID as 'sourceNodeId' so we can 
 * track identity during future syncs.
 */
function deepCloneTree(nodes) {
  return (nodes ?? []).map((node) => ({
    _id: new mongoose.Types.ObjectId().toString(),
    sourceNodeId: node._id, // Store origin
    elementId: node.elementId,
    name: node.name,
    state: node.state || '',
    quantity: node.quantity ?? 1,
    children: deepCloneTree(node.children),
  }));
}

/**
 * Merge a fresh tree from a source plan into an existing trip plan tree.
 * If a node with the same sourceNodeId already exists in the trip, we reuse its trip-level _id.
 * This preserves packing progress (which is keyed by trip-level _id).
 */
function mergeTrees(sourcePlanNodes, currentTripNodes) {
  // Map sourceNodeId -> current trip _id
  const sourceToTripId = new Map();
  const walk = (nodes) => nodes.forEach(n => {
    if (n.sourceNodeId) sourceToTripId.set(n.sourceNodeId.toString(), nid(n));
    walk(n.children || []);
  });
  walk(currentTripNodes);

  const build = (sNodes) => sNodes.map(sn => {
    const snId = nid(sn);
    const existingTripId = sourceToTripId.get(snId);
    return {
      _id: existingTripId || new mongoose.Types.ObjectId().toString(),
      sourceNodeId: snId,
      elementId: sn.elementId,
      name: sn.name,
      state: sn.state || '',
      quantity: sn.quantity ?? 1,
      children: build(sn.children || []),
    };
  });

  return build(sourcePlanNodes);
}

function removeNodeById(nodes, targetId) {
  return nodes
    .filter((n) => nid(n) !== targetId)
    .map((n) => ({ ...n, children: removeNodeById(n.children ?? [], targetId) }));
}

// GET /api/trips — list all trips
router.get('/', async (_req, res) => {
  try {
    const trips = await Trip.find().sort({ updatedAt: -1 });
    res.json(trips);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/trips/:id — full trip
router.get('/:id', async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Not found' });
    res.json(trip);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/trips — create trip
router.post('/', async (req, res) => {
  try {
    const { name, description = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    res.status(201).json(await Trip.create({ name, description, plans: [] }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// PATCH /api/trips/:id — update basic info
router.patch('/:id', async (req, res) => {
  try {
    const trip = await Trip.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!trip) return res.status(404).json({ error: 'Not found' });
    res.json(trip);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// DELETE /api/trips/:id
router.delete('/:id', async (req, res) => {
  try {
    await Trip.findByIdAndDelete(req.params.id);
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/trips/:id/add-plan — SNAPSHOT a plan into the trip
router.post('/:id/add-plan', async (req, res) => {
  try {
    const { planId } = req.body;
    const [trip, plan] = await Promise.all([Trip.findById(req.params.id), Plan.findById(planId)]);
    if (!trip || !plan) return res.status(404).json({ error: 'Not found' });

    // Create a deep copy of the plan's tree
    const snapshot = {
      name: plan.name,
      description: plan.description,
      tree: deepCloneTree(plan.tree),
      sourcePlanId: plan._id,
    };

    trip.plans.push(snapshot);
    await trip.save();
    res.json(trip);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// DELETE /api/trips/:id/remove-plan/:planId (here planId is the _id of the trip-plan subdoc)
router.delete('/:id/remove-plan/:planId', async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Not found' });
    trip.plans = trip.plans.filter((p) => p._id.toString() !== req.params.planId);
    await trip.save();
    res.json(trip);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// POST /api/trips/:id/remove-element — remove element from a specific plan snapshot in the trip
router.post('/:id/remove-element', async (req, res) => {
  try {
    const { nodeId } = req.body; // In the new architecture, we can search all plans for this nodeId
    if (!nodeId) return res.status(400).json({ error: 'nodeId required' });
    
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Not found' });

    // Iterate through all plans in the trip and remove the node from wherever it is
    trip.plans.forEach((plan) => {
      plan.tree = removeNodeById(plan.tree, nodeId);
    });
    
    trip.markModified('plans');
    await trip.save();
    res.json(trip);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// POST /api/trips/:id/resolve-conflict — keep element in one plan, remove from others
router.post('/:id/resolve-conflict', async (req, res) => {
  try {
    const { elementId, keepInPlanId } = req.body;
    if (!elementId || !keepInPlanId) return res.status(400).json({ error: 'elementId and keepInPlanId required' });

    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Not found' });

    // Iterate through plans and remove the element from those that are NOT the "keep" plan
    trip.plans.forEach((plan) => {
      if (plan._id.toString() !== keepInPlanId) {
        // We need a helper to remove by elementId (not just nodeId)
        plan.tree = removeNodesByElementId(plan.tree, elementId);
      }
    });

    trip.markModified('plans');
    await trip.save();
    res.json(trip);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Helper for conflict resolution
function removeNodesByElementId(nodes, elementId) {
  return nodes
    .filter((n) => n.elementId.toString() !== elementId.toString())
    .map((n) => ({ ...n, children: removeNodesByElementId(n.children ?? [], elementId) }));
}

// PATCH /api/trips/:id/packing-progress
router.patch('/:id/packing-progress', async (req, res) => {
  try {
    const { progress } = req.body;
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Not found' });
    trip.packingProgress = progress;
    trip.markModified('packingProgress');
    await trip.save();
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// POST /api/trips/:id/sync — update trip plans from source plans
router.post('/:id/sync', async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Not found' });

    // 1. Identify all elementIds that were explicitly removed from the trip
    // Actually, it's easier to just re-apply the logic of "what is missing compared to source"
    // But the user's goal is to bring in NEW items.
    // A simple approach: for each plan in trip that has sourcePlanId:
    //   - Get current source plan
    //   - If we want to be smart, we only add what's missing.
    //   - If we want to be safe, we replace but somehow "remember" what was deleted.
    
    // Better strategy: 
    // For each plan:
    //   - Note which elementIds are currently in the trip-plan.
    //   - Note which elementIds are in the source-plan.
    //   - Add missing nodes from source-plan to trip-plan.
    
    const updatedPlans = await Promise.all(trip.plans.map(async (tripPlan) => {
      if (!tripPlan.sourcePlanId) return tripPlan;
      
      const sourcePlan = await Plan.findById(tripPlan.sourcePlanId);
      if (!sourcePlan) return tripPlan;

      // Use mergeTrees to preserve _ids of existing nodes
      tripPlan.tree = mergeTrees(sourcePlan.tree, tripPlan.tree);
      tripPlan.name = sourcePlan.name;
      tripPlan.description = sourcePlan.description;
      
      return tripPlan;
    }));

    trip.plans = updatedPlans;
    trip.markModified('plans');
    await trip.save();
    res.json(trip);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;

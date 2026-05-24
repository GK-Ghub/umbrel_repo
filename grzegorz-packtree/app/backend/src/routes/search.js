import { Router } from 'express';
import Plan from '../models/Plan.js';
import Element from '../models/Element.js';

const router = Router();

// GET /api/search?q=battery&planId=xxx
// Returns all matching nodes with their full breadcrumb paths
router.get('/', async (req, res) => {
  try {
    const { q, planId } = req.query;
    if (!q) return res.json([]);

    const regex = new RegExp(q, 'i');

    // Find matching elements by name
    const matchingElements = await Element.find({ name: regex }).select('_id name');
    const matchingIds = new Set(matchingElements.map((e) => e._id.toString()));

    // Decide which plans to search
    const planQuery = planId ? { _id: planId } : {};
    const plans = await Plan.find(planQuery).select('name tree');

    const results = [];

    for (const plan of plans) {
      const paths = [];
      walkTree(plan.tree, matchingIds, [], paths, plan.name);
      results.push(...paths);
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recursively walk tree, collecting paths to matching nodes
function walkTree(nodes, matchingIds, currentPath, results, planName) {
  for (const node of nodes) {
    const path = [...currentPath, node.name];
    if (matchingIds.has(node.elementId.toString())) {
      results.push({
        nodeId: node._id,
        elementId: node.elementId,
        name: node.name,
        breadcrumb: [planName, ...path],
        state: node.state,
      });
    }
    if (node.children?.length) {
      walkTree(node.children, matchingIds, path, results, planName);
    }
  }
}

export default router;

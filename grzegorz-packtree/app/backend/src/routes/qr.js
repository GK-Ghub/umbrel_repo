import { Router } from 'express';
import QRCode from 'qrcode';
import Plan from '../models/Plan.js';

const router = Router();

// GET /api/qr/:planId/:nodeId
// Returns PNG QR code that encodes a deep link to the container view
router.get('/:planId/:nodeId', async (req, res) => {
  try {
    const { planId, nodeId } = req.params;
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const node = findNode(plan.tree, nodeId);
    if (!node) return res.status(404).json({ error: 'Node not found in tree' });

    // Deep link — frontend handles this route
    const url = `${process.env.CLIENT_ORIGIN || 'http://localhost:3000'}/scan/${planId}/${nodeId}`;

    res.setHeader('Content-Type', 'image/png');
    QRCode.toFileStream(res, url, { width: 300, margin: 2 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/qr/:planId/:nodeId/data
// Returns container contents as JSON (for mobile scan handler)
router.get('/:planId/:nodeId/data', async (req, res) => {
  try {
    const { planId, nodeId } = req.params;
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const node = findNode(plan.tree, nodeId);
    if (!node) return res.status(404).json({ error: 'Node not found' });

    res.json({ planId, planName: plan.name, node });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function findNode(nodes, targetId) {
  for (const node of nodes) {
    if (node._id.toString() === targetId) return node;
    if (node.children?.length) {
      const found = findNode(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

export default router;

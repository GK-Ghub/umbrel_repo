import { Router } from 'express';
import mongoose from 'mongoose';
import Element from '../models/Element.js';
import Plan from '../models/Plan.js';
import { Template } from '../models/Plan.js';

const router = Router();

// ── EXPORT ────────────────────────────────────────────────────────────────────

// GET /api/data/export?include=items,plans,templates
// Returns a single JSON bundle with selected data.
router.get('/export', async (req, res) => {
  try {
    const include = String(req.query.include ?? 'items,plans,templates').split(',');

    const bundle = {
      _packtree_version: 1,
      exported_at: new Date().toISOString(),
      items:     include.includes('items')     ? await Element.find().lean() : undefined,
      plans:     include.includes('plans')     ? await Plan.find().lean()    : undefined,
      templates: include.includes('templates') ? await Template.find().lean(): undefined,
    };

    // Strip undefined keys
    Object.keys(bundle).forEach((k) => bundle[k] === undefined && delete bundle[k]);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="packtree-export-${Date.now()}.json"`
    );
    res.json(bundle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── IMPORT ────────────────────────────────────────────────────────────────────

// POST /api/data/import
// Body: { bundle, mode: 'merge' | 'replace', include: string[] }
// - merge:   upsert by _id; existing docs with same _id are overwritten, others kept
// - replace: drop the selected collections first, then insert
router.post('/import', async (req, res) => {
  try {
    const { bundle, mode = 'merge', include } = req.body;

    if (!bundle || bundle._packtree_version !== 1) {
      return res.status(400).json({ error: 'Invalid PackTree export file' });
    }

    const scope = Array.isArray(include) ? include : ['items', 'plans', 'templates'];
    const report = { items: 0, plans: 0, templates: 0 };

    // Helper: upsert an array of lean docs
    const upsertAll = async (Model, docs) => {
      if (!docs?.length) return 0;
      const ops = docs.map((doc) => ({
        replaceOne: {
          filter: { _id: doc._id },
          replacement: doc,
          upsert: true,
        },
      }));
      const result = await Model.bulkWrite(ops, { ordered: false });
      return (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0);
    };

    // Helper: replace collection
    const replaceAll = async (Model, docs) => {
      if (!docs?.length) return 0;
      await Model.deleteMany({});
      await Model.insertMany(docs, { ordered: false });
      return docs.length;
    };

    const apply = mode === 'replace' ? replaceAll : upsertAll;

    if (scope.includes('items') && bundle.items) {
      report.items = await apply(Element, bundle.items);
    }
    if (scope.includes('plans') && bundle.plans) {
      report.plans = await apply(Plan, bundle.plans);
    }
    if (scope.includes('templates') && bundle.templates) {
      report.templates = await apply(Template, bundle.templates);
    }

    res.json({ success: true, mode, report });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/data/stats — quick summary for the UI
router.get('/stats', async (_req, res) => {
  try {
    const [items, plans, templates] = await Promise.all([
      Element.countDocuments(),
      Plan.countDocuments(),
      Template.countDocuments(),
    ]);
    res.json({ items, plans, templates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

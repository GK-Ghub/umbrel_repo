import { Router } from 'express';
import Element from '../models/Element.js';
import { upload } from '../middleware/upload.js';

const router = Router();

// GET /api/items  — list + filter
router.get('/', async (req, res) => {
  try {
    const { category, isContainer, q } = req.query;
    const filter = {};
    if (category) filter.categories = category;
    if (isContainer !== undefined) filter.isContainer = isContainer === 'true';
    if (q) filter.$text = { $search: q };

    const items = await Element.find(filter)
      .populate('defaultContents', 'name weight isContainer')
      .sort({ name: 1 })
      .limit(200);

    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/items/:id
router.get('/:id', async (req, res) => {
  try {
    const item = await Element.findById(req.params.id).populate('defaultContents');
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/items  — create (multipart for optional image)
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const data = JSON.parse(req.body.data || '{}');
    if (req.file) data.imagePath = req.file.filename;

    const item = await Element.create(data);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/items/:id
router.patch('/:id', upload.single('image'), async (req, res) => {
  try {
    const data = JSON.parse(req.body.data || '{}');
    if (req.file) data.imagePath = req.file.filename;

    const item = await Element.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/items/:id
router.delete('/:id', async (req, res) => {
  try {
    const item = await Element.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

import itemsRouter from './routes/items.js';
import plansRouter from './routes/plans.js';
import qrRouter from './routes/qr.js';
import searchRouter from './routes/search.js';
import dataRouter from './routes/data.js';
import tripsRouter from './routes/trips.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Routes
app.use('/api/items', itemsRouter);
app.use('/api/plans', plansRouter);
app.use('/api/qr', qrRouter);
app.use('/api/search', searchRouter);
app.use('/api/data', dataRouter);
app.use('/api/trips', tripsRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Serve frontend static files
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// Fallback for SPA
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Connect to MongoDB then start server
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Backend running on :${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });

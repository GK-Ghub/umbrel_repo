const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PORT = process.env.PORT || 4090;
const DB_FILE = path.join(DATA_DIR, 'links.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Database setup ────────────────────────────────────────────────────────────
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT    NOT NULL UNIQUE,
    target_url TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    max_clicks INTEGER,
    password   TEXT,
    active     INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS clicks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id    INTEGER NOT NULL,
    clicked_at TEXT    NOT NULL DEFAULT (datetime('now')),
    referrer   TEXT,
    FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_links_slug ON links(slug);
  CREATE INDEX IF NOT EXISTS idx_clicks_link_id ON clicks(link_id);
`);

// ── Helpers ───────────────────────────────────────────────────────────────────
function nanoid(len = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < len; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function isExpired(link) {
  if (link.expires_at && new Date(link.expires_at) < new Date()) return true;
  if (link.max_clicks !== null && link.max_clicks !== undefined) {
    const row = db.prepare('SELECT COUNT(*) as c FROM clicks WHERE link_id = ?').get(link.id);
    if (row.c >= link.max_clicks) return true;
  }
  return false;
}

function getLinksWithStats() {
  return db.prepare(`
    SELECT l.*,
      (SELECT COUNT(*) FROM clicks WHERE link_id = l.id) AS click_count,
      (SELECT MAX(clicked_at) FROM clicks WHERE link_id = l.id) AS last_clicked,
      (SELECT referrer FROM clicks WHERE link_id = l.id ORDER BY clicked_at DESC LIMIT 1) AS last_referrer
    FROM links l
    ORDER BY l.created_at DESC
  `).all().map(l => ({ ...l, password: l.password ? true : false }));
}

// ── Redirect handler ──────────────────────────────────────────────────────────
// Must be defined BEFORE static/SPA fallback but AFTER api routes
// We register it after the API routes below.

// ── API Routes ────────────────────────────────────────────────────────────────

// List all links
app.get('/api/links', (req, res) => {
  res.json(getLinksWithStats());
});

// Create link
app.post('/api/links', async (req, res) => {
  let { slug, target_url, expires_at, max_clicks, password } = req.body;

  if (!target_url) return res.status(400).json({ error: 'target_url is required' });
  try { new URL(target_url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  slug = slug ? slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') : nanoid();
  if (!slug) return res.status(400).json({ error: 'Invalid slug' });

  const existing = db.prepare('SELECT id FROM links WHERE slug = ?').get(slug);
  if (existing) return res.status(409).json({ error: 'Slug already taken' });

  const hashedPw = password ? await bcrypt.hash(password, 10) : null;

  const result = db.prepare(
    'INSERT INTO links (slug, target_url, expires_at, max_clicks, password) VALUES (?, ?, ?, ?, ?)'
  ).run(slug, target_url, expires_at || null, max_clicks || null, hashedPw);

  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...link, click_count: 0, password: !!hashedPw });
});

// Update link
app.put('/api/links/:id', async (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(req.params.id);
  if (!link) return res.status(404).json({ error: 'Not found' });

  const { target_url, expires_at, max_clicks, password, active } = req.body;

  let hashedPw = link.password;
  if (password === '') hashedPw = null;
  else if (password) hashedPw = await bcrypt.hash(password, 10);

  db.prepare(`
    UPDATE links SET target_url=?, expires_at=?, max_clicks=?, password=?, active=? WHERE id=?
  `).run(
    target_url ?? link.target_url,
    expires_at !== undefined ? (expires_at || null) : link.expires_at,
    max_clicks !== undefined ? (max_clicks || null) : link.max_clicks,
    hashedPw,
    active !== undefined ? (active ? 1 : 0) : link.active,
    link.id
  );
  res.json({ ok: true });
});

// Delete link
app.delete('/api/links/:id', (req, res) => {
  db.prepare('DELETE FROM links WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Analytics for a link
app.get('/api/links/:id/analytics', (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(req.params.id);
  if (!link) return res.status(404).json({ error: 'Not found' });

  const clicks = db.prepare(`
    SELECT DATE(clicked_at) as date, COUNT(*) as count
    FROM clicks WHERE link_id = ?
    GROUP BY DATE(clicked_at) ORDER BY date DESC LIMIT 30
  `).all(link.id);

  const referrers = db.prepare(`
    SELECT COALESCE(NULLIF(referrer,''), 'Direct') as referrer, COUNT(*) as count
    FROM clicks WHERE link_id = ?
    GROUP BY referrer ORDER BY count DESC LIMIT 10
  `).all(link.id);

  const total = db.prepare('SELECT COUNT(*) as c FROM clicks WHERE link_id = ?').get(link.id);
  res.json({ clicks, referrers, total: total.c });
});

// QR code
app.get('/api/links/:id/qr', async (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE id = ?').get(req.params.id);
  if (!link) return res.status(404).json({ error: 'Not found' });

  const host = req.query.host || `${req.protocol}://${req.get('host')}`;
  const url = `${host}/${link.slug}`;
  const svg = await QRCode.toString(url, { type: 'svg' });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

// Export JSON
app.get('/api/export/json', (req, res) => {
  const links = db.prepare('SELECT slug, target_url, expires_at, max_clicks, active, created_at FROM links').all();
  res.setHeader('Content-Disposition', 'attachment; filename=links.json');
  res.json(links);
});

// Export CSV
app.get('/api/export/csv', (req, res) => {
  const links = db.prepare('SELECT slug, target_url, expires_at, max_clicks, active, created_at FROM links').all();
  const header = 'slug,target_url,expires_at,max_clicks,active,created_at\n';
  const rows = links.map(l =>
    `"${l.slug}","${l.target_url}","${l.expires_at || ''}","${l.max_clicks || ''}","${l.active}","${l.created_at}"`
  ).join('\n');
  res.setHeader('Content-Disposition', 'attachment; filename=links.csv');
  res.setHeader('Content-Type', 'text/csv');
  res.send(header + rows);
});

// Import
app.post('/api/import', (req, res) => {
  const { links } = req.body;
  if (!Array.isArray(links)) return res.status(400).json({ error: 'links array required' });

  let imported = 0, skipped = 0;
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO links (slug, target_url, expires_at, max_clicks, active) VALUES (?, ?, ?, ?, ?)'
  );
  const insertMany = db.transaction((rows) => {
    for (const l of rows) {
      const r = stmt.run(l.slug, l.target_url, l.expires_at || null, l.max_clicks || null, l.active !== undefined ? l.active : 1);
      if (r.changes) imported++; else skipped++;
    }
  });
  insertMany(links);
  res.json({ imported, skipped });
});

// ── Short-link redirect ───────────────────────────────────────────────────────
app.get('/:slug', async (req, res, next) => {
  const { slug } = req.params;

  // Skip static asset requests
  if (slug.includes('.')) return next();

  const link = db.prepare('SELECT * FROM links WHERE slug = ? AND active = 1').get(slug);
  if (!link) return next();

  if (isExpired(link)) {
    return res.status(410).send(errorPage('⏰ Link Expired', 'This link is no longer active.'));
  }

  if (link.password) {
    const provided = req.query.pw;
    if (!provided) return res.send(passwordPage(slug, false));
    const ok = await bcrypt.compare(provided, link.password);
    if (!ok) return res.status(401).send(passwordPage(slug, true));
  }

  // Record click
  const referrer = req.get('Referrer') || req.get('Referer') || null;
  db.prepare('INSERT INTO clicks (link_id, referrer) VALUES (?, ?)').run(link.id, referrer);

  res.redirect(302, link.target_url);
});

// SPA fallback — serve index.html for all unmatched routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── HTML helpers ──────────────────────────────────────────────────────────────
function errorPage(title, message) {
  return `<!DOCTYPE html><html><head><title>${title}</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
height:100vh;margin:0;background:#080b0f;color:#e8edf3;}
.box{text-align:center;padding:2rem;border:1px solid #1e2836;border-radius:12px;}
h1{color:#ef4444;}a{color:#4f8ef7;}</style>
</head><body><div class="box"><h1>${title}</h1><p>${message}</p>
<a href="/">Back to home</a></div></body></html>`;
}

function passwordPage(slug, failed) {
  return `<!DOCTYPE html><html><head><title>Protected Link</title>
<style>*{box-sizing:border-box;}body{font-family:sans-serif;display:flex;align-items:center;
justify-content:center;height:100vh;margin:0;background:#080b0f;color:#e8edf3;}
.box{background:#0f1318;padding:2rem;border-radius:12px;width:320px;text-align:center;
border:1px solid #263040;}input{width:100%;padding:.75rem;margin:.5rem 0 1rem;
background:#161c24;border:1px solid #263040;color:#e8edf3;border-radius:8px;font-size:1rem;}
button{width:100%;padding:.75rem;background:#4f8ef7;color:#fff;border:none;border-radius:8px;
font-size:1rem;cursor:pointer;}button:hover{background:#3b7de8;}h2{margin-top:0;}
p{color:#7a8fa6;font-size:.875rem;}.err{color:#ef4444;}</style>
</head><body><div class="box"><h2>🔒 Protected Link</h2>
${failed ? '<p class="err">Incorrect password. Try again.</p>' : '<p>Enter the password to continue.</p>'}
<form method="GET" action="/${slug}">
<input type="password" name="pw" placeholder="Password" autofocus/>
<button type="submit">Continue →</button></form></div></body></html>`;
}

app.listen(PORT, () => {
  console.log(`URL Shortener running on port ${PORT}`);
});

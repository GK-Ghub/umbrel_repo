const express = require('express');
const ping = require('ping');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PORT = process.env.PORT || 4080;

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const LOG_FILE = path.join(DATA_DIR, 'ping_log.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Default config
const defaultConfig = {
  devices: [
    { id: '1', name: 'Router', ip: '192.168.1.1' },
    { id: '2', name: 'Internet', ip: '8.8.8.8' }
  ],
  interval: 30 // seconds
};

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading config:', e.message);
  }
  return defaultConfig;
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function readLog() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading log:', e.message);
  }
  return [];
}

function writeLog(log) {
  // Keep only last 10000 entries to prevent unbounded growth
  if (log.length > 10000) {
    log = log.slice(log.length - 10000);
  }
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

// Ping all devices and record results
async function pingAll() {
  const config = readConfig();
  const log = readLog();
  const timestamp = new Date().toISOString();

  const results = await Promise.all(
    config.devices.map(async (device) => {
      try {
        const res = await ping.promise.probe(device.ip, {
          timeout: 5,
          min_reply: 1
        });
        return {
          id: device.id,
          name: device.name,
          ip: device.ip,
          alive: res.alive,
          time: res.alive ? parseFloat(res.avg) : null
        };
      } catch (e) {
        return {
          id: device.id,
          name: device.name,
          ip: device.ip,
          alive: false,
          time: null
        };
      }
    })
  );

  const entry = {
    timestamp,
    results
  };

  log.push(entry);
  writeLog(log);

  return entry;
}

// Start periodic pinging
let pingInterval = null;

function startPinging() {
  if (pingInterval) clearInterval(pingInterval);
  const config = readConfig();
  const intervalMs = (config.interval || 30) * 1000;

  // Ping immediately on start
  pingAll().catch(console.error);

  pingInterval = setInterval(() => {
    pingAll().catch(console.error);
  }, intervalMs);

  console.log(`Pinging every ${config.interval || 30} seconds`);
}

// ---- API Routes ----

// Get config
app.get('/api/config', (req, res) => {
  res.json(readConfig());
});

// Save config
app.post('/api/config', (req, res) => {
  try {
    const config = req.body;
    // Validate
    if (!Array.isArray(config.devices)) {
      return res.status(400).json({ error: 'devices must be an array' });
    }
    config.interval = parseInt(config.interval) || 30;
    if (config.interval < 5) config.interval = 5;

    writeConfig(config);
    startPinging(); // restart with new interval
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get log - returns entries where at least one device was offline
// Also returns a "all" query param to return everything
app.get('/api/log', (req, res) => {
  const log = readLog();
  const showAll = req.query.all === '1';
  const limit = parseInt(req.query.limit) || 500;

  let filtered = log;

  if (!showAll) {
    // Only show entries where at least one device was offline
    filtered = log.filter(entry =>
      entry.results.some(r => !r.alive)
    );
  }

  // Return most recent first, limited
  const result = filtered.slice(-limit).reverse();
  res.json(result);
});

// Get latest status of all devices
app.get('/api/status', (req, res) => {
  const log = readLog();
  if (log.length === 0) {
    return res.json({ timestamp: null, results: [] });
  }
  res.json(log[log.length - 1]);
});

// Manual ping trigger
app.post('/api/ping', async (req, res) => {
  try {
    const result = await pingAll();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete all logs
app.delete('/api/log', (req, res) => {
  writeLog([]);
  res.json({ ok: true });
});

// Get stats per device
app.get('/api/stats', (req, res) => {
  const log = readLog();
  const config = readConfig();

  const stats = {};
  config.devices.forEach(d => {
    stats[d.id] = {
      id: d.id,
      name: d.name,
      ip: d.ip,
      total: 0,
      offline: 0,
      online: 0,
      uptime: 0,
      avgPing: null,
      pings: []
    };
  });

  log.forEach(entry => {
    entry.results.forEach(r => {
      if (stats[r.id]) {
        stats[r.id].total++;
        if (r.alive) {
          stats[r.id].online++;
          if (r.time !== null) stats[r.id].pings.push(r.time);
        } else {
          stats[r.id].offline++;
        }
      }
    });
  });

  Object.values(stats).forEach(s => {
    s.uptime = s.total > 0 ? ((s.online / s.total) * 100).toFixed(1) : 0;
    s.avgPing = s.pings.length > 0
      ? (s.pings.reduce((a, b) => a + b, 0) / s.pings.length).toFixed(1)
      : null;
    delete s.pings;
  });

  res.json(Object.values(stats));
});

app.listen(PORT, () => {
  console.log(`Ping Monitor running on port ${PORT}`);
  startPinging();
});

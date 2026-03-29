const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 9252;
const CONFIG_PATH = '/etc/gitlab-runner/config.toml';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET /api/status — check if runner is registered
app.get('/api/status', (req, res) => {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return res.json({ registered: false, runners: [] });
    }
    const config = fs.readFileSync(CONFIG_PATH, 'utf8');
    const names = [...config.matchAll(/name\s*=\s*"([^"]+)"/g)].map(m => m[1]);
    const urls  = [...config.matchAll(/url\s*=\s*"([^"]+)"/g)].map(m => m[1]);
    const registered = config.includes('[[runners]]');
    res.json({ registered, runners: names.map((n, i) => ({ name: n, url: urls[i] || '' })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/register — register the runner
app.post('/api/register', (req, res) => {
  const {
    token,
    name = 'umbrel-runner',
    tags = 'umbrel,docker',
    image = 'alpine:latest',
  } = req.body;

  if (!token || !token.startsWith('glrt-')) {
    return res.status(400).json({ error: 'Invalid token. Must start with glrt-' });
  }

  const cmd = [
    'gitlab-runner register',
    '--non-interactive',
    '--url "http://192.168.1.225:8929"',
    `--token "${token}"`,
    `--name "${name}"`,
    '--executor docker',
    `--docker-image "${image}"`,
    '--docker-privileged',
    '--docker-volumes "/var/run/docker.sock:/var/run/docker.sock"',
    '--docker-volumes "/cache"',
    '--docker-network-mode host',
    '--docker-pull-policy if-not-present',
    `--tag-list "${tags}"`,
  ].join(' ');

  exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ error: stderr || err.message });
    }
    res.json({ success: true, output: stdout + stderr });
  });
});

// POST /api/unregister — unregister all runners
app.post('/api/unregister', (req, res) => {
  exec('gitlab-runner unregister --all-runners', { timeout: 15000 }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    res.json({ success: true });
  });
});

// GET /api/config — return raw config.toml (redacted tokens)
app.get('/api/config', (req, res) => {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return res.json({ config: '' });
    let config = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = config.replace(/token\s*=\s*"[^"]+"/g, 'token = "****"');
    res.json({ config });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`GitLab Runner UI listening on port ${PORT}`);
});

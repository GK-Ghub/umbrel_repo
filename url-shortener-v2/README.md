# 🔗 URL Shortener — Umbrel App

A self-hosted URL shortener for your home network. Shorten `192.168.1.23/plex`, track clicks, generate QR codes, and more.

## Features
- Custom slugs (e.g. `/plex`, `/nas`, `/git`)
- Click analytics — per-day counts and referrer breakdown
- QR code generation (SVG, downloadable)
- Expiration by date or max-click count
- Password-protected redirects
- Bulk JSON/CSV import & export
- Enable/disable links without deleting

## Structure

```
grzegorz-url-shortener/
├── umbrel-app.yml
├── docker-compose.yml
├── icon.svg
└── app/
    ├── Dockerfile
    ├── package.json
    ├── server.js
    └── public/
        └── index.html
```

## Deploy to Umbrel via Community Store

### 1. Push this repo to GitHub
```bash
git init && git add . && git commit -m "init"
git remote add origin https://github.com/gk-ghub/grzegorz-url-shortener.git
git push -u origin main
```

GitHub Actions will automatically build and push the Docker image to `ghcr.io/gk-ghub/grzegorz-url-shortener:latest`.

> **Make the image public:** GitHub → your package → Package settings → Change visibility → Public

### 2. Add to your community app store repo

In your `umbrel-app-store` repo, create a folder:
```
umbrel-app-store/
└── grzegorz-url-shortener/
    ├── umbrel-app.yml    ← copy from this repo
    └── docker-compose.yml ← copy from this repo
```

### 3. Install on Umbrel
Umbrel → App Store → Add Community Store → `https://github.com/gk-ghub/umbrel-app-store`

## Local development
```bash
cd grzegorz-url-shortener/app
npm install
DATA_DIR=./data PORT=4090 node server.js
# Open http://localhost:4090
```

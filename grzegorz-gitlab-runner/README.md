# grzegorz-gitlab-runner

GitLab Runner packaged as an **Umbrel Community App Store** app, with a built-in **web UI** for registering runners — no SSH required.

---

## How it works

```
GitHub repo (your app store)
  └── grzegorz-gitlab-runner/
        ├── Dockerfile + ui/     →  GitHub Actions builds this
        │                        →  pushes image to ghcr.io/grzegorz/gitlab-runner-umbrel
        └── docker-compose.yml   →  Umbrel pulls that image and runs it
```

Umbrel **cannot build Docker images** — it only pulls pre-built ones.  
So this repo uses **GitHub Actions** to auto-build and push the image to the  
**GitHub Container Registry (GHCR)** every time you push changes.

---

## First-time setup

### Step 1 — Push the repo

```bash
git add .
git commit -m "add gitlab runner app"
git push
```

GitHub Actions will automatically:
1. Build the image for both `linux/amd64` and `linux/arm64` (Raspberry Pi)
2. Push it to `ghcr.io/grzegorz/gitlab-runner-umbrel:latest`

Check progress: **GitHub repo → Actions tab**

### Step 2 — Make the GHCR package public

Umbrel needs to pull the image without authentication.

1. Go to `https://github.com/grzegorz?tab=packages`
2. Click **gitlab-runner-umbrel**
3. Click **Package settings** (bottom right)
4. Scroll to **Danger Zone** → **Change visibility** → set to **Public**

This only needs to be done **once**.

### Step 3 — Install on Umbrel

1. Open Umbrel UI → **App Store** → **Community App Stores**
2. Add your repo URL: `https://github.com/grzegorz/umbrel-app-store`
3. Find **GitLab Runner** → **Install**

---

## Using the web UI

Click the **GitLab Runner** icon in Umbrel to open the config page:

1. Go to your GitLab at `http://192.168.1.225:8929`
2. **Admin Area → CI/CD → Runners → New instance runner** (or group/project)
3. Copy the `glrt-` token
4. Paste it into the **Runner Token** field in the UI
5. Click **▶ Register**

The runner appears online in GitLab immediately — no SSH, no restart.

---

## Updating the app

Any time you change the Dockerfile, entrypoint.sh, or ui/ files:

```bash
git add .
git commit -m "update runner UI"
git push
```

GitHub Actions rebuilds and pushes the new image automatically.
On Umbrel, restart the app to pull the latest image.

---

## File structure

```
your-repo/
├── .github/
│   └── workflows/
│       └── docker.yml                  ← auto-build & push to GHCR
├── umbrel-app-store.yml
└── grzegorz-gitlab-runner/
    ├── umbrel-app.yml                  ← app listing in Umbrel UI
    ├── docker-compose.yml              ← pulls ghcr.io image, mounts volumes
    ├── Dockerfile                      ← gitlab-runner + Node.js UI
    ├── entrypoint.sh                   ← starts both services
    └── ui/
        ├── package.json
        ├── server.js                   ← Express API
        └── public/
            └── index.html              ← config web page
```

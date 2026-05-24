# PackTree 🌳📦

Self-hosted, Dockerized logistics app for hierarchical packing management.  
Track nested containers, scan QR codes on mobile, generate return-home checklists.

---

## Quick start

```bash
cp .env.example .env          # set JWT_SECRET if desired
docker compose up --build -d

# Frontend → http://localhost:3000
# Backend  → http://localhost:4000
```

### Umbrel OS

This project is prepared for Umbrel OS. The configuration is located in the `umbrel_repo`.
The unified Docker image is built via GitHub Actions and available on GHCR.

---

## Features

| # | Feature |
|---|---------|
| 1 | Remove items from plan — ✕ button returns element to available list |
| 2 | Infinite nesting — "+ Add" inside any container works at any depth |
| 3 | Default contents — containers auto-populate children when added to a plan |
| 4 | Grouped return checklist — collapsible per-container sections with sub-paths |
| 5 | Full TypeScript frontend |

---

## Stack

- **Frontend**: React 18 + TypeScript + Vite → nginx
- **Backend**: Node.js / Express (ESM)
- **Database**: MongoDB 7 (embedded document tree)
- **Infrastructure**: Docker Compose + named volumes

---

## Project structure

```
packtree/
├── backend/src/
│   ├── index.js
│   ├── models/       Element.js  Plan.js
│   ├── routes/       items.js  plans.js  qr.js  search.js
│   └── middleware/   upload.js
│
├── frontend/src/
│   ├── types.ts              ← shared TypeScript types
│   ├── utils/  api.ts  weight.ts
│   ├── components/
│   │   ├── Layout.tsx
│   │   ├── TreeNode.tsx      ← recursive tree, QR, remove, nested-add
│   │   └── ItemModal.tsx     ← create/edit + default contents picker
│   └── pages/
│       ├── HomePage.tsx
│       ├── ItemsPage.tsx
│       ├── PlansPage.tsx
│       ├── PlanEditorPage.tsx  ← split-screen editor + checklist
│       ├── SearchPage.tsx
│       └── ScanPage.tsx        ← mobile QR landing
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## API reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/items` | List items (`?category=&isContainer=&q=`) |
| POST | `/api/items` | Create (multipart/form-data) |
| PATCH | `/api/items/:id` | Update |
| DELETE | `/api/items/:id` | Delete |
| GET | `/api/plans` | List plans |
| POST | `/api/plans` | Create plan |
| PATCH | `/api/plans/:id` | Update metadata / status |
| POST | `/api/plans/:id/add-element` | Add element to tree (expands defaults) |
| POST | `/api/plans/:id/remove-element` | Remove node + descendants, rebuild usedIds |
| GET | `/api/plans/:id/returnable` | Grouped checklist with paths |
| GET | `/api/qr/:planId/:nodeId` | QR PNG |
| GET | `/api/qr/:planId/:nodeId/data` | Container JSON for mobile |
| GET | `/api/search?q=` | Deep search with breadcrumbs |

---

## Docker volumes

| Volume | Container path | Purpose |
|--------|---------------|---------|
| `db-data` | `/data/db` | MongoDB persistence |
| `uploads-data` | `/app/uploads` | Item images |


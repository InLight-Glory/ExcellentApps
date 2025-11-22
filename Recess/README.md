# Recess — MVP (local scaffold)

Lightweight local scaffold for the Recess MVP: Node + Express backend, SQLite persistence and a static, vanilla-JS frontend. Intended for fast iteration and demoing parent moderation flows and staff escalation.

Quick start (Windows PowerShell)

1) Install dependencies (only once or when package.json changes):

```powershell
cd 'Recess/server'
npm install
```

2) Start the server:

```powershell
npm start
```

3) Open the frontend in a browser:

http://localhost:3000/

What this scaffold provides
- A simple REST API (see `server/index.js`) and static SPA under `web/`.
- Local SQLite DB at `Recess/server/db.sqlite` (auto-created).
- File uploads saved to `Recess/server/uploads` and served from `/uploads/...`.
- Parent approval workflow: child posts are created as `pending_parent` until a linked parent approves them.
- Reporting/escalation: users can report posts; reported posts are marked `escalated` and visible to admin/staff.

Notes and dev tips
- This project is for local development and prototyping only. Secrets in `server/config.json` are for convenience and must be changed before any sharing or production use.
- Server port: default 3000. Use `PORT` environment variable to override.
- Use `nodemon` during development for auto-reload (add a `dev` script or install `nodemon` globally).
- To keep the server running between sessions use `pm2` or a similar process manager.

Seeded test accounts (dev only)
- A seeded parent account exists in the database for convenience (see `server/index.js` seeding). Default developer credentials are in `server/config.json`. Change them.

Where to look next
- API entrypoints: `Recess/server/index.js` — posts, moderation, parent login and parent endpoints.
- Static app: `Recess/web/index.html`, `Recess/web/app.js`, `Recess/web/style.css`.
- Config: `Recess/server/config.json` (admin token, jwt secret, and seeded parent settings).

Roadmap and next work
- See `ROADMAP.md` for prioritized features and implementation notes. Use it to add items you want implemented now vs later.

License / security
- No production guarantees. Do not expose this scaffold to the public with the current config/secrets.
# Recess MVP (scaffold)

This folder contains a minimal scaffold for the Recess MVP: a lightweight Node + Express backend and a static frontend.

Quick start (Windows PowerShell):

1. Start the server

```powershell
cd "Recess/server"
npm install
npm start
```

2. Open the frontend

Navigate to http://localhost:3000/ which serves the static files and the simple web UI.

Notes:
- This is a minimal, local scaffold for development and demo purposes only. It stores data in a local SQLite file at `Recess/server/db.sqlite`.
- Uploaded media are stored in `Recess/server/uploads` and served by the server.
- Moderation actions are manual via the admin section in the UI.

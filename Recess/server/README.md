# Recess — server (express + sqlite)

This folder contains the minimal Node/Express server used by the Recess MVP scaffold. It's intended for local development and demo only.

Quick start (Windows PowerShell)

```powershell
cd 'Recess/server'
npm install
npm start
```

By default the server listens on port 3000 (override with `PORT` environment variable).

Key files
- `index.js` — main server and API endpoints (posts, moderation, parent login, reports).
- `config.json` — local development config (admin token, jwt secret, seeded parent settings). **Do not** use these values in production.
- `db.sqlite` — SQLite database file (auto-created).
- `uploads/` — directory for uploaded media.

Dev notes
- The server creates a few tables on first run and seeds a small set of demo users (admin, parent, child) for testing.
- Parent authentication: there is a `POST /api/parents/login` endpoint that returns a JWT. The frontend stores this in `localStorage` under `recess_parent_jwt` for the in-page parent UI.
- Admin endpoints use a simple admin token header (x-admin-token) for local testing. Change the token in `config.json` before sharing.

Security & production
- This scaffold is intentionally minimal. Before production you should:
  - Replace config-file secrets with environment-provided secrets or a proper secret manager.
  - Use a proper auth system (OAuth, Auth0, or your own with secure password resets, email verification).
  - Move media storage to a durable object store (S3, Azure Blob) and serve via signed URLs or a CDN.
  - Implement rate-limiting, input validation, and robust moderation tooling.

Troubleshooting
- If you see JSON parse errors when running `npm install`, remove any malformed `package.json` files and re-run. The repo includes a working `package.json` in this folder.
- If uploads fail, confirm the `uploads/` directory exists and the process has write permissions.
# Recess server (minimal scaffold)

This folder contains a minimal Express + SQLite server used for the Recess MVP scaffold.

Quick start (Windows PowerShell):

```powershell
cd "Recess/server"
npm install
npm start
```

Server notes:
- Server listens on port 3000 by default (use PORT environment variable to override).
- SQLite DB: `Recess/server/db.sqlite` will be created automatically.
- Uploaded media are saved in `Recess/server/uploads` and served at `/uploads/...`.
- This scaffold is for local development and demo only.

Admin token:
- Moderation endpoints are protected by a simple admin token. The default token is stored in `Recess/server/config.json` under the `adminToken` property.
- For local testing the provided token is `recess-admin-token-CHANGE_ME`. Change it in `config.json` to a strong secret before sharing.
- The frontend admin UI will prompt for the token and store it in `localStorage` under `recess_admin_token`.

Parent tokens:
- You can configure parent tokens in `Recess/server/config.json` under the `parentTokens` array. each entry should include an `email` (the parent user's email) and a `token` value.
- For local testing a default parent `parent@local` is seeded and linked to `child@local`. The sample parent token is `recess-parent-token-CHANGE_ME` (change it in `config.json`).
- The frontend Parent UI will prompt for parent credentials and store the returned JWT in `localStorage` under `recess_parent_jwt`.

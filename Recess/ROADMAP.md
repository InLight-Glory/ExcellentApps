# Recess Roadmap

This roadmap lists prioritized improvements, grouped by milestone and status. Use this file to track what should be implemented now vs later. Each item includes a short description, why it matters, rough priority, and suggested next steps.

How to use
- Mark items as `TODO`, `IN-PROGRESS`, or `DONE` and update owner/ETA as you pick work.

High priority (near-term / beta)

- [IN-PROGRESS] UI overhaul — responsive card-based feed, in-page parent login, upload form improvements
  - Why: improves clarity for testers and parents; reduces friction for end-to-end flows.
  - Next: polish accessibility, add media preview, add small demo posts.

- [TODO] Wire upload form with `childEmail` (browser) and client-side preview
  - Why: enable full browser-based child → parent → public flow without manual API calls.
  - Next: add `childEmail` input (done), add preview and progress bar.

- [TODO] Admin in-page login / nicer moderation UI
  - Why: avoid prompt() flows and make staff workflows smoother.
  - Next: create admin login form, show escalated queue, add bulk actions.

Medium priority (post-beta)

- [TODO] Authentication & accounts
  - Replace config-based tokens with a proper auth system. Options: JWT with refresh tokens + hashed passwords; OAuth with third-party provider; third-party auth (Auth0, Clerk).
  - Next: choose provider, migrate seeds, add account management UI.

- [TODO] Persistent media storage and CDN
  - Move from local `uploads/` to S3/Blob storage; serve via signed URLs or CDN.
  - Next: add storage adapter and migration path.

- [TODO] Moderation tools & workflows
  - Add moderation dashboard, staff roles, audit log, bulk moderation, and machine-assisted filters.
  - Next: wire reports → moderation queue with richer metadata and email/Slack alerts for escalations.

Lower priority / future

- [TODO] COPPA / privacy & legal compliance
  - Implement age gating, parental consent flows, data retention policies, and privacy docs.

- [TODO] Analytics and metrics
  - Event tracking, acceptance criteria for success metrics, retention funnels.

- [TODO] Mobile apps / PWA
  - Build mobile clients or PWA for better native-like experience.

Tests and automation

- [DONE] Basic integration script: `test/run-tests.js` exercises parent login → create post → parent approve → feed visibility → report → admin escalated

- [TODO] Add CI unit tests and UI end-to-end tests (Playwright/Puppeteer)

Security & ops

- [TODO] Secrets & config management
  - Move secrets out of `config.json` and into environment variables or a secrets manager.

- [TODO] Deployment
  - Add Dockerfile, deployment playbook (VPS, Heroku, or container registry + cloud provider).

Roadmap governance
- When you want a feature implemented now, add your initials and a short ETA beside the item and assign the task to the backlog or start it.
- For quick wins I can implement items directly (UI polish, admin login, upload preview). For larger items (auth migration, media storage) we'll plan a set of discrete tasks.

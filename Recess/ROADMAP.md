# Recess Roadmap — Beta-focused (updated)

This file captures the priorities and current status as we move toward a working beta. It reflects recent progress on the TikTok-style swipe feed, demo Shorts seeding, and the client/server changes made in the `copilot/redesign-landing-page` branch.

How to use
- Mark items as `TODO`, `IN-PROGRESS`, or `DONE` and add `owner` + `ETA` when you pick a task.
- Use the Acceptance Criteria to decide what to prioritize for the beta.

Beta Goal (minimum)
- Deliver a deployable app where a child can create media posts, a parent can approve them, approved content appears in a public, mobile-first feed, and staff can moderate/escalate content. The landing page will showcase the new continuous vertical (swipe) feed.

Recent progress (what's done in this session)
- **DONE:** Add default YouTube Shorts demo seeds and `/api/admin/reset-demo` to force-reset them (9 Shorts seeded).
- **DONE:** Server: detect YouTube URLs in `POST /api/posts` and set `mediaType: 'youtube'`.
- **DONE:** Server: add paginated `GET /api/feed` endpoint used by the swipe pager.
- **DONE:** Client: implement swipe view with YouTube iframe embedding (autoplay muted) and seed-driven demo mode.
- **DONE:** Client: fixed entry overlay blocking header nav (overlay background click-through).
- **DONE:** Client: added wheel, pointer drag, and touch handlers to advance swipe items; added visible Prev/Next nav buttons as a fallback.

Current status (high-level)
- [IN-PROGRESS] Landing page redesign: TikTok-style swipe feed integrated into `web/app.js` and `web/index.html` (branch: `copilot/redesign-landing-page`).
- [IN-PROGRESS] UX tweaks: autoplay behavior for Shorts, click/scroll navigation, overlay behavior.
- [DONE] Demo seeds: nine Shorts available and returned by `/api/feed`.
- [TODO] Polish: smooth transitions/animations between swipe items; avoid iframe input swallowing gestures in all browsers.
- [TODO] Tests: add automated UI checks for swipe behavior and autoplay (headless/browser tests).

Beta milestones (revised)
- Milestone B1 — Core flows (complete/basic): child upload → parent approval → approved posts visible in feed. Acceptance: basic end-to-end flow works locally.
- Milestone B2 — Feed & UX (near complete): continuous vertical swipe feed with autoplay Shorts and navigation. Acceptance: feed shows demo posts, wheel/drag/swipe advances items, navigation accessible.
- Milestone B3 — Admin & moderation: admin login, moderation queue, escalate/delete/restore actions. Acceptance: staff flows function and create audit records.
- Milestone B4 — Ops & deployment: media storage, Dockerfile, CI. Acceptance: staging deploy with persistent media storage.

Acceptance criteria for Beta (concise)
- Child-to-parent flow: create post (file or URL) with `childEmail`, parent can approve or reject; approved posts appear in feed.
- Feed UX: approved posts appear in the swipe feed; scrolling/dragging/keyboard and visible nav buttons change items; YouTube Shorts autoplay muted in swipe view.
- Moderation: admin can view escalated items and perform actions; moderation actions are recorded.
- Tests & CI: integration tests run on PRs; basic UI checks for swipe navigation.

Immediate tasks (next sprint)
- [IN-PROGRESS] Polish swipe transitions & stabilize autoplay handling across browsers — owner: frontend — ETA: 3 days
- [IN-PROGRESS] Improve iframe gesture handling and fallbacks (nav buttons + keyboard) — owner: frontend — ETA: 2 days
- [TODO] Add headless/browser tests for swipe navigation and feed rendering — owner: qa — ETA: 1 week
- [TODO] Add Dockerfile + minimal GitHub Actions CI to run tests and `test/run-tests.js` — owner: devops — ETA: 1 week
- [TODO] Move `uploads/` to cloud storage (S3/compatible) + CDN — owner: backend — ETA: 1–2 weeks

Testing and CI
- Keep `test/run-tests.js` as the canonical integration smoke test.
- Add a GitHub Actions workflow to run lint, `npm test`, and `node test/run-tests.js` on PRs targeting `main` and feature branches.

Security, privacy & compliance
- [TODO] Remove secrets from `config.json` and use environment variables / secrets manager.
- [TODO] Document parent-consent flow and plan COPPA/privacy compliance before public beta.

Governance & contributions
- When you pick a task, add your initials and ETA (e.g., `- [IN-PROGRESS] Polish autoplay — owner: VN — ETA: 2025-12-02`).
- Break larger items (storage migration, CI, auth) into smaller PR-sized tasks.

Next steps (this session)
- ROADMAP.md updated to reflect the recent work and current priorities.
- If you want, I can open issues for the immediate tasks and create a minimal `Dockerfile` and GitHub Actions workflow next. Want me to proceed with that?

---
Updated: 2025-11-29 — reflects demo seeds, server feed, YouTube detection, swipe navigation handlers, and immediate polish tasks.

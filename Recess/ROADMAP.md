# Recess Roadmap — Beta-focused

This roadmap captures the current priorities as we work toward a working beta release (an end-to-end parent/child posting and moderation flow, plus a redesigned landing/feed experience). Use this file to track status, owners, and acceptance criteria for the beta.

How to use
- Mark items as `TODO`, `IN-PROGRESS`, or `DONE` and add `owner` + `ETA` when you pick a task.
- Beta acceptance criteria are listed below; prioritize items that unblock them.

Beta Goal (minimum):
- Deliver a deployable app where a child can create media posts (browser), a parent can approve them, content appears in the public feed, and staff can escalate or moderate from an admin UI. The landing page should demonstrate the new feed (TikTok-style/video-first) and basic analytics.

Current status (high-level)
- [IN-PROGRESS] Landing page redesign: TikTok-style video feed and responsive card feed — branch: `copilot/redesign-landing-page` (PR: redesign landing page with TikTok-style video feed).
- [IN-PROGRESS] UI polish: in-page parent login, upload form improvements, client-side preview and progress indicator.
- [TODO] Server persistence to production storage (migrate `uploads/` to cloud storage and CDN).
- [TODO] Admin moderation UI: in-page admin login, escalations, bulk actions.
- [DONE] Basic integration script: `test/run-tests.js` covers parent login → create post → parent approve → feed visibility → report → admin escalate.

Beta milestones
- Milestone B1 — Core flows (1–2 weeks)
  - Implement and QA: browser upload with `childEmail`, parent approval flow (in-page or link), feed visibility tests.
  - Acceptance: test script passes and demoable on local & staging.

- Milestone B2 — Feed & landing (1 week)
  - Complete landing redesign with continuous vertical feed (video-first) and responsive layout.
  - Acceptance: landing shows demo posts, smooth play/pause on scroll, accessible controls.

- Milestone B3 — Admin & moderation (1 week)
  - Ship in-page admin login, moderation queue with escalated items, and bulk actions.
  - Acceptance: staff can mark, delete, or restore posts; escalations surface metadata.

- Milestone B4 — Ops & deployment (1–2 weeks)
  - Move media to cloud storage, add Dockerfile, basic deployment docs, and CI checks.
  - Acceptance: app deploys to a staging host, media served from storage, CI runs tests on push.

Acceptance criteria for Beta
- Child-to-parent flow: browser upload with `childEmail` and preview, upload completes with progress, and parent is notified (email or in-page) and can approve.
- Feed: approved posts appear in the public feed consistently and are playable on the landing page; feed supports video-first UX.
- Moderation: admin can view escalated items and take actions (delete/hide/restore). Audit entries created for actions.
- Tests: `test/run-tests.js` passes in CI; basic end-to-end smoke tests are in place.
- Deployment: Dockerfile and simple deployment steps documented; media served from persistent storage.

Immediate tasks (next sprint)
- [IN-PROGRESS] Complete landing page video feed integration — owner: frontend — ETA: 4 days
- [IN-PROGRESS] Wire upload form to backend including `childEmail` and preview — owner: frontend — ETA: 3 days
- [TODO] Add admin login UI and moderation queue — owner: ops/frontend — ETA: 1 week
- [TODO] Add cloud storage adapter & migration for `uploads/` — owner: backend — ETA: 1 week
- [TODO] Add Dockerfile + staging deploy script — owner: devops — ETA: 1 week

Testing and CI
- Keep `test/run-tests.js` as the canonical integration test for now.
- Add a CI pipeline (GitHub Actions) to run lint, `npm test`, and `node test/run-tests.js` on PRs targeting `main` and `copilot/redesign-landing-page`.

Security, privacy & legal
- [TODO] Remove secrets from `config.json` and use environment variables / secrets manager.
- [TODO] Plan COPPA & privacy compliance for beta launch; prioritize transparent parent-consent flows.

Governance & contributions
- Add your initials when you pick a task (e.g., `- [IN-PROGRESS] Foo feature — owner: AV — ETA: 2025-12-05`).
- For larger items (auth, storage migration) we'll break work into smaller PR-sized tasks and assign owners.

Next steps (this session)
- Finish drafting this roadmap (done).
- Apply the updated file to the repo (next).
- After merge: open issues corresponding to the immediate tasks and create PR templates for B1–B4 work.

--
If you want, I can also open issues for the immediate tasks and create the Dockerfile + a minimal GitHub Actions workflow next. Want me to proceed with that?

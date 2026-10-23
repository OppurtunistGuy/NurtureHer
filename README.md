# Nocturne Together — Master/Sub workflow build

An incremental implementation on the supplied Nocturne codebase. The original restrained wine/ivory styling, narrow content column, onboarding and separate pages are retained. No consolidated dashboard of every feature.

**This is a single-browser, unencrypted demo, not a production-private service. Use example data only.** Camera proof, actual pairing, authentication, E2EE and screenshot blocking are not implemented or simulated.

## Run

Changes go to `UAT`, pass CI, and then move to production through a `UAT` → `main` pull request. See `RELEASE.md` for the promotion checks and deployment status.

Tested with Node 24.19 and npm 11. Use a Node version supported by Vite 8 (22.12+ or 24 recommended).

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. If the environment cannot enumerate network interfaces, use `npm run dev -- --host 127.0.0.1`. This is a source project, not a double-click HTML file or APK.

For this build use `package-lock.json` and `npm ci`. The original `bun.lock` is retained for provenance but has not been regenerated.

## Explore both roles

1. Complete onboarding with example names and choose Master or Sub.
2. Open Agreement and acknowledge it.
3. In Settings → Demo perspective, switch to the other role and acknowledge the same agreement.
4. In Sub perspective, submit a check-in from Today.
5. In Master perspective, open Proof review and accept or request clarification.
6. Pause from the header. Operational controls become read-only for both perspectives.
7. Open Pause discussion, contribute as each role, then confirm readiness as each role. Only after both confirmations does the app resume.

Demo perspective is deliberately kept in Settings rather than the main header. It is a preview tool, **not authentication**. A real paired application must not expose role switching.

## What is implemented

| Page             | Purpose                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Today            | Chronological assignments and a small Master summary; no expanded review queue                                          |
| Routines         | Master creation/edit/deletion, scheduling, opt-in, instruction acknowledgement and check-in policy; Sub change requests |
| Goals            | Master-owned goals with four areas, criteria, review date and active/completed/archived states                          |
| Proof review     | Written submissions, preserved instruction snapshots, manual acceptance/clarification/rejection and history             |
| Requests         | Permission, extension, skip, illness and routine-change requests; Master decisions and history                          |
| Notes            | Shared text notes, separate from task evidence and pause discussion                                                     |
| Agreement        | Mutual boundaries, proposals and acknowledgements                                                                       |
| Activity         | Decision and operational history (latest 300 entries)                                                                   |
| Pause discussion | Dedicated conversation and independent readiness confirmations                                                          |
| Settings         | Reminders, capability limitations and explicit demo tooling                                                             |

### Authority

The Master assigns routines and goals and makes review decisions. The Sub submits evidence and requests changes, but cannot directly edit/delete assignments or accept their own work. Consent, optional daily opt-in, pauses and agreement changes are separate from operational authority. Agreement proposals can be made by either person and resolved only by the other person.

### Supplied agreement

The Agreement page contains the supplied seven-section Master & Sub Agreement verbatim, followed by its Final Understanding. Each section expands independently. Working limits and future additions are separate from the supplied text. Both people must acknowledge this version; the app does not acknowledge it on their behalf.

Existing terms and acknowledgements are archived when this version is installed. Routines, submissions, goals and history are preserved. If an existing dynamic is paused, installation waits until discussion and mutual readiness have resumed it. This preserves the pause lock. Reloading an already installed version does not reset acknowledgements again.

RED immediately stops activity; YELLOW pauses for a check-in. Both enter the same operational lock and require discussion plus mutual readiness before resuming. Neither signal can be replaced through an ordinary agreement proposal. The session-focused arrangement through December 16 appears on Today and Agreement; no year or automatic expansion afterward is inferred.

### Submission lifecycle

`Assigned → Submitted → Master review → Accepted / Clarification / Rejected`

Only acceptance produces a new completed task. Rejection/clarification requires feedback and permits another submission; attempts remain in history. No punishments or confidence scores are generated. Legacy task completions are preserved as historical self-reports, not converted to reviewed submissions.

### Neutral prompts

A routine can optionally use a neutral, one-use, 60-second text prompt. These routines require daily opt-in. Changing an existing proof policy, or adding a neutral-prompt routine, resets both agreement acknowledgements. The prompt response is text evidence for manual review, **not verified identity, liveness, secrecy or task performance**. A new local session ID binds each attempt; the active challenge is ephemeral and invalidated on pause, routine edits, role changes and reload. The submitted prompt is retained with the response for review. No shared secret is collected or stored.

### Pause lock

The domain engine uses an allowlist during a pause. Routine/goal changes, task actions, proof generation/submission, reviews, requests/decisions, notes, agreement changes/acknowledgements, preferences, invite regeneration and in-app reset are blocked. The only changes permitted are pause discussion and readiness acknowledgement. Browsing, history filters and the demo perspective selector remain usable.

Both people must post in the **current** pause discussion before readiness can be confirmed. A new discussion message clears both previous readiness confirmations. Participation cannot prove the quality of a discussion: each person must voluntarily decide whether to resume. Pauses do not secretly accrue failure or penalties; deadlines remain visible and can be adjusted after discussion.

## Architecture

- React 19, TypeScript, TanStack Start/Router, Vite, Tailwind v4 and Radix UI.
- `src/lib/nocturne/engine.ts`: pure command/state-transition engine with role and pause rules.
- `store.ts`: React subscription adapter, local persistence, error reporting and action results.
- `storage.ts`: schema validation and migration from version 1.
- `types.ts`: routines, goals, requests, submissions, agreements and discussion types.
- Existing SSR error wrapper, CSRF middleware, route splitting and Lovable configuration are retained.

The original `nocturne.demo.v1` browser key is reused to migrate existing demo data. Valid old routines, task records, messages and history are retained; new collections default to empty. Old agreements require re-acknowledgement. An old active pause receives a fresh discussion session. Invalid saved data is not silently overwritten; writes are blocked until the user explicitly clears the demo. Storage events refresh other tabs, and commands check current persisted state before changing it. This is best-effort local coordination, not transactional multi-user security.

Remote Google Fonts requests have been removed. The existing font stacks fall back to locally available serif/sans fonts; self-host licensed font assets later if exact typography is required.

## Checks

```sh
npm test
npm run typecheck
npm run lint
npm run test:ssr
npm run build
```

`test:ssr` starts a temporary local Vite server and checks all 11 routes. Tests include pure domain rules, persistence guards, migration, and a rendered React integration workflow without mocking application actions. See `IMPLEMENTATION.md` for validation scope and production gaps.

Keep the supplied `AGENTS.md` rules when syncing changes back to Lovable/GitHub. No git history has been rewritten by this build.

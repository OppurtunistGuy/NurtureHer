# Nocturne Together

A shared space for two, with separate pages for routines, goals, written check-ins, review, requests, notes and the supplied Master & Sub Agreement. The existing wine/ivory interface is retained.

## Create, share and join

1. Open the app, enter your name, choose Master or Sub and confirm voluntary adult participation. Select **Create my space**. No account, password or partner name is required.
2. Today shows **Your space is ready**, a waiting state and a real invitation link. Copy it and send it to the other person. You can prepare routines and explore while waiting; the shared dynamic has not started.
3. The other person opens that link on their own browser, sees who invited them and their assigned opposite role, enters their name, confirms participation and selects **Join space**.
4. Both browsers now read the same space. Names, routines, notes, check-ins, review decisions and pause discussion synchronize while the app is open. Reloading restores membership from the browser session.
5. Both people review and acknowledge the agreement before task submission. Account registration and deeper onboarding can be added later.

Invitations admit one person, expire after seven days and can be replaced by their creator before pairing. Replacing a link invalidates the old link. A used, expired or invalid invitation displays an explanation instead of creating a second space. Links contain a random invitation secret in the URL fragment, with no names, tasks or agreement text. Anyone holding an unused link can occupy its vacant place: share it directly with the intended person.

The creator can be either role. Live roles are fixed by the server session; there is no live perspective switch. Each member can update their own name in Settings. Opening an invitation in a browser that already belongs to a space does not replace that space.

## Test alone

Choose **Try alone first** on the start page to open the separate browser-only demo with example routines. Its Settings page allows perspective switching. This is explicitly a solo simulation, not a connected partner. From an existing solo demo, Settings → **Create or join a shared space** starts real setup without deleting the saved demo.

To test a real invitation by yourself, use separate browser profiles or separate browser contexts. Two normal tabs share a cookie and represent the same member. The automated browser test uses isolated desktop and mobile contexts.

## Run

Requires Node 24 and npm. No external database account, signup service or secret API key is required.

```sh
npm ci --ignore-scripts
npm run dev -- --host 0.0.0.0
```

For production server output:

```sh
npm run build
npm run start
```

The default database is `data/nocturne.sqlite`. Set `NOCTURNE_DB_PATH` to a durable writable file location on the host. Keep the SQLite file and its WAL/SHM files together. Back it up outside the source repository. `HOST` and `PORT` configure the production server. For another physical device, both browsers must open the same reachable server address; localhost on a phone points to that phone. Public sharing requires a deployed Node server with HTTPS and persistent storage.

A Dockerfile is included for a single Node host:

```sh
docker build -t nocturne-together .
docker run --rm -p 3000:3000 -v nocturne-data:/data nocturne-together
```

The container definition has not been built in this workspace. The tested deployment target is Nitro `node-server`, not static hosting or an unconfigured Cloudflare Worker. No hosting provider or public production URL has been connected. Use `package-lock.json`; the original `bun.lock` is retained only for provenance.

## Shared storage and session boundary

Shared records are persisted in SQLite on the server, never in the solo-demo localStorage key. Each browser receives a random HttpOnly, SameSite=Strict cookie; only its hash is stored in the membership table. HTTPS responses add Secure. Membership lasts 30 days. This is anonymous browser membership, not an account system: clearing cookies or moving to another device has no recovery flow yet. Use example data during testing.

The server derives the acting role from membership, validates commands and runs the existing domain engine inside a SQLite transaction. Client-supplied role switches, resets and onboarding commands are rejected for shared spaces. Revision checks prevent stale updates from overwriting newer work. A stale safety stop is accepted against current state. Regular synchronization polls every two seconds while the page is visible; writes wait for server confirmation. Connection failures show an error and do not report success or replace the space.

## Agreement and pause

The Agreement page contains the supplied seven sections and Final Understanding verbatim. Previous terms are archived; fresh acknowledgements are required from both people. New agreement installation waits until an active pause is resolved. Negotiated additions remain separate from the supplied base document. The December 16 arrangement is displayed without guessing a year or automatically expanding the dynamic.

RED stops; YELLOW pauses for a check-in. While paused, both roles are blocked from operational changes, name changes and invitation changes. Only the current pause discussion and independent readiness acknowledgements can change shared activity. Both people must contribute to that discussion before either can confirm readiness. A new message resets readiness. Only both confirmations resume the dynamic. Unpaired spaces have no active dynamic to pause; this avoids a pause that could never be mutually resumed before joining.

The Master assigns and reviews; the Sub submits and requests changes. Acceptance completes a task. A missed task or rejected submission never automatically triggers a punishment.

## Privacy limits

No camera, media upload, tracking, intimate proof requirement, screenshot blocking or liveness/biometric verification is implemented. Written submissions are self-reported evidence for manual review. Shared text is readable on the server and by the two members; there is no end-to-end encryption. Same-origin scripts or a compromised browser/server can expose data. The public repository contains the supplied agreement, not live records or media.

## Checks and release

```sh
npm test
npm run typecheck
npm run lint
npm run test:ssr
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

The browser test starts the built Node server with a disposable database and uses isolated desktop/mobile sessions for creation, invitation, joining, reloads, profile updates, shared routines/notes, role restrictions, pause/discussion/resume and used-link rejection. Domain/API tests also cover concurrency, expired links, stale writes, persistence across repository restarts, cross-origin rejection and independent acknowledgements. See `QA.md` for results and `IMPLEMENTATION.md` for design boundaries.

All changes go to `UAT` first, pass CI, then move through a `UAT` → `main` PR. See `RELEASE.md`. The existing published history and `AGENTS.md` rules are preserved.

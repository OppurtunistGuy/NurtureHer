# Nocturne Together

A shared space for two, with separate pages for routines, goals, written check-ins, review, requests, notes and the supplied Master & Sub Agreement. The existing wine/ivory interface is retained.

## Create, share and join

1. Open the app, enter your name, choose Master or Sub and confirm voluntary adult participation. Select **Create my space**. No account, password or partner name is required.
2. Today shows **Your space is ready**, a waiting state and a real invitation link. Copy it and send it to the other person. You can prepare routines and explore while waiting; the shared dynamic has not started.
3. The other person opens that link on their own browser, sees who invited them and their assigned opposite role, enters their name, confirms participation and selects **Join space**.
4. Both browsers now read the same space. Names, routines, notes, check-ins, review decisions and pause discussion synchronize while the app is open. Reloading restores membership from the browser session.
5. Both people review and acknowledge the agreement before task submission. Account registration and deeper onboarding can be added later.

Invitations admit one person, expire after seven days and can be replaced by their creator before pairing. Replacing a link invalidates the old link. A used, expired or invalid invitation displays an explanation instead of creating a second space. Links contain a random invitation secret in the URL fragment, with no names, tasks or agreement text. Anyone holding an unused link can occupy its vacant place: share it directly with the intended person.

The creator can be either role. Live roles are fixed by membership in each relationship; there is no live perspective switch. Each member can update their own name in Settings. **Add a space** creates or joins another relationship without replacing existing spaces. One Master can have multiple Subs, and one Sub can have multiple Masters. A person can have different roles in different relationships. Each relationship remains a separate private pair-space with its own agreement, tasks, notes, review and pause. Members cannot see their partner's other memberships.

The header's **Active space** selector switches relationships. Selection is stored per tab, and every mutation identifies its space explicitly. Switching discards unsaved page editors so a draft cannot be accidentally saved into another relationship. Pausing one space does not pause or resume another. The same browser identity cannot redeem both places in one pair.

The space uses the creator's detected timezone for both people's schedule, task dates and reminders. Settings shows that timezone; a differently configured server or partner device cannot move a check-in onto a different day.

## Test alone

Choose **Try alone first** on the start page to open the separate browser-only demo with example routines. Its Settings page allows perspective switching. This is explicitly a solo simulation, not a connected partner. From an existing solo demo, Settings → **Create or join a shared space** starts real setup without deleting the saved demo.

To test a real invitation by yourself, use separate browser profiles or separate browser contexts. Two normal tabs share a cookie and represent the same member. The automated browser test uses isolated desktop and mobile contexts.

## Run

Requires Node 24 and npm. The core workflow needs no external database account, signup service or secret API key. AI and Telegram are optional server integrations.

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

No camera, in-app media storage, tracking, intimate proof requirement, screenshot blocking or liveness/biometric verification is implemented. Camera work is deferred to the next phase. Written submissions and Telegram receipts are self-reported evidence for manual review. Shared text is readable on the server and by the two members; there is no end-to-end encryption. Same-origin scripts or a compromised browser/server can expose data. The public repository contains the supplied agreement, not live records or media.

## AI routine drafting

In Routines, the Master can expand **Draft a routine with AI**, describe the desired schedule and generate a draft that opens in the ordinary editor. It stays unsaved until **Save**. The Sub can request routine changes through the existing flow. The server checks membership, role and pause before calling the provider, validates the result, and checks pause again before returning it. No AI task verification or automatic consequences are introduced.

Configure server environment variables `OPENAI_API_KEY` and `OPENAI_ROUTINE_MODEL` using a Responses API model that supports Structured Outputs. No key goes in the browser or a `VITE_` variable. Only the description explicitly submitted is sent to OpenAI; names, agreement, messages and media are not attached. Requests use `store: false`; this does not assert zero provider retention. Missing setup or provider failures show an error and preserve the manual workflow. Provider tests use mocks; no paid live provider call has been made in this build. Reference: https://developers.openai.com/api/docs/guides/structured-outputs.

## Telegram proof receipts

Proof review has a separate expandable **Telegram proof collection** panel. Optional media is shared in the participants' agreed Telegram conversation; this build supports confirmations through a private bot, rather than ingesting arbitrary group chat messages. Each participant chooses the same routine and opens their own personal bot link from the app. These are private bearer links, consumed once and valid only for the pending daily receipt. Keep them private. Distinct Telegram accounts are required within a space. Linked accounts cannot be replaced through a new link; account recovery is future work.

The bot gives a record ID and accepts `/yes RECORD`, `/no RECORD` and `/status RECORD`. Media optionally sent to the bot can have `/proof RECORD` as its caption. The server records only whether such an input arrived, never Telegram file IDs, filenames, download URLs or file bytes. It does not forward media to the other participant: use the agreed Telegram conversation for sharing. A text alternative remains available. Telegram has its own privacy and retention rules; moving media there does not prevent screenshots, downloads or external photographs.

Only both yes confirmations create **Proof submitted successfully** in the app, as a submission awaiting the existing human review. One yes, a no, an unlinked sender, stale instructions, an expired daily record or a paused space cannot submit it. The same consent, daily opt-in and instruction acknowledgement rules apply. Neutral challenge routines retain their written prompt flow. Duplicate webhook deliveries cannot create another submission. The app polls receipts as well as task state, so a first confirmation becomes visible without changing the task.

Configure `TELEGRAM_BOT_USERNAME` without `@` and a random `TELEGRAM_WEBHOOK_SECRET` of at least 32 characters in the Node host's environment. Register the bot's HTTPS webhook as `https://YOUR_HOST/api/space/telegram` using Telegram `setWebhook`, passing the **same** `secret_token` and `allowed_updates: ["message"]`. Keep the bot token in the operator's secret manager; this app uses Telegram's response-to-webhook mechanism and does not need the bot token at runtime. Only authenticated private-chat message updates are processed. Keep the secret header and body out of proxy logs. See https://core.telegram.org/bots/api#setwebhook and https://core.telegram.org/bots/api#making-requests-when-getting-updates. Automated tests simulate authenticated Telegram deliveries; a real bot and public HTTPS host have not been connected.

## Existing data and parallel environments

The first start of this version automatically migrates the membership table, retaining session hashes, roles and all space records. Before migrating a persistent legacy database it writes a consistent SQLite backup alongside it, with restricted permissions. The migration is transactional and does not reset or seed live spaces. Keep enough disk space for that backup. Stop the old server before starting the new build; do not run the old single-space version against the migrated database. To roll back, restore the backup with the old version while the server is stopped.

Use separate `NOCTURNE_DB_PATH` locations and separate AI/Telegram configuration for development, UAT and production. Never point parallel developers or CI at a live database. This is still a single persistent Node host with serialized SQLite writes, not a horizontally scaled deployment. Isolation tests are not a capacity benchmark. Integrate parallel changes serially through UAT and test the exact candidate before promotion.

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

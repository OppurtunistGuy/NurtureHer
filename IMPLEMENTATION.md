# Implementation notes — shared create/join flow

## Root cause and change

The previous Join button deliberately returned a backend-required error. Its code and pairing status existed only in localStorage; another device could not redeem the code or see the creator's space. Local workflow tests did not exercise that path.

Setup is now one short form. Creating a space stores a server record and returns an expiring invitation. Opening it previews only the creator's name and vacant role. Joining atomically consumes the invitation, creates the other browser's membership and updates the same space. Existing demo data remains on its original browser key; it is not silently uploaded or deleted. A separate solo-demo entry supports testing without a partner.

## Implementation

- `space-api.server.ts`: same-origin JSON API, bounded request bodies, validation, no-store responses and HttpOnly membership cookie.
- `space-repository.server.ts`: persistent Node SQLite repository, member-derived actor, atomic invitation redemption, revision checks and server-side domain transitions.
- `space-protocol.ts`: snapshot shape and fragment-based invitation links without names or private text.
- `initial-state.ts`: shared state factory without importing a React store into the server.
- `store.ts`: server-confirmed shared actions, initial session restoration, polling, stale-state reconciliation and an independent legacy local-demo path.
- `SpaceConnection.tsx`: waiting/connected status, copyable link, replacement invitations and own-name update.
- `index.tsx`: create/join/solo entry without account signup or deeper onboarding.
- `scripts/browser-smoke.mjs`: production server plus independent desktop/mobile browser contexts. No application actions or API responses are mocked.

The existing domain engine, agreement document, page navigation, submission review and pause discussion remain in use. UI handlers now await shared writes before reporting success. Live role switching and local reset are hidden and rejected server-side. Client-supplied actor fields cannot grant authority.

Every server change executes inside BEGIN IMMEDIATE, reads current state, verifies membership and revision, validates the resulting state and commits atomically. Safety stops bypass stale revision rejection, then run against current state. Failed mutations roll back; an outdated request receives a current snapshot and must be deliberately retried. A stopped dynamic cannot accept a later operational write. No new external accounts, cloud services or credentials have been connected.

## Deployment boundary

The build target changes from the previous default Cloudflare module to Nitro node-server because the shared repository uses Node 24's built-in SQLite. It needs one persistent writable filesystem. Node hosting must preserve the database across deployments and use HTTPS. Static hosting, ephemeral serverless filesystems and unconfigured Cloudflare Workers are unsupported. The app is runnable with `npm run start`; no public host or production URL has been provisioned. The Dockerfile is provided but not locally validated.

## Remaining scope

Anonymous sessions last 30 days and have no recovery, account identity, device transfer, access revocation UI or re-pairing flow. Invitations are bearer links: possession permits joining the single vacant seat until redemption/expiry. Browser cookies and server state bind roles but do not establish a person's real-world identity. A mature release still needs identity/recovery, retention/deletion controls, operational abuse protection, hosting/backups, transport configuration and security review.

No E2EE, media/camera module, facial recognition, screenshot prevention, location tracking or automated disciplinary action is added. Clear browser/server failures are reported rather than replaced with simulated success. Use example data during this testing stage.

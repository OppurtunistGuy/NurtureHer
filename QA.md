# Validation report — relationships, AI drafts and Telegram receipts

Date: 23 October 2026. Local environment: Node 24.19.0 / npm 11.9.0.

| Check                                                               | Result                                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Unit, domain, rendered workflow, AI provider and shared API tests   | PASS: 147 tests in 9 files                                                   |
| TypeScript                                                          | PASS                                                                         |
| ESLint                                                              | PASS: 0 errors; 7 existing Fast Refresh warnings                             |
| Server-rendered page routes                                         | PASS: 11 routes                                                              |
| Production build                                                    | PASS: client, SSR and Nitro node-server output                               |
| Production API startup                                              | PASS: built Node server responds to anonymous session lookup                 |
| Dependency audit                                                    | PASS: zero vulnerabilities                                                   |
| Local Playwright execution                                          | BLOCKED: browser download returned a truncated archive; no browser installed |
| GitHub extended browser acceptance                                  | PASS on UAT application commit daeb160; Actions run 39990917314              |
| Physical phones, Safari, Firefox, penetration test, container build | NOT PERFORMED                                                                |

## Why the former tests missed the basic flow

The original 73 tests covered a local demo, role rules and rendering. They did not redeem a link from another browser: the old Join implementation intentionally returned a backend-required error. The new shared tests exercise the actual request handler and SQLite repository with independent cookie jars, without replacing the server with fake state.

## Shared API coverage

- Creation as either role, preview, opposite-role assignment and joining the identical space.
- Waiting status before joining, consumed links, third-person rejection and simultaneous redemption attempts.
- Seven-day expiry, link replacement and creator access after expiry.
- Multiple private relationships retain the same browser identity without replacing existing spaces. One Master can have several Subs and one Sub several Masters; roles can differ per space.
- Scoped writes, outsider-space rejection, ambiguous legacy-write rejection, own-invitation rejection, independent agreements, identical routine IDs and pause isolation.
- RED during an in-flight space switch keeps controls locked until all requests settle; late stop responses cannot reopen a different relationship after a create completes.
- Legacy membership migration preserves both sessions and saved records; a consistent backup is created once before migration.
- Reload-equivalent reads and persistence across closing/reopening the SQLite repository.
- Own-name update visible to the other member; server-derived role prevents switching to the other role.
- Shared routine assignment, separate agreement acknowledgements, written submission and Master acceptance.
- Stale revision rejection with a fresh snapshot and no duplicate write.
- Shared task dates and deadline checks use the creator's timezone, including India/UTC midnight boundaries; unsupported zones are rejected.
- Stale RED acceptance; server pause lock for both members; discussion and independent mutual resume.
- Avoiding an unpaired pause that cannot be mutually resumed before a second member joins.
- Server-stored expiring neutral prompts; the Master does not receive the other member's active challenge.
- Unauthorized reads, cross-origin changes, invalid roles/names/adult confirmation, bounded request bodies and link parsing.

## Browser acceptance

`npm run test:e2e` starts the actual production Node server with a disposable database. Playwright uses two isolated cookie/storage contexts: desktop creator and mobile-width joining member. It checks create, a usable invitation, creator reload, partner entry/name/join, shared identity, mobile overflow, member reload, fixed roles, own-name updates visible to the partner, shared routines and notes, RED propagation, read-only controls, discussion, independent readiness and used-link rejection. The happy path does not mock app actions or API responses.

GitHub Actions installs Chromium and must pass this test on UAT before promotion. The production PR also checks that its exact head already passed UAT and runs the suite again. CI retains the tested build for seven days. This is automated Chromium coverage, not certification of physical phones or all browsers.

## Deployment and privacy boundaries

The extended browser script covers multiple partners in both directions, per-tab selection, reload persistence, discarding an unsaved editor on a space switch and retaining each space's pause. AI editor acceptance uses a mocked external draft response and verifies nothing is saved until explicit Save. Provider contract tests validate the actual adapter with mocked HTTP envelopes, invalid fields, refusal, failures, bounded responses and timeouts. API tests enforce member/Master access and pause. A paid live AI request has not been made.

Telegram tests simulate authenticated updates through the HTTP handler and transactional repository: distinct linked accounts, consumed links, both yes, a no, expired instructions/day, duplicate delivery, media metadata exclusion, outsider rejection, setup absence, consent/preparation and pause lock. Extended browser acceptance posts simulated webhook updates to the built Node route and waits for the receipt in both browser sessions. No real Telegram bot, real media or public webhook is connected by these tests.

AI credentials and a Telegram HTTPS webhook require operator setup. Camera work is deferred; media files remain outside app storage. Isolation coverage does not establish concurrent production capacity. See the exact candidate's Actions run for the extended browser result.

No public production URL, hosting account or branch protection is configured. The application now has a real shared server repository, but it requires a reachable Node 24 server with persistent storage. It is not deployable as static HTML or a default Cloudflare Worker. Shared membership uses an anonymous browser cookie, without account login/recovery or E2EE. Camera, in-app media storage and photographic verification remain absent. Use example data while testing.

# Validation report — create/share/join

Date: 23 October 2026. Local environment: Node 24.19.0 / npm 11.9.0.

| Check                                                               | Result                                                                             |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Unit, domain, rendered workflow and shared API tests                | PASS: 95 tests in 7 files                                                          |
| TypeScript                                                          | PASS                                                                               |
| ESLint                                                              | PASS: 0 errors; 7 existing Fast Refresh warnings                                   |
| Server-rendered page routes                                         | PASS: 11 routes                                                                    |
| Production build                                                    | PASS: client, SSR and Nitro node-server output                                     |
| Production API startup                                              | PASS: built Node server responds to anonymous session lookup                       |
| Dependency audit                                                    | PASS: zero vulnerabilities                                                         |
| Local Playwright execution                                          | BLOCKED: browser download returned a truncated archive; no browser installed       |
| GitHub two-browser acceptance                                       | Mandatory CI step; inspect the matching UAT/PR commit's Actions run for its result |
| Physical phones, Safari, Firefox, penetration test, container build | NOT PERFORMED                                                                      |

## Why the former tests missed the basic flow

The original 73 tests covered a local demo, role rules and rendering. They did not redeem a link from another browser: the old Join implementation intentionally returned a backend-required error. The new shared tests exercise the actual request handler and SQLite repository with independent cookie jars, without replacing the server with fake state.

## Shared API coverage

- Creation as either role, preview, opposite-role assignment and joining the identical space.
- Waiting status before joining, consumed links, third-person rejection and simultaneous redemption attempts.
- Seven-day expiry, link replacement and creator access after expiry.
- Existing-member protection; a new create/join attempt cannot replace the browser's current space.
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

No public production URL, hosting account or branch protection is configured. The application now has a real shared server repository, but it requires a reachable Node 24 server with persistent storage. It is not deployable as static HTML or a default Cloudflare Worker. Shared membership uses an anonymous browser cookie, without account login/recovery or E2EE. Camera/media and photographic verification remain absent. Use example data while testing.

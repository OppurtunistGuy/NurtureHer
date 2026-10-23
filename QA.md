# Validation report

Build date: 23 October 2026. Environment: Node 24.19.0 / npm 11.9.0.

| Check                                                                      | Result                                                                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `npm test`                                                                 | PASS: 73 tests in 6 files                                                                                          |
| `npm run typecheck`                                                        | PASS: no TypeScript errors                                                                                         |
| `npm run lint`                                                             | PASS: 0 errors; 7 React Fast Refresh warnings (6 inherited UI-component warnings, 1 shared request-label constant) |
| `npm run test:ssr`                                                         | PASS: 11 routes return HTTP 200 with app markup                                                                    |
| `npm run build`                                                            | PASS: client, SSR and Nitro Cloudflare-module output generated                                                     |
| Chrome desktop smoke test                                                  | PASS: onboarding, both perspectives, submission, manual acceptance, persistence, pause/discussion/mutual resume    |
| Mobile/device and cross-browser QA                                         | NOT COMPLETED                                                                                                      |
| Camera, media, physical devices and screenshot blocking                    | NOT IMPLEMENTED / NOT TESTED                                                                                       |
| Production authentication, encryption and multi-user backend authorization | NOT IMPLEMENTED / NOT TESTED                                                                                       |

The rendered UI test exercises actual page components and real application actions: adult acknowledgement/onboarding; both agreement acknowledgements; partner read-only routines; text submission; Commander acceptance/history; goal creation; pause locking; history browsing during pause; separate discussion; independent readiness; and resumption/activity history. It uses jsdom, not a real browser or visual screenshot renderer.

Domain tests reject every operational mutation while paused for both roles, even when UI controls are bypassed. They test role separation, duplicate submissions/reviews, opt-in/instruction checks, immutable submission snapshots, input validation, prompt expiry/invalidation, permission decisions, actual per-day extensions, illness recurrence filtering, and legacy/corrupt state. Persistence tests cover stale-tab pause refresh, ephemeral role/challenge handling and corrupt-data preservation.

SSR checks cover `/`, `/today`, `/routines`, `/goals`, `/proof`, `/requests`, `/notes`, `/agreements`, `/discussion`, `/activity`, `/settings`, and ensure no external Google Fonts link is injected.

Build output includes non-fatal existing-toolchain notices about Vite path resolution plugins, Nitro/Rolldown options and plugin timings. Dependencies were installed with scripts disabled. No repository push, deployment, external account connection, media transmission or native build was performed.

Passing these checks establishes the stated local-demo behavior, not production security or photographic/biometric proof.

## Follow-up real-browser run

The supported managed preview was started and tested in Chrome using disposable demo data. The run exposed two preview compatibility issues: Vite needed the specific internal `terminal.local` development hostname, and `crypto.randomUUID()` was unavailable over that HTTP origin. The hostname is explicitly allowed (not a wildcard); IDs now fall back to RFC 4122 v4 values generated with `crypto.getRandomValues`, never `Math.random`. Legacy pause migration uses the same helper. An added regression test covers the non-secure-context fallback.

Browser observations: Partner routines had zero Edit/New routine buttons and six Request change buttons; a check-in appeared Awaiting review; the Commander accepted it and the evidence stayed in History; the accepted count became 1/6. During pause, New goal and Clear demo data were disabled, readiness was disabled before discussion, and one acknowledgement did not resume the app. After a message and acknowledgement from each demo role, the pause banner disappeared and the accepted task remained completed. A direct page load restored persisted data.

This was internal browser QA, not a published interactive URL. Camera/media, physical-device testing, mobile viewport testing and production multi-user security remain outside this validation. Some first-time lazy-route transitions required waiting or a direct reload in the development session; this smoke run is not a navigation-performance or cross-browser certification.

## Supplied agreement update

Six additional tests cover verbatim agreement installation, one-time migration with archived terms, deferred installation while paused, RED and YELLOW locking for both roles, and keeping negotiated additions separate from the supplied document. The rendered workflow also checks the agreement heading and section availability. Type checking, lint, production build and all 11 SSR routes pass after this update.

A Chrome check of `/agreements` confirmed all seven section headings plus Final Understanding, archived previous terms, both safety controls, and an available acknowledgement action. No acknowledgement was made on behalf of either person. This check does not constitute acceptance of the agreement.

## GitHub UAT quality gate

The source is now tracked in `OppurtunistGuy/NurtureHer`. `UAT` is tested before promotion to the existing production branch `main`. GitHub Actions repeats the checks on a clean Ubuntu runner and retains the tested build. Production PRs must originate from this repository's `UAT` and reference a head SHA with a successful UAT push run.

The first remote SSR check exposed ANSI color codes inside Vite's printed URL. The readiness matcher now strips terminal control characters; a local run with `FORCE_COLOR=1` checks this regression, and the subsequent remote UAT run passed all checks. Dependency auditing identified the existing Vite 8.1.5 development-server advisories; Vite is updated to 8.3.5, with a high/critical audit check added to CI. The final revision is subject to the same full UAT and PR checks before merge. Branch protection and hosting remain unconfigured as described in `RELEASE.md`.

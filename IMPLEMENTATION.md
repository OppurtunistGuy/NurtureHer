# Implementation notes — 23 October 2026

## Delivered scope

This build extends the uploaded application rather than replacing it. Navigation remains page-based, with eight compact desktop destinations and a mobile bottom bar plus More sheet. Goals, review queues, requests, notes and agreements are not dumped onto Today.

New files include the domain engine, migration schema, Goals/Proof/Requests/Discussion routes, submission dialog and regression tests. Existing routine, onboarding, Today, notes, agreement and settings screens have been connected to the new command boundary. Controls show errors rather than reporting success after a rejected command.

## Supplied Master & Sub Agreement

`src/lib/nocturne/agreement-document.ts` stores the complete supplied wording and installs version `master-sub-2026-10-23-v1`. The Agreement route renders seven collapsible sections and Final Understanding, with separate acknowledgement, working limits, additions and archive areas. Role labels are Master/Sub. Existing custom names are preserved.

Migration archives previous terms and their acknowledgements, preserves operational data, clears current acknowledgements, and installs only once. During an active pause it records that an update is pending and waits for discussion and mutual resume before installing. RED and YELLOW immediately enter the existing pause lock. Missed tasks still do not trigger automatic punishments. The December 16 arrangement is displayed without guessing a year or automatically broadening the dynamic afterward.

## Privacy boundaries

- No camera, microphone, GPS, media upload, facial recognition or covert monitoring.
- No fake camera result, fake encryption badge, or misleading AI confidence score.
- No third-party font requests in app pages.
- All application text remains unencrypted localStorage data. It can be read/modified by someone with browser/device access, same-origin script execution or developer tools.
- There is no authenticated relationship, backend ACL, signed invite redemption or cloud synchronization. The shared demo selector cannot be treated as a production permission mechanism.
- Client-side roles, timestamps, history and prompt matching are not cryptographic evidence and cannot prevent intentional local tampering.
- Local pause enforcement is thoroughly tested, but real multi-user enforcement requires an atomic backend check before every write. Two browser tabs cannot provide transactional guarantees.
- No app control can guarantee prevention of another device photographing a displayed screen. This build does not promise screenshot blocking.
- The in-app operational reset is blocked during pause; browser/site-data controls remain independent. Privacy deletion in a future service must not depend on partner approval.

## Native/media module is NOT built

If approved separately, begin with feasibility tests on physical devices. Do not change the web experience to pretend unsupported hardware works. A future module would need explicit, revocable task-specific consent; visible camera indicators; no intimate proof; on-device processing; an honest unsupported state; and a validated threat model. Obstruction means insufficient evidence, not proof of dishonesty. Detection of a person/object does not prove task completion. Secret/decoy text is not a substitute for authentication or encryption.

Production media would also require a carefully reviewed key-management design, retention/deletion policy, access authorization, content-type validation, no public URLs, and secure delivery. “No download button” and view-once UI are not exfiltration protection. No such media security claims are made here.

## Production next steps

1. Choose backend and identity provider with the user before connecting an account/service.
2. Bind roles to authenticated users; remove demo role switching.
3. Execute the command engine on a trusted server with resource ownership checks, revision checks, idempotency and atomic pause/commit transactions.
4. Replace client timestamps and mutable activity with authoritative server records. Coordinate in-flight operations with a pause epoch so a paused operation cannot commit later.
5. Design retention, deletion, account/device revocation, backup and encryption/E2EE before accepting sensitive information.
6. Replace local neutral prompts with server-bound one-use expiring challenges if needed. Do not call text matching liveness verification.
7. Perform real-browser mobile/desktop visual QA, accessibility checks, device/timezone tests and a security review before deployment.

## Validation

The project includes domain, storage and rendered-UI integration tests plus an 11-route HTTP/SSR smoke test. Exact final results are recorded in `QA.md`.

Follow-up validation used the supported managed browser preview and completed a Chrome desktop smoke cycle. It found and fixed the internal development-host allowlist and HTTP-context UUID startup issues; see `QA.md`. Mobile/cross-browser visual checks and native hardware/camera tests remain uncompleted. No claims of device-camera feasibility, production privacy or penetration testing should be inferred from these checks.

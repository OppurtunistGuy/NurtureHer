# UAT to production

This repository uses exactly two working branches:

- `UAT`: all application changes land here first.
- `main`: production source, retaining the repository's existing default branch name.

## Promotion

1. Commit changes to `UAT` and wait for **Nocturne CI / Quality gate** to pass on that exact commit.
2. Review the tested behavior in UAT. Automated checks cover dependency advisories (high/critical findings fail), TypeScript, lint, domain/workflow tests, 11 server routes and the production build. Device and real-user acceptance are separate checks.
3. Open a pull request from `UAT` to `main`. Its quality gate requires a successful UAT push run for the same head SHA, then tests the proposed merge again. A different source branch or a fork fails the promotion check.
4. Merge only after the PR check passes, using a normal merge commit. Do not squash, rebase or force push published history.
5. Keep `UAT` for subsequent changes. If production changes outside this flow, merge `main` back into `UAT` before continuing.

Actions retains the tested `.output` build as a compressed artifact for seven days. Successful CI does not deploy a website. No hosting provider, deployment credentials or production URL has been configured.

## Repository settings

Branch protection must be enabled in GitHub settings to enforce this flow against direct writes: require a pull request and **Quality gate** on `main`; block force pushes and deletion. The connected GitHub tools cannot change these administrative settings. Until configured, CI detects an invalid promotion PR but cannot prevent an authorized user from bypassing the process with a direct push.

The repository is public. Source includes the supplied agreement, but no live browser records, personal names, check-ins, secrets or media. The application remains the local-browser demo described in `README.md`; merging production source does not add authentication, encryption or a shared backend.

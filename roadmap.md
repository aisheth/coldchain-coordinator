# ColdTrack additions

## Worker account management

- [x] Inspect user update/reset-password and forced-password-change/token contracts.
- [x] Add owner/admin worker editing with active status and a separate confirmed password reset flow.
- [x] Keep temporary passwords out of drafts/logs and preserve worker self-service access.
- [x] Add regression tests; run 79 tests, changed-file/full lint and automated typecheck/production build without live writes or deployment.
- Browser edit/reset verification used isolated API responses and created no records. Changed-file lint has zero errors and four existing warnings; full lint retains 37 pre-existing formatting errors and 11 warnings. Live target-user token revocation remains unverified because no real password was reset.

- [x] Verify worker sign-in, dedicated routes, own-assignment isolation and allowed actions with mock API tests.
- [x] Add confirmed CSV master-data imports, templates, validation, duplicate detection and partial-failure retry.
- [x] Add per-user browser-local drafts to transaction and other non-secret forms, with resume/discard controls.
- [x] Run 70 regression tests, changed-file/full lint and automated typecheck/production checks; browser flows verified without live writes. Changed-file lint has zero errors; full lint retains 37 pre-existing formatting errors and 11 warnings.
- [x] Report exact coverage and blockers; no publishing or deployment.

## Previous audit

- [x] Audit every owner sidebar route and API-backed data flow.
- [x] Fix `/workers` being treated as a worker-only route and add regression coverage.
- [x] Inspect live item, variant, category, size-option and UOM contracts.
- [x] Add owner/admin item and variant creation with validation, progress, errors and empty states.
- [x] Run focused tests, full tests, typecheck and build; browser-check with isolated API responses.
- [x] Report changed flows and remaining blockers; do not publish.
- Live authenticated server reads/writes remain unverified; this request intentionally used isolated mock API sessions and created no real records.

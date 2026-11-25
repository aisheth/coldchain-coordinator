# ColdTrack focused functionality audit

- [x] Audit every owner sidebar route and API-backed data flow.
- [x] Fix `/workers` being treated as a worker-only route and add regression coverage.
- [x] Inspect live item, variant, category, size-option and UOM contracts.
- [x] Add owner/admin item and variant creation with validation, progress, errors and empty states.
- [x] Run focused tests, full tests, typecheck and build; browser-check with isolated API responses.
- [x] Report changed flows and remaining blockers; do not publish.
- [ ] Verify live server reads/writes with the owner's existing session — blocked because the sandbox cannot access that browser session.

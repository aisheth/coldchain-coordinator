# Connect ColdTrack to the live FastAPI backend

## Integration foundation
- Add a reusable browser API client using `VITE_API_BASE_URL`, defaulting to `https://cold-chain-clin.onrender.com`, with all resource paths under `/api/v1`.
- Implement identifier/password login, bearer tokens, refresh, logout, session expiry handling, and readable backend/network/validation errors.
- Replace the seeded localStorage store with live API loading, empty/loading/error states, and real asynchronous mutations. Keep the existing visual design.

## Connected owner flows
- Load real dashboard assignments and history, projects/customers, workers, vendors, catalogue items/variants, and activity.
- Create/edit projects using customer records; create workers with required login credentials; create vendors.
- Build a request, add material lines, finalize it, and assign it to a worker/vendor with delivery details.
- Show assignment materials, history, issues, delivery, and authenticated proof images. Limit owner status actions to transitions allowed by the API.

## Connected worker flows
- Load only the signed-in worker’s assignments and profile; remove worker impersonation.
- Use server-provided allowed transitions for task progress, with real issue, hold, delivery, and attachment requests.
- Make photo upload and status updates refresh from the server and surface partial or failed requests honestly.

## Explicitly unsupported or changed UX
- Remove sample-data reset and mock-only owner/worker switching.
- Disable or remove note-only updates, unsupported project description/reference persistence, worker area, vendor specialty, and arbitrary customer changes where no matching endpoint exists; explain this in the UI.
- Keep backend-provided attachment metadata and fetch protected images with bearer authorization.

## Verification and handoff
- Add focused tests for API paths, bearer/error handling, and backend-to-UI status mapping.
- Check the production build and test login/loading behavior in the browser. Verify authenticated end-to-end actions only if test credentials are supplied.
- Document changed flows, unsupported actions, and any remaining API/CORS/login setup.

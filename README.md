# Cold-Chain Coordinator

Cold-Chain Coordinator is a procurement and field-work tracking application with a React/TanStack frontend and a FastAPI backend.

## Repository layout

```text
src/, public/, package.json       # Web frontend
procurement-backend/              # FastAPI API, tests, and local PostgreSQL stack
```

The frontend and API are separate applications. Each self-hosted organization should use its own API, database, and frontend configuration.

## Run locally

Requirements: Node.js supported by Vite 8 (20.19+ or 22.12+), Python 3.11+, and Docker Desktop.

### 1. Start the API and database

In PowerShell, from the repository root:

```powershell
if (-not (Test-Path procurement-backend\.env)) {
    Copy-Item procurement-backend\.env.example procurement-backend\.env
}
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Put the generated value in `SECRET_KEY` in `procurement-backend\.env`. Keep this file private. The example database credentials are only for local development.

Then start the API and PostgreSQL:

```powershell
Set-Location procurement-backend
docker compose up --build
```

The API is available at `http://localhost:8000`; its Swagger interface is at `http://localhost:8000/docs`. In another terminal, create an owner; the password prompt does not echo the password:

```powershell
Set-Location procurement-backend
docker compose exec api python -m app.cli create-owner --org "My Company" --username owner --name "Owner Name"
```

### 2. Start the frontend

In a second terminal, from the repository root:

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). The frontend template points to the local API at `http://localhost:8000`. Set `VITE_API_BASE_URL` in `.env.local` if using a different API origin. Only public API origins belong in `VITE_*` variables; never put database URLs or signing keys there.

## Tests and checks

Backend tests:

```powershell
Set-Location procurement-backend
$env:SECRET_KEY = "test-only-signing-key-with-at-least-32-characters"
python -m pip install -r requirements.txt
pytest
```

Frontend tests and production build, from the repository root:

```powershell
npm test
npm run build
```

## Self-hosted deployment

Deploy the frontend and API separately:

1. Deploy `procurement-backend/` as a Docker web service and provision a PostgreSQL database for that installation.
2. Set `DATABASE_URL` (using the `postgresql+psycopg://` driver), a unique `SECRET_KEY` of at least 32 characters, and exact frontend origins in `CORS_ORIGINS` using the host's secret/environment settings.
3. Configure `UPLOAD_DIR` on persistent storage if delivery photos must survive restarts.
4. Deploy the frontend as a static/web application with `VITE_API_BASE_URL` set to the public API origin.
5. Create the first owner in the backend environment after the API is healthy. Never include a password in a command, source file, screenshot, or frontend variable.
6. Test owner and worker sign-in, catalogue operations, task assignment, worker updates, and photo persistence before inviting users.

The exact host-specific deployment configuration can be added once the hosting provider is chosen. GitHub stores source code; it does not run the application by itself.

## Security and project status

- Never commit `.env` files, database files, uploaded files, credentials, or real customer/worker records.
- Rotate credentials that have been shared or exposed before publishing or reusing the deployment.
- The app has no public self-sign-up flow. Create an owner for each self-hosted installation.
- No license has been selected. Keep the repository private until one is chosen; do not describe the project as open source before then.
- Backend tables currently use `create_all`; review the backend README's production limitations before relying on it for critical business data.

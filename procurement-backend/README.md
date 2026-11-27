# Procurement Management API

FastAPI + PostgreSQL backend for cold-storage procurement: an owner builds a request from the item catalogue, assigns it to a worker, tracks progress, and confirms delivery.

## Local development

Requires Python 3.11+ and Docker. From this directory, copy the example settings and generate a unique signing key:

```powershell
Copy-Item .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Put the generated value in `SECRET_KEY` in `.env`. Never commit `.env`; the example database credentials are for local development only.

Start the API and local database:

```bash
docker compose up --build
```

The API is available at `http://localhost:8000`; docs are at `http://localhost:8000/docs`. Tables and units of measure initialize on startup. Create the first owner in another terminal. The password is prompted without echo:

```bash
docker compose exec api python -m app.cli create-owner --org "My Company" --username owner --name "Owner Name"
```

Run tests with `pytest` (SQLite, fast) or set `TEST_DATABASE_URL` to a disposable PostgreSQL test database first.

All endpoints live under `/api/v1`; errors always look like `{"error": {"code", "message", "details"}}`.

## Layout

| File | Role |
|---|---|
| `models.py` | Tables and database-level rules |
| `schemas.py` | Request/response contract |
| `state_machine.py` | Status lifecycle and allowed transitions |
| `procurement.py` | Assignment workflow, transitions, issues, delivery, reassignment, completion |
| `services.py` | Notifications, allocation maths, attachment linking |
| `routers/` | HTTP endpoints by area |

## Typical workflow

1. `POST /auth/login` (username or email) returns an access token; send it as a bearer token in the `Authorization` header.
2. Owner/admin manages catalogue, units, customers, and vendors.
3. Owner creates a project and procurement request, adds request items, and finalizes the list.
4. Owner assigns the request to a worker.
5. Worker reads `GET /me/assignments`, uses the allowed transitions returned by the API, updates item progress, and uploads delivery proof through `/attachments`.
6. Owner confirms completion or requests follow-up.

## Roles

- `owner`: manages the organization and all supported workflows.
- `admin`: manages users other than owners, item master data, customers, and vendors.
- `worker`: accesses only their own assignments.

## Deployment

- Each organization should use its own API deployment, PostgreSQL database, and frontend configuration.
- Set a unique `SECRET_KEY` (at least 32 characters) and the exact frontend origin(s) in `CORS_ORIGINS` using the host's environment/secret settings.
- Set `DATABASE_URL` to the deployment database using the `postgresql+psycopg://` driver.
- The upload directory must be persistent if attachments need to survive container restarts.
- Do not expose `.env`, database files, uploaded attachments, demo credentials, or real user/customer records in source control.

## Current limitations

- Tables are created with `create_all`; use Alembic migrations before evolving a production schema.
- Uploads go to local disk; use persistent storage or S3-compatible storage for production.
- Notifications are stored and listed, but push/WhatsApp delivery and the overdue/due-soon scheduler are not implemented.
- There is no per-IP rate limiting; per-account lockout is implemented.
- Costs, purchase orders, and inventory endpoints are not implemented.

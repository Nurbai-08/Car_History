# CarHistory

CarHistory is a full-stack vehicle history and maintenance application. It includes a React/Vite frontend, a NestJS API, PostgreSQL, Redis/BullMQ background jobs, private S3-compatible file storage, email verification, password recovery, reminders, reports, and vehicle ownership transfer.

## Local start without Docker

Requirements: Node.js 24 with Corepack and [Homebrew](https://brew.sh). Docker Desktop is not required.

```bash
brew install postgresql@18 redis mailpit
corepack enable
pnpm install --frozen-lockfile
pnpm dev:up
```

On the first run, `pnpm dev:up` creates `.env` with a new JWT secret, starts a private local PostgreSQL cluster, Redis, local S3-compatible storage, Mailpit, the API, the background worker, and the frontend. It also applies migrations and seeds demo data.

To use a custom configuration, copy `.env.example` to `.env` before starting. The script stores local data and logs in `../work` by default; set `CARHISTORY_WORK_DIR` to use another directory.

Start the project again after it has been stopped:

```bash
pnpm dev:up
```

Open:

- Application: http://localhost:8080
- API health: http://localhost:3001/api/v1/health/ready
- Local email inbox: http://localhost:8025
- Local private S3-compatible storage: http://localhost:9000

Demo account after seeding: `owner@carhistory.test` / `CarHistory2026!`.

Stop the application with `pnpm dev:down`. Local data remains in the work directory. To run API tests, lint, type checking, and a production build:

```bash
pnpm test
pnpm test:integration
pnpm lint
pnpm typecheck
pnpm build
```

## Production architecture

The frontend is deployed to Vercel. The API and the always-on BullMQ worker are separate Railway services. Railway also provides PostgreSQL, Redis, an S3-compatible Storage Bucket, and a private ClamAV service. A real SMTP provider is required for verification and password-reset messages.

Vercel proxies `/api/*` to Railway. This keeps refresh cookies on the frontend origin and avoids third-party-cookie failures. Set `BACKEND_URL` in Vercel to the public Railway API origin, without `/api` and without a trailing slash.

### Railway services

Create these services from the same GitHub repository:

1. `api` — build with `docker/api.Dockerfile`, expose a public domain, and use `/api/v1/health/ready` as the health check.
2. `worker` — build with `docker/worker.Dockerfile`; it does not need a public domain.
3. PostgreSQL and Redis — use Railway database templates.
4. Storage Bucket — keep it private and copy its S3 reference variables to the API and worker.
5. `ClamAV` — run a ClamAV container on the private Railway network and expose port `3310` internally.

Apply the values in [deploy/production.env.template](deploy/production.env.template) to both `api` and `worker`. `FRONTEND_URL` must exactly match the production Vercel origin. The API Docker image applies Prisma migrations and verifies the storage bucket before serving traffic.

### Vercel

Import the same GitHub repository. The root [vercel.ts](vercel.ts) builds only the web application and configures SPA routes plus the API reverse proxy. Set:

```text
BACKEND_URL=https://your-api.up.railway.app
```

After the first Vercel deployment, copy its production origin into Railway as `FRONTEND_URL`, redeploy `api` and `worker`, and then redeploy Vercel. Do not add a trailing slash.

## Required production secrets

Never commit `.env`. Production needs:

- `DATABASE_URL`, `REDIS_URL`: Railway references.
- `JWT_ACCESS_SECRET`: a new random secret with at least 32 characters.
- `FRONTEND_URL`: exact Vercel production origin.
- `STORAGE_*`: private S3-compatible bucket credentials and endpoints.
- `SMTP_*`, `MAIL_FROM`: SMTP account with a verified sender.
- `CLAMAV_HOST`, `CLAMAV_PORT`: private antivirus service.

The complete list and safe placeholders are in [deploy/production.env.template](deploy/production.env.template).

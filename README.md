# Galaxy OS

Galaxy OS is Galaxy Centre's internal operating platform for project-led ERP work. Sprint 1 adds organization-scoped users, departments, roles, permissions, and audit logs without implementing production login.

## Architecture

- `apps/web`: Vietnamese, desktop-first Next.js App Router shell
- `apps/api`: NestJS modular-monolith REST API and Prisma client
- `services/document-ai`: inactive FastAPI health placeholder reserved for Sprint 14
- PostgreSQL: system of record; Redis: local infrastructure only, unused by application code

See [system context](docs/architecture/system-context.md), [data principles](docs/architecture/data-principles.md), and [roadmap](docs/roadmap.md).

## Prerequisites on WSL

- WSL 2 with Ubuntu
- Node.js 20 (`nvm use` reads `.nvmrc`)
- pnpm 10 (`corepack enable` then `corepack prepare pnpm@10.33.4 --activate`)
- Python 3.10+
- Docker Desktop with WSL integration enabled
- VS Code with the WSL extension; open the repository from WSL using `code .`

Do not install JavaScript or Python project dependencies globally.

## Install

```bash
cp .env.example .env
pnpm install --frozen-lockfile
python3 -m venv services/document-ai/.venv
services/document-ai/.venv/bin/pip install -r services/document-ai/requirements-dev.txt
pnpm --filter @galaxy/api prisma:generate
pnpm env:check
```

The checked-in `.env.example` values are local defaults, not production credentials. Set `ALLOW_DEV_AUTH=true` only for local development, then restart the API. Production startup rejects that setting. `DEV_AUTH_USER_EMAIL` selects only the seeded administrator; requests cannot select an organization.

## Develop

Start infrastructure:

```bash
docker compose up -d postgres redis
docker compose ps
```

Start web and API together with `pnpm dev`, or separately:

```bash
pnpm --filter @galaxy/web dev
pnpm --filter @galaxy/api dev
```

Web: <http://localhost:3000>. Web health: <http://localhost:3000/health>. API health: <http://localhost:3001/api/v1/health>. API readiness: <http://localhost:3001/api/v1/ready>. Swagger: <http://localhost:3001/docs>.

The document placeholder is optional and outside the ERP runtime:

```bash
services/document-ai/.venv/bin/uvicorn --app-dir services/document-ai app.main:app --reload --port 8000
```

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

## Database migrations

With PostgreSQL healthy and `DATABASE_URL` loaded from `.env`:

```bash
pnpm --filter @galaxy/api prisma:migrate -- --name <short_description>
pnpm --filter @galaxy/api prisma:deploy
pnpm --filter @galaxy/api prisma:seed
```

Create migrations only through Prisma, review generated SQL, never rewrite an applied migration, and never run `migrate reset` against shared data. See [database/README.md](database/README.md).

The deterministic seed creates Galaxy Centre, approved departments, the role/permission catalog, and the local administrator from `DEV_AUTH_USER_EMAIL` (default `admin@galaxy.local`). It is safe to rerun and creates no passwords or production credentials.

## Troubleshooting

- `docker: command not found` in WSL: enable this distro under Docker Desktop → Settings → Resources → WSL Integration, then reopen the shell.
- Port already in use: change `POSTGRES_PORT`, `REDIS_PORT`, or `API_PORT` in `.env`.
- API readiness returns 503: check `docker compose ps`, then confirm `DATABASE_URL` matches the Compose values.
- Prisma Client missing: run `pnpm --filter @galaxy/api prisma:generate`.
- Stale Next output: remove `apps/web/.next` and rebuild; it is generated and ignored.

## Repository structure

```text
apps/                 web and ERP API
database/             Prisma schema and migration guidance
docs/                 business, architecture, decisions, sprints
scripts/              repository environment checks
services/document-ai/ inactive future document service
.github/workflows/    CI
```

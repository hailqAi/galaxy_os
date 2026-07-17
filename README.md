# Galaxy OS

Galaxy OS is Galaxy Centre's internal operating platform for project-led ERP work across design, purchasing, production, logistics, installation, finance, warranty, and after-sales service. Sprint 0 contains foundation code only.

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

The checked-in `.env.example` values are local defaults, not production credentials.

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

Web: <http://localhost:3000>. Web health: <http://localhost:3000/health>. API health: <http://localhost:3001/api/v1/health>. API readiness: <http://localhost:3001/api/v1/ready>. Swagger: <http://localhost:3001/api/docs>.

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
```

Create migrations only through Prisma, review generated SQL, never rewrite an applied migration, and never run `migrate reset` against shared data. See [database/README.md](database/README.md).

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

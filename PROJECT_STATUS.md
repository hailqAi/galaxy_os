# Project status

## Current sprint

Sprint 0 — Galaxy OS Foundation on branch `feat/sprint-0-foundation`.

## Completed work

- Root pnpm workspace, strict TypeScript base, formatting, environment check, and repository hygiene
- Vietnamese Next.js ERP shell with accessible navigation and health route
- NestJS API with `/api/v1`, environment validation, structured JSON logs, base error responses, Swagger, liveness, database readiness, graceful shutdown, and Prisma
- Empty PostgreSQL Prisma foundation and safe migration workflow
- PostgreSQL and Redis Docker Compose services with health checks and named volumes
- Inactive FastAPI document-service health/readiness placeholder and test
- Focused tests, GitHub Actions CI, architecture/business/decision/sprint documentation
- Tracked generated root `venv/` removed; local environments are now ignored and reproducible
- Complete uncommitted diff reviewed under Ponytail full; optional Uvicorn extras and generated TypeScript build metadata removed
- Confirmed reviews resolved: duplicate root Prisma dependencies removed, Prisma schema owned by the API, unnecessary Next standalone config and Python package marker deleted, and the API now loads the optional root `.env` with Node's standard library

## Work in progress

None.

## Blocked items

Docker Desktop WSL integration is not enabled in this environment. Therefore PostgreSQL and Redis startup, Compose validation, Prisma deployment to a live database, and a successful live `/api/v1/ready` response could not be verified here. No operating-system packages were installed.

## Verification results — 2026-07-17

Passed:

- `pnpm install --frozen-lockfile`
- `pnpm env:check` (Node v20.20.2, Linux)
- `pnpm --filter @galaxy/api prisma:generate`
- `pnpm --filter @galaxy/api prisma:validate` using the root `.env`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` (web: 1, API: 4, document service: 1)
- `pnpm build`
- `pnpm format:check`
- Web runtime: `/` 200 and `/health` 200
- API runtime without PostgreSQL: `/api/v1/health` 200, `/api/docs` 200, `/api/v1/ready` 503 with the consistent error response
- `pnpm --filter @galaxy/api start` without inline variables loaded the root `.env`; `/api/v1/health` returned 200
- Secret-pattern scan of repository files returned no findings
- `git diff --check`

Failed or unavailable:

- `docker compose config`: Docker command unavailable; WSL integration must be enabled
- Live PostgreSQL/Redis health checks, `prisma:deploy`, and database-ready 200 response: blocked by the same Docker availability issue
- Initial sandboxed Next build, Prisma generation, API endpoint tests, and FastAPI TestClient runs were blocked by sandbox process/network restrictions; each passed when rerun with the required local execution permission
- One intermediate format check failed because Next.js regenerated `next-env.d.ts`; the generated file is now excluded and the final format check passed
- The first post-review Prisma generation failed after root duplicates were removed because the root-level schema resolved packages from the wrong workspace; moving the schema to its owning API package fixed the cause, and final generation and validation passed

## Next recommended sprint

First enable Docker Desktop WSL integration and finish the four blocked Sprint 0 runtime checks. Then begin Sprint 1: organization, departments, users, roles, permissions, and audit logs under a separately approved plan.

## Known technical debt

No intentional application-code debt. The only remaining gap is the environment-blocked Docker/database verification above.

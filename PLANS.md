# Execution Plan

## Objective

Deliver Sprint 0: a verified monorepo foundation for Galaxy OS.

## Scope

- pnpm workspace and shared TypeScript/formatting defaults
- Vietnamese Next.js ERP shell
- NestJS REST API with health, database readiness, Swagger, validation, logging, Prisma, and graceful shutdown
- PostgreSQL and Redis development services
- inactive FastAPI document-service health placeholder
- focused tests, CI, and Sprint 0 documentation

## Out of scope

Business modules, authentication, Redis application use, document processing, external integrations, mobile applications, and every Sprint 1+ feature.

## Assumptions

- Node.js 22 and pnpm 10 are the supported JavaScript toolchain.
- Docker Compose supplies local PostgreSQL and Redis; applications run directly through pnpm.
- Sprint 0 has no business entities, so Prisma contains no models.

## Existing implementation

Only a generated Python `venv/` is tracked. It is not application code and will be removed in favor of reproducible dependency definitions.

## Files affected

Create the root workspace files, `apps/web`, `apps/api`, `services/document-ai`, `database`, `.github/workflows/ci.yml`, and the documentation explicitly listed in the Sprint 0 specification. Remove tracked `venv/`.

## Database impact

Add an empty PostgreSQL Prisma schema and documented migration workflow. No business tables or seed data.

## Security impact

Validate API environment values, validate all HTTP input through Nest's global validation pipe, expose no secrets, and document backend authorization requirements for later sprints.

## Implementation steps

1. Establish the minimal root workspace and repository hygiene.
2. Add and verify the web application shell.
3. Add and verify the API and Prisma connectivity.
4. Add and verify the inactive document service.
5. Add Docker Compose, CI, and required documentation.
6. Run full checks and runtime smoke tests.
7. Review the complete diff with Ponytail, remove excess, rerun checks, and record exact results.

## Verification commands

```bash
pnpm install --frozen-lockfile
pnpm env:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config
docker compose up -d postgres redis
pnpm --filter @galaxy/api prisma:generate
pnpm --filter @galaxy/api prisma:deploy
python -m venv services/document-ai/.venv
services/document-ai/.venv/bin/pip install -r services/document-ai/requirements-dev.txt
services/document-ai/.venv/bin/pytest services/document-ai
```

Runtime endpoints will also be checked locally when their required services can start.

## Rollback

Before commit, discard the uncommitted Sprint 0 files and restore the tracked `venv/` from Git. Database containers and named volumes are independent local development state and are not removed automatically.

## Completion criteria

All applicable Sprint 0 acceptance criteria pass, failures or unavailable tooling are recorded accurately, the final diff passes Ponytail review, and `PROJECT_STATUS.md` contains the exact final verification results.

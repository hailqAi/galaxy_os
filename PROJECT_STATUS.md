# Project status

## Current sprint

Sprint 1 — Organization, departments, users, roles, permissions, and audit logs on branch `feat/sprint-1-identity-access`.

## Completed work

- UUID PostgreSQL identity/access schema, reviewed migrations, partial unique primary-department constraint, and deterministic idempotent Galaxy Centre seed
- Galaxy Centre organization; 11 approved departments; 16 current Sprint 1 permissions; 11 approved system roles; and a local administrator seeded from `DEV_AUTH_USER_EMAIL`
- NestJS `CurrentActor` development-auth boundary, explicit permission guards, organization-scoped queries, strict DTO validation, transaction-coupled append-only audits, and safe conflict responses
- Protected `/me`, organization, department, user, role, permission, and audit-log API endpoints with Swagger at `/docs`
- Last-active-administrator protection, system-role protections, cross-organization assignment checks, disabled user/membership denial, and no user/department/role/audit hard-delete API routes
- Vietnamese Settings pages for organization, departments, users, roles, and audit logs with permission-aware controls and accessible native forms
- Focused service, guard, API integration, and web behavior tests; CI now starts PostgreSQL, deploys migrations, and seeds before verification
- Required Sprint 1 documentation, local development-auth instructions, migration/seed procedure, and audit behavior documentation

## Work in progress

None.

## Sprint 1 integration timeout fix — 2026-07-18

- Root cause: Nest application initialization did not establish Prisma connections, so the first protected request (`GET /api/v1/me`) performed the development-auth guard's lazy database connection inside the five-second test budget. `PrismaService` now connects in `onModuleInit`, which `app.init()` already awaits, and still disconnects in `onModuleDestroy`.
- Changed `apps/api/src/prisma.service.ts` and `apps/api/test/sprint1.integration.test.ts`. The integration harness now restores its development-auth environment after every test/file so failures cannot leak actor selection or authentication settings.
- Reproduction before the fix: isolated target passed in 139 ms; the full integration file passed 6/6; ten repeated integration-file runs passed 60/60; and the full API suite passed 24/24. The timeout was not deterministic on the warm local database, but tracing confirmed the first request owned lazy Prisma initialization.
- Post-fix: isolated target passed in 55 ms; the full integration file passed 6/6 with the target at 54 ms; three consecutive full API suites passed 24/24 each; full repository tests passed (API 24, web 5, document service 1); lint, typecheck, and production build passed.
- Commands run: `docker compose up -d postgres`, `docker compose ps`, `pnpm db:migrate`, `pnpm db:seed`, the requested isolated and complete integration Vitest commands, ten repeated integration-file runs, one pre-fix full API run, three consecutive post-fix full API runs, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm format:check`, and `git diff --check`.
- Full-diff Ponytail review removed only the generated `apps/web/next-env.d.ts` build change. Correctness review separated environment restoration from database cleanup; no security, validation, audit, or organization-isolation behavior changed.

## Local environment fix — 2026-07-18

- Standardized local development on the ignored root `.env.local`; API development and all Prisma scripts load it through Node 20's native `--env-file-if-exists` support.
- Added root `db:generate`, `db:migrate`, `db:status`, and `db:seed` commands; removed the duplicate API environment example and the ineffective bootstrap `.env` loader.
- Kept development authentication disabled by default, normalized its configured email in Zod, and retained production rejection when it is enabled.
- `pnpm db:migrate` reported no schema changes, `pnpm db:status` reported two migrations and an up-to-date schema, and two consecutive `pnpm db:seed` runs succeeded. PostgreSQL contained exactly one `admin@galaxy.local` user afterward.
- `pnpm dev` started web on 3000 and API on 3001. API health, readiness, `/me`, `/departments`, and web health returned HTTP 200; `/me` resolved `admin@galaxy.local`, and `/departments` included all 11 seeded Galaxy Centre departments.
- Passed `docker compose config`, `docker compose up -d`, `docker compose ps`, Prisma validate/generate/migrate/status/seed, `pnpm lint`, `pnpm typecheck`, `pnpm test` (API 24, web 5, document service 1), `pnpm build`, `pnpm format:check`, and `git diff --check`.
- Full-diff Ponytail and correctness review found no removable application code or dependency. An unrelated generated `next-env.d.ts` build change was removed. Explicit production startup with development authentication enabled exited with the expected validation error.

## Verification results — 2026-07-17

Passed:

- `pnpm --filter @galaxy/api prisma:validate`
- `pnpm --filter @galaxy/api prisma:generate`
- `pnpm --filter @galaxy/api prisma:migrate --name sprint_1_identity_access` (created and applied `20260717155135_sprint_1_identity_access`)
- `pnpm --filter @galaxy/api prisma:deploy`
- `pnpm --filter @galaxy/api prisma:seed` (rerun successfully)
- `pnpm --filter @galaxy/api prisma:status` (two migrations, database schema up to date)
- `docker compose config` and `docker compose ps` (PostgreSQL and Redis healthy)
- `pnpm --filter @galaxy/api test` (21 tests: 6 integration, 15 focused unit/API tests)
- `pnpm --filter @galaxy/web test` (5 tests)
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` (API: 21, web: 5, document service: 1)
- `pnpm build`
- `pnpm format:check`
- `git diff --check`
- Runtime checks: web `/`, all five Settings pages, API `/api/v1/health`, `/api/v1/ready`, protected Sprint 1 lists, and `/docs` returned 200
- Security runtime checks: final system-admin disable returned 403; request-supplied `organizationId` was rejected with 400; production startup with `ALLOW_DEV_AUTH=true` rejected configuration

Resolved during implementation:

- The first API integration run exposed Vitest’s lack of emitted Nest constructor metadata. Explicit Nest injection tokens now make real HTTP integration tests reliable without adding a dependency.
- The integration audit list exposed raw query-string pagination in the same harness; the controller now safely coerces page values before Prisma use.

## Ponytail and correctness review

Complete. No dependency was added. Confirmed necessary code retained: direct Prisma transactions for assignment replacement/audit atomicity, explicit injection tokens for Vitest integration reliability, and test-only cleanup deletes. Removed ordinary organization status mutation because Sprint 1 has no organization-disable workflow. Added safe unique-conflict handling instead of exposing a 500.

## Remaining limitations

- Development authentication is local-only and intentionally has no production identity provider, passwords, tokens, OAuth, or SSO.
- Sprint 1 operates with the seeded Galaxy Centre organization, although the schema supports future multi-organization membership.
- No Sprint 2 customers, projects, or other business-domain functionality has been started.

## Next recommended sprint

Sprint 2: customers, contacts, leads, opportunities, projects, project members, tasks, and milestones, reusing the Sprint 1 `CurrentActor`, organization scope, RBAC, audit, migration, and Settings patterns.

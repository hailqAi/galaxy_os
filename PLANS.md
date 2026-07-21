# Execution Plan

## Objective

Deliver complete Sprint 1 hierarchical identity, authentication, scoped authorization, organization administration, configuration, custom fields, and user administration. Do not begin Sprint 2.

## Scope

- Organization, user, organization membership, department membership, role, permission, user-role, role-permission, and append-only audit data
- Deterministic Galaxy Centre seed data and one explicitly enabled local development administrator
- NestJS CurrentActor boundary, development auth, organization-scoped permission enforcement, focused CRUD endpoints, Swagger, validation, and audit transactions
- Vietnamese Settings pages for organization, departments, users, roles, permissions, and audit visibility
- Focused security, API, and frontend tests plus operating documentation
- Real email/password authentication, opaque database sessions, logout, first-login password change, profile/avatar management, delegated administration, password recovery, and one permission-aware portal

## Out of scope

Registration, email/username changes, social/passwordless login, MFA, Redis session infrastructure, mobile, document processing, integrations, and all Sprint 2+ business domains.

## Existing implementation to reuse

- NestJS global `/api/v1` prefix, strict validation pipe, error filter, Swagger, Prisma service, and environment validation
- Next.js App Router shell, responsive navigation, Tailwind, native `fetch`, and Vitest
- Existing pnpm verification and Prisma commands

No shared `packages/` directory or reusable identity implementation exists, so none will be invented.

## Data and migration

Add the approved UUID models and enums to `apps/api/prisma/schema.prisma`, create one named Sprint 1 migration through Prisma, review its SQL, and add an idempotent seed. Constraints enforce unique slugs, normalized emails, organization memberships, department codes/memberships, role codes, role permissions, and user roles. Partial unique SQL enforces one primary department per organization. No existing migration will be rewritten and no shared data will be reset.

## Security model

- Resolve `CurrentActor` from a hashed opaque database session; fall back to development auth only when explicitly enabled outside production.
- Reject production startup whenever development auth is enabled.
- Require active user, organization, and organization membership before protected access.
- Resolve effective permissions from active organization roles in the API and require explicit permission decorators.
- Scope every relevant query and mutation to the actor organization.
- Protect the last active system administrator, system role codes, and the `system_admin` role.
- Validate cross-organization department and role assignments transactionally.
- Write append-only audit records in the same transaction as important mutations.
- Restrict first-login sessions to `/me`, password change, and logout; revoke every session after password changes.

## Implementation steps

1. Update and validate the Prisma schema, migration, seed, and required environment variables.
2. Add the minimal CurrentActor/development-auth and permission guard boundary.
3. Add focused organization, department, user, role, permission, and audit endpoints with scoped Prisma queries, pagination, Swagger, and mutation audits.
4. Add focused unit/service and API integration tests for required authorization and integrity behavior.
5. Extend the existing web shell with Vietnamese Settings navigation, one shared API helper, permission-aware actions, accessible forms, and practical loading/error/empty states.
6. Add focused frontend tests and update only Sprint 1 documentation.
7. Run the full suite, review the entire uncommitted diff for Ponytail simplification and correctness, remove confirmed excess/fix confirmed findings, rerun the full suite, and record exact results.

## Expected files

Modify existing environment, Prisma, API bootstrap/module/package, web shell/style/package, test, and required documentation files. Create one Prisma migration, one seed, focused Sprint 1 Nest modules/controllers/services/DTOs/access files, focused Settings routes/components/API helper/tests, and `docs/sprints/sprint-1-identity-access.md`. Add no dependency unless verification proves the installed stack insufficient.

## Verification

```bash
pnpm --filter @galaxy/api prisma:validate
pnpm --filter @galaxy/api prisma:generate
pnpm db:migrate --name <short_description>
pnpm --filter @galaxy/api prisma:seed
pnpm --filter @galaxy/api test
pnpm --filter @galaxy/web test
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
docker compose config
docker compose ps
pnpm --filter @galaxy/api prisma:status
```

When infrastructure is available, verify the required web routes, `/api/v1/health`, `/api/v1/ready`, protected Sprint 1 endpoints, and `/docs`. Failed or unavailable commands will be recorded exactly rather than claimed as passed.

## Rollback

Before commit, Sprint 1 application changes can be discarded without touching the existing user-owned generated file. A locally applied migration is reversed only through a reviewed forward migration or by recreating an explicitly disposable local database; shared data is never reset.

## Completion criteria

All requested Sprint 1 models, seed data, scoped endpoints, security protections, audit behavior, and usable Settings pages exist; focused and full checks pass or exact environmental blockers are recorded; the complete diff passes Ponytail and correctness review; no unused dependency or Sprint 2 code remains; and `PROJECT_STATUS.md` contains actual final results.

## Sprint 1 enterprise completion — 2026-07-21

- Extend the existing `Department`, `UserRole`, `Role`, and shared target policy; do not create parallel authorization or organizational-unit systems.
- Add explicit SYSTEM/ORGANIZATION/DEPARTMENT/SELF assignments, hierarchical units, settings, custom fields, access profiles, access preview, representative seed accounts, and direct security evidence.
- Publication remains conditional on every security-critical acceptance item and every required repository command passing.

## Sprint 1 completion audit — 2026-07-20

The completion audit added explicit organization-membership status management, per-member effective permissions, department and role member visibility, the missing membership/archive/permission-assignment catalogue keys, direct API authorization coverage, and department-membership timestamps. Sprint 1 is complete; Sprint 2 remains out of scope.

## Local environment bug fix

Use the ignored root `.env.local` through Node's native environment-file support for API development and Prisma commands. Keep development authentication opt-in and rejected in production; verify migration, seed, normal `pnpm dev`, and protected endpoints before closing the bug.

## Sprint 1 Users administration redesign

- Keep `/settings/users` as the existing equivalent administration route; add separate `/new`, `/:userId`, and `/:userId/edit` experiences rather than duplicating them under `/admin`.
- Replace the full-detail list payload with a paginated, scoped summary DTO and load capabilities, sessions, and audit only from an opened user.
- Keep role-sourced capabilities read-only at user level. Preserve audited Disable as the retention-safe destructive action; do not add hard delete while user identity is retained by audit and ownership relations.
- Add no migration, dependency, bulk framework, or preference framework for this presentation and API-shape redesign.

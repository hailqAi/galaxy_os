# Sprint 1 — Organization and access

## Delivered boundary

Sprint 1 owns Galaxy Centre organization data, departments, user profiles and memberships, organization roles, the controlled permission catalog, effective permission enforcement, and append-only audit logs. It does not own passwords, login, tokens, OAuth, SSO, or production identity-provider integration.

## Authorization

The API resolves `CurrentActor`, verifies active user/organization/membership state, resolves effective role permissions, and scopes relevant queries to the actor organization. Backend guards are authoritative; Settings action visibility is usability only. Cross-organization assignments are rejected. The final active `system_admin` cannot be disabled or lose that role, system role codes cannot be renamed, and system roles cannot be archived.

## Development authentication

Copy `.env.example`, set `ALLOW_DEV_AUTH=true`, optionally change `DEV_AUTH_USER_EMAIL`, run the seed, and restart the API. The configured email resolves only a seeded active membership; requests cannot select identity or organization. `ALLOW_DEV_AUTH=true` is rejected when `NODE_ENV=production`. A production provider later replaces this resolver and supplies the same `CurrentActor` shape.

## Local procedure

```bash
docker compose up -d postgres redis
pnpm --filter @galaxy/api prisma:generate
pnpm --filter @galaxy/api prisma:migrate -- --name sprint_1_identity_access
pnpm --filter @galaxy/api prisma:seed
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Swagger is at <http://localhost:3001/docs>. Settings begin at <http://localhost:3000/settings/organization>. Environment changes require an API/web restart.

## Audit behavior

Organization, department, user, role, permission assignment, department assignment, and role assignment mutations write audit data in the same transaction. The API provides filtered, paginated read access only; no update or delete route exists. Audit data excludes credentials and request headers.

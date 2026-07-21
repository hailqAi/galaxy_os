# Sprint 1 — Organization and access

## Delivered boundary

Sprint 1 owns hierarchical organizational administration, SYSTEM/ORGANIZATION/DEPARTMENT/SELF assignments, protected and custom roles, settings, custom fields, access preview, email/password login, hashed credentials, revocable database sessions, personal profiles, password recovery, delegated administration, and append-only audit logs. CRM and every Sprint 2 business domain remain out of scope.

## Authorization

The API resolves `CurrentActor`, verifies active user/organization/membership state, ignores inactive/expired roles and scopes, returns permission source metadata, and combines capability, assignment scope, target policy, delegation ceiling, protected-resource rules, and organization isolation. Organizational units have parent, type, manager, order, status, cycle checks, and tenant foreign keys. See [security and permissions](../architecture/security-and-permissions.md) and the [pre-change gap analysis](sprint-1-enterprise-gap-analysis.md).

## Authentication and sessions

Login normalizes the immutable email identifier, verifies a bcrypt hash, applies a five-attempt/15-minute temporary lock, requires one active organization membership, and creates a 32-byte opaque token. Only its SHA-256 hash is stored. The browser receives the token in an HttpOnly, SameSite=Lax cookie that is Secure in production. Sessions expire, may be revoked, and are rejected for disabled users, memberships, or organizations. Password changes revoke all sessions and require a clean login.

Avatars use generated filenames under `AVATAR_STORAGE_PATH`, accept JPEG/PNG/WebP magic signatures up to `AVATAR_MAX_BYTES`, and are served through an authenticated endpoint. Local filesystem persistence must be replaced only when deployment uses shared or ephemeral storage.

## Development authentication

Real login works with `ALLOW_DEV_AUTH=false`. For a local credential, set an ignored `DEV_SEED_PASSWORD` and run the idempotent seed. Development auth may still be explicitly enabled outside production, but each request must carry the explicit configured selector; the flag alone never recreates a logged-out actor. It resolves the same user, membership, roles, permissions, and organization scope and never bypasses authorization.

## Local procedure

```bash
docker compose up -d postgres redis
pnpm --filter @galaxy/api prisma:generate
pnpm db:migrate --name <short_description>
pnpm --filter @galaxy/api prisma:seed
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Swagger is at <http://localhost:3001/docs>. Settings begin at <http://localhost:3000/settings/organization>. Environment changes require an API/web restart.

## Audit behavior

Organization, unit, user, membership, settings, custom-field, role, permission, scope, password, session, and access-profile mutations write audit data. Rejected self, protected-target, tier, and delegation attempts are recorded. Audit data excludes credentials, password hashes, raw reset/session tokens, cookies, integration secrets, and request headers.

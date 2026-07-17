# Security and permissions

All authorization belongs in the API. Web controls improve usability but never grant or deny authority. Sprint 1 uses organization-scoped RBAC: active users receive effective permissions through active organization memberships, active roles, and role-permission assignments. Every protected query derives `organizationId` from `CurrentActor`; request data cannot switch organization.

Local development may set `ALLOW_DEV_AUTH=true` and select the deterministic seeded administrator through `DEV_AUTH_USER_EMAIL`. The boundary is disabled by default, accepts no request-controlled identity or organization header, and production validation rejects it. A later production identity provider replaces this resolver while preserving `CurrentActor`; Sprint 1 stores no passwords or tokens.

The API protects system role codes, prevents system role archival, prevents disabling the last active system administrator or removing their `system_admin` role, and rejects cross-organization role and department assignments. Permission codes are seed-controlled and have read-only API exposure.

Important mutations and audit records share a database transaction. Audit records are append-only because the API exposes only list access. They contain business changes or compact assignment metadata, never headers or secrets.

Validate every external input, expose safe errors, keep secrets out of Git, use least-privilege production credentials, and never let a future mobile or integration client bypass the API.

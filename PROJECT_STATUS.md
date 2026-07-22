# Project status

## Internet deployment preparation — 2026-07-22

- Added production-only Next and Nest start commands bound to
  `127.0.0.1:3000` and `127.0.0.1:3001`, loopback health checks, browser-bundle
  leakage checks, and one systemd target with dependency ordering, restart on
  failure, secure environment loading, and clean stop behavior. The existing
  Docker Compose services remain private on loopback.
- Consolidated public URL handling on `APP_PUBLIC_ORIGIN`. Production rejects
  HTTP or path-bearing origins, `ALLOW_DEV_AUTH=true`, missing proxy trust,
  malformed/wildcard trusted hosts, and a browser API URL other than
  same-origin `/api/v1`. Reset mail uses only the validated public origin.
- Host/Origin enforcement now covers the closed same-origin API forwarder and
  protected routes. Forwarded host/protocol/client-IP values are ignored by
  default and accepted only for the documented loopback proxy deployment;
  ambiguous or non-HTTPS production proxy headers fail closed. Next Server
  Actions use the same exact host allowlist and a 100 KB body ceiling.
- Production cookies remain HttpOnly, Secure, SameSite=Lax, path `/`, and
  host-only. Login/logout/reset remain server-session operations, reset and
  password changes revoke sessions, credentials are redacted from errors and
  logs, and account-wide password lockout was removed to prevent trivial
  targeted denial of service while retaining per-client login throttling and
  audited failures.
- Added safe placeholder-only Cloudflare Tunnel and Caddy examples plus
  deployment guidance for DDNS, router rules, Windows firewall, WSL
  portproxy/IP changes, certificate prerequisites, HSTS timing, service
  health/restart, rollback, and the explicitly non-production public-IP
  diagnostic. No public IP, LAN/WSL address, domain, credential, or token was
  committed.
- Verification passed: `git diff --check`, lint, strict typecheck, format
  check, API 58/58, web 44/44, document service 1/1, controlled HTTPS
  production build, static client-artifact scan, and loopback production smoke
  tests for both health endpoints, the same-origin API path, trusted forwarded
  headers, and untrusted Host rejection. The production processes stopped
  cleanly. Internet reachability was not claimed or tested.
- Cloudflare/dashboard and router/firewall changes remain manual. The current
  DMZ and public TCP 3000 mapping must be removed before deployment. No Sprint
  2 work was started, and nothing was committed or pushed.

## Development Host allowlist and Login verification — 2026-07-22

- `DEV_ALLOWED_ORIGINS` is now the single development allowlist consumed by
  both Next's `allowedDevOrigins` and request Host validation. Entries support
  comma-separated HTTP(S) URLs, hostnames, IPv4 addresses, and optional ports;
  normalization trims, deduplicates, lowercases hostnames, and removes ports.
  Wildcards, malformed entries, malformed Host headers, and unconfigured Hosts
  fail closed. Development defaults remain only `localhost` and `127.0.0.1`;
  production accepts only the hostname from `APP_PUBLIC_ORIGIN`.
- Next now loads the ignored repository-root `.env.local`, matching the API's
  environment location. The current WSL Host and loopback returned HTTP 200;
  an unconfigured Host returned HTTP 400. Fake credentials reached NestJS
  through `/api/v1/auth/login` and returned the required generic HTTP 401.
- Browser API calls remain same-origin `/api/v1`; the internal API remains
  `http://127.0.0.1:3001/api/v1`. Proxy tests verify body, status, safe headers,
  `Set-Cookie`, and no-store behavior. API authentication/session integration
  passed with `ALLOW_DEV_AUTH=false`.
- Diff, lint, typecheck, focused tests, full tests (API 56/56, web 40/40,
  document service 1/1), production build, and formatting passed. The five
  Playwright Login checks could not launch because the host lacks `libnss3.so`;
  installing browser libraries requires unavailable sudo authorization. No
  credential was reset or disclosed, no Sprint 2 work was started, and nothing
  was committed or pushed.

## Emergency CSP, Login, same-origin API, and LAN repair — 2026-07-22

- Root cause: the sole web CSP in `apps/web/next.config.ts` used static
  `script-src 'self'`, blocking Next.js inline bootstrap, `self.__next_r`
  initialization, hydration, Login submission, and password-toggle handlers.
  The unhydrated form then posted natively to the browser-visible
  `localhost:3001`, which both violated `form-action 'self'` and could not work
  from another LAN device.
- Web CSP now has one owner in `proxy.ts`. Development permits the minimum
  Next runtime exceptions (`unsafe-inline`, `unsafe-eval`, and development
  WebSockets) without forced HTTPS. Production dynamically renders all pages,
  creates a cryptographically random per-request nonce, applies it before
  rendering and to the response CSP, uses `strict-dynamic`, and excludes
  `unsafe-eval`.
- Browser API calls now use relative `/api/v1`. A closed Next.js route handler
  forwards allowlisted Galaxy OS paths to server-only
  `http://127.0.0.1:3001/api/v1`, preserves method/body/status/safe headers and
  `Set-Cookie`, enforces no-store, and returns a generic 502 on connection
  failure. NestJS binds to `127.0.0.1:3001`; browser CORS was removed.
- Login remains a controlled POST form with a same-origin native fallback,
  field validation, exact generic invalid/server messages, an accessible live
  alert, repeat-submit prevention, safe redirects, and no credential URL or
  browser storage. Password visibility is local state with an explicit
  `type="button"`, accurate label, `aria-pressed`, keyboard support, and value
  preservation.
- Next development binds `0.0.0.0:3000`. Host acceptance and Next development
  origins use `APP_PUBLIC_ORIGIN` and `DEV_ALLOWED_ORIGINS`; only port 3000
  needs trusted-LAN exposure. Windows firewall and WSL NAT portproxy remain
  explicit operator configuration.
- Browser regression passed 5/5 in development. Production browser execution
  passed with no CSP, `self.__next_r`, or hydration errors; two HTTP requests
  had distinct nonces and rendered scripts carried the matching nonce. Focused
  web unit/proxy/CSP tests passed 25/25. Authentication passed 10/10 three
  consecutive times with `ALLOW_DEV_AUTH=false`; the full suite passed API
  56/56, web 25/25, and document service 1/1. Lint (two existing image
  advisories), typecheck, production build, format, diff, Prisma
  generate/validate/status, and local header/network checks passed.
- Ponytail review found no removable complexity. The external Codex review was
  blocked because it would disclose the private uncommitted diff to an
  untrusted service; local correctness/security review instead fixed
  production use of development hosts, stale Login messages, CurrentActor 401
  classification, nested secret-bearing return paths, and cross-origin BFF
  mutations. All checks were rerun afterward.
- The credential previously exposed in a URL remains compromised and must be
  rotated by the operator using the hidden-input reset workflow. No credential
  was copied into code, tests, logs, or documentation. No Sprint 2 work was
  started and nothing was committed or pushed.

## Critical Login credential exposure remediation — 2026-07-21

### Incident and root cause

- A plaintext password was exposed through a browser-native GET Login request
  and must be rotated. No credential or secret-bearing request is reproduced
  here.
- The Login form relied on its hydrated React submit handler but omitted an
  explicit HTML method. Before hydration or when client JavaScript failed, the
  browser defaulted to GET and serialized the named controls into the URL. That
  bypassed the API call, visible error handling, session creation, and redirect.
- A second confirmed redirect-loop cause scoped the session cookie to the API
  path, so Next middleware could not receive it on protected page requests.

### Remediation

- Login is now a controlled accessible form with an explicit POST fallback to
  the Login API. Hydrated submission prevents the native request and sends a
  JSON body with `credentials: include`; credentials are never copied into
  navigation state or browser storage. Repeated submission is disabled and a
  failed attempt clears the password field.
- `POST /api/v1/auth/login` remains the only authentication endpoint. It
  accepts a length-bounded validated body, normalizes email, rejects all query
  parameters, returns the same Vietnamese 401 response for unknown, inactive,
  locked, or invalid accounts, applies the existing IP/account protections,
  updates login state, creates an opaque hash-only server session, and writes
  secret-free success/failure audits. GET Login API requests do not
  authenticate.
- The session cookie is HttpOnly, SameSite=Lax, Secure in production, has an
  explicit expiry and root path, and has no Domain. API JSON contains no token.
  The root path lets same-host Next middleware receive the cookie; deployments
  must keep web and API on a shared cookie host or use a reviewed same-origin
  proxy.
- Login now distinguishes the required generic invalid-credential message from
  the required safe network/server message, exposes it through an alert, clears
  it on resubmission, and keeps it out of the URL. Required email, email format,
  and required password errors are field-associated and visible. Session-expired
  state is a safe query flag.
- Successful Login reloads the current actor, sends mandatory-password-change
  users to `/account/change-password`, validates relative permission-compatible
  `returnTo`, rejects external and secret-bearing return paths, otherwise enters
  the authorized portal, and refreshes protected routing.
- Login GET accepts only `returnTo`, `reason`, and `sessionExpired`; middleware
  removes other fields before rendering. Central API redaction now covers
  credential-equivalent object fields, URL values, error stacks, exception
  response paths, and audit serialization. Authentication request bodies are
  not logged.
- Logout remains POST-only, revokes the server session, clears the exact cookie,
  clears frontend actor state after confirmed revocation, refreshes no-store
  routes, and redirects to Login. Old cookies return 401 and protected routing
  prevents cached server data from being restored.

### Regression and verification

- Added/expanded web regression coverage for POST-only JSON submission, URL
  secrecy, native fallback safety, Enter-compatible form submission, password
  input behavior, generic visible errors, safe redirects, authenticated Login
  redirect, forced password change, and protected routing.
- Added/expanded API coverage for GET/query rejection, generic failures,
  session creation/current actor, HttpOnly/Secure/root-path cookie behavior,
  hash-only storage, audit secrecy, logout cookie clearing/revocation, old-cookie
  denial, and centralized application-log redaction.
- Authentication integration passed 12/12 three consecutive times. Focused web
  Login/middleware passed 11/11 three consecutive times. Full verification
  passed API 56/56, web 19/19, and document service
  1/1, plus diff check, format, Prisma generate/validate/status, and production
  build. Lint and typecheck passed; lint retains two unrelated non-failing Next
  image advisories.
- Ponytail review found no removable complexity. Codex review found one nested
  secret-bearing `returnTo` path; middleware now removes it before rendering.
  Local correctness/security review also verified complete Login-query
  rejection, error-stack redaction, and fail-closed frontend logout behavior.

### Rotation status and remaining risk

- Rotation is mandatory and pending operator execution of the approved hidden-
  input `pnpm admin:reset-password` command. Automating an undisclosed password
  would leave no operator able to use it. The command forces password change,
  revokes sessions/reset tokens, and clears failed-login state. The compromised
  password must not be used again.
- Browser-developer-tools verification with the operator-known replacement
  password remains pending. Automated integration verifies the same POST,
  cookie, current-actor, forced-change, logout, and old-session denial flow.
- Shared-host cookie deployment must be verified outside localhost. The existing
  process-local Login limiter remains development-only and must move to shared
  storage before multi-instance deployment. No Sprint 2 work was started and
  nothing was committed or pushed.

## Sprint 1 security audit — 2026-07-21

### Assessment and threat model

The audit traced password reset, login, recovery, cookie sessions, logout,
development auth, scoped authorization, final-administrator controls, audit
payloads, browser headers, Git contents, and dependencies against credential
disclosure, brute force, token theft/replay, CSRF, session theft/fixation,
cross-tenant access, privilege escalation, concurrent administrator removal,
and secret leakage. Initial rating: development-only; staging and production
blocked by one CRITICAL and multiple HIGH findings.

### Findings and remediation

- The local reset utility now refuses production, defaults the documented
  email, accepts only an existing active protected `system_admin` with SYSTEM
  scope, hides and confirms TTY input, requires target confirmation, removes
  `ADMIN_TEMP_PASSWORD` from `process.env`, never repairs/creates an admin,
  and atomically changes the bcrypt hash, forces change, clears lockout,
  revokes sessions/reset tokens, and writes a secret-free audit. Controlled
  noninteractive tests require matching `ADMIN_CONFIRM_EMAIL`.
- Password minimums were raised from 12 to 15 characters across API and web.
  Existing storage remains bcrypt with configurable 12 rounds (4 only in
  tests), unique library-generated salts, and a hard 72 UTF-8-byte limit.
  This is not the desired >=64-character passphrase support or Argon2id and
  remains a production blocker.
- Login now adds process-local IP throttling while preserving generic invalid
  credentials. Account lockout remains five failures for 15 minutes. Redis or
  another shared limiter is required before multi-instance staging/production.
- Sessions use 32 random bytes, store SHA-256 token hashes only, expire
  absolutely, revoke server-side, and now enforce a 60-minute configurable
  idle timeout with activity writes throttled to five minutes. The cookie is
  HttpOnly, SameSite=Lax, Secure in production, expires explicitly, and is
  scoped/cleared at `/api/v1` with matching attributes.
- Logout revokes the session, clears the exact cookie, clears frontend actor
  state, refreshes no-store routes, redirects to `/login`, and the old cookie
  receives 401. Development auth is production-rejected, explicitly selected,
  and now loopback-only; it remains unsuitable for staging.
- Recovery uses a 32-byte random single-use token, stores only SHA-256, expires
  in 30 minutes, serializably claims once, revokes other tokens and sessions,
  clears lockout, sends a password-change notice, uses configured
  `APP_BASE_URL`, and now scrubs the token from browser history. Request rate
  limiting remains process-local.
- Unsafe methods reject cross-origin browser requests, including public auth
  mutations. SameSite=Lax remains defense in depth. Missing Origin/Referer is
  still accepted for non-browser clients; a synchronizer token is required if
  deployment becomes cross-site.
- Production startup now requires HTTPS web/application URLs. API and Next
  responses add no-store, CSP/frame-ancestors, nosniff, no-referrer, and a
  restrictive Permissions-Policy; API HSTS is production-only.
- Scope/tier/delegation and protected-target tests pass, but final-admin checks
  are count-based Serializable transactions without a shared row/advisory lock
  across every viability-removal path. Recent-authentication/step-up for peer
  System Administrator reset is also absent. Both remain production blockers.
- `.env.local` and `.local/` are ignored. A reachable-history pattern scan
  found no private/cloud key signature; ignored environment values were not
  printed. No committed secret requiring rotation was identified.
- Dependency audit initially reported 17 advisories including two critical
  Vitest paths. Vitest was patched to 3.2.6 and direct PostCSS to 8.5.10. The
  final audit reports 14 transitive advisories: 5 high, 7 moderate, 2 low in
  Prisma tooling, Nest CLI, Swagger, Next's bundled PostCSS, and build tooling.
  No major upgrade was applied automatically.

### Verification evidence

- `git diff --check`, lint, typecheck, full tests, build, and format check pass.
  Full results: API 53/53, web 13/13, document placeholder 1/1. Lint has two
  non-failing existing Next image advisories.
- Compose config succeeds; PostgreSQL, Redis, and Mailpit are healthy. Prisma
  generate/validate/status/seed pass; all nine migrations are applied.
- With `ALLOW_DEV_AUTH=false`, auth plus Sprint 1 integration passed three
  consecutive runs, 27/27 each. Focused reset tests pass 7/7.
- Ponytail complete-diff review: `Lean already. Ship.` External
  `codex review --uncommitted` was rejected by tenant policy because it would
  transmit the private diff to an untrusted service; the local security review
  corrected production CSP origin, loopback dev-auth, reset-token history,
  cookie path, and session idle handling.

### Security control matrix

| Security control        | Implementation evidence                                                      | Test evidence                 | Status              | Production blocker |
| ----------------------- | ---------------------------------------------------------------------------- | ----------------------------- | ------------------- | ------------------ |
| Admin CLI reset         | Protected SYSTEM target, hidden input, confirmation, atomic revocation/audit | 7 reset integration tests     | PASS                | NO                 |
| Password hashing/policy | bcrypt 12, unique salt, 15 chars, 72-byte ceiling                            | auth/reset tests              | PARTIAL             | YES                |
| Login abuse resistance  | generic errors, account lock, process IP limit                               | auth integration              | PARTIAL             | YES                |
| Session/cookie/logout   | hash-only opaque token, idle/absolute expiry, exact cookie clear             | auth integration              | PASS                | NO                 |
| Forgot password         | hashed 256-bit token, expiry, serializable single use, revocation            | auth integration              | PARTIAL             | YES                |
| Development auth        | false default, production rejection, explicit loopback selector              | env/auth integration          | PASS for local only | YES                |
| CSRF/origin             | SameSite=Lax plus trusted Origin rejection                                   | cross-site auth test          | PARTIAL             | YES                |
| Authorization/scope     | global guards, target policy, tenant/department/tier ceilings                | Sprint 1 integration          | PASS                | NO                 |
| Final administrator     | protected sequential paths, Serializable transactions                        | integration tests             | PARTIAL             | YES                |
| Audit/log secrecy       | selective secret-free auth/reset audit payloads                              | reset output/audit assertions | PARTIAL             | YES                |
| Browser/TLS headers     | CSP, frame denial, nosniff, no-referrer, no-store, HTTPS validation          | build/env checks              | PARTIAL             | YES                |
| Secret/Git hygiene      | ignore rules and reachable-history signature scan                            | manual command evidence       | PASS                | NO                 |
| Dependency security     | Vitest/PostCSS patched; 14 transitive advisories remain                      | `pnpm audit`                  | PARTIAL             | YES                |

### Residual readiness

Local development is acceptable on a trusted workstation, preferably with
`ALLOW_DEV_AUTH=false` for real-login verification. Staging and production are
blocked until Argon2id/long-passphrase support, shared rate limiting,
recent-authentication or step-up for high-risk administrator resets,
transaction-safe final-admin locking, centralized audit/log redaction,
deployment-specific CSRF/TLS validation, and remaining HIGH dependency
advisories are resolved. Sprint 2 was not started; nothing was committed or
pushed.

## Current sprint

Sprint 1 — Organization, departments, users, roles, permissions, and audit logs on branch `feat/sprint-1-identity-access`.

## Completed work

- UUID PostgreSQL identity/access schema, reviewed migrations, partial unique primary-department constraint, and deterministic idempotent Galaxy Centre seed
- Galaxy Centre organization; 11 approved departments; 20 Sprint 1 permissions; 11 approved system roles; and a local administrator seeded from `DEV_AUTH_USER_EMAIL`
- NestJS `CurrentActor` development-auth boundary, explicit permission guards, organization-scoped queries, strict DTO validation, transaction-coupled append-only audits, and safe conflict responses
- Protected `/me`, organization, department, user, role, permission, and audit-log API endpoints with Swagger at `/docs`
- Last-active-administrator protection, system-role protections, cross-organization assignment checks, disabled user/membership denial, and no user/department/role/audit hard-delete API routes
- Vietnamese Settings pages for organization, departments, users, roles, and audit logs with permission-aware controls and accessible native forms
- Focused service, guard, API integration, and web behavior tests; CI now starts PostgreSQL, deploys migrations, and seeds before verification
- Required Sprint 1 documentation, local development-auth instructions, migration/seed procedure, and audit behavior documentation

## Work in progress

Sprint 1 enterprise completion is under final verification. The implementation now includes hierarchical organizational units, explicit scoped role assignments, protected system and organization settings, metadata custom fields, named per-user access profiles, access preview, expanded authority seed data, and direct representative-account tests. Git publication remains blocked until every required check and review finishes.

## Local System Administrator reset — 2026-07-21

- Verified that `admin@galaxy.local` exists as an active Galaxy Centre member with SYSTEM administration scope, an active protected SYSTEM-scoped `system_admin` assignment, all 52 current permissions, and an existing credential.
- Hardened `pnpm admin:reset-password` to accept only environment input, restore only the canonical seeded administrator through the idempotent seed when required, force password change, clear lockout state, revoke sessions/reset tokens, and write a secret-free audit record.
- Focused reset tests passed 7/7; full API 52/52, web 13/13, and document service 1/1 tests passed. Diff check, lint, typecheck, build, Prisma generate/validate/status, Ponytail review, and correctness review passed.
- The reset was not executed because `ADMIN_TEMP_PASSWORD` was not exported in the operator process. No password was invented, printed, or stored.

## Enterprise IAM extension — 2026-07-21

- Added forward-only migrations for assignment scopes, hierarchy metadata, role category/scope ceilings, safe JSON custom data, settings, custom-field definitions, and least-privilege SELF assignment defaults. Existing identities, memberships, departments, and roles were preserved.
- Added SYSTEM, ORGANIZATION, DEPARTMENT, and SELF assignment evaluation. Active role plus explicit managed-unit assignment is required for department management; optional child scope is expanded from the organization tree.
- Added system organization/settings/audit boundaries, organization settings, system-controlled permission metadata, organizational cycle/archive checks, custom-field validation and visibility/editability policy, named access-profile lifecycle, and access preview.
- Extended the UI with organizational tree/list controls, role metadata and permission search, system configuration and organization visibility, custom-field management, direct one-time temporary-password display, managed-scope/custom-field/access-preview tabs, and the access-profile checklist.
- Focused authentication plus Sprint 1 integration passed 26/26, and the expanded Sprint 1 file passed 18/18. One full repository run reproduced the documented Vitest five-second harness anomaly in two tests whose bodies completed in 45 ms and 243 ms; no timeout was increased. Final repeated and full verification remains pending.

## Users administration redesign — 2026-07-21

- Replaced the dense per-user editor cards with a concise responsive table whose default columns are Username, Name, Email, and Role. Optional department, status, last-login, membership, and created columns remain local UI state because no preference architecture exists.
- Added URL-preserved backend search, scoped filters, stable sorting, 25/50/100 pagination, scope context, loading/error/empty states, and pointer/keyboard row actions.
- Added separate create, read-only View, and section-specific Edit routes under the existing `/settings/users` route family.
- Split the API list from detail selection. The summary excludes credentials, capabilities, sessions, audit history, full membership records, and role-permission graphs. Capabilities, safe sessions, and target audit are separate lazy requests.
- Kept backend permission, organization/managed-department scope, target authority, delegation ceiling, and final-administrator policy as the source of truth. Capabilities remain role-sourced and read-only.
- Retention decision: no hard-delete API. Disable revokes sessions and retains identity, membership history, ownership, and audit attribution; permanent deletion is unsafe under the current Sprint 1 relationships.
- No database migration or dependency was added.
- Verification passed: `git diff --check`, lint (two pre-existing non-failing image advisories), typecheck, API 44/44, web 13/13, document placeholder 1/1, production build, format check, Prisma validate/generate/status, and idempotent seed. Three consecutive Sprint 1 integration runs passed 13/13 before the final local review, and the post-review full suite passed 13/13; additional repetition reproduced the repository's known five-second harness anomaly despite sub-two-second file runtimes, so no timeout was increased.
- Ponytail diff review removed the unused list avatar selection/response (`net: -3 lines possible`; no dependency or abstraction findings). Local correctness review removed role-permission graphs from general detail, constrained manager filter values, and fixed status URL state. `codex review --uncommitted` was requested but execution policy rejected transmitting the private diff to an untrusted external service; no workaround was attempted.
- Remaining limitations: no bulk-action API/UI, no hard delete because retained audit/ownership identity makes it unsafe, no administrator-specific per-session revocation, no audit actor/date filter UI, column choices are not persisted without an existing preference mechanism, and representative browser accounts were not manually exercised in this run.

## Local administrator recovery — 2026-07-20

- Added the root `pnpm admin:reset-password` command for non-production local recovery using `ADMIN_TEMP_PASSWORD`, the configured administrator email, existing bcrypt settings, and a single audited transaction.
- The command preserves the active protected administrator assignment, forces first-login password change, clears lockout state, and revokes sessions and outstanding reset tokens without printing credentials.
- Focused command tests cover production, missing-secret, unknown-user, hashing, output secrecy, forced change, revocation, and preservation of identity, membership, roles, and permissions.
- Verification passed: lint (two existing non-failing image advisories), typecheck, API 44/44, web 10/10, document placeholder 1/1, production build, format check, and diff check. A live `ALLOW_DEV_AUTH=false` run verified temporary-password login, forced change, successful change, temporary-password rejection, replacement-password login with system-administrator permissions, and logout invalidation; generated verification passwords were held only in memory and not logged.

## Delegated administration and recovery — 2026-07-20

- Added explicit administration scope, tenant-constrained managed departments, protected/delegable role metadata, administration tiers, and one shared target-user policy.
- Added generic forgot-password handling, hashed expiring single-use reset tokens, SMTP/Mailpit delivery, administrator reset email, server-generated temporary passwords, forced change, and session invalidation.
- Removed implicit development authentication: the flag alone no longer recreates a logged-out actor; an explicit request selector is required and production rejects the feature.
- Added self-session controls, scoped audit history, permission-and-scope-aware Users navigation, recovery pages, representative manager/employee seed records, and two additive migrations.
- Focused delegated-administration (13/13) and authentication/recovery (8/8) integration files passed three consecutive final runs. Full verification passed: API 40/40, web 10/10, document placeholder 1/1, lint (two existing non-failing image advisories), typecheck, format, build, diff check, Compose config/healthy services, Prisma validate/generate/status, migrations, and idempotent seed.
- Live `ALLOW_DEV_AUTH=false` checks passed reset email through Mailpit, reset completion, new-password login, `/me`, logout, old-session 401, and generic unknown-email response. Explicit development auth separately returned 401 without its selector and a scope-safe managed-department user list with it.
- Ponytail review reported `Lean already. Ship.` Local correctness review fixed production mail configuration validation, forgot-password timing, dual IP/account rate limiting, target-specific frontend actions, scoped audit retrieval, assignment controls, and user filters. External `codex review --uncommitted` was attempted as requested but tenant policy rejected private-diff transmission; no workaround was attempted.

## Real authentication and personal accounts — 2026-07-20

- Login/session architecture: normalized immutable email plus bcrypt credential (12 rounds by default), five-failure temporary lockout, 32-byte opaque tokens, SHA-256 token hashes in PostgreSQL, explicit expiry/revocation, and an HttpOnly/SameSite=Lax cookie that is Secure in production. `ALLOW_DEV_AUTH=false` real login was verified live; the local fallback remains opt-in and production-rejected.
- Route behavior: Next middleware resolves `/me` before protected pages render or fetch, carries only safe relative `returnTo` values, rejects unauthorized deep links at `/forbidden`, and forces first-login sessions to password change. The shared portal and action controls derive from effective permissions; personal Home/Profile/Change Password/Logout remain available to every normal authenticated actor.
- Personal account: `/account/profile` exposes the login email read-only, edits only the current user’s normalized display name, and uploads/replaces/removes JPEG/PNG/WebP avatars up to 2 MB under the ignored configurable local storage path using generated keys. `/account/change-password` verifies the current password, rejects reuse and bcrypt overflow, clears `mustChangePassword`, revokes all sessions, and requires clean login.
- Administration: transactional user creation creates the immutable identity, credential, active organization membership, initial department/primary assignment, and roles; the temporary password is returned once. Users exposes membership, roles, effective permissions, security state, scoped audit history, reset-password, session-revoke, disable/reactivate, and action-specific controls. Disabling a user or membership revokes sessions. Final-administrator user disable, membership disable, and role removal return 409 under serializable protection.
- Audit coverage added for login success/failure, logout, profile/avatar/password changes, password reset, session revocation, user creation/reactivation, and existing membership/department/role changes; passwords, hashes, raw tokens, cookies, and avatar bytes are excluded.
- Migration `20260720090000_real_authentication` added `normalizedEmail`, avatar/last-login fields, `PasswordCredential`, and `Session`. Prisma validate/generate/migrate/status and idempotent seed passed; five migrations are applied and current. The seed creates a missing local credential only when ignored `DEV_SEED_PASSWORD` is supplied and never overwrites it.
- Tests: API 37/37, web 10/10, document placeholder 1/1; no skipped/todo tests or timeout increases. Authentication plus authorization integration files passed 18/18 three consecutive times. Live checks with development auth disabled verified Login 200, protected redirect 307, invalid login 401 generic, valid login 201, `/me` 200 without secrets, first-login administration 403, profile/avatar/password flows, logout 201, and old-session reuse 401.
- Full final commands passed: `git diff --check`, lint (two non-failing authenticated-avatar optimization advisories), typecheck, complete tests, production build, format check, Docker config/healthy services, Prisma validate/generate/status, and seed.
- Ponytail review applied three reductions: removed dead Settings navigation, removed an unused login result, and centralized route-permission mappings (`net: -24 lines`). Local correctness review fixed the immutable-status/final-admin bypass, disabled-session resurrection, unauthorized catalogue fetching, bcrypt byte limits/test cost, safe tenant 404s, duplicate department assignment, and 409 final-admin conflicts.
- Codex review: `codex review --uncommitted` was attempted twice. Sandbox initialization failed first; the required escalation was then rejected because sending the full private uncommitted diff to an external review service needs new explicit user approval after risk disclosure. No workaround was attempted.

## Sprint 1 completion audit — 2026-07-20

- Identity model: `User` is the global human identity and exposes only safe profile fields. Email is normalized and unique. Organization settings reject global identity edits/disables for users shared by multiple organizations; their organization membership must be disabled instead.
- Organization membership: `OrganizationMembership` is unique per organization/user, timestamped, status-bearing, visible in Users, and managed through permission-protected scoped endpoints. Creation, status changes, and status changes caused by account disable are audited. The final active administrator membership cannot be disabled.
- Department membership: `DepartmentMembership` is organization scoped, unique per department/user, timestamped, and limited by a partial unique index to one primary department per organization/user. Composite foreign keys require the organization membership and department to share its organization. Add/remove actions are audited separately and grant no permissions. Users manages assignments; Departments shows counts, members, and primary indication.
- Authorization flow: development auth resolves one unambiguous active user/organization membership; active organization roles supply a sorted unique union of permission codes; global Nest guards return 401 for an unresolved actor and 403 for missing permission; services derive scope from `CurrentActor` and use scoped lookups returning 404 for foreign records. Frontend visibility is usability only.
- Permission catalogue: 20 idempotently seeded stable codes cover organization, departments, users, memberships, roles, role assignment/archive, permission read/assignment, and audit read. Normal users cannot create arbitrary permission codes.
- Roles: organization-scoped assignments support multiple active roles. Duplicate assignments and same-organization membership/role references are database constrained. The Users page edits assignments and shows effective permissions; Roles shows permissions and assigned members. Inactive roles do not grant access.
- Final-administrator protection: serializable mutations prevent disabling the final active administrator account or membership and removing its `system_admin` role. System roles cannot be archived and `system_admin` permissions remain seed controlled.
- Audit coverage: organization, department, user, organization-membership, department-membership add/remove, role, role-permission, and role-assignment mutations write actor, organization, action, entity, timestamp, and safe before/after or metadata in the same transaction. Viewing requires `audit.read`.
- Local authentication: `ALLOW_DEV_AUTH` defaults false, is rejected in production, uses the normalized seeded email, rejects zero/multiple active memberships, and remains isolated behind the `CurrentActor` boundary for later replacement.
- Tests added/expanded: direct Nest API tests cover permitted and forbidden mutations, no-write/no-audit behavior on 403, department non-authorization, role grant/removal, multi-role union, disabled account/membership, cross-organization user/department/role rejection, mutation audits, role-permission changes, and all final-administrator mutation paths.
- Endpoint evidence: `POST /api/v1/departments` returns 201 for the seeded administrator and writes one `department.create` audit; the same endpoint returns 403 for an active actor lacking `department.create`, with unchanged matching department and audit counts. A department membership alone still returns 403; adding the permission through an assigned role returns 201; removing it returns 403. `GET /api/v1/departments/:foreignId` and `GET /api/v1/users/:foreignId` return 404, and foreign department/role assignment returns 400. `GET /api/v1/me` returns 401 for disabled users and memberships. The final administrator's user disable, membership disable, generic status change, and role removal are rejected. Department-membership, role-permission, membership-status, and department mutations are verified to create audit rows.
- Migrations: `20260720032423_department_membership_updated_at` adds the relationship update timestamp safely for existing rows; `20260720034500_enforce_membership_organization_scope` adds composite tenant foreign keys. The latter SQL was generated with `prisma migrate diff`, reviewed, deployed, and reported up to date. The disposable local database contained only deterministic seed/test artifacts and was reset with approval after Prisma detected the first new migration had been reviewed after local application; no shared data was reset.
- Commands run successfully: Prisma validate/generate/migrate/deploy/status, repeated seeds, Docker config/up/ps, lint, typecheck, format check, full test (`api 31`, `web 5`, document service `1`), production build, and `git diff --check`. Five isolated forbidden tests and three subsequent complete integration runs passed. Live API and all Settings routes returned HTTP 200. A production start with development authentication enabled failed at environment validation as required.
- Ponytail review: lean already; no dependency, abstraction, or required security/test code was removed. Correctness review fixed internal external-auth field exposure in user responses/audits, inactive-member effective-permission display, a generic-update final-admin bypass, ambiguous development tenant selection, and missing database tenant foreign keys.
- One anomalous repeated focused run reported a five-second timeout for a test whose measured body was 31 ms and whose file completed under one second. No timeout was increased; five isolated reproductions and three full integration reruns passed.
- Final acceptance rerun on 2026-07-20: `git diff --check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (API 31/31, web 5/5, document service 1/1), `pnpm build`, `pnpm format:check`, Prisma validate/generate/status, and Prisma seed passed. Three additional consecutive complete Sprint 1 API integration runs passed 12/12 each. No skipped, todo, only, flaky, explicit-sleep, or timeout-configured tests were found. Ponytail diff review reported `Lean already. Ship.` (`net: -0 lines possible`). The requested Codex uncommitted review remains unverified because the execution policy rejected disclosure of private uncommitted changes to its external review service pending explicit user approval.

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

- Local avatar storage is single-host and not suitable for horizontally scaled or ephemeral production deployments; configure persistent shared storage when deployment requires it.
- Sprint 1 intentionally has no registration, identifier change, MFA, or social/passwordless login.
- Development authentication intentionally rejects users with multiple active memberships because it has no tenant selector; a future production identity provider must supply the active organization explicitly.
- Sprint 1 operates with the seeded Galaxy Centre organization, although the schema and membership APIs safely support additional isolated organizations.
- No Sprint 2 customers, projects, or other business-domain functionality has been started.
- External Codex review remains blocked pending explicit approval to transmit the private uncommitted diff.

## Next recommended sprint

Sprint 2: customers, contacts, leads, opportunities, projects, project members, tasks, and milestones, reusing the Sprint 1 `CurrentActor`, organization scope, RBAC, audit, migration, and Settings patterns.

## Node TLS edge — 2026-07-22

- Added the standalone `@galaxy/edge` TypeScript workspace package: HTTP ACME/redirect service, optional Node TLS 1.2+ termination, strict Host validation, local readiness with upstream status, HTTP/WebSocket proxying, fixed forwarding headers, safe 502 handling, structured metadata-only logs, and graceful shutdown.
- Added the ignored edge environment contract, runtime-path ignores, root edge scripts, and hardened non-root `infra/systemd/galaxy-edge.service` template. Router, Windows portproxy, certificates, secrets, and Sprint 2 remain untouched.
- `pnpm install` and `pnpm edge:check` passed; the socket tests required permission to bind temporary loopback listeners in the managed verification sandbox.

# Galaxy OS

Galaxy OS is Galaxy Centre's internal operating platform. Sprint 1 provides hierarchical organizations, scoped enterprise IAM, system/organization configuration, metadata-driven custom fields, email/password login, personal accounts, and secure database sessions.

## Architecture

- `apps/web`: Vietnamese, desktop-first Next.js App Router shell
- `apps/api`: NestJS modular-monolith REST API and Prisma client
- `services/document-ai`: inactive FastAPI health placeholder reserved for Sprint 14
- PostgreSQL: system of record; Redis: local infrastructure only, unused by application code

Browsers use the same-origin `/api/v1` path on the web application. Next.js
forwards only approved Galaxy OS API paths to the private server-only
`INTERNAL_API_URL` (default `http://127.0.0.1:3001/api/v1`) and preserves
session cookies. Keep browser-facing `NEXT_PUBLIC_API_URL=/api/v1`; never put
the internal API URL in a `NEXT_PUBLIC_` variable.

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
cp .env.example .env.local
pnpm install --frozen-lockfile
python3 -m venv services/document-ai/.venv
services/document-ai/.venv/bin/pip install -r services/document-ai/requirements-dev.txt
pnpm db:generate
pnpm env:check
```

The ignored root `.env.local` is the single local-development environment file used by the API and Prisma commands. Set a local-only `DEV_SEED_PASSWORD` of 12–72 UTF-8 bytes before seeding to create the administrator credential; it is hashed and never printed or stored as plaintext. `PASSWORD_BCRYPT_ROUNDS` defaults to 12. `ALLOW_DEV_AUTH` remains false by default; outside production it also requires the explicit `x-galaxy-dev-auth` request selector, and production rejects it. Session lifetime/cookie name and local avatar storage are configured by `SESSION_TTL_HOURS`, `SESSION_COOKIE_NAME`, `AVATAR_STORAGE_PATH`, and `AVATAR_MAX_BYTES`.

## Develop

Start infrastructure:

```bash
docker compose up -d postgres redis mailpit
docker compose ps
```

Start web and API together with `pnpm dev`, or separately:

```bash
pnpm --filter @galaxy/web dev
pnpm --filter @galaxy/api dev
```

Web: <http://localhost:3000>. Web health: <http://localhost:3000/health>.
The API and Swagger remain loopback-only on port 3001; normal browser traffic
uses <http://localhost:3000/api/v1/health> and the other same-origin API paths.

Mailpit receives local password-reset mail on SMTP port 1025; inspect it at <http://localhost:8025>. Production must configure the trusted `APP_PUBLIC_ORIGIN`, SMTP settings, and `EMAIL_FROM`. Reset tokens are hashed, expiring, single-use, and revoke all sessions when consumed.

## Internet deployment

Do not expose the development server or public ports 3000/3001. The supported
production server, Cloudflare Tunnel recommendation, Caddy/DDNS alternative,
systemd persistence, router/firewall changes, temporary non-production
connectivity diagnostic, and rollback steps are in
[Internet deployment](docs/internet-deployment.md).

Administration combines effective permissions with `SYSTEM`, `ORGANIZATION`, `DEPARTMENT`, or `SELF` role-assignment scope. Department authority additionally requires an explicit active managed-unit assignment; ordinary membership is never authority. A shared backend target policy enforces tenant/unit scope, protected/equal authority, assignment-scope ceilings, and delegable permission subsets.

`/settings/departments` provides tree/list organizational structure, `/settings/roles` provides the role/permission designer, `/settings/custom-fields` manages metadata fields, and `/settings/system` is protected System Administrator configuration. System and organization settings use separate allowlisted catalogues; secrets stay in the environment or production secret store. The per-user capability editor creates a named audited access-profile role with explicit scope instead of storing arbitrary direct permissions.

Users administration lives at `/settings/users`. Its server-paginated summary list returns only concise identity, status, role/department summaries, and allowed actions. View, Edit, and Create use separate routes; capabilities, sessions, and audit history load only when their detail tab or drawer is opened. Disabling is the retention-safe removal policy and revokes active sessions; Sprint 1 intentionally exposes no hard-delete route.

Open <http://localhost:3000/login>. Protected web routes validate `/api/v1/me` before rendering, preserve only safe relative return paths, and redirect unauthorized deep links to `/forbidden`. Cookie-authenticated mutations use `SameSite=Lax` plus origin validation; cross-origin local requests send credentials explicitly.

The Login form has a same-origin POST fallback when JavaScript is unavailable.
Development CSP permits only the inline/eval/WebSocket exceptions required by
the Next.js development runtime. Production uses a unique per-request nonce,
dynamic rendering, and no `unsafe-eval`; local HTTP does not enable HSTS,
Secure cookies, or `upgrade-insecure-requests`.

## Trusted private LAN access

The web development server listens on `0.0.0.0:3000`; NestJS listens on
`127.0.0.1:3001`. Set `APP_PUBLIC_ORIGIN` to the URL users will open and add
the corresponding hostname or IP to comma-separated `DEV_ALLOWED_ORIGINS`.
Only TCP port 3000 should be exposed to the trusted private LAN. Never expose
PostgreSQL, Redis, or port 3001 for this architecture.

Run PowerShell as Administrator to allow the web port on the Private profile:

```powershell
New-NetFirewallRule -DisplayName "Galaxy OS Web 3000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private
```

If WSL uses NAT and the LAN cannot reach it directly, obtain the WSL address
with `wsl hostname -I`, then run this in Administrator PowerShell (replace the
placeholder with that address):

```powershell
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=3000 connectaddress=<WSL_IP> connectport=3000
```

Another trusted device then opens `http://<WINDOWS_LAN_IP>:3000`. Windows
firewall/portproxy changes are operator actions; this repository does not make
them automatically.

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

With PostgreSQL healthy and `DATABASE_URL` loaded from `.env.local`:

```bash
pnpm db:generate
pnpm db:migrate --name <short_description>
pnpm db:status
pnpm db:seed
```

Create migrations only through Prisma, review generated SQL, never rewrite an applied migration, and never run `migrate reset` against shared data. See [database/README.md](database/README.md).

The deterministic seed creates Galaxy Centre, its organizational tree, the complete Sprint 1 role/permission catalogue, and representative System Administrator, Organization Administrator, Director, Sales/Accounting Manager, and employee accounts. When `DEV_SEED_PASSWORD` is present, it creates each missing local bcrypt credential once and requires a password change at first login. It never overwrites an existing password or prints the credential.

To replace the local System Administrator password safely, run the command in
an interactive terminal. It hides and confirms the temporary password, then
requires you to type the displayed target email before changing anything:

```bash
cd /home/galaxy_os

pnpm admin:reset-password
```

The default protected account is `admin@galaxy.local`, role `system_admin`, scope `SYSTEM`. The temporary password is known only to the operator. Set `ADMIN_EMAIL` only when an existing protected System Administrator is the intended target; otherwise the command falls back to `DEV_AUTH_USER_EMAIL`, then the default account. The command never creates or repairs an administrator. `ADMIN_TEMP_PASSWORD` plus matching `ADMIN_CONFIRM_EMAIL` is a higher-exposure fallback only for controlled, noninteractive development/test automation: set it for one process, never in `.env.local`, logs, or production. Never commit `.env.local` or credentials. The reset revokes existing sessions and reset tokens, clears login lockout state, and requires the user to change the temporary password after first login. Test real password login and the forced-change flow with `ALLOW_DEV_AUTH=false`.

## Troubleshooting

- `docker: command not found` in WSL: enable this distro under Docker Desktop → Settings → Resources → WSL Integration, then reopen the shell.
- Port already in use: change `POSTGRES_PORT`, `REDIS_PORT`, or `API_PORT` in `.env.local`, then restart the affected process.
- API readiness returns 503: check `docker compose ps`, then confirm `DATABASE_URL` matches the Compose values.
- Prisma Client missing: run `pnpm db:generate`.
- Stale Next output: remove `apps/web/.next` and rebuild; it is generated and ignored.
- Browser tests need Chromium and its host libraries: run
  `pnpm --filter @galaxy/web exec playwright install chromium`, then
  `pnpm --filter @galaxy/web test:browser`.

Any password previously exposed in a Login URL is compromised and must be
rotated with the documented hidden-input reset command after this flow is
repaired. Never reuse or record that password.

## Repository structure

```text
apps/                 web and ERP API
database/             Prisma schema and migration guidance
docs/                 business, architecture, decisions, sprints
scripts/              repository environment checks
services/document-ai/ inactive future document service
.github/workflows/    CI
```

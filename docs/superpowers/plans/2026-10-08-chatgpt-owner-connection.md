# ChatGPT owner connection implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Owner approved this scope and INLINE in the active request. No repeat approval gate.

**Goal:** A SYSTEM owner signs in with ChatGPT and completes Project chat plus a real task_list round trip.
**Architecture:** Settings owns the encrypted connection and loopback OAuth lifecycle. ProjectAiService reuses its IAM, conversation, answer and Task domain; the SIWC adapter uses official HTTP/SSE only.
**Tech Stack:** NestJS, Prisma SystemSetting, Node crypto/http, jose, Next.js, Vitest/Playwright.
**Spec:** ../specs/2026-10-08-chatgpt-owner-connection-design.md, bounded by the current owner prompt.

## Global constraints

- Existing isolated worktree m2-a-20260928; baseline dd66c640. Preserve unrelated work. No commit/push/merge.
- Dynamic registration, Galaxy host ID, exact loopback callback, verified OIDC and actual token-response scopes.
- Owner pilot only; four API-key providers stay paused. No fallback, billing change or automatic purchase.
- No schema/migration/domain changes; protected runtime key and encrypted SystemSetting record. No secrets in projections/logs.
- Browser Windows and live evidence are separate from mocked tests. User performs login/MFA/consent.

## Review focus

Cross-origin callback without Galaxy cookies; cancel racing callback/refresh; stale role/session; truncated SSE; Project/tool data crossing actor boundaries.

### Task 1: Connection lifecycle

**Files:** settings/chatgpt-connection.service.ts, settings/chatgpt-connection.test.ts, settings module/controller/service, security-redaction and tests; API dependency/lockfile.
**Interfaces:** metadata(actor), begin(actor), cancel(actor), disconnect(actor), owner(actor, generation?), catalog(actor), respond(actor, generation, request, signal).

- [ ] Write RED tests for first registration, SYSTEM/session checks, missing grant, state/nonce/replay/cancel and issued ID validation.
- [ ] Implement backend loopback listener, encrypted persistence, OIDC verification and safe error projections.
- [ ] Add refresh/restart/revoke tests and serialized lifecycle, then run targeted Vitest.

### Task 2: Project and admin UI

**Files:** ai-chatgpt-plan.ts/tests, ai-registry.ts, ProjectAiService, project-chat.module, project-ai.tsx, settings/chatgpt-connection/page.tsx, relevant tests.
**Interfaces:** Task 1 owner-bound generation/catalog; existing Task domain and answer lifecycle.

- [ ] RED tests for owner/staff split, task_list ACL, stream terminal and lifecycle fencing.
- [ ] Connect model selection, official Responses tool loop and Project answer persistence; no writes or extra tools.
- [ ] Connect real admin actions and host guidance; test browser flow with isolated fixtures.

### Task 3: Verify and release

**Files:** runtime candidate env/artifact and scoped status/handoff docs.

- [ ] Run focused and full regression, lint/typecheck/build/format; record exact blockers.
- [ ] Fresh correctness/security/authorization/UX and Ponytail review.
- [ ] Build immutable local artifact; verify Windows callback and both served URLs.
- [ ] User authenticates on Galaxy/OpenAI; verify real catalog, Project response.completed and task_list, lifecycle.
- [ ] Record A–J evidence, source/tree/artifact identity and remaining one next blocker if any.

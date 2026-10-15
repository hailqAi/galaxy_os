# Project Delete and Key Dossier Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: execute inline with strict RED → GREEN cycles. The user prohibited subagents, commits, pushes, resets, `db push`, and deletion of non-test data.

**Goal:** Safely delete authorized Projects, fully separate Key Dossier milestones/uploads/state from the five-Step Workflow, and delete Key Dossier items independently from attachments.

**Architecture:** Extend the current discriminator-based document models with one Key Dossier milestone relation and tombstones. Reuse the current upload/file stack while making its target validation and client state context-specific.

**Tech Stack:** NestJS, Prisma/PostgreSQL, strict TypeScript, Next.js/React, Vitest, Playwright, Chrome DevTools MCP.

**Spec:** `docs/superpowers/specs/2026-09-10-project-delete-key-dossier-separation-design.md`

## Global constraints

- Preserve the dirty working tree and current branch; do not commit or discard user work.
- No second uploader, FileAsset model, workflow engine, dependency, bulk delete, trash UI, or permanent delete.
- Never reset data or rewrite an applied migration; migration and backfill are additive/idempotent.
- Every command uses CurrentActor, organization, Project scope, exact permission, and existing target policy.

### Task 1: Lock permission, Project-delete, and separation regressions

**Files:** `apps/api/src/projects/projects.test.ts`, `apps/api/src/projects/project-stage-one.test.ts`, `apps/api/src/uploads/uploads.test.ts`, `apps/web/app/projects/page.test.ts`, `apps/web/app/project-pms.test.tsx`, `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`.

- [ ] Add tests for scoped `project.delete`, revoke-before-confirm, reason/code validation, idempotent audit, active-list/search/selector removal, and preserved child records.
- [ ] Add tests proving 0/2/7 independent milestones, Workflow independence, context-bound recovery/finalize/submit, non-mixed lists, item/file deletion isolation, and delete/upload races.
- [ ] Run focused tests and record the expected missing-field/route/capability failures.

### Task 2: Add the minimal additive schema and permission catalogue

**Files:** `apps/api/prisma/schema.prisma`, new `apps/api/prisma/migrations/20260910*_project_delete_key_dossier_separation/migration.sql`, `apps/api/prisma/seed.mjs`, permission UI/tests.

- [ ] Add Project deletion metadata, Key Dossier milestone rows, item milestone/tombstone fields, relations, constraints, and indexes.
- [ ] Insert Vietnamese-labelled `project.key_dossier.manage` and `project.key_dossier.item.delete`; grant them only to the protected system role in migration and exclude delete capabilities from ordinary seeded roles.
- [ ] Backfill one independent snapshot milestone per legacy Project/Matrix reference without changing Workflow or duplicating physical files.
- [ ] Run Prisma format/validate and review SQL for no destructive cascade/reset.

### Task 3: Separate Key Dossier catalogue, reads, permissions, and targets

**Files:** Stage 1 DTO/controller/service/rules/tests and upload DTO/service/tests.

- [ ] Add milestone create/update/delete and Key Dossier item CRUD commands with scoped permissions and audit.
- [ ] Return distinct `keyDossier` and `workflow` collections plus `canManageKeyDossier`, `canDeleteKeyDossierItem`, and per-file `canDeleteAttachment`.
- [ ] Make Matrix upload omit Workflow Step, derive its persisted target server-side, and make recovery context-specific.
- [ ] Recheck active Project/item in each terminal upload write; return distinct Project-deleted and item-deleted messages.
- [ ] Run focused API RED/GREEN tests.

### Task 4: Isolate Web forms, queues, queries, and file lists

**Files:** `project-stage-one.tsx`, `optional-document-matrix.tsx`, shared upload queue and focused tests.

- [ ] Replace the Matrix Step selector with independent milestone management and an unclassified option.
- [ ] Give Matrix and Workflow separate queue maps, recovery guards, selections, form/error/pending state, target payloads, and invalidation.
- [ ] Render only Key Dossier attachments in item rows and only selected-Step Workflow documents in its submitted list.
- [ ] Keep same-name files independent and preserve the other panel after submit/cancel/delete.
- [ ] Run focused Web RED/GREEN tests.

### Task 5: Add item/file deletion UX and shared Project deletion UX

**Files:** Stage 1 Web/API files, `apps/web/features/projects/project-delete-action.tsx`, Project dashboard/header and tests.

- [ ] Add separate confirmations for deleting one attachment and tombstoning an item with its visible attachment count.
- [ ] Add the shared Project dialog with code/reason validation, pending/error handling, dashboard refresh, and workspace redirect.
- [ ] Hide every action without capability while retaining backend enforcement.
- [ ] Run focused permission and UI tests.

### Task 6: Database/browser acceptance and review

**Files:** focused integration/Playwright specs and only verified status documentation.

- [ ] Apply/status the additive migration only with the safe deploy flow; create a run-specific TEST Project and never delete existing business data.
- [ ] Execute the five requested Playwright/browser flows, inspect Console/Network and every required screenshot.
- [ ] Run targeted checks, full relevant regression, Web production build, `git diff --check`, then correctness/security/authorization/UX and Ponytail diff reviews.
- [ ] Fix proven findings test-first and rerun affected checks before the final COMPLETE/PARTIAL/BLOCKED report.

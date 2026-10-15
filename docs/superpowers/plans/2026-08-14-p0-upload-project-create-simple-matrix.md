# P0 Upload, New Project, and Simple Stage 1 Matrix Implementation Plan

> **Execution:** use `superpowers:subagent-driven-development` sequentially in
> the current worktree. Do not commit, push, reset data, or discard existing
> changes. Every task starts with a failing focused test and ends with fresh
> targeted verification.

**Goal:** Repair the existing chunked Project upload path, expose one effective
20 GiB file limit, make `/projects/new` create an idempotent new Project and
redirect to its Stage 1, and cut Stage 1 over to one localized five-column
multi-file matrix.

**Architecture:** Keep the existing UploadSession → UploadPart → FileAsset →
ProjectStageOneDocument/EntityAttachment pipeline and existing `POST /projects`.
Widen only the active total-byte field, make the API upload constraints the
server authority, fold Stage 1 initialization into Project creation, and render
one queue/drawer against the existing Project-scoped document definitions.

**Stack:** NestJS, Prisma/PostgreSQL, Next.js/React, Vitest/Jest, Playwright,
pnpm, existing filesystem storage adapter.

## Task 1: Canonical 20 GiB limit and large-byte persistence

**Files:**

- Modify: `apps/api/src/config/env.ts`
- Modify: `.env.example`
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_file_asset_size_bigint/migration.sql`
- Modify: `apps/api/src/uploads/uploads.service.ts`
- Modify: `apps/api/src/uploads/uploads.test.ts`
- Modify only affected FileAsset response mappers in `apps/api/src/files/` and
  Project services that serialize `sizeBytes`
- Modify: `apps/web/app/projects/[projectId]/documents/document-upload.tsx`
- Modify: `apps/web/app/projects/[projectId]/documents/document-upload.test.ts`

1. Add failing tests proving the effective limit is exactly
   `21_474_836_480`, exactly 20 GiB is accepted, plus one byte is rejected,
   invalid startup values fail, the chunk limit remains bounded, and JSON uses
   a decimal string without overflow.
2. Run the focused API upload/config tests and capture the expected failures.
3. Add validated `UPLOAD_MAX_FILE_BYTES` with the canonical default; remove the
   active `FileAsset` 32-bit clamp.
4. Change only `FileAsset.sizeBytes` from Prisma `Int`/SQL `INTEGER` to BigInt
   with an additive `ALTER COLUMN ... TYPE BIGINT USING ...::bigint` migration.
   Preserve UploadPart `Int` because one part is bounded.
5. Keep bigint internally and serialize byte counts as decimal strings at API
   boundaries; update Web parsing to validate safe non-negative decimal bytes.
6. Run Prisma format/validate, inspect migration SQL, run focused tests, then
   apply with `prisma migrate deploy` and confirm migrate status. Never reset.

## Task 2: Explicit upload state machine, resume, and actionable failure

**Files:**

- Modify: `apps/web/features/projects/project-document-upload-queue.tsx`
- Modify: `apps/web/app/projects/[projectId]/documents/document-upload.tsx`
- Modify: existing focused queue/client tests or add adjacent test files
- Reuse patterns from: `apps/web/app/projects/[projectId]/documents/document-upload.tsx`

1. Add failing tests for selection, immediate `QUEUED → INITIALIZING`, init
   invocation, init failure → `FAILED`, first confirmed chunk > 0%, rerender file
   retention, independent multi-file state, retry, resume from server offset,
   abort, partial success, and no duplicate successful upload.
2. Run only those tests and confirm they fail for the missing explicit states.
3. Add the smallest state union and transitions needed for `INITIALIZING`,
   `UPLOADING`, `RETRYING`, `FINALIZING`, `COMPLETED`, `FAILED`, `ABORTED`.
4. Reuse the older uploader's server-session lookup and file identity checks;
   retain selected `File` in memory and store no token or signed secret.
5. Map actual Vietnamese init/chunk/finalize/link errors, preserve confirmed
   bytes on retry, and keep one AbortController per file.
6. Show percentage plus confirmed transferred/total bytes; never timer progress.
7. Run focused tests and Web typecheck.

## Task 3: Finalization, linkage, and authorization regression

**Files:**

- Modify: `apps/api/src/uploads/uploads.service.ts`
- Modify: `apps/api/src/uploads/uploads.test.ts`
- Modify: `apps/api/test/project-required-document-upload.integration.test.ts`
- Modify only if evidence requires: `apps/api/src/files/files.service.ts`

1. Add failing integration cases for BigInt finalization, multiple attachments
   on one definition, reload reads all files, idempotent finalize/activity,
   cross-Project rejection, non-member init/part/complete/read/download denial,
   and link retry without retransmitting bytes.
2. Run the focused tests and distinguish already-green guarantees from genuine
   gaps; do not rewrite working services.
3. Fix only proven gaps in the existing transaction/link path. A completed
   transfer may remain recoverable when linkage fails, but must not be shown as
   completed until linking succeeds.
4. Run API unit/integration tests for uploads and files.

## Task 4: Dedicated idempotent new-Project command

**Files:**

- Modify: `apps/api/src/projects/projects.dto.ts`
- Modify: `apps/api/src/projects/projects.controller.ts`
- Modify: `apps/api/src/projects/projects.service.ts`
- Modify: `apps/api/src/projects/project-stage-one.service.ts` only to expose a
  transaction-safe reuse point for the existing five-step/default initialization
- Modify: existing Project service/controller/integration tests
- Add a narrow Prisma idempotency relation/migration only if no existing audited
  unique key can safely own create-command idempotency

1. Add failing tests proving one `POST /projects` command generates a unique
   code, creates membership for CurrentActor, Stage 1, five steps, exactly five
   approved defaults, one Activity/Audit trail, and returns `stageOneUrl`.
2. Add retry/double-submit and cross-organization/permission cases; prove a
   selected existing Project is untouched.
3. Keep the current create endpoint and service. Accept the approved four-field
   payload plus idempotency key, validate CRM references in organization scope,
   normalize strings and Decimal money, and generate the code server-side.
4. In one short transaction, create the Project, member, Stage 1 state, five
   steps, five definitions, plan, Activity, and Audit. Do not upload files there.
5. Return `{ id, code, stageOneUrl }`; repeated same command key returns the
   existing result without another Project.
6. Run focused Project, membership, Stage 1, authorization, and Prisma tests.

## Task 5: `/projects/new` create UI and explicit existing edit mode

**Files:**

- Modify: `apps/web/app/projects/new/page.tsx`
- Modify or split minimally: `apps/web/app/projects/project-form.tsx`
- Modify: Project selector/navigation component used by Stage 1
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Modify/add focused Web tests for both modes and redirects

1. Add failing tests that `/projects/new` has only the four approved business
   fields, posts create with a stable idempotency key, refreshes selector data,
   and calls `router.replace('/projects/:id/stage-1?step=1')`.
2. Add a failing test that existing Stage 1 shows `THÔNG TIN KHỞI TẠO DỰ ÁN`,
   uses a PATCH/update command, and never renders/calls create.
3. Replace the generic new form's manual code/raw fields with the four fields
   and localized errors. Keep Decimal input as a string at the boundary.
4. Add `+ KHỞI TẠO DỰ ÁN MỚI` to the selector and navigate to `/projects/new`.
5. Separate create and update handlers; preserve existing Project routes.
6. Run focused Web tests and typecheck.

## Task 6: Exact five-column matrix and one row-scoped uploader

**Files:**

- Modify: Stage 1 matrix component(s) in `apps/web/features/projects/`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Modify: Stage 1 presentation-label dictionary/types
- Modify/add focused matrix and queue tests

1. Add failing tests for exactly five headers, five defaults, empty/file/multiple
   attachment cells, `TẢI LÊN`/`THÊM TỆP`, no `⋯`, no duplicate matrix/list,
   no raw enums, and one queue render.
2. Render the exact title/subtitle and five headers. Move all file viewing into
   the attachment column; show two chips plus `+ N tệp` drawer overflow.
3. Replace row details menus with one visible button. Open one in-page
   row-scoped multi-file drawer for both actions.
4. Remove the duplicate lower uploader/list after tests prove the matrix path.
5. Use one typed Vietnamese dictionary with a humanized unknown fallback and
   development diagnostic; do not alter internal enums.
6. Run focused matrix tests, raw-code search, Web typecheck, and build.

## Task 7: Matrix-level customization and optional-document guarantees

**Files:**

- Modify: existing Stage 1 document-definition component/API calls
- Modify: existing API document-definition DTO/service tests only for proven gaps
- Modify/add Web customization tests

1. Add failing UI tests for one `QUẢN LÝ LOẠI HỒ SƠ` drawer with add, rename,
   Step assignment, description, order, active toggle, and restore.
2. Add/confirm API tests for Project scope, authorization, reorder persistence,
   archive-not-delete with history, and no default re-seeding after customization.
3. Reuse the existing definition CRUD endpoints; change presentation and missing
   behavior only where tests prove a gap.
4. Confirm empty rows/matrix do not block Step/Stage completion or navigation.
5. Run focused API/Web tests.

## Task 8: Routes, browser acceptance, cleanup, and full verification

**Files:**

- Modify: existing legacy Stage 1 redirect pages/tests only if needed
- Modify: `apps/web/tests/browser/project-stage-one.spec.ts`
- Update: `docs/project-system/PROJECT_CREATE_UPLOAD_MATRIX_CUTOVER.md`
- Update: `PROJECT_STATUS.md` after accepted verified work

1. Add/confirm redirect tests for initiation → step 1, survey → step 2,
   requirements → step 3, and approval → step 5, including document deep links.
2. Extend Playwright for effective limit, create, small/multiple/multi-chunk,
   retry/abort, customization, authorization, and responsive viewports.
3. Start fresh source-matched services. Verify constraints returns 20 GiB and
   the browser shows 20 GB. Upload a real small file and a real many-chunk file;
   verify DB, storage, linkage, download, and reload.
4. Capture and inspect the 13 required visual states at the approved desktop
   and mobile viewports under ignored `.artifacts/`.
5. Search references, then remove only verified dead duplicate UI, menus,
   handlers, and active 2 GiB fallbacks. Do not delete domain history.
6. Invoke `superpowers:verification-before-completion`; run `git diff --check`,
   Prisma validate/status, all typechecks, lint, focused/full tests, Playwright,
   format check, and production build with fresh exact counts.
7. Invoke `superpowers:requesting-code-review`, then run Ponytail lean plus
   correctness, security, authorization, UX/reference, and large-file reviews.
   Fix findings with regression tests and rerun affected/full checks.
8. Record full 20 GiB transfer as verified only if an actual 20 GiB browser
   transfer completed with safe disk headroom. Otherwise report exactly
   `FULL_20_GIB_TRANSFER_NOT_VERIFIED` while preserving boundary evidence.

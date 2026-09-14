# Independent Project Workspace and Two-Phase Dossier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver CurrentActor-authorized temporary Project document uploads, explicit byte-free dossier submission, a Project overview root, independent Stage state/progress, separate Stage 1 Matrix and five-Step workflow, shared Stage document panels, and secure consolidated file access.

**Architecture:** Extend the existing `UploadSession` → `FileAsset` transport by stopping `/complete` after temporary FileAsset finalization and adding one idempotent session-link batch command. Reuse `ProjectStageState`, `ProjectStageStep`, `ProjectRequiredDocument`, `ProjectStageOneDocument`, `EntityAttachment`, and current Stage routes; add no parallel Project, workflow, uploader, or storage system.

**Tech Stack:** NestJS 11, Prisma 6/PostgreSQL 17, Next.js 16/React 19, strict TypeScript, Vitest, Playwright, native browser upload/preview APIs.

**Spec:** `docs/superpowers/specs/2026-08-07-galaxy-project-pms-full-replacement-design.md` sections 35–36.

## Global Constraints

- Preserve the dirty `feature/project-business-operations` worktree and inspect callers before edits.
- Ponytail full: reuse current systems, native APIs, and installed dependencies; smallest reviewed diff wins.
- Authorization always uses `CurrentActor`; `submittedOfficerId` is validated business metadata only.
- No commit, tag, push, PR, database reset, `prisma db push`, applied-migration rewrite, business-data deletion, or uploaded-history deletion.
- Migrations are additive, SQL-reviewed, and applied only through `pnpm --filter @galaxy/api prisma:deploy`.
- Each task follows RED → focused GREEN → focused review before the next task.
- Completion requires fresh full checks, real browser acceptance, and screenshot inspection.

---

### Task 1: CurrentActor upload authorization and server capabilities

**Files:**

- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/project-stage-one.test.ts`
- Modify: `apps/api/src/projects/project-stage-two.service.ts`
- Modify: `apps/api/src/projects/project-stage-two.test.ts`
- Modify if integration gap is proven: `apps/api/test/project-required-document-upload.integration.test.ts`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`

**Interfaces:**

- Produces `documentCapabilities(actor): { canReadDocuments; canUploadDocuments; canSubmitDocuments; canManageDocumentTypes; canCompleteStep; canReopenStep; canPreviewFiles; canDownloadFiles }` from existing permission codes.
- Stage responses expose `capabilities`; Web renders from these flags, never role names.
- `createUploadTarget` and `assertUploadTarget` scope Project access with `policy.projectWhere(actor)` and use `actor.userId` for session/file/audit ownership.

- [ ] **Step 1: Add RED authorization matrix tests**

  Cover SYSTEM/ORGANIZATION scope, active Project member with upload permission, member without permission, inactive user/membership, non-member, valid/expired role assignment, cross-Project definition, inactive definition, and on-behalf metadata. Assert the security actor remains `actor.userId`.

- [ ] **Step 2: Run RED tests**

  Run: `pnpm --filter @galaxy/api test -- project-stage-one.test.ts project-stage-two.test.ts`
  Expected: failures only for missing capability projection or proven target-policy gaps.

- [ ] **Step 3: Implement the smallest shared capability mapper and target correction**

  Keep permission checks in controllers/services. Do not add a permission when `file.upload`, `project.document.manage`, `project.read`, `file.read`, and `file.download` cover the command. Validate nominated officer after CurrentActor Project authorization.

- [ ] **Step 4: Make Web controls consume server capabilities**

  Disable/hide upload before file selection and show `Bạn không có quyền tải hồ sơ cho dự án này.` while retaining backend enforcement.

- [ ] **Step 5: Verify and review Task 1**

  Run focused API/Web tests and `pnpm --filter @galaxy/api typecheck && pnpm --filter @galaxy/web typecheck`.

### Task 2: Temporary-ready FileAsset boundary

**Files:**

- Modify: `apps/api/src/uploads/uploads.service.ts`
- Modify: `apps/api/src/uploads/uploads.controller.ts`
- Modify: `apps/api/src/uploads/uploads.dto.ts`
- Modify: `apps/api/src/uploads/uploads.test.ts`
- Modify: `apps/api/test/project-required-document-upload.integration.test.ts`

**Interfaces:**

- `UploadsService.complete(actor, sessionId, checksum?, note?)` verifies and materializes FileAsset only.
- A completed temporary response returns `status: 'AVAILABLE'`, `fileAssetId`, `uploadedBytes`, and no `document` or attachment projection.
- `EntityAttachment`, document version/current pointer, submitted Activity, and Audit remain absent until Task 3.

- [ ] **Step 1: Add RED completion tests**

  Assert one valid chunk advances `uploadedBytes`, complete creates exactly one FileAsset owned by `actor.userId`, complete retry reuses it, and no attachment/version/document-current mutation occurs.

- [ ] **Step 2: Run RED tests**

  Run: `pnpm --filter @galaxy/api test -- uploads.test.ts`
  Expected: current tests fail because `/complete` links the dossier immediately.

- [ ] **Step 3: Split byte finalization from business linkage**

  Stop the existing completion transaction after FileAsset materialization and `UploadSession.status = AVAILABLE`. Preserve checksum, content validation, exact part geometry, ownership, cleanup, and lost-acknowledgement idempotency.

- [ ] **Step 4: Add temporary recovery query**

  Add the smallest actor/context-scoped GET needed by the client to recover unsubmitted AVAILABLE sessions. Exclude sessions that already have an EntityAttachment and mark expired drafts without exposing storage metadata.

- [ ] **Step 5: Verify and review Task 2**

  Run unit and PostgreSQL upload integration tests. Confirm `FileAsset` exists and `EntityAttachment` does not.

### Task 3: Idempotent `NỘP HỒ SƠ` batch linkage

**Files:**

- Modify: `apps/api/src/uploads/uploads.controller.ts`
- Modify: `apps/api/src/uploads/uploads.dto.ts`
- Modify: `apps/api/src/uploads/uploads.service.ts`
- Modify: `apps/api/src/uploads/uploads.test.ts`
- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/project-stage-one.test.ts`
- Modify: `apps/api/test/project-required-document-upload.integration.test.ts`

**Interfaces:**

- `SubmitUploadsDto = { projectId: UUID; sessionIds: UUID[1..20]; idempotencyKey: string[1..200] }`.
- `POST /uploads/submit` returns `{ items: { sessionId; fileAssetId; document }[] }`.
- `UploadsService.submit(actor, dto)` locks the Project and sessions, reauthorizes each target, links existing FileAssets, and never reads or writes chunk bytes.

- [ ] **Step 1: Add RED batch tests**

  Assert no chunk/storage write occurs, only actor-owned AVAILABLE sessions in one Project are accepted, cross-Project and foreign-actor sessions are rejected, repeat same batch is idempotent, concurrent/retry linkage does not duplicate attachment/version, and a failed item retains its FileAsset.

- [ ] **Step 2: Run RED tests**

  Run: `pnpm --filter @galaxy/api test -- uploads.test.ts project-stage-one.test.ts`

- [ ] **Step 3: Implement the batch command with existing uniqueness**

  Reuse `@@unique([fileAssetId, entityType, entityId])`, document current-file idempotency, Project row locking, and Activity metadata carrying the batch key. Add a schema model only if a concurrency test proves these existing constraints cannot make key reuse safe.

- [ ] **Step 4: Verify PostgreSQL persistence**

  Assert one FileAsset, one EntityAttachment, one immutable version, one current pointer, actual actor in Activity/Audit, nominated officer in business metadata, and stable reload query.

- [ ] **Step 5: Verify and review Task 3**

  Run focused unit/integration tests and inspect SQL queries for Project/organization ownership.

### Task 4: Automatic client upload and explicit submit queue

**Files:**

- Modify: `apps/web/features/projects/project-document-upload-queue.tsx`
- Modify: `apps/web/features/projects/project-document-upload-queue.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/stage-1/optional-document-matrix.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`

**Interfaces:**

- Queue statuses: `QUEUED | INITIALIZING | UPLOADING | RETRYING | FINALIZING_TEMP | READY_TO_SUBMIT | SUBMITTING | SUBMITTED | FAILED | ABORTED | EXPIRED`.
- `transferProjectDocumentQueueItem` stops at READY_TO_SUBMIT after `/complete`.
- `submitProjectDocumentQueue(items, batchKey, request)` sends only session IDs and refreshes documents after success.

- [ ] **Step 1: Add RED queue tests**

  Assert file selection auto-starts, first confirmed chunk raises progress, complete maps to `Đã tải tạm — Chờ nộp`, no permanent refresh occurs, submit sends no file/blob/part request, duplicate clicks are blocked, failed linkage remains retryable, and submitted state refreshes/clears correctly.

- [ ] **Step 2: Run RED Web tests**

  Run: `pnpm --filter @galaxy/web test -- project-document-upload-queue.test.tsx project-stage-one.test.tsx`

- [ ] **Step 3: Implement automatic Phase A**

  Trigger queued items from the append path/effect with the existing concurrency limit. Preserve confirmed offsets, retry/abort, and per-file errors. Do not add timers or fake progress.

- [ ] **Step 4: Implement explicit Phase B**

  Enable `NỘP HỒ SƠ` only when every non-aborted item is ready and at least one is READY_TO_SUBMIT. Generate one stable batch key, submit session IDs, mark returned items SUBMITTED, then refetch.

- [ ] **Step 5: Add draft close/recovery UI**

  Render the approved three close actions only when temporary-ready files exist and recover them on reopening from the actor/context endpoint.

- [ ] **Step 6: Verify and review Task 4**

  Run focused Web tests, typecheck, and one real 48-byte PDF flow. Network must show initiate → part → complete on selection and only `/uploads/submit` on button click.

### Task 5: Project root overview and independent Stage cards

**Files:**

- Modify: `apps/api/src/projects/projects.service.ts`
- Modify: `apps/api/src/projects/projects.test.ts`
- Modify: `apps/api/src/projects/projects.controller.ts` only if a dedicated response is required
- Replace behavior in: `apps/web/app/projects/[projectId]/page.tsx`
- Modify: `apps/web/app/projects/[projectId]/compatibility.test.tsx`
- Modify: `apps/web/app/projects/page.tsx`
- Modify: `apps/web/app/projects/page.test.ts`
- Reuse/modify: `apps/web/app/project-pms.tsx`
- Modify: `apps/web/app/project-pms.test.tsx`

**Interfaces:**

- `workspaceSummary` returns five `StageOverviewCard` values with `stageKey`, Vietnamese `title`, `objective`, independent visible `status`, optional `completedSteps/totalSteps/progressPercent`, `updatedAt`, and `nextAction`.
- Missing later-Stage denominator returns null progress and `Chưa có tiến độ được ghi nhận`.

- [ ] **Step 1: Add RED API/Web route tests**

  Assert Project root renders overview without replace/redirect, five objectives render, Stage 1 uses exactly five Steps, later Stages use only own records, opening root makes no writes, list links target root, and deep Stage routes remain valid.

- [ ] **Step 2: Run RED tests**

  Run focused `projects.test.ts`, `project-pms.test.tsx`, compatibility, and Project list tests.

- [ ] **Step 3: Implement truthful overview projection**

  Map existing TaskStatus values to the five approved Vietnamese states without deriving one Stage from another. Remove mandatory-document and upstream-stage calculations from card progress/status.

- [ ] **Step 4: Replace root redirect with overview UI**

  Reuse existing card/status styles and direct `/stage-1` … `/stage-5` links. Add last-work optional action only if current persisted/current-user data already supports it; otherwise omit it.

- [ ] **Step 5: Verify and review Task 5**

  Run focused tests and Playwright Flow A/J. Query Activity/Audit counts before/after navigation to prove no mutation.

### Task 6: Stage 1 Matrix and five-Step dossier workflow

**Files:**

- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/stage-1/optional-document-matrix.tsx`
- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/project-stage-one.test.ts`
- Modify: `apps/api/src/projects/project-stage-one.controller.ts`

**Interfaces:**

- Matrix remains a sibling section with exactly five visible columns and Project-specific type management.
- Selected Step renders shared queue plus submitted list regardless of completion.
- `completeSimpleStep` changes only current Step; client navigation selects the next Step. Reopen uses its existing permission or remains unavailable until a distinct approved command is proven necessary.

- [ ] **Step 1: Add RED separation, type-history, and Step tests**

  Cover five columns/defaults, matrix/workflow non-duplication, archive-with-history, ordinary-user denial, `?step` persistence, completed-Step upload visibility, current-only completion, next selection, and no next-Step completion.

- [ ] **Step 2: Run RED API/Web tests**

- [ ] **Step 3: Restore one Step detail document panel**

  Compose `ProjectDocumentUploadQueue` under the selected Step with Step-scoped definitions/data. Do not create a second uploader.

- [ ] **Step 4: Correct completion copy and semantics**

  Use `HOÀN TẤT & CHUYỂN SANG BƯỚC X+1` for Steps 1–4 and `HOÀN TẤT & KẾT THÚC QUY TRÌNH` for Step 5; backend updates only selected Step.

- [ ] **Step 5: Verify and review Task 6**

  Run focused tests and Playwright Flows F/G.

### Task 7: Shared Stage panels and consolidated Stage file query

**Files:**

- Reuse: `apps/web/features/projects/project-document-upload-queue.tsx`
- Create only if composition cannot stay local: `apps/web/features/projects/project-stage-step-documents.tsx`
- Create focused test only with component: `apps/web/features/projects/project-stage-step-documents.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-two.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-two.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-access.tsx`
- Modify: `apps/api/src/projects/projects.service.ts`
- Modify: `apps/api/src/projects/projects.test.ts`

**Interfaces:**

- `GET /projects/:id/stage-documents?stageKey=&workstreamKey=&definitionId=&source=&submittedOfficerId=&from=&to=&mimeType=` queries canonical submitted attachments only.
- The shared panel receives actual existing Stage/workstream keys; it never invents Steps.

- [ ] **Step 1: Add RED query and shared-composition tests**

  Assert source/Step/type/officer/date/MIME filters, no temporary drafts, no duplicate attachment rows, and Stage isolation. Assert Stage 2 established tabs and Stage 3–5 existing work areas accept the shared panel without upstream gating.

- [ ] **Step 2: Run RED tests**

- [ ] **Step 3: Implement one bounded attachment query**

  Select safe file metadata, logical source, workstream, submitting officer, and submitted date from existing relations. Do not copy files or persist a second list.

- [ ] **Step 4: Compose supported Stage panels**

  Start with real Stage 2 Steps/tabs. For Stage 3–5, map only established workstream records surfaced by the current Stage response; show an honest no-record state where no Step model exists.

- [ ] **Step 5: Verify and review Task 7**

  Run focused API/Web tests and Playwright H/J.

### Task 8: Secure preview/download and draft cleanup

**Files:**

- Modify: `apps/api/src/files/files.controller.ts`
- Modify: `apps/api/src/files/files.service.ts`
- Modify: `apps/api/src/files/files.test.ts`
- Modify: `apps/api/src/uploads/uploads.service.ts`
- Modify: `apps/api/src/uploads/uploads.test.ts`
- Modify relevant shared file-list Web component/test from Task 7

**Interfaces:**

- `GET /files/:id/preview` returns inline only for PDF, JPEG/PNG/WebP, MP4, and currently supported plain text with safe headers.
- Unsupported formats return metadata instructing secure download or a 415; they never claim inline support.
- Draft cleanup acts only on expired, unattached, actor-owned temporary FileAssets.

- [ ] **Step 1: Add RED preview/download/cleanup tests**

  Cover permitted PDF/image/MP4, unsupported DOCX/XLSX/CSV/DWG/ZIP fallback, non-member denial, organization/Project isolation, no storage key, content disposition/type/nosniff headers, and submitted-history cleanup immunity.

- [ ] **Step 2: Run RED tests**

- [ ] **Step 3: Implement native streaming preview boundary**

  Reuse `FilesService.file` authorization and `FileStorage.stream`; do not add a conversion service.

- [ ] **Step 4: Implement bounded expiry cleanup**

  Reuse UploadSession expiry and FileStorage removal. If no scheduler exists, clean lazily during recovery/access plus one explicit internal maintenance method; do not add a worker solely for this task.

- [ ] **Step 5: Verify and review Task 8**

  Run focused file/upload tests and Playwright I/E.

### Task 9: Cutover, full regression, visual acceptance, and handoff

**Files:**

- Modify: `apps/web/tests/browser/project-stage-one.spec.ts`
- Modify: `apps/web/tests/browser/project-stage-two.spec.ts`
- Modify/create only required Project acceptance spec for Flows A–J
- Modify: `PROJECT_STATUS.md`
- Modify docs only where verified behavior changed
- Delete obsolete code only after `rg` proves zero legitimate callers and replacement acceptance passes

**Interfaces:**

- Browser flows A–J are the acceptance contract.
- Final report follows the user-specified 35-section structure and exact closing handoff title.

- [ ] **Step 1: Add/adjust Playwright flows before final implementation cleanup**

  Record upload request method/path/status/body-byte counts so submit proves no chunk retransmission.

- [ ] **Step 2: Run focused browser acceptance**

  Verify real authorized and unauthorized actors, upload-on-behalf actor/officer audit, reload persistence, Stage independence, matrix management, Step completion, consolidated list, and preview/download.

- [ ] **Step 3: Capture and inspect all approved viewports**

  Capture 1536×864, 1440×900, 1280×800, and 390×844 states. Open every final image at original detail and record defects before proceeding.

- [ ] **Step 4: Remove only proven obsolete redirect/upload/list code**

  Run caller searches first; preserve legacy routes, notifications, file history, and all user work.

- [ ] **Step 5: Invoke verification-before-completion and run fresh gates**

  Run `git diff --check`; Prisma temp-copy format check, validate, status; API/Web/Edge/Document typechecks; lint; focused authorization/upload/Project/Matrix/Step/file tests; full API/Web/Edge tests; document-ai test; Playwright A–J and baseline; production builds; `pnpm format:check`. Record exact counts and blockers.

- [ ] **Step 6: Request correctness review and run Ponytail reviews**

  Run correctness, lean, security, authorization, UX/reference, and upload/performance reviews. Fix every proven defect test-first and rerun affected gates.

- [ ] **Step 7: Update status and deliver the handoff**

  Report COMPLETE/PARTIAL/NOT_STARTED truthfully. Do not claim completion if 403, two-phase submit, persistence, Project root, Stage independence, or browser acceptance remains red.

## Plan self-review

- Spec coverage: Tasks 1–4 cover CurrentActor, capabilities, temporary upload, explicit submission, recovery, retry, resume, abort, and no retransmission; Tasks 5–7 cover overview, independent Stage state, Matrix/Steps, shared panels, and consolidated files; Tasks 8–9 cover secure file access, cleanup, cutover, browser/visual acceptance, and handoff.
- Placeholder scan: no TBD/TODO, fake data, fake progress, generic workflow engine, second uploader, second FileAsset system, or undefined later task remains.
- Type consistency: `AVAILABLE` is temporary-ready server state; Web `READY_TO_SUBMIT` maps to it; `POST /uploads/submit` consumes session IDs and returns linked document projections; only submitted attachments feed Stage lists.
- Safety: no task authorizes database reset, applied-migration edits, history deletion, commits, or unrelated refactors.

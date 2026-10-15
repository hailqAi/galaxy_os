# Optional Stage Documents, Upload Repair, and Stage 2 Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking. Do not commit.

**Goal:** Make Stage 1–5 Project documents optional, add the five-row editable
Stage 1 matrix, preserve the repaired shared multi-file pipeline, remove
whole-stage inheritance UI, and deliver a real Stage 2 Step 1 baseline plan,
XLSX preview/import, and optional documents.

**Architecture:** Reuse Project, ProjectStageState/Step,
ProjectRequiredDocument, the existing logical Stage 1 document/version tables,
UploadSession/FileAsset/EntityAttachment, Task, ImportJob/Row, Activity/Audit,
and current Project policy. Widen only the existing logical document relation
for Stage 2 and add only configuration/planning/import fields that current
models cannot represent. One Project-scoped API per stage feeds focused Web
components; no second uploader, file store, planning table, or Customer model.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Next.js/React, strict TypeScript,
ExcelJS, Vitest, Playwright, existing local resumable upload/storage adapter.

## Global Constraints

- Documents in Stages 1–5 are optional and never block a Step, Stage, route,
  readiness state, or navigation.
- Keep the exact Vietnamese labels, columns, default rows, tabs, empty states,
  and button copy from the approved 2026-08-14 prompt.
- Preserve Project, file, version, Activity/Audit, notification, approval, and
  migration history. Never reset the database or rewrite an applied migration.
- Any migration is production-safe, non-destructive, reviewed, and applied
  with `prisma migrate deploy` only.
- Backend Project membership and exact action permissions protect metadata,
  bytes, type management, upload, download, completion, plan CRUD, template,
  preview, and import.
- Financial values use `Prisma.Decimal`; unauthorized actors never receive,
  sort, filter, or export allocated budget.
- Reuse the configured upload extension/size limits; do not display a hard-coded
  50 MB/100 MB limit, physical storage key, or unverified SmartCA state.
- Use RED/GREEN TDD for every behavior. Do not commit, tag, push, open a PR,
  stage files, discard work, seed shared business data, or delete business rows.
- Primary design:
  `docs/superpowers/specs/2026-08-07-galaxy-project-pms-full-replacement-design.md`
  Sections 11–12 and 33–34.

---

## File responsibility map

- `project-stage-one.service/controller/dto/rules`: Stage 1 definitions,
  optional completion, logical document projection, and matrix commands.
- `project-stage-two.service/controller/dto`: Stage 2 Step 1 read model, Task
  CRUD, XLSX template/preview/confirm, optional definition commands, and Step
  completion.
- `uploads.*`: the one resumable transfer/finalization path and generalized
  Project stage-document target.
- `project-stage-one.tsx` plus `stage-1/optional-document-matrix.tsx`: Stage 1
  page composition, five-row matrix, and selected-Step behavior.
- `project-stage-two.tsx`: Stage 2 tabs, baseline table, import preview, optional
  upload, and actual-file list.
- `project-document-upload-queue.tsx`: extracted current Stage 1 queue shared by
  Stage 1 matrix, Stage 1 selected Step, and Stage 2 Step 1.
- `project-stage-access.tsx`: later-stage generic access without inherited data.

### Task 1: Optional document configuration and planning schema

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260814120000_optional_stage_documents_and_stage_two_plan/migration.sql`
- Test: `apps/api/src/projects/project-stage-one.rules.test.ts`
- Test: `apps/api/src/projects/project-stage-two.test.ts`

**Interfaces:**

- `ProjectStageState.documentDefinitionsInitializedAt: DateTime | null` marks
  one-time default creation per Project/stage.
- `ProjectRequiredDocument` adds `position Int @default(0)`,
  `initialMatrix Boolean @default(false)`, and `normalizedName String?`; reuse
  `notes` for description and `supersededAt/supersededBy` for hide/restore.
- The migration adds a partial unique index for active non-null normalized names
  within Project/stage/workstream.
- Existing `ProjectStageOneDocument` adds `stageKey String`,
  `workstreamKey String`; legacy `step` becomes nullable only for non-Stage-1
  rows. Existing rows backfill `STAGE_1` and their enum Step.
- `Task` adds nullable `code`, `baselineVersion`, and
  `allocatedBudget Decimal(20,2)` plus scoped uniqueness for
  `relatedEntityType = PROJECT_STAGE_TWO_BASELINE`.
- `ImportJob` adds nullable Project/FileAsset ownership so preview and confirm
  can reauthorize the exact Project and uploaded workbook.

- [ ] Write consumer-facing Prisma DMMF tests that fail until generated clients
      expose the fields used by the Stage 1/Stage 2 services. Review migration
      SQL manually for additive columns/indexes and the safe Stage 1 Step
      nullability widening; do not add a source-text change-detector test.
- [ ] Run:
      `pnpm --filter @galaxy/api test -- project-stage-one.rules.test.ts project-stage-two.test.ts`
      and record the expected RED field/model failures.
- [ ] Add the minimum Prisma fields/relations and SQL. Backfill existing logical
      documents before setting `stageKey/workstreamKey` non-null. Do not
      normalize or mutate historical Required Document names in the migration.
- [ ] Run `pnpm --filter @galaxy/api exec prisma format --check --schema prisma/schema.prisma`,
      `pnpm --filter @galaxy/api prisma:validate`, generate the client, inspect
      SQL, run `prisma:deploy`, then `prisma:status`.
- [ ] Re-run focused schema tests GREEN.

### Task 2: Project-scoped optional definition commands and one-time defaults

**Files:**

- Modify: `apps/api/src/projects/project-stage-one.dto.ts`
- Modify: `apps/api/src/projects/project-stage-one.controller.ts`
- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/project-stage-one.test.ts`
- Modify: `apps/api/test/project-stage-one.integration.test.ts`

**Interfaces:**

```ts
type ProjectDocumentDefinitionDto = {
  name: string;
  workstreamKey:
    | 'ASSIGNMENT'
    | 'SURVEY'
    | 'PROPOSAL'
    | 'FINANCIAL_PLANNING'
    | 'KICKOFF_APPROVAL';
  description?: string;
  position: number;
  initialMatrix: boolean;
  active: boolean;
  confirmDuplicate?: boolean;
};
```

- `GET /projects/:projectId/stage-1/simple` returns `documentDefinitions`, the
  exact five active `initialMatrix` rows, all configurable Step types, files per
  definition, and `permittedCommands`.
- `POST /projects/:projectId/stage-1/document-definitions` creates a custom row.
- `PATCH /projects/:projectId/stage-1/document-definitions/:id` renames, moves,
  reorders, hides, or restores it without deleting history.
- `initiateSimple` creates all approved Step defaults and marks exactly five as
  `initialMatrix` only when `documentDefinitionsInitializedAt` is null.

- [ ] Add failing tests for the exact five initial rows, retry idempotency,
      renamed/deleted defaults not being recreated, add/rename/move/reorder,
      hide/restore, history-preserving archive, normalized duplicate rejection,
      Project isolation, and `required: false` for every covered definition.
- [ ] Run the focused service/integration tests and record RED.
- [ ] Implement one normalization helper using `trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi')`,
      one locked initialization transaction, and the smallest create/update
      commands. Link existing matching historical definitions instead of
      duplicating them.
- [ ] Write Activity/Audit once for initialization and each accepted mutation;
      include IDs/Step/position, never filenames, storage keys, or financials.
- [ ] Re-run focused tests GREEN.

### Task 3: Optional Stage 1 Step/Stage completion

**Files:**

- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/project-stage-one.test.ts`
- Modify: `apps/api/src/projects/project-stage-one-approval.test.ts`
- Modify: `apps/api/test/project-stage-one.integration.test.ts`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`

**Interfaces:**

```ts
type CompleteOptionalStepResult = {
  completed: true;
  nextStep: 1 | 2 | 3 | 4 | 5 | null;
  stageCompleted: boolean;
};
```

- The simple completion endpoint never returns `missingDocuments`.
- Validation is limited to scoped Project existence, completion permission,
  valid Step/Stage state, and cross-Project integrity.
- Repeating completion is unchanged/idempotent. Completing all five Steps marks
  Stage 1 `DONE` with zero files and selects the next incomplete Step.

- [ ] Replace current document/approval-gate expectations with failing tests for
      one Step, all five Steps, Stage completion, empty matrix, all rows missing,
      legacy Required Documents missing, no Red Flag side effect, idempotency,
      invalid state, unauthorized actor, and reopen where existing policy allows.
- [ ] Run focused API/Web tests and confirm RED against `missingDocuments`.
- [ ] Delete only the covered simple-command document/approval/finance checks;
      retain separate legacy command behavior for compatible callers.
- [ ] Update the Web completion handler to consume only the successful result,
      navigate to `nextStep`, keep completed Steps accessible, and expose no
      missing-file warning copy.
- [ ] Re-run focused tests GREEN.

### Task 4: Generalized shared upload target and durable linkage

**Files:**

- Modify: `apps/api/src/uploads/uploads.dto.ts`
- Modify: `apps/api/src/uploads/uploads.service.ts`
- Modify: `apps/api/src/uploads/uploads.test.ts`
- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/project-stage-one.test.ts`
- Modify: `apps/api/src/files/files.service.ts`
- Modify: `apps/api/src/files/files.test.ts`
- Modify: `apps/api/test/project-required-document-upload.integration.test.ts`

**Interfaces:**

```ts
type ProjectStageDocumentTargetDto = {
  definitionId: string;
  stageKey: 'STAGE_1' | 'STAGE_2';
  workstreamKey: string;
  displayName?: string;
  submittedOfficerId: string;
  documentId?: string;
  idempotencyKey: string;
};
```

- Upload initiation resolves the definition by ID/Project/stage/workstream and
  creates/reuses one logical document per file key.
- Completion creates/reuses one FileAsset, EntityAttachment, logical version,
  current pointer, Activity, and Audit exactly once.
- The stable result includes safe document/file metadata but no checksum or
  storage key. Stage 1 and Stage 2 use this same target and service.

- [ ] Add failing tests for the previously reproduced missing definition link,
      matrix upload, Step upload, Stage 2 target, multiple same-type documents,
      later version, reload, retry, partial batch, duplicate completion/activity,
      expired session, configured constraints, cross-Project target, non-member
      metadata/bytes, on-behalf actor/officer audit, and Vietnamese categories.
- [ ] Run upload/FileAsset/integration tests and confirm RED.
- [ ] Generalize the existing target lookup/transaction; do not change chunking,
      storage, checksum, resume, retry, abort, or download adapters.
- [ ] Map errors to the approved actionable Vietnamese messages at the API/Web
      boundary without exposing Prisma/stack/raw enum data.
- [ ] Re-run focused tests GREEN and repeat the original Playwright upload flow
      to prove definition linkage as well as file persistence.

### Task 5: Stage 1 matrix, customization, and shared Web upload queue

**Files:**

- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Create: `apps/web/app/projects/[projectId]/stage-1/optional-document-matrix.tsx`
- Create: `apps/web/features/projects/project-document-upload-queue.tsx`
- Create: `apps/web/features/projects/project-document-upload-queue.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/compatibility.test.tsx`

**Interfaces:**

- `ProjectDocumentUploadQueue` consumes Project/stage/workstream/definition,
  officer options, configured constraints, and `onUploaded(document)`.
- `OptionalDocumentMatrix` renders exactly the five approved desktop columns,
  compact mobile cards, add/edit/reorder/hide/restore, Upload/View, file drawer,
  and actual attachments.

- [ ] Add failing component tests for exact order/subtitle/five rows/columns,
      empty/file/multiple-file statuses, file drawer, add/edit/move/reorder,
      hide/restore, history archive, duplicate warning, and no file count/gate.
- [ ] Add failing shared-queue tests for picker, `multiple`, drag/drop, queue
      retention across prop refetch/rerender, configured limits, remove, abort,
      retry/resume, independent partial success, and completed-item dedupe.
- [ ] Run focused Web tests RED.
- [ ] Extract the already working queue without changing its protocol, then use
      it from both the initial matrix and selected-Step area. Keep queue state
      keyed by Project/stage/workstream, not by fetched Step object identity.
- [ ] Insert the matrix immediately after initiation. Derive Step detail,
      uploader, list, and completion label from the same URL Step value.
- [ ] Re-run focused Web tests, Web typecheck, and build GREEN.

### Task 6: Remove inherited-data behavior from Stage 2–5

**Files:**

- Modify: `apps/api/src/projects/projects.service.ts`
- Modify: `apps/api/src/projects/projects.test.ts`
- Modify: `apps/web/app/projects/[projectId]/project-stage-access.tsx`
- Modify: `apps/web/app/projects/[projectId]/compatibility.test.tsx`
- Modify: `apps/web/tests/browser/project-pms-stage-access.spec.ts`

**Interfaces:**

- Stage access no longer returns/calculates `upstreamWarnings`.
- Stage 2–5 routes render without `DỮ LIỆU KẾ THỪA`, earlier-stage warning copy,
  or status-based redirect.

- [ ] Add failing API/Web/browser tests opening Stage 2 with Stage 1 incomplete,
      Stage 3 with 1–2 incomplete, Stage 4 with 1–3 incomplete, and Stage 5 with
      1–4 incomplete; assert no inherited card, warning, or redirect.
- [ ] Run focused tests RED.
- [ ] Remove upstream warning calculation and the inherited-data section only;
      preserve direct Project authorization, applicability, state, and real
      record-level business screens.
- [ ] Re-run focused tests GREEN.

### Task 7: Stage 2 Step 1 API, Task CRUD, XLSX template, and import

**Files:**

- Create: `apps/api/src/projects/project-stage-two.dto.ts`
- Create: `apps/api/src/projects/project-stage-two.controller.ts`
- Create: `apps/api/src/projects/project-stage-two.service.ts`
- Create: `apps/api/src/projects/project-stage-two.test.ts`
- Modify: `apps/api/src/projects/projects.module.ts`
- Modify: `apps/api/src/imports/imports.service.ts`
- Modify: `apps/api/src/imports/imports.test.ts`
- Modify: `apps/api/src/access-control/business-entity.policy.ts`
- Test: `apps/api/test/project-stage-two.integration.test.ts`

**Interfaces:**

```ts
type StageTwoPlanRowInput = {
  id?: string;
  code: string;
  description: string;
  departmentId: string;
  startDate: string;
  finishDate: string;
  allocatedBudget?: string;
  version?: number;
};
```

- `GET /projects/:id/stage-2?step=1` returns tabs, permitted commands, real
  baseline Tasks, optional definitions, actual documents, members/departments,
  and upload constraints.
- `PUT /projects/:id/stage-2/plan` validates/saves the submitted batch with
  optimistic versions and soft-deletes confirmed persisted removals.
- `GET /projects/:id/stage-2/plan-template` returns a valid authorized XLSX.
- `POST /projects/:id/stage-2/plan-import/preview` consumes an authorized
  completed workbook FileAsset and returns row-level preview/errors/summary.
- `POST /projects/:id/stage-2/plan-import/:jobId/confirm` imports valid rows once;
  default mode rejects duplicate codes.
- `POST /projects/:id/stage-2/steps/1/complete` succeeds with an empty plan and
  zero documents.

- [ ] Add failing tests for real list/add/edit/delete/reload, scoped unique code,
      dates, active department, Decimal normalization, finance omission,
      non-member denial, idempotent completion, and Activity/Audit.
- [ ] Add failing XLSX tests for exact headers, valid workbook, authorized
      download, bounded size/row count, formula rejection, malformed/duplicate
      headers, row errors, duplicate code rejection, preview counts, explicit
      confirm, transaction safety, and confirm retry dedupe.
- [ ] Run focused Stage 2/import tests RED.
- [ ] Implement the focused controller/service using Task discriminator
      `PROJECT_STAGE_TWO_BASELINE`, baseline version `1`, existing ExcelJS, and
      existing FileStorage read methods. Do not add a queue worker unless the
      configured initial limit is measurably unsafe for the bounded parser.
- [ ] Re-run unit/integration tests GREEN and verify unauthorized responses omit
      project codes, filenames, budgets, workbook bytes, and storage metadata.

### Task 8: Stage 2 three-tab Web workspace and optional documents

**Files:**

- Create: `apps/web/app/projects/[projectId]/project-stage-two.tsx`
- Modify: `apps/web/app/projects/[projectId]/stage-2/page.tsx`
- Create: `apps/web/app/projects/[projectId]/project-stage-two.test.tsx`
- Reuse: `apps/web/features/projects/project-document-upload-queue.tsx`
- Modify: `apps/web/app/projects/[projectId]/compatibility.test.tsx`

**Interfaces:**

- URL `?step=1..3` owns selected tab and survives reload.
- Step 1 renders the exact baseline columns/actions, inline rows, import preview,
  optional upload section, actual-file list, and completion action.
- Step 2/3 render existing real functionality when present; otherwise the tab
  remains selectable without fake business content or a completion claim.

- [ ] Add failing tests for three exact tabs/query state, empty/error/loading,
      add/edit/delete-confirm/save/reload, date/budget validation, protected
      budget, real template response, XLSX selection→shared upload→preview,
      row errors/summary/confirm, duplicate handling, optional document types,
      multi-file list/reload/version, and zero-document completion.
- [ ] Run focused Web tests RED.
- [ ] Implement the shortest reference-style composition using native table,
      date/number/file controls and the shared queue. Do not ship sample rows,
      fake SmartCA, fixed limits, or storage paths.
- [ ] Re-run focused tests, Web typecheck, accessibility assertions, and build
      GREEN.

### Task 9: Compatibility, Playwright, visual acceptance, docs, and verification

**Files:**

- Modify: `apps/web/tests/browser/project-stage-one.spec.ts`
- Create: `apps/web/tests/browser/project-stage-two.spec.ts`
- Modify: `apps/web/tests/browser/project-pms-stage-access.spec.ts`
- Modify: `apps/api/scripts/stage-one-playwright-fixture.mjs`
- Create or modify the narrow Stage 2 Playwright fixture under `apps/api/scripts/`
- Update: `docs/project-system/OPTIONAL_DOCUMENT_AND_STAGE2_CUTOVER.md`
- Update: `docs/project-system/PMS_OPTIONAL_DOCUMENT_AND_STAGE2_REFERENCE_AUDIT.md`
- Update: `PROJECT_STATUS.md`

- [ ] Implement Playwright Flows A–I from the approved prompt with fixture-only
      IDs/data and assertions for console errors, direct authorization, reload,
      partial success, and no raw/mandatory/inherited copy.
- [ ] Preserve legacy Stage 1 routes and document links; add Stage 2 Step query
      compatibility and verify Notification/Activity hrefs.
- [ ] Capture all 15 requested states at 1536×864, 1440×900, 1280×800, and
      mobile under ignored `.artifacts/`; open every image at original detail.
- [ ] Search obsolete callers, delete only proven dead UI/handlers/CSS, and
      finalize KEEP_DOMAIN/REUSE/ADAPT/REDIRECT/DELETE_AFTER_CUTOVER.
- [ ] Invoke `superpowers:verification-before-completion` and run fresh:
      `git diff --check`, Prisma format/validate/status, API/Web/Edge typecheck,
      lint, targeted and full API/Web tests, upload/FileAsset/version/auth/route/
      Stage 2/import tests, Playwright A–I and existing baseline, format check,
      API/Web/Edge production builds. Record exact counts and blockers.
- [ ] Invoke `superpowers:requesting-code-review`; run correctness, security,
      authorization, UX/reference, and Ponytail diff reviews. Fix every proven
      defect test-first and rerun affected/full verification.
- [ ] Update `PROJECT_STATUS.md` and the final handoff without claiming COMPLETE
      for any unverified behavior. Do not commit.

## Plan self-review

- Spec coverage: Tasks 1–9 cover the optional matrix/types, Stage 1 shared
  uploads/completion, Stage 2–5 inheritance removal, Stage 2 tabs/plan/template/
  preview/import/documents/completion, authorization, routes, Playwright, and
  visual acceptance.
- Placeholder scan: no TBD/TODO, fake action, missing template, mock production
  row, second uploader, or unspecified validation step remains.
- Type consistency: every upload uses `ProjectStageDocumentTargetDto`; Stage 2
  plan uses Task discriminator `PROJECT_STAGE_TWO_BASELINE`, version `1`, and
  exact Decimal strings; definition IDs connect configuration to uploads.
- Scope: Stage 3–5 change only by removing inherited-data UI/warnings. Global
  authentication, CRM, Marketing, Warehouse, Product Master, deployment, and
  unrelated finance remain untouched.

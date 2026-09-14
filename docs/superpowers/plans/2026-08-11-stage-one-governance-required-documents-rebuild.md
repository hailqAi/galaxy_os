# Stage 1 Governance and Required Documents Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` task-by-task. Every production
> behavior follows `superpowers:test-driven-development`. The user forbids
> commits, tags, pushes, PRs, database resets, applied-migration rewrites, and
> discarding existing work; use task snapshots and working-tree review packages
> instead of commit ranges.

**Goal:** Make `/projects/:projectId/stage-1` a reference-matched operational
workspace with durable governance, one compact grouped Required Document view,
reliable resumable upload/versioning, and synchronized server readiness/issues/
gate behavior.

**Architecture:** Reuse the current Project, Project-member, Stage 1,
UploadSession, FileAsset, Required Document/version, Approval, Activity,
Notification, and Audit services. Add one additive Stage 1 coordinator-ID field
because no current relation safely represents multiple coordinators, expose one
atomic governance command, and replace only the Stage 1 presentation layer.

**Tech Stack:** Next.js 16, React 19, NestJS 11, Prisma 6/PostgreSQL 17,
Vitest 3, Playwright 1.51, TypeScript strict mode.

## Global Constraints

- Work in `/home/galaxy_os` on `feature/project-business-operations` and
  preserve every pre-existing modification.
- Do not create a second Project, governance, upload, Required Document,
  readiness, or gate source of truth.
- Do not expand Stage 2–5 business workflows; preserve their current routes and
  shared document placement only.
- Validate external input and enforce Project, membership, permission, file,
  financial, approver, and self-approval policy in the API.
- Preserve approved-document immutability, previous versions, one current
  version, auditability, financial redaction, and existing business data.
- No new dependency, repository-wide formatting, database reset,
  `prisma db push`, applied-migration edit, commit, tag, push, or PR.
- A new migration may only add the proven coordinator field, must be reviewed
  for additive SQL, and must be applied with `prisma migrate deploy`.
- Each task starts with a focused failing test, records the expected RED output,
  implements the smallest fix, and records focused GREEN output.

---

### Task 1: Atomic Stage 1 governance persistence

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create through Prisma migrate create-only:
  `apps/api/prisma/migrations/20260811103000_project_stage_one_governance/migration.sql`
- Modify: `apps/api/src/projects/project-stage-one.dto.ts`
- Modify: `apps/api/src/projects/project-stage-one.controller.ts`
- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/project-stage-one.test.ts`
- Modify: `apps/api/src/projects/project-stage-one-approval.test.ts`
- Modify: `apps/api/test/project-stage-one.integration.test.ts`

**Interfaces:**

- `ProjectStageOnePlan.governanceCoordinatorUserIds` is a non-null PostgreSQL
  UUID array with an empty default; it stores IDs only after service validation.
- `GET /projects/:projectId/stage-1/initiation` returns `governance` with
  `principalUserId`, `coordinatorUserIds`, `responsibilityNotes`,
  `availableMembers`, policy-resolved `approvers`, and
  `responsibilityNoteMaxLength: 1000`.
- `PATCH /projects/:projectId/stage-1/governance` accepts exactly
  `{ principalUserId: UUID, coordinatorUserIds: UUID[], responsibilityNotes:
  string | null }` and returns the saved authoritative governance view.

- [ ] Add DTO/controller/service unit tests that fail because the governance
      route/field do not exist. Cover one active principal, multiple active
      Project-member coordinators, policy-resolved approvers excluding the
      actor, null/1000-character notes, duplicate IDs, inactive/non-member/
      cross-Project IDs, unauthorized actor, no-op save, Activity, AuditLog,
      and reload response.
- [ ] Add a PostgreSQL integration test that writes governance, constructs a
      new service/read request, and asserts the same principal/coordinator/note
      values plus one Activity and one AuditLog.
- [ ] Run focused RED:
      `pnpm --filter @galaxy/api exec vitest run src/projects/project-stage-one.test.ts test/project-stage-one.integration.test.ts --no-file-parallelism`.
- [ ] Add `governanceCoordinatorUserIds String[] @default([]) @db.Uuid` to the
      existing Stage 1 plan. Run Prisma migrate create-only; stop immediately if
      Prisma requests a reset. Review SQL for one additive UUID-array column,
      then apply only with `pnpm --filter @galaxy/api prisma:deploy`.
- [ ] Implement one transaction that locks the scoped Project, validates all
      selected users against active organization membership and active Project
      membership, updates `Project.projectOwnerId`, upserts Stage 1 plan
      coordinators/note, assigns the `ASSIGNMENT` step owner, writes Activity and
      AuditLog only on change, and resolves approvers with the existing resolver.
- [ ] Remove silently ignored `ownerUserId`/`dueDate` from
      `CompleteStageOneStepDto`; governance and document assignment commands own
      those writes explicitly.
- [ ] Run focused GREEN plus Prisma format/validate/status and API typecheck.

### Task 2: Governance-aware readiness, issues, and Step 1 completion

**Files:**

- Modify: `apps/api/src/projects/project-stage-one.rules.ts`
- Modify: `apps/api/src/projects/project-stage-one.rules.test.ts`
- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/project-stage-one.test.ts`

**Interfaces:**

- The Stage 1 summary remains the only readiness/issue source.
- Governance readiness uses the same principal/coordinator/note/department
  facts as assignment completion.
- Missing governance emits concise structured Vietnamese issue/checklist data
  with a Stage 1 governance anchor and never promotes ordinary missing work to
  a hard block.

- [ ] Add RED rule/service tests for missing principal, inactive principal,
      invalid coordinator, missing responsible department, and missing note;
      assert each appears in readiness/issues and in Step 1 blockers, then
      disappears after the saved governance state satisfies it.
- [ ] Add RED tests proving normal governance/document work maps to
      `IN_PROGRESS`/needs-attention while rejected mandatory approval evidence
      remains a hard blocker.
- [ ] Run focused RED:
      `pnpm --filter @galaxy/api exec vitest run src/projects/project-stage-one.rules.test.ts src/projects/project-stage-one.test.ts --no-file-parallelism`.
- [ ] Extend the existing bounded Stage 1 select/input and shared derivation
      functions; do not add a client readiness calculation or second rules
      service.
- [ ] Keep Save governance separate from Complete Step. Keep Step completion
      idempotent/CAS-protected and return the exact corrective field/section/
      route metadata.
- [ ] Run focused GREEN and the Stage 1 approval/gate regression.

### Task 3: Required Document operational commands and history contract

**Files:**

- Modify: `apps/api/src/projects/project-products.dto.ts`
- Modify: `apps/api/src/projects/project-products.controller.ts`
- Modify: `apps/api/src/projects/project-products.service.ts`
- Modify: `apps/api/src/projects/project-products.test.ts`
- Modify: `apps/api/src/uploads/uploads.dto.ts`
- Modify: `apps/api/src/uploads/uploads.controller.ts`
- Modify: `apps/api/src/uploads/uploads.service.ts`
- Modify: `apps/api/src/uploads/uploads.test.ts`
- Modify: `apps/api/test/project-required-document-upload.integration.test.ts`

**Interfaces:**

- Existing `PATCH /required-documents/:id` remains the owner/due-date command
  and validates an active member of the same Project.
- `POST /required-documents/:id/restore-applicability` restores an authorized
  audited `NOT_APPLICABLE` requirement to `MISSING` or `DRAFT` according to
  current-file presence.
- Upload completion accepts optional `note` up to 1000 characters and stores it
  on the new current document/version path without mutating prior history.
- History returns current filename/version/status/note/uploader/timestamp/
  approval and previous version filename/actor/timestamp/status/download IDs;
  it never returns storage keys/checksums/bytes.

- [ ] Add RED tests for owner/due update Activity/Audit, required N/A reason,
      server actor/time, restore authorization/state/Activity/Audit, note
      persistence, two-version history, one current version, retry idempotency,
      cross-Project rejection, and metadata-free non-member denial.
- [ ] Run focused RED:
      `pnpm --filter @galaxy/api exec vitest run src/projects/project-products.test.ts src/uploads/uploads.test.ts test/project-required-document-upload.integration.test.ts --no-file-parallelism`.
- [ ] Reuse the existing locked document transaction and `AuditService`; add no
      new document/status table. Preserve immutable approved current evidence.
- [ ] Pass the optional note through complete → materialize/link transaction;
      repeated complete returns the same FileAsset/version.
- [ ] Implement restore and enriched history with bounded bulk file/user reads
      after the existing Project/file authorization checks.
- [ ] Run focused GREEN, file authorization tests, and API typecheck.

### Task 4: Grouped responsive Required Documents and upload recovery

**Files:**

- Replace/rename only as needed:
  `apps/web/features/projects/stage-required-document-matrix.tsx`
- Modify: `apps/web/features/projects/stage-required-document-matrix.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/documents/document-upload.tsx`
- Modify: `apps/web/app/projects/[projectId]/documents/document-upload.test.ts`
- Modify: `apps/web/app/projects/[projectId]/documents/document-ui.ts`
- Modify: `apps/web/app/projects/[projectId]/documents/document-ui.test.ts`

**Interfaces:**

- `StageRequiredDocumentGroups` keeps the existing load/refresh owner but
  renders each applicable requirement exactly once in one of five business
  groups.
- A single structured row changes layout responsively; desktop exposes only
  Hồ sơ/Trạng thái/Phụ trách/Hạn/Thao tác and mobile has no horizontal page
  overflow or duplicate accessibility content.
- One primary action is visible; native `<details>` owns secondary actions.
- Native dialogs own upload, N/A reason, assignment/due date, and detail/history.

- [ ] Add RED render/DOM tests for five groups, omitted empty groups, missing
      groups open, completed groups collapsible, summary counts, five desktop
      fields, one primary action, overflow actions, one document occurrence,
      no completion policy/checksum/raw enum/default duplicate status, labelled
      N/A/assignment/history dialogs, and mobile structured layout classes.
- [ ] Add RED `DocumentUpload` tests proving 409/expired session cleanup removes
      localStorage/in-memory session and permits a fresh initiation, while a
      network interruption retains a resumable session. Cover drop, configured
      types/size, note, progress, abort, retry, and optional upload-and-submit.
- [ ] Run focused RED:
      `pnpm --filter @galaxy/web exec vitest run features/projects/stage-required-document-matrix.test.tsx 'app/projects/[projectId]/documents/document-upload.test.ts'`.
- [ ] Refactor the current matrix in place; reuse `DocumentUpload`, `api`,
      `documentActions`, labels, native dialog/details, and existing Tailwind.
      Add no component library or second uploader.
- [ ] Make upload completion refresh the group data and owner summary once,
      expose actionable Vietnamese errors, and submit for review only after a
      successful approval-policy upload.
- [ ] Run focused GREEN, Web typecheck, and Web lint.

### Task 5: Stage 1 reference-match composition and governance card

**Files:**

- Modify: `apps/web/app/project-pms.tsx`
- Modify: `apps/web/app/project-pms.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`
- Create: `apps/web/features/projects/project-governance-card.tsx`
- Create: `apps/web/features/projects/stage-one-readiness-card.tsx`

**Interfaces:**

- `ProjectGovernanceCard` consumes the API governance view and emits the single
  governance PATCH payload; it owns edit/save/cancel/dirty/pending/error/focus.
- Stage 1 uses the approved order and mounts `StageRequiredDocumentGroups` once.
- `VIỆC CẦN XỬ LÝ` and readiness render server data only; gate ineligibility
  opens the checklist and eligibility exposes submission without completing
  the stage.

- [ ] Add RED tests for exact section order, 70/30 initiation-routing layout,
      compact header/context, maximum three concise issues, governance load/
      edit/save/cancel/unchanged-disable/errors/reload values, coordinator
      multi-select, policy approver display, correction focus, one document
      surface, five-step process, selected workspace, readiness checklist, and
      approval action semantics.
- [ ] Run focused RED:
      `pnpm --filter @galaxy/web exec vitest run app/project-pms.test.tsx 'app/projects/[projectId]/project-stage-one.test.tsx'`.
- [ ] Remove responsibility note from the generic plan save path and render it
      only in the governance command/card. Keep one container load/reload owner.
- [ ] Replace long `Cờ đỏ` copy with concise actionable issues and replace
      abstract readiness cards with the server checklist/count.
- [ ] Remove the selected-step duplicate document mount; selected steps link or
      scroll to their already-rendered group/requirement.
- [ ] Run focused GREEN, Web typecheck/lint, route compatibility tests, and
      `git diff --check`.

### Task 6: Route cutover, Playwright acceptance, visuals, and deletion

**Files:**

- Modify: `apps/web/app/projects/[projectId]/documents/page.tsx`
- Modify: `apps/web/app/projects/[projectId]/documents/[requirementId]/page.tsx`
- Modify: `apps/web/app/projects/[projectId]/compatibility.test.tsx`
- Modify: `apps/web/tests/browser/project-stage-one.spec.ts`
- Modify: `apps/web/playwright.stage-one.config.ts`
- Delete or rewrite after replacement proof:
  `apps/web/tests/browser/stage-one.spec.ts`
- Modify: `docs/project-system/PROJECT_UI_CUTOVER_AND_DELETION_MATRIX.md`

**Interfaces:**

- Stage-qualified and requirement-specific document links land on Stage 1
  anchors; bare archive behavior is explicit and no raw legacy CRUD UI remains
  a competing Stage 1 completion path.
- Playwright uses deterministic test-only IDs and cleanup only for those IDs;
  it must not reset the database or delete non-fixture business records.

- [ ] Add RED compatibility/browser assertions for governance round trip,
      Step 1 remediation/completion, upload/progress/version/history/download,
      N/A reason/restore, issue disappearance without reload, direct outsider
      denial, and no console errors.
- [ ] Replace the stale seven-test English fixture suite with current contract
      coverage or delete it after `rg` proves the real Project acceptance suite
      owns every behavior.
- [ ] Add viewport projects for 1536×864, 1440×900, 1280×800, and 390×844.
      Assert one document surface and `scrollWidth <= innerWidth` at each.
- [ ] Run real Playwright flows, capturing header, issues, governance summary/
      edit, scope, preliminary plan, groups/missing/completed rows, upload,
      history, readiness, gate, mobile documents, and forbidden state.
- [ ] Open every capture and record reference hierarchy, density, action,
      status, alignment, overflow, and console findings.
- [ ] Search every legacy import/CTA/notification link with `rg`; delete only
      zero-reference obsolete presentation code, never domain/history data.
- [ ] Update the cutover matrix with exact retained/redirected/deleted files and
      run Web typecheck, Project tests, and production Web build.

### Task 7: Fresh verification, reviews, status, and handoff

**Files:**

- Modify: `PROJECT_STATUS.md`
- Modify if final evidence changes it:
  `docs/project-system/PMS_STAGE_1_REFERENCE_AUDIT.md`

- [ ] Invoke `superpowers:verification-before-completion` and run fresh:
      `git diff --check`, Prisma format/check/validate/status, API/Web/Edge
      typecheck, lint, focused governance/Stage 1/document/upload/file-auth/
      readiness/route tests, full API/Web/Edge/document-service tests, all
      Playwright flows and baseline, and production Web/API/Edge builds.
- [ ] Record exact pass/fail/skipped counts and exact environment blockers; do
      not reuse prior counts or call a blocked check green.
- [ ] Invoke `superpowers:requesting-code-review` for the full working-tree
      package. Fix every proven correctness/security/authorization/UX issue
      test-first, then run one scoped re-review.
- [ ] Run Ponytail lean review and explicit correctness, security,
      authorization, and reference/UX reviews. Remove only proven duplication
      or dead code; retain validation, audit, authorization, accessibility, and
      data-loss controls.
- [ ] Update `PROJECT_STATUS.md` without removing history and produce the
      requested handoff classifications: COMPLETE, REUSABLE_FOUNDATION,
      PARTIAL, NOT_STARTED, blockers, deleted files, exact tests, visual
      acceptance, and exact next task.

## Plan self-review

- Coverage: every approved Stage 1 governance, document, upload, version,
  N/A, issue, readiness, gate, route, authorization, responsive, visual, test,
  cleanup, and handoff requirement maps to a task.
- Scope: Stage 2–5 receive no business workflow; existing routes and shared
  sources are only regression constraints.
- Reuse: the plan adds one proven coordinator UUID array and no new service,
  upload state machine, document model, readiness engine, or dependency.
- Type consistency: governance field/DTO/response names, note limit, document
  restore route, history shape, and component names are identical across tasks.
- Migration safety: one additive nullable-safe/defaulted column, create-only,
  reviewed SQL, deploy only, and immediate stop on any reset request.
- Placeholder scan: no TBD, TODO, unspecified helper, fake provider, fake data,
  or deferred implementation instruction remains.

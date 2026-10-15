# Project Stage 1 Inline Document Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user forbids commits, tags, pushes, PRs, database resets, applied-migration rewrites, and discarding existing work; review working-tree diffs instead of commit ranges.

**Goal:** Make Stage 1 one connected, localized workspace with an inline resumable Required Document workflow and reuse that matrix at Stage 2–5 roots.

**Architecture:** Extract one Web matrix from the existing Required Document list/detail UI, reuse the existing resumable `DocumentUpload`, and refresh its owner through callbacks. Correct routes and stage status at their shared derivation points. Keep Stage 2–5 changes to matrix placement and existing idempotent initialization.

**Tech Stack:** Next.js 16, React 19, NestJS 11, Prisma/PostgreSQL, Vitest, Playwright, TypeScript strict mode.

## Global Constraints

- Preserve the existing dirty worktree and authoritative Project/FileAsset/UploadSession/Required Document/Approval/Activity/Notification data.
- No dependency or schema migration unless a failing trust-boundary test proves existing models cannot represent the behavior.
- Never expose financial data without the narrow finance permission or file metadata/bytes without active Project access.
- Write and run a failing behavior test before each production change.
- Do not expand Stage 2–5 business workflows.
- No commit, tag, push, PR, database reset, `prisma db push`, or applied-migration edit.

---

### Task 1: Shared localized inline Required Document matrix

**Files:**

- Create: `apps/web/features/projects/stage-required-document-matrix.tsx`
- Create: `apps/web/features/projects/stage-required-document-matrix.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/documents/document-upload.tsx`
- Modify: `apps/web/features/projects/project-domain-labels.ts`
- Modify: `apps/web/features/projects/project-domain-labels.test.ts`

**Interfaces:**

- Consumes: `api`, `DocumentUpload`, `documentActions`, `documentStatusClass`, and `projectDomainLabel`.
- Produces: `StageRequiredDocumentMatrix({ projectId, stageKey, stepKey?, actorPermissions?, initialData?, onMutate? })` and row anchors `required-document-<id>`.

- [ ] Add a focused rendering test that expects the approved eight columns, Stage 1 filtering, localized document/status/policy labels, an in-page upload dialog, no raw enums, and no navigation on upload.
- [ ] Run the focused test and confirm RED because the shared component does not exist.
- [ ] Implement the smallest shared component by reusing the current list endpoint and `DocumentUpload`; do not copy the upload state machine.
- [ ] Make successful upload refetch rows, close/show success in the dialog, call `onMutate`, and retain history through the existing API.
- [ ] Run the focused matrix, upload, action, and label tests and confirm GREEN.

### Task 2: Stage 1 composition, correction anchors, and responsibility focus

**Files:**

- Modify: `apps/web/app/project-pms.tsx`
- Modify: `apps/web/app/project-pms.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`

**Interfaces:**

- Consumes: `StageRequiredDocumentMatrix` and the existing Stage 1 load/reload command path.
- Produces: fixed Stage 1 section order, same-page red-flag routes, `#required-documents`, `#responsibility-notes`, and selected-step matrix filtering.

- [ ] Add RED tests for the exact section order, maximum three alerts, same-page document anchors, row highlighting, the approved responsibility label/helper/placeholder, default-open error section, focus target, concise step cards, and collapsed checklist.
- [ ] Replace the shell's detached document card/links with the shared inline matrix slot and same-page corrective actions.
- [ ] Use native `details`, anchors, `scrollIntoView`, and focus; add no accordion/focus dependency.
- [ ] Keep Save Draft behavior unchanged and Step 1 completion server-authoritative.
- [ ] Run focused Stage 1 and shell tests and confirm GREEN.

### Task 3: Status semantics and document completion policy

**Files:**

- Modify: `apps/api/src/projects/projects.service.ts`
- Modify: `apps/api/src/projects/projects.test.ts`
- Modify: `apps/api/src/projects/project-stage-one.rules.ts`
- Modify: `apps/api/src/projects/project-stage-one.rules.test.ts`
- Modify only if required by failing tests: `apps/api/src/projects/project-stage-one.service.ts`
- Modify only if required by failing tests: `apps/api/src/projects/project-stage-one.test.ts`

**Interfaces:**

- Produces ordinary-document warnings separately from hard blockers and a code-defined `FILE_PRESENT | APPROVED` policy beside the existing Project template.

- [ ] Add RED tests proving missing/draft/pending ordinary documents keep the workspace stage `IN_PROGRESS`, rejected approval-required evidence may hard-block, and warning flags alone do not hard-block.
- [ ] Derive completion policy from the existing typed template; use current-file presence for supporting evidence and approval for approval/decision records.
- [ ] Update readiness/submit checks to use the policy without weakening approved-document immutability or authorization.
- [ ] Run focused Project/Stage 1 API tests and confirm GREEN.

### Task 4: Legacy route compatibility and Stage 2–5 placement

**Files:**

- Modify: `apps/web/app/projects/[projectId]/documents/page.tsx`
- Modify: `apps/web/app/projects/[projectId]/compatibility.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-access.tsx`
- Modify: `apps/web/app/projects/[projectId]/stage-2/page.tsx`
- Modify: `apps/web/app/projects/[projectId]/stage-3/page.tsx`
- Modify: `apps/web/app/projects/[projectId]/stage-4/page.tsx`
- Modify: `apps/web/app/projects/[projectId]/stage-5/page.tsx`

**Interfaces:**

- Produces redirects from `stageKey=STAGE_N` to stage anchors, requirement row anchors, and one shared matrix at each downstream stage root.

- [ ] Add RED route/component tests for all five stage anchors, requirement-specific compatibility, empty initialization copy/action, and no general-files redirect from stage roots.
- [ ] Implement the compatibility adapter and reuse `StageRequiredDocumentMatrix` in `ProjectStageAccessView`.
- [ ] Use the current idempotent stage initialize command for the authorized empty state; do not invent downstream document templates or workflows.
- [ ] Run compatibility/stage-access tests and confirm GREEN.

### Task 5: Browser acceptance, visual inspection, cutover records, and verification

**Files:**

- Modify: `apps/web/tests/browser/project-stage-one.spec.ts`
- Modify: `apps/web/tests/browser/project-pms-stage-access.spec.ts`
- Modify: `docs/project-system/PROJECT_UI_CUTOVER_AND_DELETION_MATRIX.md`
- Modify: `PROJECT_STATUS.md`

**Interfaces:**

- Produces browser evidence for Stage 1 structure, responsibility completion, inline upload, legacy links, file authorization, status semantics, and Stage 2 placement.

- [ ] Add browser assertions only after focused behavior is GREEN; cover flows A–F with existing fixtures and real upload constraints.
- [ ] Run focused API/Web tests, authorization/integration tests, typechecks, lint, Prisma format/validate/status, and `git diff --check`.
- [ ] Run Playwright at 1536×864 and 1440×900 and open every required capture; record exact gaps rather than claiming an unseen visual match.
- [ ] Search every old CTA/import before adapting or deleting it; delete only zero-reference obsolete presentation files.
- [ ] Request correctness review, fix proven defects test-first, and run Ponytail lean/correctness/security/authorization/UX reviews.
- [ ] Run full regression and Web production build; update `PROJECT_STATUS.md` with exact counts, classifications, blockers, deleted files, and next task.

## Plan self-review

- Coverage: the five tasks cover the approved Stage 1 order, inline matrix/upload, responsibility correction, step completion, status semantics, compatibility routes, Stage 2–5 placement, tests, visuals, and handoff.
- Reuse: the plan extracts one composition and reuses the existing upload and document sources; no duplicate service/model/provider is planned.
- Type consistency: the shared component and anchor signatures are identical in every task.
- Scope: downstream stages receive only the matrix/empty state; no operational workflow is introduced.
- Placeholder scan: no TBD, TODO, fake data/table, unspecified helper, or speculative migration remains.

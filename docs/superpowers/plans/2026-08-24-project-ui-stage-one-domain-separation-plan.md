# Project UI Reference Match and Stage 1 Domain Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly prohibited commits, pushes, tags, PRs, database reset, `prisma db push`, and reset-requesting migration commands.

**Goal:** Make Stage 1 Matrix and Workflow uploads, lists, caches, and deletion independent, then compact and unify the Project dashboard and GĐ1–GĐ5 UI against the browser-reviewed PMS hierarchy.

**Architecture:** Reuse `ProjectRequiredDocument`, `ProjectStageOneDocument`, `UploadSession`, `FileAsset`, the existing upload queue, and the existing shared `ProjectStageHeader`. `initialMatrix` derives the authoritative logical context; every queue/target/delete command retains context identity, and logical deletion preserves file/history/audit.

**Tech Stack:** TypeScript strict mode, React/Next.js App Router, NestJS, Prisma/PostgreSQL, Vitest, Playwright, Chrome DevTools MCP, Tailwind/native CSS and native dialogs.

**Spec:** `docs/superpowers/specs/2026-08-24-project-ui-stage-one-domain-separation-design.md`

## Global Constraints

- Preserve all existing tracked and untracked work on `feature/project-business-operations`.
- Add no uploader, FileAsset model, browser framework, dependency, mock Project data, or speculative abstraction.
- Matrix and Workflow may share physical bytes/transport only; their definitions, queues, files, lists, invalidation, and deletion remain disjoint.
- Backend authorization is authoritative; frontend capabilities only control visibility.
- Do not expose finance values or aggregates without exact permission.
- Apply only reviewed additive migrations with `prisma migrate deploy`; never reset or rewrite an applied migration.
- Do not commit, tag, push, or open a PR.

---

### Task 1: Lock the two reproduced regressions

**Files:**

- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`
- Test: `apps/web/features/projects/project-document-upload-queue.test.tsx`
- Test: `apps/api/src/projects/project-stage-one.test.ts`
- Test: `apps/api/src/uploads/uploads.test.ts`

**Interfaces:**

- Consumes: `SimpleStageOneView`, `OptionalDocumentMatrix`, `projectDocumentQueueKey`, `ProjectStageOneService.createUploadTargetInTransaction`.
- Produces: regression evidence for empty-Matrix Workflow availability and cross-context queue independence.

- [ ] Change the existing Matrix/Workflow queue test to assert that a Workflow `READY_TO_SUBMIT` item does not disable Matrix row actions; keep the same-context Matrix lock test.
- [ ] Add a render test with zero Matrix definitions and active Workflow definitions that expects `THÊM HỒ SƠ`, a Workflow-only upload surface after activation, and one Workflow submitted-list scope.
- [ ] Add/retain service tests that Matrix and Workflow context mismatches return `PROJECT_DOCUMENT_TARGET_NOT_FOUND`, neither target requires a definition from the other context, and serialized lists never mix contexts.
- [ ] Run `pnpm --filter @galaxy/web test --run 'app/projects/[projectId]/project-stage-one.test.tsx'` and confirm failure on the queue lock and missing `THÊM HỒ SƠ` behavior before implementation.
- [ ] Run focused API tests and retain the current green target-resolver evidence before changing business logic.

### Task 2: Isolate UI queue state and compact Workflow upload

**Files:**

- Modify: `apps/web/app/projects/[projectId]/stage-1/optional-document-matrix.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Test: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`

**Interfaces:**

- Consumes: queue items containing `contextType`, `definitionId`, and `workstreamKey`.
- Produces: Matrix blocking derived only from `STAGE_MATRIX_DOCUMENT`; Workflow panel state local to selected Step/Project.

- [ ] Filter Matrix blocking queues by Matrix context before calling `projectDocumentQueueBlocksClose`; do not change canonical queue keys.
- [ ] Add a local `workflowUploadOpen` boolean reset by Step/Project component identity; render `THÊM HỒ SƠ` while closed and the existing `ProjectDocumentUploadQueue` inside a compact panel while open.
- [ ] Remove the `matrixUploaderOpen` condition from Workflow rendering so opening one logical context never suppresses the other.
- [ ] Keep custom type/name/officer/drop-zone/two-phase submit behavior inside the panel and close only when its own queue is not blocking.
- [ ] Rerun the focused Web test and confirm both regressions are green.

### Task 3: Add authorized logical-document deletion

**Files:**

- Modify: `apps/api/src/projects/project-stage-one.controller.ts`
- Modify: `apps/api/src/projects/project-stage-one.dto.ts`
- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/project-stage-one.test.ts`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Modify: `apps/web/app/projects/[projectId]/stage-1/optional-document-matrix.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`

**Interfaces:**

- Produces: `DELETE /projects/:projectId/stage-1/documents/:documentId?contextType=STAGE_MATRIX_DOCUMENT|STAGE_WORKFLOW_STEP_DOCUMENT` and `capabilities.canDeleteProjectDocuments`.

- [ ] Add failing service tests for permission denial, cross-Project rejection, context mismatch, Matrix/Workflow isolation, preserved FileAsset/version references, and Activity/Audit writes.
- [ ] Add `DeleteStageOneDocumentQuery` with `@IsIn(PROJECT_DOCUMENT_CONTEXTS)` and a controller route protected by `file.delete`.
- [ ] Implement one transaction: lock scoped Project/document, derive context from the persisted definition, validate finance policy, set the logical document status to `SUPERSEDED`, write Activity/Audit, and leave `FileAsset`, versions, attachment, and storage untouched.
- [ ] Add `canDeleteProjectDocuments` from explicit `file.delete` capability.
- [ ] Add one compact native confirmation dialog shared by Matrix and Workflow rows; omit Delete entirely when the capability is false.
- [ ] On success refresh only Stage 1 data and preserve unrelated queue state; on failure show the existing inline error channel.
- [ ] Run focused API and Web tests, including unauthorized and cross-context cases.

### Task 4: Apply the pending legacy-context repair safely

**Files:**

- Review only: `apps/api/prisma/migrations/20260824010000_repair_stage_one_document_contexts/migration.sql`
- Test: `apps/api/test/project-required-document-upload.integration.test.ts`

**Interfaces:**

- Produces: independent Matrix and Workflow definitions for legacy Stage 1 Projects without deleting or rewriting existing rows/history.

- [ ] Run Prisma format, validate, and migrate status; record the pending migration.
- [ ] Review the SQL for additive inserts, exact legacy corrections, conflict safety, and absence of deletes/cascades/resets.
- [ ] Run target-resolver/integration tests before deployment.
- [ ] Apply with `pnpm --filter @galaxy/api prisma:deploy` only; stop if Prisma requests a reset.
- [ ] Re-run migrate status and query legacy Projects to confirm active Workflow definitions exist independently from Matrix rows.

### Task 5: Compact the shared Project visual system

**Files:**

- Modify: `apps/web/app/project-pms.tsx`
- Modify: `apps/web/app/project-pms.test.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/portal-shell.tsx`
- Modify: `apps/web/app/portal-shell.test.ts`

**Interfaces:**

- Produces: one `ProjectStageHeader` geometry and exact accent mapping for all five stages.

- [ ] Add/adjust tests for one shared header, direct stage URLs, Project switch preserving stage and dropping stale context, exact accent classes, and no predecessor gate.
- [ ] Map Stage accents to blue/indigo/amber/emerald/teal while keeping primary actions Galaxy blue.
- [ ] Tighten shared cards, controls, table typography/row height, and content spacing to the approved token ranges without adding a second theme.
- [ ] Compact the mobile shell using the existing DOM: horizontally scroll top-level navigation, suppress nested sidebar detail on mobile, and keep account access in the top header.
- [ ] Verify keyboard focus, labels, horizontal scroll, and no clipped stage/project controls.

### Task 6: Polish Dashboard and GĐ1–GĐ5 terminology/layout

**Files:**

- Modify: `apps/web/app/projects/page.tsx`
- Modify: `apps/web/app/projects/project-dashboard.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-two.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-two.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-access.tsx`
- Modify: `apps/web/app/projects/[projectId]/compatibility.test.tsx`

**Interfaces:**

- Consumes: truthful current API data and existing domain links only.
- Produces: approved compact Project dashboard and Galaxy terminology across GĐ1–GĐ5.

- [ ] Dashboard: use `TỔNG QUAN DỰ ÁN`, protect long currency values, keep permission-filtered KPI cards, dense table columns, controlled overflow, and `MỞ DỰ ÁN`.
- [ ] GĐ1: compact initiation, Matrix, five Step cards, selected-Step detail, upload panel, and submitted list; show only View/Download/Delete file actions.
- [ ] GĐ2: keep shared header, indigo accent, and labels `KẾ HOẠCH & KHẢO SÁT`, `THIẾT KẾ, SẢN PHẨM & BOQ`, `PHÊ DUYỆT`.
- [ ] GĐ3: use `BÁO GIÁ & HỢP ĐỒNG`, `NHÀ CUNG CẤP & MUA HÀNG`, `PO, PI & THANH TOÁN` with amber accent.
- [ ] GĐ4: use `SẢN XUẤT & QC`, `LOGISTICS`, `KHO & GIAO HÀNG`, `LẮP ĐẶT & TIẾN ĐỘ` with emerald accent.
- [ ] GĐ5: use `NGHIỆM THU & BÀN GIAO`, `QUYẾT TOÁN`, `BẢO HÀNH & HẬU MÃI` with teal accent.
- [ ] Remove normal-list `Xem chi tiết`, history, and new-version actions; retain version/audit data in backend and upload flow.
- [ ] Run focused Project component tests and Web typecheck.

### Task 7: Browser and Playwright acceptance

**Files:**

- Modify only if a regression is missing: `apps/web/tests/browser/project-stage-one.spec.ts`
- Modify only if shared-stage coverage is missing: `apps/web/tests/browser/project-pms-stage-access.spec.ts`
- Reuse: `apps/web/playwright.stage-one.config.ts`

**Interfaces:**

- Produces: real-browser evidence for upload order, list isolation, file actions, stage navigation, and responsive layout.

- [ ] With Playwright, log in and run Matrix-empty -> Workflow upload -> Matrix upload without reload; then Matrix -> Workflow, reload, Project switch, Stage switch, preview, download, authorized Delete, and lower-permission absence/DELETE rejection.
- [ ] Use Network responses to assert Matrix and Workflow initiation targets differ and no list mixes contexts.
- [ ] With Chrome DevTools MCP, reload and inspect Dashboard plus GĐ1–GĐ5 at 1536x864, 1440x900, 1280x800, and 390x844.
- [ ] Capture after screenshots and compare against baseline; inspect computed width/gap/font/row/button values, active accents, overflow, Console, and unexpected 4xx/5xx.
- [ ] If any screenshot remains cluttered, clipped, excessively tall, or visually unbalanced, patch the smallest CSS/component source and repeat the affected viewport.

### Task 8: Fresh verification and reviews

**Files:**

- Modify after accepted work: `PROJECT_STATUS.md`

**Interfaces:**

- Produces: evidence-backed completion or an exact partial/blocker report.

- [ ] Invoke `superpowers:verification-before-completion` and run `git diff --check`, Prisma format/validate/status, API/Web typecheck, lint, focused Matrix/Workflow/upload/delete/header/stage tests, Project Playwright, and production Web build.
- [ ] Invoke `superpowers:requesting-code-review`; perform correctness, security, authorization, UX, and responsive reviews.
- [ ] Run Ponytail Full diff review, remove unnecessary code, and rerun every affected check.
- [ ] Update `PROJECT_STATUS.md` with verified commands/results only.
- [ ] Report COMPLETE/PARTIAL/NOT_STARTED items, exact blockers, and the exact next task without claiming browser completion from source/tests alone.

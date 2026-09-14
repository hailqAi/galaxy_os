# Simplified Stage 1 Multi-file Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking. Do not commit.

**Goal:** Replace the current Stage 1 dashboards/forms/matrices with the
approved four-field, five-step, multi-file legal-dossier workflow while
preserving existing records, file history, authorization, and legacy links.

**Architecture:** Keep Project, Customer/Contact, Project stage records,
Required Document configuration/history, UploadSession, FileAsset, storage,
Activity, Audit, Approval, and Notification authoritative. Add only a typed
funding-source field and the narrow logical Stage 1 step-document/version
relation proven necessary by current Required Document cardinality. One Stage
1 API summary/command owner feeds one focused Web workspace.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Next.js/React, strict TypeScript,
Vitest, Playwright, existing local resumable upload/FileStorage.

## Global Constraints

- Authoritative Stage 1 design: Sections 11 and 31 of
  `docs/superpowers/specs/2026-08-07-galaxy-project-pms-full-replacement-design.md`.
- Visible initiation inputs are exactly Project name, expected investment VND,
  funding source, and investor/representative.
- Visible initiation CTA is exactly `KHỞI TẠO & KÝ PHÊ DUYỆT DỰ ÁN`.
- Use the exact five Vietnamese step labels and per-step document names from
  the 2026-08-12 approved prompt.
- Do not show routing, Red Flags, governance, responsibility, readiness,
  preliminary finance, a separate Stage approval card, a global matrix, blank
  missing rows, raw codes, or hidden legacy blockers.
- Backend authorization protects every Project, upload, linkage, history,
  download, on-behalf, step, and Stage command.
- Preserve approved/history files and records; never reset the database or
  rewrite an applied migration.
- Any migration is additive, reviewed SQL, and applied with `prisma migrate
  deploy` only.
- No new dependency, second uploader, second FileAsset store, second Customer
  store, generic workflow engine, Stage 2–5 expansion, unrelated refactor, or
  formatting churn.
- Use RED/GREEN TDD for each changed behavior. Do not commit, tag, push, open a
  PR, stage files, or discard existing work.

---

### Task 1: Simplified policy, persistence, and schema

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260812130000_simplified_stage_one_documents/migration.sql`
- Create only because the first migration was already deployed before review
  found the required upload target FK:
  `apps/api/prisma/migrations/20260812143000_stage_one_document_upload_target/migration.sql`
- Modify: `apps/api/src/projects/project-stage-one.rules.ts`
- Modify: `apps/api/src/projects/project-stage-one.rules.test.ts`
- Modify: `apps/api/src/projects/project-stage-one.dto.ts`
- Modify: `apps/api/src/projects/project-stage-one.test.ts`

**Interfaces:**

- Produces `StageOneFundingSource` with exactly four accepted values.
- Produces `SIMPLE_STAGE_ONE_STEPS` and per-step document configuration.
- Adds nullable typed `fundingSource` to `ProjectStageOnePlan`.
- Adds `ProjectStageOneDocument` and `ProjectStageOneDocumentVersion`, linked to
  Project, configured Required Document when applicable, current FileAsset,
  submitted officer, actual actor, and append-only versions.
- Adds nullable `UploadSession.stageOneDocumentId`, its foreign key/relation,
  and lookup index so Task 3 can persist exactly one logical upload target.

The exact five labels and document options are:

```ts
[
  {
    step: 'ASSIGNMENT',
    label: 'TIẾP NHẬN & PHÂN CÔNG',
    documents: [
      'Văn bản chủ trương đầu tư',
      'Quyết định giao nhiệm vụ / Phân công Ban QLDA',
      'Hồ sơ khác',
    ],
  },
  {
    step: 'SURVEY',
    label: 'KHẢO SÁT & THIẾT LẬP BỘ MÁY',
    documents: [
      'Báo cáo khảo sát hiện trạng mặt bằng',
      'Phương án bố trí nhân sự Ban QLDA',
      'Biên bản khảo sát',
      'Bản vẽ / Bản đo hiện trạng',
      'Ảnh / Video hiện trường',
      'Hồ sơ khác',
    ],
  },
  {
    step: 'PROPOSAL',
    label: 'LẬP & THẨM ĐỊNH BCNCTKT / ĐỀ XUẤT CTĐƯ',
    documents: [
      'Hồ sơ BCNCTKT / Báo cáo đề xuất chủ trương đầu tư',
      'Báo cáo thẩm định nội bộ',
      'Báo cáo thẩm định ngành / Bộ',
      'Thuyết minh',
      'Bản vẽ',
      'Dự toán',
      'Hồ sơ khác',
    ],
  },
  {
    step: 'FINANCIAL_PLANNING',
    label: 'XÁC ĐỊNH NGUỒN VỐN & KẾ HOẠCH VỐN',
    documents: [
      'Văn bản cam kết / cân đối nguồn vốn',
      'Kế hoạch vốn',
      'Văn bản xác nhận nguồn vốn',
      'Hồ sơ khác',
    ],
  },
  {
    step: 'KICKOFF_APPROVAL',
    label: 'PHÊ DUYỆT DỰ ÁN',
    documents: [
      'Quyết định phê duyệt chủ trương đầu tư',
      'Quyết định phê duyệt dự án đầu tư xây dựng',
      'Biên bản / Văn bản phê duyệt',
      'Hồ sơ khác',
    ],
  },
] as const;
```

- [ ] Write failing table-driven policy/DTO tests for all five labels, all
      configured document options, four funding values, custom-name validation,
      and the absence of governance/preliminary-finance legacy predicates.

```ts
expect(stageOneDocumentTypes('ASSIGNMENT').map(({ name }) => name)).toEqual([
  'Văn bản chủ trương đầu tư',
  'Quyết định giao nhiệm vụ / Phân công Ban QLDA',
  'Hồ sơ khác',
]);
expect(validate(SimpleInitiationDto, { fundingSource: 'RAW_CODE' })).rejects;
```

- [ ] Run those tests and confirm RED because simplified policy/schema do not
      exist.
- [ ] Add the minimum types/configuration/DTO validation and additive Prisma
      models/relations. Keep exact Decimal and UUID columns; use database
      foreign keys and uniqueness for per-file idempotency and per-document
      version number.
- [ ] Run Prisma format check/generate/validate, inspect SQL, deploy with
      `prisma migrate deploy`, then run migrate status and focused tests GREEN.

### Task 2: Idempotent initiation and simplified completion API

**Files:**

- Modify: `apps/api/src/projects/project-stage-one.controller.ts`
- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/project-stage-one.test.ts`
- Modify: `apps/api/test/project-stage-one.integration.test.ts`
- Modify narrowly when exact Decimal input requires it:
  `apps/api/src/projects/projects.dto.ts`, `apps/api/src/projects/projects.service.ts`

**Interfaces:**

- `POST /projects/:projectId/stage-1/initiate-simple` consumes:

```ts
type InitiateSimpleStageOneDto = {
  name: string;
  estimatedInvestmentAmount: string;
  fundingSource: StageOneFundingSource;
  customerId: string;
  primaryContactId?: string;
  idempotencyKey: string;
};
```

- `POST /projects/:projectId/stage-1/steps/:step/complete` returns either
  `{ completed: true, nextStep: 1|2|3|4|5|null }` or
  `{ completed: false, missingDocuments: string[] }`.
- `GET /projects/:projectId/stage-1/simple` returns the four initiation values,
  five statuses, document types, scoped Project/member options, and actual
  documents only.

- [ ] Write failing service/controller/integration tests for Decimal
      persistence, Customer/Contact scope, no Project duplication, five-step
      idempotency, pending honest approval status, Activity/Audit once,
      removed-field exclusion, readable missing names, completion idempotency,
      next-step selection, and Step 5 Stage completion.
- [ ] Run tests RED against the legacy commands.
- [ ] Implement one transaction for initiation domain writes and one short
      transaction per completion. Reuse the existing policy lock, stage rows,
      Required Document configuration, approval resolver, Activity/Audit, and
      exact Decimal construction.
- [ ] Keep legacy endpoints for downstream compatibility but route the new UI
      only through simplified commands; do not mutate or falsely complete old
      data.
- [ ] Run focused API and PostgreSQL integration tests GREEN.

### Task 3: Logical document upload, versions, and authorization

**Files:**

- Modify: `apps/api/src/uploads/uploads.dto.ts`
- Modify: `apps/api/src/uploads/uploads.controller.ts`
- Modify: `apps/api/src/uploads/uploads.service.ts`
- Modify: `apps/api/src/uploads/uploads.test.ts`
- Modify: `apps/api/src/projects/project-stage-one.controller.ts`
- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/test/project-required-document-upload.integration.test.ts`
- Modify: `apps/api/src/files/files.service.ts`
- Modify: `apps/api/src/files/files.test.ts`

**Interfaces:**

- Upload initiation accepts an authorized `stageOneDocument` target created
  idempotently from Project, step, type, display name, submitted officer, and
  file idempotency key.
- Upload completion branches by target and atomically creates FileAsset,
  EntityAttachment, logical document version/current version, Activity/Audit,
  and stable document result exactly once.
- Existing Required Document upload behavior remains unchanged.

- [ ] Write failing tests for one logical document per file, same-type multiple
      documents, custom name, on-behalf metadata versus actual actor,
      FileAsset/link/version/current assignment, prior-version history,
      completion retry, duplicate Activity prevention, cross-Project rejection,
      revoked access, outsider metadata/bytes denial, and authorized download.
- [ ] Run focused upload/FileAsset tests RED.
- [ ] Extend the existing upload target union and completion transaction; do
      not create a new transfer loop, storage adapter, or long transaction.
- [ ] Return structured Vietnamese-safe error categories without paths,
      checksums, Prisma errors, or raw enum codes.
- [ ] Run focused unit and real PostgreSQL integration tests GREEN.

### Task 4: Concise Stage 1 Web cutover and multi-file queue

**Files:**

- Replace/adapt: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Create focused files only as needed under
  `apps/web/app/projects/[projectId]/stage-1/`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`
- Reuse/modify: `apps/web/app/projects/[projectId]/stage-1/money.ts`
- Modify: `apps/web/app/projects/[projectId]/stage-1/money.test.ts`
- Modify redirect pages under `apps/web/app/projects/[projectId]/stage-1/**`
- Modify: `apps/web/app/projects/[projectId]/compatibility.test.tsx`
- Delete only after reference search: obsolete Stage 1-only components under
  `apps/web/features/projects/`

**Interfaces:**

- URL step mapper: `stepFromSearchParam(value): 1|2|3|4|5`.
- Queue entry:

```ts
type StageOneUploadQueueItem = {
  idempotencyKey: string;
  file: File;
  documentType: string;
  customName: string;
  status: 'QUEUED'|'UPLOADING'|'COMPLETED'|'FAILED'|'ABORTED';
  progress: number;
};
```

- One bounded queue runner reuses existing UploadSession calls independently
  per file and never resubmits `COMPLETED` items.

- [ ] Write failing Web tests for exactly four fields/one CTA, removed-section
      absence, five labels, URL selection/reload, dynamic completion label,
      `multiple`, multi-drop queue, remove/type/custom name, invalid-file
      isolation, disabled CTA, partial success, retry, duplicate prevention,
      actual-document-only list, responsive single renderer, and legacy
      redirects.
- [ ] Run tests RED against the current 3,000-line dashboard/matrix component.
- [ ] Implement the shortest focused composition. Reuse Project shell/stage
      switcher/context/member dialog, money helper, API helper, upload
      constraints/session transfer, and label tokens. Derive all selected-step
      copy/action state from the URL step.
- [ ] Remove primary rendering/imports of routing, issues, Red Flags,
      governance, readiness, preliminary finance, approval card, and matrices.
      Delete Stage 1-only files only after `rg` proves no legitimate callers.
- [ ] Run focused Web tests, typecheck, and production build GREEN.

### Task 5: Browser acceptance, cutover docs, verification, and reviews

**Files:**

- Rewrite: `apps/web/tests/browser/project-stage-one.spec.ts`
- Modify fixture only for simplified test data:
  `apps/api/scripts/stage-one-playwright-fixture.mjs`
- Create/update:
  `docs/project-system/PROJECT_STAGE_1_SIMPLIFICATION_CUTOVER.md`
- Update:
  `docs/project-system/PMS_STAGE_1_SIMPLIFIED_REFERENCE_AUDIT.md`
- Update: `PROJECT_STATUS.md`

- [ ] Write/execute Playwright flows for layout, initiation, multi-file upload,
      partial failure/retry, step completion, five steps/Stage completion,
      outsider denial, and four responsive viewports. Assert no console error,
      duplicate surface, raw code, removed panel, or horizontal overflow.
- [ ] Capture the required header/form/navigator/queue/progress/list/error/
      completed/Step 5/Stage/mobile/forbidden states and open every image.
- [ ] Search every obsolete component/route caller, finish redirect cutover,
      and record KEEP_DOMAIN/REUSE/ADAPT/REDIRECT/DELETE_AFTER_CUTOVER plus every
      deleted file.
- [ ] Invoke verification-before-completion and run fresh diff, Prisma,
      API/Web/Edge typecheck, lint, targeted/full tests, authorization,
      Playwright baseline and flows, production build, format check, and exact
      pass/fail counts.
- [ ] Invoke requesting-code-review. Run independent correctness/security/
      authorization/UX review plus Ponytail diff review; fix proven defects
      test-first and reverify.
- [ ] Update status/handoff without claiming COMPLETE for any unverified item.

## Plan self-review

- Coverage: tasks map initiation, policy/schema, transfer/linkage/versioning,
  UI/routes, completion, authorization, Playwright, visual acceptance, cutover,
  status, and reviews.
- Ordering: policy/schema precedes commands; commands precede upload linkage;
  backend contracts precede Web; browser/docs follow verified behavior.
- Types: funding source, step IDs, queue states, command payloads, and result
  shapes are stable across tasks.
- YAGNI: one narrow step-document relation is the only new domain surface and
  exists solely because the current Required Document unique key cannot hold
  multiple same-type logical documents.
- Placeholder scan: no TBD, TODO, generic error-handling instruction, fake
  provider, unowned field, or speculative downstream workflow remains.

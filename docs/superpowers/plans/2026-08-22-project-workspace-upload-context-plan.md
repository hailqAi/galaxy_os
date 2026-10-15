# Galaxy Project Workspace and Upload P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the permission-filtered Project dashboard, one shared five-stage workspace header, fully separate Stage 1 Matrix and Workflow document contexts, and a browser-proven two-phase upload flow on localhost and LAN.

**Architecture:** Keep the existing `UploadSession` → chunk → temporary `FileAsset` → submit transport and the existing `ProjectDocumentUploadQueue`. Use `ProjectRequiredDocument.initialMatrix` as the persisted logical context discriminator, add only a data backfill for missing Workflow definitions, and compose existing Project/domain routes behind a single shared header. Keep browser API calls relative under `/api/v1` and stream requests through the existing Next catch-all.

**Tech Stack:** TypeScript strict mode, Next.js App Router, React, NestJS, Prisma/PostgreSQL, Vitest, Playwright, native Web Crypto plus a dependency-free SHA-256 fallback.

**Spec:** `docs/superpowers/specs/2026-08-07-galaxy-project-pms-full-replacement-design.md`

## Global Constraints

- Work in `/home/galaxy_os` on `feature/project-business-operations`; preserve every pre-existing tracked and untracked change.
- Do not commit, tag, push, open a pull request, reset data, delete business/file/upload history, or rewrite an applied migration.
- Browser-visible API paths remain relative `/api/v1/...`; internal hosts and ports stay server-side.
- Authorization always uses `CurrentActor`; `submittedOfficerId` is business metadata and requires the existing upload-on-behalf permission when different.
- Matrix and Workflow share transport and physical `FileAsset` bytes but never share a logical attachment context or visible list.
- No new uploader, file store, lifecycle, dependency, fake record, fake financial value, or inactive call to action.
- Financial fields, aggregates, filters, sorts, downloads, and previews are omitted unless the backend grants the exact capability.
- Stage 1 never gates navigation to Stages 2–5.
- New migrations are additive, reviewed SQL only, and applied with `prisma migrate deploy`.
- Every behavior change follows red → confirmed failure → minimum fix → green → focused regression.

---

### Task 1: Close the same-origin upload and HTTP-LAN transport gate

**Files:**

- Modify: `apps/web/app/api/v1/[...path]/route.ts`
- Modify: `apps/web/app/api/v1/[...path]/route.test.ts`
- Modify: `apps/web/app/projects/[projectId]/documents/document-upload.tsx`
- Modify: `apps/web/app/projects/[projectId]/documents/document-upload.test.ts`

**Interfaces:**

- Consumes: real Nest route `POST /api/v1/uploads/initiate` and the existing raw-stream forwarder.
- Produces: `digestUploadBlob(blob: Blob): Promise<string>` that works with and without `SubtleCrypto`; a proxy preserving upload protocol headers and response semantics.

- [ ] **Step 1: Keep the HTTP-LAN regression test red evidence**

```ts
it('hashes upload chunks when SubtleCrypto is unavailable on HTTP LAN', async () => {
  vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues });
  await expect(digestUploadBlob(new Blob(['abc']))).resolves.toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
```

Run: `pnpm --filter @galaxy/web test --run 'app/projects/[projectId]/documents/document-upload.test.ts'`

Expected before the fix: FAIL because `crypto.subtle` is unavailable. Expected after the shared fallback: 24 tests pass.

- [ ] **Step 2: Add failing proxy coverage for raw bodies and protocol headers**

```ts
it('streams a binary upload part and preserves protocol headers', async () => {
  const request = new Request(
    'http://192.168.1.80:3000/api/v1/uploads/id/parts',
    {
      method: 'POST',
      headers: {
        origin: 'http://192.168.1.80:3000',
        cookie: 'session=member',
        'content-type': 'application/octet-stream',
        'content-range': 'bytes 0-2/3',
        etag: 'request-etag',
        'x-csrf-token': 'csrf-value',
      },
      body: new Uint8Array([1, 2, 3]),
    },
  );
  const response = await POST(request, context(['uploads', 'id', 'parts']));
  expect(response.headers.get('content-range')).toBe('bytes 0-2/3');
  expect(response.headers.get('etag')).toBe('response-etag');
});
```

Run: `pnpm --filter @galaxy/web test --run 'app/api/v1/[...path]/route.test.ts'`

Expected before the header fix: FAIL because `Content-Range` and `ETag` are dropped.

- [ ] **Step 3: Keep the minimum shared fixes**

```ts
const requestHeaders = [
  'accept',
  'content-type',
  'content-range',
  'cookie',
  'etag',
  'x-csrf-token',
] as const;
const responseHeaders = [
  'content-range',
  'etag',
  'location',
  'set-cookie',
  'upload-offset',
] as const;

export async function digestUploadBlob(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const subtle = globalThis.crypto?.subtle;
  return subtle
    ? hex(await subtle.digest('SHA-256', bytes))
    : hex(sha256(bytes));
}
```

The request body remains the incoming stream with `duplex: 'half'`; no JSON parse and no whole-file buffer is introduced.

- [ ] **Step 4: Verify direct API, localhost, and LAN classification**

Run authenticated browser upload flows against `http://localhost:3000` and `http://192.168.1.80:3000`. Record `initiate=201`, first part `201`, confirmed bytes greater than zero, completion `AVAILABLE`, submit `201`, reload persistence, download bytes, and that every LAN upload request origin is the LAN Web origin.

- [ ] **Step 5: Run the focused Web regression**

Run:

```bash
pnpm --filter @galaxy/web test --run 'app/api/v1/[...path]/route.test.ts' 'app/projects/[projectId]/documents/document-upload.test.ts' 'features/projects/project-document-upload-queue.test.tsx'
```

Expected: all selected tests pass and no request target contains an internal hostname.

---

### Task 2: Make the persisted Matrix/Workflow boundary authoritative

**Files:**

- Modify: `apps/api/src/uploads/uploads.dto.ts`
- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/project-stage-one.test.ts`
- Modify: `apps/api/src/uploads/uploads.test.ts`
- Modify: `apps/api/src/projects/project-stage-one.rules.ts`
- Modify: `apps/api/src/projects/project-stage-one.rules.test.ts`
- Create: `apps/api/prisma/migrations/20260822090000_stage_one_workflow_document_definitions/migration.sql`
- Test: `apps/api/test/project-required-document-upload.integration.test.ts`

**Interfaces:**

- Consumes: `ProjectRequiredDocument.initialMatrix`, `ProjectStageOneDocument.requiredDocumentId`, and `SIMPLE_STAGE_ONE_STEPS`.
- Produces: `ProjectDocumentContext = 'STAGE_MATRIX_DOCUMENT' | 'STAGE_WORKFLOW_STEP_DOCUMENT'`; persisted Workflow definitions for every Stage 1 Step; read models whose documents carry their derived context.

- [ ] **Step 1: Write failing service and DTO tests**

```ts
it('derives disjoint Matrix and Workflow contexts from the persisted definition', async () => {
  const result = await service(prisma).getSimple(
    actor('u', readPermissions),
    projectId,
  );
  expect(
    result.documents.find(({ id }) => id === 'matrix-document')?.contextType,
  ).toBe('STAGE_MATRIX_DOCUMENT');
  expect(
    result.documents.find(({ id }) => id === 'workflow-document')?.contextType,
  ).toBe('STAGE_WORKFLOW_STEP_DOCUMENT');
});

it('rejects a Workflow target presented as a Matrix target', async () => {
  await expect(
    service(prisma).createUploadTarget(actor, projectId, {
      ...target,
      contextType: 'STAGE_MATRIX_DOCUMENT',
    }),
  ).rejects.toMatchObject({
    response: { category: 'PROJECT_DOCUMENT_TARGET_NOT_FOUND' },
  });
});
```

Also assert that a definition with any logical document, legacy version, current file, or version counter cannot change either `workstreamKey` or `initialMatrix`.

Run:

```bash
pnpm --filter @galaxy/api test --run src/projects/project-stage-one.test.ts src/uploads/uploads.test.ts
```

Expected before implementation: the context field is absent and context reassignment is accepted.

- [ ] **Step 2: Define the context once and validate it at the upload boundary**

```ts
export const PROJECT_DOCUMENT_CONTEXTS = [
  'STAGE_MATRIX_DOCUMENT',
  'STAGE_WORKFLOW_STEP_DOCUMENT',
] as const;
export type ProjectDocumentContext = (typeof PROJECT_DOCUMENT_CONTEXTS)[number];

// ProjectStageDocumentTargetDto
@IsIn(PROJECT_DOCUMENT_CONTEXTS)
contextType!: ProjectDocumentContext;
```

Target resolution reads `initialMatrix` from the scoped persisted definition, derives the expected context, and rejects a mismatch before creating or reusing a logical document.

- [ ] **Step 3: Seed Workflow definitions without a second document model**

```ts
const workflowDefinitionDefaults = SIMPLE_STAGE_ONE_STEPS.flatMap(
  ({ step, documents }) =>
    documents.map((name, position) => ({
      name,
      workstreamKey: step,
      position,
      initialMatrix: false,
    })),
);
const stageOneDefinitionDefaults = [
  ...initialDocumentMatrix.map((definition, position) => ({
    ...definition,
    position,
    initialMatrix: true,
  })),
  ...workflowDefinitionDefaults,
];
```

The additive SQL inserts the same `(workstreamKey, documentType)` pairs for existing non-deleted Projects with Stage 1 state, uses each Project's organization, sets `initialMatrix=false`, and uses `ON CONFLICT DO NOTHING`. It changes no existing row and deletes nothing.

```sql
INSERT INTO "ProjectRequiredDocument" (
  "id", "organizationId", "projectId", "stageKey", "workstreamKey",
  "documentType", "documentName", "required", "position", "initialMatrix",
  "normalizedName", "status", "ownerRole", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), p."organizationId", p."id", 'STAGE_1', d.step,
       d.name, d.name, false, d.position, false, lower(d.name), 'MISSING',
       'PROJECT_MANAGER', now(), now()
FROM "Project" p
JOIN "ProjectStageState" s
  ON s."projectId" = p."id" AND s.stage = 'STAGE_ONE'
CROSS JOIN (VALUES
  ('ASSIGNMENT', 'Văn bản chủ trương đầu tư', 0),
  ('ASSIGNMENT', 'Quyết định giao nhiệm vụ / Phân công Ban QLDA', 1),
  ('ASSIGNMENT', 'Hồ sơ khác', 2),
  ('SURVEY', 'Báo cáo khảo sát hiện trạng mặt bằng', 0),
  ('SURVEY', 'Phương án bố trí nhân sự Ban QLDA', 1),
  ('SURVEY', 'Biên bản khảo sát', 2),
  ('SURVEY', 'Bản vẽ / Bản đo hiện trạng', 3),
  ('SURVEY', 'Ảnh / Video hiện trường', 4),
  ('SURVEY', 'Hồ sơ khác', 5),
  ('PROPOSAL', 'Hồ sơ BCNCTKT / Báo cáo đề xuất chủ trương đầu tư', 0),
  ('PROPOSAL', 'Báo cáo thẩm định nội bộ', 1),
  ('PROPOSAL', 'Báo cáo thẩm định ngành / Bộ', 2),
  ('PROPOSAL', 'Thuyết minh', 3),
  ('PROPOSAL', 'Bản vẽ', 4),
  ('PROPOSAL', 'Dự toán', 5),
  ('PROPOSAL', 'Hồ sơ khác', 6),
  ('FINANCIAL_PLANNING', 'Văn bản cam kết / cân đối nguồn vốn', 0),
  ('FINANCIAL_PLANNING', 'Kế hoạch vốn', 1),
  ('FINANCIAL_PLANNING', 'Văn bản xác nhận nguồn vốn', 2),
  ('FINANCIAL_PLANNING', 'Hồ sơ khác', 3),
  ('KICKOFF_APPROVAL', 'Quyết định phê duyệt chủ trương đầu tư', 0),
  ('KICKOFF_APPROVAL', 'Quyết định phê duyệt dự án đầu tư xây dựng', 1),
  ('KICKOFF_APPROVAL', 'Biên bản / Văn bản phê duyệt', 2),
  ('KICKOFF_APPROVAL', 'Hồ sơ khác', 3)
) AS d(step, name, position)
WHERE p."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "ProjectRequiredDocument" existing
    WHERE existing."projectId" = p."id"
      AND existing."stageKey" = 'STAGE_1'
      AND existing."initialMatrix" = false
  )
ON CONFLICT ("projectId", "stageKey", "workstreamKey", "documentType")
DO NOTHING;
```

- [ ] **Step 4: Return derived contexts and disjoint definition collections**

Select `requiredDocument.initialMatrix` with each logical document and serialize:

```ts
const contextType = (initialMatrix: boolean): ProjectDocumentContext =>
  initialMatrix ? 'STAGE_MATRIX_DOCUMENT' : 'STAGE_WORKFLOW_STEP_DOCUMENT';
```

`steps[].documentTypes` includes active definitions with `initialMatrix=false` only. Matrix definition files contain documents derived as Matrix only. Workflow documents contain documents derived as Workflow only. Legacy files derive from their own persisted definition.

- [ ] **Step 5: Prove no physical duplicate and actor separation**

Extend integration coverage to submit one Matrix session and one Workflow session and assert:

```ts
expect(matrixDocument.currentFileAssetId).toBe(matrixSession.fileAssetId);
expect(workflowDocument.currentFileAssetId).toBe(workflowSession.fileAssetId);
expect(await prisma.fileAsset.count({ where: { id: { in: fileIds } } })).toBe(
  2,
);
expect(workflowDocument.actualActorId).toBe(currentActor.userId);
expect(workflowDocument.submittedOfficerId).toBe(nominatedOfficer.userId);
```

Assert cross-Project definitions, mismatched contexts, and non-members are rejected without revealing file metadata.

- [ ] **Step 6: Validate and deploy the additive data migration**

Run:

```bash
pnpm --filter @galaxy/api exec prisma format --schema prisma/schema.prisma
pnpm --filter @galaxy/api prisma:validate
pnpm db:status
pnpm --filter @galaxy/api prisma:deploy
pnpm --filter @galaxy/api prisma:validate
pnpm db:status
```

Never run the root `pnpm db:migrate` here: it maps to `prisma migrate dev`.
Apply this additive migration only with `pnpm --filter @galaxy/api prisma:deploy`;
stop if any command requests a reset.

---

### Task 3: Carry context and custom document names through the one shared queue

**Files:**

- Modify: `apps/web/features/projects/project-document-upload-queue.tsx`
- Modify: `apps/web/features/projects/project-document-upload-queue.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/stage-1/optional-document-matrix.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-two.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-two.test.tsx`

**Interfaces:**

- Consumes: Task 2 `ProjectDocumentContext`, existing queue identity, `displayName` accepted by `ProjectStageDocumentTargetDto`, and the existing legacy `requiredDocumentId` upload target.
- Produces: context-aware queue items/batches, a discriminated Stage-document/Required-document target, Project-switch stale-state eviction, custom `Hồ sơ khác` display names, and disjoint Stage 1 lists.

- [ ] **Step 1: Write failing queue identity and payload tests**

```ts
expect(
  projectDocumentQueueKey(
    projectId,
    'STAGE_1',
    'ASSIGNMENT',
    definitionId,
    'STAGE_MATRIX_DOCUMENT',
  ),
).not.toBe(
  projectDocumentQueueKey(
    projectId,
    'STAGE_1',
    'ASSIGNMENT',
    definitionId,
    'STAGE_WORKFLOW_STEP_DOCUMENT',
  ),
);

expect(initBody.stageOneDocument).toMatchObject({
  contextType: 'STAGE_WORKFLOW_STEP_DOCUMENT',
  displayName: 'Biên bản bổ sung',
});
```

Assert a stored batch is rejected when Project, Stage, Step/workstream, definition, or context differs.

- [ ] **Step 2: Extend the existing queue item instead of introducing a wrapper**

```ts
type ProjectDocumentQueueItem = {
  contextType: 'STAGE_MATRIX_DOCUMENT' | 'STAGE_WORKFLOW_STEP_DOCUMENT';
  displayName?: string;
  targetType: 'STAGE_DOCUMENT' | 'REQUIRED_DOCUMENT';
  // existing fields stay unchanged
};
```

Include `contextType` and `targetType` in the queue key,
session-storage key, exact-key validator, recovery identity, initiate body, and
all enqueue/reconcile comparisons. A Stage target sends `stageOneDocument`; a
Required-document target sends `requiredDocumentId: item.definitionId`; never
send both. Include `displayName` only when a bounded non-blank custom name is
supplied.

Update every existing Stage-document caller in the same task so the required
API contract is never left broken: Stage 1 Matrix sends
`STAGE_MATRIX_DOCUMENT`, Stage 1 Workflow sends
`STAGE_WORKFLOW_STEP_DOCUMENT`, and the existing Stage 2 definition uploader
sends `STAGE_MATRIX_DOCUMENT`.

- [ ] **Step 3: Write failing Stage 1 separation tests**

Render one Matrix document and one Workflow document for the same Step and assert:

```ts
expect(matrixSection).toContain('matrix.pdf');
expect(matrixSection).not.toContain('workflow.pdf');
expect(workflowSection).toContain('workflow.pdf');
expect(workflowSection).not.toContain('matrix.pdf');
```

Assert all five selected Steps render an enabled upload area after `DONE`, URL `?step=N` controls the selected card, completing Step N selects N+1, and the next Step status remains unchanged.

- [ ] **Step 4: Filter both visible contexts from the persisted flag**

```ts
const matrixDefinitions = data.documentDefinitions.filter(
  ({ initialMatrix }) => initialMatrix,
);
const stepDefinitions = data.documentDefinitions.filter(
  ({ active, initialMatrix, workstreamKey }) =>
    active && !initialMatrix && workstreamKey === step.step,
);
const stepDocuments = data.documents.filter(
  ({ contextType, step: documentStep }) =>
    contextType === 'STAGE_WORKFLOW_STEP_DOCUMENT' &&
    documentStep === step.step,
);
```

The Matrix manager receives Matrix definitions only and always writes `initialMatrix=true`.

Add/rename/reorder/archive/restore tests exercise the existing definition
command. An ordinary actor with `canManageMatrixDocumentTypes=false` receives
no management control, and a definition with history cannot cross contexts.

- [ ] **Step 5: Implement custom-name input on the Workflow surface**

When the selected definition has `customNameRequired=true`, render a required input capped at 200 characters. Disable file selection until its trimmed value is non-empty, pass that name into the shared queue, and keep it stable for retry/recovery.

```tsx
{
  stepDefinition.customNameRequired && (
    <input
      aria-label="Tên hồ sơ"
      maxLength={200}
      onChange={(event) => setCustomDisplayName(event.target.value)}
      required
      value={customDisplayName}
    />
  );
}
```

Add `Tải version mới` on a submitted Workflow record only when upload is
allowed. It reopens the same shared queue with the logical `documentId`; the
backend appends a version to that same logical document and reuses the same
history view.

- [ ] **Step 6: Run focused API/Web tests**

Run:

```bash
pnpm --filter @galaxy/api test --run src/projects/project-stage-one.test.ts src/uploads/uploads.test.ts
pnpm --filter @galaxy/web test --run 'features/projects/project-document-upload-queue.test.tsx' 'app/projects/[projectId]/project-stage-one.test.tsx' 'app/projects/[projectId]/project-stage-two.test.tsx'
```

Expected: context, stale-target, submit-idempotency, Matrix separation, Workflow separation, custom-name, and Step navigation tests all pass.

---

### Task 4: Add authorized safe preview without weakening download

**Files:**

- Modify: `apps/api/src/files/files.controller.ts`
- Modify: `apps/api/src/files/files.service.ts`
- Modify: `apps/api/src/files/files.test.ts`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Modify: `apps/web/app/projects/[projectId]/stage-1/optional-document-matrix.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`

**Interfaces:**

- Consumes: the existing `FilesService.file()` scope/organization/attachment policy and file storage read.
- Produces: `GET /api/v1/files/:id/preview` for PDF, JPEG, PNG, WebP, MP4, and safe text; unsupported types retain metadata and download only.

- [ ] **Step 1: Write failing permission and content-disposition tests**

```ts
it('streams an authorized safe preview inline', async () => {
  const result = await controller.preview(actor, fileId, response);
  expect(response.setHeader).toHaveBeenCalledWith(
    'Content-Disposition',
    expect.stringContaining('inline;'),
  );
  expect(result).toBeInstanceOf(StreamableFile);
});

it('does not reveal an inaccessible Project file through preview', async () => {
  await expect(service.preview(nonMember, fileId)).rejects.toBeInstanceOf(
    NotFoundException,
  );
});
```

- [ ] **Step 2: Reuse the exact download authorization path**

```ts
const previewMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'text/plain',
]);

async preview(actor: CurrentActor, id: string) {
  const result = await this.download(actor, id);
  if (!previewMimeTypes.has(result.file.mimeType))
    throw new UnsupportedMediaTypeException('Preview is not supported');
  return result;
}
```

The controller sets `Content-Disposition: inline` with the encoded original filename, never returns storage keys, and remains guarded by `file.read`. Download remains guarded by `file.download`.

- [ ] **Step 3: Gate visible actions by backend capabilities**

Show `Xem` only when `canPreviewFiles` and the MIME is supported. Show `Tải xuống` only when `canDownloadFiles`. DOCX, XLSX, CSV, DWG, and ZIP show metadata/download only.

```tsx
{
  capabilities.canPreviewFiles && isPreviewable(file.mimeType) && (
    <a
      href={`${apiUrl}/files/${file.id}/preview`}
      target="_blank"
      rel="noreferrer"
    >
      Xem
    </a>
  );
}
{
  capabilities.canDownloadFiles && (
    <a href={`${apiUrl}/files/${file.id}/download`}>Tải xuống</a>
  );
}
```

- [ ] **Step 4: Verify files regression**

Run:

```bash
pnpm --filter @galaxy/api test --run src/files/files.test.ts
pnpm --filter @galaxy/web test --run 'app/projects/[projectId]/project-stage-one.test.tsx'
```

Expected: authorized preview/download pass; non-member, cross-organization, and missing-capability reads reveal neither filename nor bytes.

---

### Task 5: Make `/projects` the canonical real-data dashboard

**Files:**

- Modify: `apps/web/app/projects/page.tsx`
- Modify: `apps/web/app/projects/project-dashboard.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/page.tsx`
- Modify: `apps/web/app/projects/[projectId]/compatibility.test.tsx`
- Modify: `apps/web/tests/browser/project-pms-dashboard.spec.ts`
- Modify only if a failing test proves a server gap: `apps/api/src/projects/projects.service.ts`
- Modify only if a failing test proves a server gap: `apps/api/src/projects/projects.test.ts`

**Interfaces:**

- Consumes: existing permission-filtered Project page read and real aggregate response.
- Produces: dashboard title `TỔNG QUAN QUẢN LÝ DỰ ÁN`, capability-filtered KPIs/list, `CHI TIẾT` links to Stage 1, and a server redirect from the bare Project route.

- [ ] **Step 1: Write failing route and dashboard tests**

```ts
expect(markup).toContain('TỔNG QUAN QUẢN LÝ DỰ ÁN');
expect(markup).toContain(`/projects/${project.id}/stage-1`);
expect(markup).not.toContain(`/projects/${project.id}\"`);
expect(redirect).toHaveBeenCalledWith(`/projects/${projectId}/stage-1`);
```

With `canReadFinance=false`, assert no financial label, value, sort key, filter control, or export field exists in the rendered markup or API selection.

- [ ] **Step 2: Keep real aggregates only**

Render count/status/due KPIs only when supplied by the backend. Render the planned-versus-actual chart only when a non-empty real series is returned; otherwise omit the chart region entirely. Keep create action capability-gated.

```tsx
{
  page.progressSeries?.length ? (
    <ProjectProgressChart series={page.progressSeries} />
  ) : null;
}
{
  page.permittedCommands.create ? (
    <Link href="/projects/new">TẠO DỰ ÁN</Link>
  ) : null;
}
```

If no existing `ProjectProgressChart` exists, render the real series with a
native CSS bar list inside `DashboardView`; do not add a chart dependency.

- [ ] **Step 3: Replace the bare Project overview with the canonical redirect**

```tsx
import { redirect } from 'next/navigation';

export default async function ProjectPage({ params }: PageProps) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/stage-1`);
}
```

- [ ] **Step 4: Run focused dashboard tests**

Run:

```bash
pnpm --filter @galaxy/web test --run 'app/projects/project-dashboard.test.tsx' 'app/projects/[projectId]/compatibility.test.tsx'
```

Expected: dashboard hierarchy, financial omission, details route, redirect, loading/error/empty/pagination states all pass.

---

### Task 6: Use one two-row `ProjectStageHeader` on all five stages

**Files:**

- Modify: `apps/web/app/project-pms.tsx`
- Modify: `apps/web/app/project-pms.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-two.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-two.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-access.tsx`
- Modify: `apps/web/app/projects/[projectId]/compatibility.test.tsx`
- Modify: `apps/api/src/projects/project-stage-one.service.ts`
- Modify: `apps/api/src/projects/project-stage-two.service.ts`
- Modify: `apps/api/src/projects/projects.service.ts`

**Interfaces:**

- Consumes: permission-filtered Project options and server-derived capabilities.
- Produces: exported `ProjectStageHeader` with identical row structure on GĐ1–GĐ5; Project switching preserves Stage and clears Step/tab/upload state.

- [ ] **Step 1: Write one cross-stage rendering test before extraction**

For each stage number 1–5, render its page view and assert one element marked `data-project-stage-header`, the same two row markers, all `GĐ1`–`GĐ5` links, Project code/name, selector, and the exact Galaxy title. Assert the access action is absent when `canManageProjectAccess=false`.

- [ ] **Step 2: Export the shared header from the existing PMS component**

```ts
export const PROJECT_STAGE_LABELS = {
  STAGE_1: 'KHỞI TẠO, HỒ SƠ DỰ ÁN & PHÊ DUYỆT',
  STAGE_2: 'THIẾT KẾ, SẢN PHẨM & DỰ TOÁN',
  STAGE_3: 'THƯƠNG MẠI, HỢP ĐỒNG & MUA HÀNG',
  STAGE_4: 'SẢN XUẤT, LOGISTICS, KHO & LẮP ĐẶT',
  STAGE_5: 'NGHIỆM THU, BÀN GIAO & BẢO HÀNH',
} as const;
```

`ProjectStageHeader` row one owns badge/title/status/switcher. Row two owns Project label/selector/code/name/access action. The switcher uses native horizontal overflow and the selector is full width on small screens.

```ts
export type ProjectStageHeaderProps = {
  activeStage: keyof typeof PROJECT_STAGE_LABELS;
  project: { id: string; code: string; name: string };
  projects: readonly { id: string; code: string; name: string }[];
  status?: string;
  canManageProjectAccess: boolean;
};
```

- [ ] **Step 3: Supply backend capabilities and visible Project options**

Add `canSwitchProject` and `canManageProjectAccess` to existing stage read models using exact permission checks. Reuse the already scoped Project list; do not infer from role names. GĐ2–GĐ5 load the same visible option shape `{id, code, name}`.

```ts
const projectCapabilities = (actor: CurrentActor) => ({
  canSwitchProject: actor.permissions.includes('project.read'),
  canManageProjectAccess: actor.permissions.includes('project.manage_members'),
});
```

- [ ] **Step 4: Replace bespoke headers without retaining duplicates**

Mount the exported header from Stage 1, Stage 2, and `ProjectPmsShell`. Changing Project routes to `/projects/:nextId/stage-X` without an old query/hash; React unmount clears Step/tab state and queue recovery keys include the new exact context.

```tsx
<ProjectStageHeader
  activeStage="STAGE_1"
  canManageProjectAccess={data.capabilities.canManageProjectAccess}
  project={data.project}
  projects={data.options.projects}
/>
```

- [ ] **Step 5: Run shared-header regressions**

Run:

```bash
pnpm --filter @galaxy/web test --run 'app/project-pms.test.tsx' 'app/projects/[projectId]/project-stage-one.test.tsx' 'app/projects/[projectId]/project-stage-two.test.tsx' 'app/projects/[projectId]/compatibility.test.tsx'
```

Expected: GĐ1–GĐ5 share one header component and direct stage navigation never depends on GĐ1 completion.

---

### Task 7: Adapt GĐ2–GĐ5 to the approved Galaxy tabs using real routes

**Files:**

- Modify: `apps/web/app/projects/[projectId]/project-stage-two.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-two.test.tsx`
- Modify: `apps/web/app/projects/[projectId]/project-stage-access.tsx`
- Modify: `apps/web/app/projects/[projectId]/compatibility.test.tsx`
- Create: `apps/web/features/projects/project-context-documents.tsx`
- Modify: `apps/web/features/projects/stage-required-document-matrix.tsx`
- Modify: `apps/web/tests/browser/project-pms-stage-access.spec.ts`

**Interfaces:**

- Consumes: Task 3 shared queue target, Task 6 shared header, existing `ProjectRequiredDocument` records, and existing functional Project/domain pages.
- Produces: thin `ProjectContextDocuments`, URL-stable tabs for GĐ2–GĐ5, honest empty states, and working links into current canonical records without creating duplicate business models or uploaders.

- [ ] **Step 1: Write failing label and action tests**

Assert exact tab labels:

```ts
const tabs = {
  STAGE_2: [
    'KẾ HOẠCH & KHẢO SÁT',
    'THIẾT KẾ, SẢN PHẨM & BOQ',
    'THẨM ĐỊNH & PHÊ DUYỆT',
  ],
  STAGE_3: [
    'BÁO GIÁ & HỢP ĐỒNG KHÁCH HÀNG',
    'NHÀ CUNG CẤP & MUA HÀNG',
    'PO, PI & KẾ HOẠCH THANH TOÁN',
  ],
  STAGE_4: [
    'SẢN XUẤT & QC',
    'LOGISTICS & HẢI QUAN',
    'KHO & GIAO HÀNG',
    'LẮP ĐẶT & TIẾN ĐỘ',
  ],
  STAGE_5: [
    'NGHIỆM THU & BÀN GIAO',
    'QUYẾT TOÁN & THANH LÝ',
    'BẢO HÀNH & HẬU MÃI',
  ],
};
```

Assert every visible action has a real destination and no construction-law term, raw enum, fake file, fake row, or large inherited-data blocker is rendered.

- [ ] **Step 2: Rename Stage 2 tabs and preserve its real Step 1 work**

Keep the current plan/import/document implementation under `KẾ HOẠCH & KHẢO SÁT`. The second tab links to the real Product Register and Estimate/BOQ routes. The third tab renders only connected approval/revision records or a concise empty state without a completion claim.

```ts
const stageTwoTabs = [
  'KẾ HOẠCH & KHẢO SÁT',
  'THIẾT KẾ, SẢN PHẨM & BOQ',
  'THẨM ĐỊNH & PHÊ DUYỆT',
] as const;
```

- [ ] **Step 3: Replace the legacy stage uploader with the shared queue**

`ProjectContextDocuments` is a thin adapter that supplies Project, Stage,
workstream, `STAGE_MATRIX_DOCUMENT`, capabilities, and the discriminated
`REQUIRED_DOCUMENT` target to `ProjectDocumentUploadQueue`. Replace the live
`DocumentUpload` mount in `StageRequiredDocumentMatrix`; retain no second
transport worker. A selected file still follows initiate → parts → complete →
explicit submit.

```tsx
<ProjectDocumentUploadQueue
  contextType="STAGE_MATRIX_DOCUMENT"
  definition={{ id: document.id, name: document.documentName }}
  targetType="REQUIRED_DOCUMENT"
  {...sharedProjectUploadProps}
/>
```

- [ ] **Step 4: Compose Stage 3 from current commercial and procurement routes**

Use Project-scoped quotations/contracts for tab one; Project-filtered purchase requests/RFQs/supplier quotations/comparisons for tab two; purchase orders/proforma invoices and permission-safe payment schedules for tab three. Links include `projectId` only where the destination already accepts it.

```ts
const stageThreeLinks = {
  commercial: [
    `/projects/${projectId}/quotations`,
    `/projects/${projectId}/contracts`,
  ],
  procurement: [
    `/procurement/requests?projectId=${projectId}`,
    `/procurement/rfqs?projectId=${projectId}`,
  ],
  orders: [
    `/procurement/purchase-orders?projectId=${projectId}`,
    `/procurement/proforma-invoices?projectId=${projectId}`,
  ],
};
```

- [ ] **Step 5: Compose Stage 4 from current execution routes**

Use production/QC, shipments/customs/landed cost, inventory/warehouse/delivery, and installation/task/timeline routes. Finance actions appear only with the server capability. Do not add copied tables when an authoritative registry already exists.

```ts
const stageFourRoutes = [
  `/production?projectId=${projectId}`,
  `/logistics/shipments?projectId=${projectId}`,
  '/inventory',
  `/installations?projectId=${projectId}`,
];
```

- [ ] **Step 6: Compose Stage 5 from current Project routes**

Use Project inspections/handover, contracts/settlement destinations, and Project warranty/after-sales destinations. File actions use Task 4 preview/download and never display fake PDF/DWG names.

```ts
const stageFiveRoutes = [
  `/projects/${projectId}/inspections`,
  `/projects/${projectId}/handover`,
  `/projects/${projectId}/contracts`,
  `/projects/${projectId}/warranty`,
];
```

- [ ] **Step 7: Run stage regressions**

Run:

```bash
pnpm --filter @galaxy/web test --run 'app/projects/[projectId]/project-stage-two.test.tsx' 'app/projects/[projectId]/compatibility.test.tsx'
```

Expected: approved labels, working canonical links, direct GĐ2–GĐ5 access, and no predecessor gate or unimplemented command.

---

### Task 8: Browser acceptance, reference audit, cleanup, and complete verification

**Files:**

- Modify: `apps/web/tests/browser/project-stage-one.spec.ts`
- Modify: `apps/web/tests/browser/project-pms-dashboard.spec.ts`
- Modify: `apps/web/tests/browser/project-pms-stage-access.spec.ts`
- Modify: `apps/web/tests/browser/api-forwarder.spec.ts`
- Create: `docs/project-system/PMS_PROJECT_WORKSPACE_REFERENCE_AUDIT.md`
- Modify after accepted implementation: `PROJECT_STATUS.md`
- Delete only code proven unreachable by route/caller search: obsolete Project header/uploader/list fragments in files already modified above.

**Interfaces:**

- Consumes: Tasks 1–7 and ignored `.artifacts/pms-reference/project-workspace/` screenshots.
- Produces: fresh localhost/LAN Playwright evidence, responsive screenshots, updated audit/status documentation, and exact verification counts.

- [ ] **Step 1: Extend real browser flows**

Cover Dashboard → Stage 1, shared header across GĐ1–GĐ5, Project switching at the same Stage, Matrix upload, Workflow upload, Step completion, upload after completion, preview/download, and non-member/no-upload permission. Network assertions distinguish route-level 404 from structured business responses and fail if LAN browser requests target localhost/internal hosts.

```ts
page.on('request', (request) => {
  if (request.url().includes('/api/v1/uploads/'))
    expect(new URL(request.url()).origin).toBe(expectedWebOrigin);
});
await expect(page.getByText('Đã tải tạm — Chờ nộp')).toBeVisible();
await page.getByRole('button', { name: 'NỘP HỒ SƠ' }).click();
```

- [ ] **Step 2: Capture and inspect all required viewports**

Store ignored captures under `.artifacts/pms-reference/project-workspace/` at 1536×864, 1440×900, 1280×800, and mobile. Inspect dashboard/table, five headers, separate Matrix/Workflow, selected Step, temporary progress, submit result, both file lists, preview, mobile switcher, and forbidden state for clipping, duplicated content, raw enums, and overflow.

- [ ] **Step 3: Write the reference audit from inspected evidence**

`PMS_PROJECT_WORKSPACE_REFERENCE_AUDIT.md` records permitted reference hierarchy, density, spacing, state treatment, responsive behavior, Galaxy-specific substitutions, screenshot inventory, and verified deviations. It contains no credentials and makes no unsupported preview or completion claim.

- [ ] **Step 4: Remove only proven obsolete Project code**

Run caller searches before deletion:

```bash
rg -n "DocumentUploadView|StageOneUploader|ProjectPmsHeader|legacyProjectDocumentDestination|projectLandingStage" apps packages services
```

Delete a fragment only when no live route/test imports it and the shared replacement covers its behavior. Keep compatibility redirects and all data/history models.

- [ ] **Step 5: Invoke verification and review skills**

Invoke `superpowers:verification-before-completion`, then run fresh checks:

```bash
git diff --check
pnpm --filter @galaxy/api exec prisma format --schema prisma/schema.prisma
pnpm db:validate
pnpm db:status
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

Run Project upload/context/authorization/preview suites separately with the database and services reachable, then Playwright Project flows on localhost and LAN. Record exact pass/fail/skip counts and exact blockers.

- [ ] **Step 6: Run independent reviews**

Invoke `superpowers:requesting-code-review`. Run the mandatory Ponytail diff review followed by correctness, security, authorization, upload, performance, and UX/reference-match reviews. Fix every Critical/Important issue with a regression and fresh verification; record deliberately deferred non-blocking findings precisely.

- [ ] **Step 7: Update status without claiming unverified work**

Append a dated `PROJECT_STATUS.md` checkpoint that separates `COMPLETE`, `REUSABLE_FOUNDATION`, `PARTIAL`, `NOT_STARTED`, and blockers. Report completion only if every Definition of Done item has browser evidence; otherwise name the first exact unmet item and the next executable task.

## Plan self-review

- Spec coverage: Task 1 covers route/proxy/LAN/chunk/temporary upload; Tasks 2–3 cover target scope, actor metadata, two-phase submit, context separation, versions, Matrix management, and Step behavior; Task 4 covers preview/download; Task 5 covers Dashboard/canonical detail; Task 6 covers the shared header/selectors; Task 7 covers GĐ2–GĐ5 and the final legacy uploader; Task 8 covers browser, visual, documentation, cleanup, and full verification.
- Instruction scan: every code-changing step names exact files, interfaces, runnable checks, and concrete implementation shapes; no speculative dependency, fake datum, duplicate domain, or unspecified alternate path remains.
- Type consistency: `ProjectDocumentContext`, `contextType`, `targetType`, `definitionId`, `displayName`, `canManageProjectAccess`, and Project option shapes keep the same spelling and semantics across producer and consumer tasks.
- Scope: no administration, CRM, Marketing, global Warehouse/Product Master, authentication architecture, unrelated format pass, commit, push, or destructive data action is included.

## Execution checkpoint — 2026-08-24

- Tasks 1–7 are implemented in the preserved working tree and have fresh
  focused/full unit evidence. The upload route/proxy, two-phase submit,
  CurrentActor enforcement, Matrix/Workflow separation, Dashboard, shared
  header, direct Stage navigation, and connected Stage 2–5 routes are present.
- Review repairs added explicit live proxy roots, Project-scoped Production
  reads, permission-safe creation visibility, collision-safe legacy Matrix
  classification, and terminal draft cleanup/quota accounting without deleting
  UploadSession or FileAsset history.
- Task 8 remains partial. Static/unit verification is green; database-backed,
  localhost/LAN Playwright, full visual recapture, and Web production build are
  blocked by this runner's PostgreSQL/socket restrictions. The executable next
  step is the Task 8 command set on an environment with those facilities.

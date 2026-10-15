# Project Required Document Resumable Upload Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task-by-task. The user forbids commits, tags, pushes, and database resets; review the affected-file diff instead of a commit range.

**Goal:** Connect the existing resumable `UploadSession` API to the existing Project Required Document `FileAsset` and version workflow.

**Architecture:** Keep byte transfer in `UploadsService`, durable storage in the existing `FileStorage`, and Required Document replacement in `ProjectProductsService`. Add only the persisted target/finalized-asset links needed for authorization and idempotent retry. Every session command rechecks actor ownership and current Project access; responses expose resumable part metadata but never storage keys or paths.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Next.js/React, Vitest, Playwright, Node standard library.

---

### Task 1: Deliver resumable Project Required Document upload

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260808120000_project_document_resumable_upload/migration.sql`
- Modify: `apps/api/src/files/file-storage.ts`
- Modify: `apps/api/src/files/files.module.ts`
- Modify: `apps/api/src/projects/project-products.service.ts`
- Modify: `apps/api/src/projects/projects.module.ts`
- Modify: `apps/api/src/uploads/uploads.module.ts`
- Modify: `apps/api/src/uploads/uploads.dto.ts`
- Modify: `apps/api/src/uploads/uploads.controller.ts`
- Modify: `apps/api/src/uploads/uploads.service.ts`
- Modify: `apps/api/src/uploads/uploads.test.ts`
- Modify or create focused tests beside `apps/api/src/projects/project-products.test.ts`
- Modify: `apps/web/app/projects/[projectId]/documents/[requirementId]/page.tsx`
- Create: `apps/web/app/projects/[projectId]/documents/document-upload.tsx` only if keeping the tested upload state in the route would materially worsen the existing component
- Create: one focused Web test beside the Required Document route
- Modify: `apps/web/tests/browser/project-stage-one.spec.ts` only after focused API/Web behavior is green

**Step 1: Write failing API tests**

Cover target validation, actor ownership, current Project access on every command, financial-document manage permission, sanitized status output, resumable uploaded-part numbers/bytes, part retry, abort, checksum failure, sequential completion retry, exactly one `FileAsset`, exactly one `EntityAttachment`, and preserved prior Required Document versions. Assert that responses omit `storageKey`, `storagePath`, and provider identifiers.

**Step 2: Run the focused API tests and capture RED**

Run: `pnpm --filter @galaxy/api exec vitest run --no-file-parallelism src/uploads/uploads.test.ts src/projects/project-products.test.ts`

Expected: FAIL because initiation cannot bind a Required Document and completion cannot materialize/link a durable asset.

**Step 3: Add the minimum additive persistence**

Add nullable `projectId`, `requiredDocumentId`, and `fileAssetId` fields to `UploadSession`, with Project/Required Document/FileAsset relations and a uniqueness constraint on the finalized `fileAssetId`. Add relation backfields only where Prisma requires them. Create one additive migration; review its SQL. Do not change existing applied migrations or widen `FileAsset.sizeBytes` in this slice.

**Step 4: Implement the API adapter**

Require `projectId` and `requiredDocumentId` at initiation. Enforce `file.upload` and `project.document.manage` at the controller and service boundary, including independent Stage 1 financial-manage permission. Revalidate ownership and current Project access on get/part/complete/abort/refresh. Cap Project document upload size to the lower of the configured object limit and the current `FileAsset.sizeBytes` database limit; return the actual cap and allowed extensions.

Use Node standard-library streaming and the existing `FileStorage` to place the verified object in canonical storage without buffering the entire upload. Compute the final SHA-256 on the server; compare a client checksum only when supplied. Idempotently create one `FileAsset` and one `EntityAttachment`, then reuse the canonical Required Document link/version command. A completed retry must return the same asset/document. Do not expose physical paths or storage keys.

**Step 5: Run focused API tests and capture GREEN**

Run the Step 2 command and the existing Project Product integration test. Run API typecheck. Fix only proven failures and use `superpowers:systematic-debugging` for unexpected behavior.

**Step 6: Write failing Web tests**

Cover file selection, server-provided size/extension copy, part progress, reload resume using the persisted session id for this Project/requirement, retry, abort, completion/current-version refresh, submit-review continuity, and Vietnamese error text. Do not add a second files page or upload abstraction.

**Step 7: Run focused Web tests and capture RED**

Run the new Required Document route test with the existing document action tests.

Expected: FAIL because the route still posts the legacy 10 MB multipart `/files` request.

**Step 8: Implement the smallest upload panel**

Replace only the Required Document route's legacy multipart submit with the `/uploads` lifecycle. Hash each part with Web Crypto, upload sequentially for deterministic progress/retry, persist only the opaque session id in browser storage under a Project-and-requirement-specific key, resume from sanitized server status, and clear it after completion or abort. Keep current version, download, submit/review, loading, empty, error, and forbidden behavior intact. Use existing styles and Vietnamese UI.

**Step 9: Run targeted and browser verification**

Run focused API/Web tests, Project Product integration, API/Web typechecks, Prisma format/validate/migrate status, `git diff --check`, and the real Stage 1 Playwright document-upload flow. Inspect both required viewport captures before claiming browser acceptance.

**Step 10: Independent reviews and checkpoint**

Request correctness/security/authorization/UX review and Ponytail diff review. Fix proven defects test-first. Update the master SDD ledger and `PROJECT_STATUS.md` with exact evidence and the exact next task. Do not commit.

## Plan self-review

- Reuses all three existing sources of truth and adds no upload/provider/workflow abstraction.
- The migration is additive and exists only for immutable target binding and idempotent materialization.
- Project access, financial sensitivity, direct status URLs, file metadata/bytes, storage paths, retries, and version preservation are verified at trust boundaries.
- The known `FileAsset.sizeBytes` `Int` ceiling is enforced honestly instead of starting a broad storage-schema migration.
- No unfinished route, unrelated Project shell work, fake signing, or speculative background worker is included.

# Project create, upload, and Stage 1 matrix cutover

Date: 2026-08-14  
Status: focused P0 implementation and browser verification complete

## Root-cause baseline

A real local browser reproduction against fresh Web/API processes selected a
37-byte PDF and immediately left `Chờ tải`; it created an UploadSession, sent
one chunk, finalized a FileAsset, linked a Stage 1 document, and persisted it
after reload. The repository's pre-existing port-3000 Next process accepts TCP
but returns no HTTP response, so its cached/stale page cannot execute the
current queue handler or send a first chunk. This process/runtime divergence is
why source-only prior changes did not alter the observed application.

The visible `2048.0 MB` is server-derived, not a frontend text constant. The
active chain is runtime configuration (10 GiB default) → UploadsService → clamp
to `2_147_483_647` because `FileAsset.sizeBytes` is Prisma `Int`/SQL `INTEGER` →
`GET /uploads/constraints` → Web MiB formatter. UploadSession total byte fields
are already BigInt; the active FileAsset completion path is not.

## Pattern comparison

The older Project Required Document uploader persists the UploadSession ID,
queries the server-confirmed offset, validates file identity before resume,
surfaces mapped errors, and supports abort/forget. The newer shared Stage 1
queue supports independent multi-file AbortControllers and confirmed chunk
progress, but always initializes again, hides failures behind a generic catch,
has no initializing/finalizing/retrying states, and is rendered in two places.

## Cutover classification

| Area                                                            | Classification       | Decision                                                                                      |
| --------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| UploadSession, UploadPart, checksum, storage adapter            | KEEP_DOMAIN          | Repair and reuse the existing chunk pipeline.                                                 |
| FileAsset, EntityAttachment, Stage 1 logical documents/versions | KEEP_DOMAIN          | Widen byte storage; preserve records and history.                                             |
| Server upload constraints endpoint                              | ADAPT                | Make it the sole effective 20 GiB source.                                                     |
| Shared Stage 1 multi-file queue                                 | ADAPT                | Add explicit states, resume/error behavior, and one render site.                              |
| Older required-document uploader                                | REUSE                | Reuse its server-offset and file-identity patterns; do not create another uploader.           |
| Existing `POST /projects` service                               | ADAPT                | Keep one create API; add generated code, membership, Stage 1 initialization, and idempotency. |
| `/projects/new`                                                 | ADAPT                | Four visible fields and redirect to the new Project's Stage 1.                                |
| Existing Stage 1 initiation submit handler                      | ADAPT                | Become existing-project edit only.                                                            |
| Legacy Stage 1 child routes                                     | REDIRECT             | Preserve redirects to canonical `?step=` routes.                                              |
| Duplicate lower upload/submitted list                           | DELETE_AFTER_CUTOVER | Removed after focused matrix and queue verification.                                          |
| Row `⋯` menu and English Upload/Xem actions                     | DELETE_AFTER_CUTOVER | Removed; one Vietnamese upload action remains per row.                                        |
| Active 32-bit clamp and 2048 MB presentation                    | DELETE_AFTER_CUTOVER | Removed after the additive BigInt migration and boundary tests passed.                        |
| Stage 2–5 behavior                                              | REUSE                | Outside this P0 change.                                                                       |

## Data safety

No Project, UploadSession, FileAsset, attachment, version, Activity, Audit, or
migration history is deleted. Schema changes are additive and applied through
`prisma migrate deploy`; shared data is never reset.

## Verified P0 cutover

- The stale default Galaxy Web/API runtime was replaced with the verified
  source; `/health` now responds on Web port 3000 and API port 3001.
- The server validates and exposes `21,474,836,480` bytes; exactly 20 GiB is
  accepted, 20 GiB + 1 byte is rejected, and the Web derives `20 GB` from the
  server response. Parts remain 64 MiB, so the browser never sends a 20 GiB
  request.
- `FileAsset.sizeBytes` is now `BIGINT`. UploadSession, FileAsset, Project
  attachment/version, Activity, and Audit remain the reused domain pipeline.
- The queue has explicit initialization, upload, retry, finalization, complete,
  failed, and aborted states with server-confirmed byte progress. Finalized
  bytes survive a linkage retry without retransmission.
- `/projects/new` creates an idempotent new Project, initial membership, five
  Stage 1 steps, and the exact five initial definitions, then replaces the URL
  with `/projects/:newProjectId/stage-1?step=1`. Existing Stage 1 uses the
  separate authorized PATCH command.
- The Stage 1 matrix has exactly five visible columns, one row action, files in
  the attachment column, multiple attachments per row, one native management
  dialog, exact Vietnamese Step labels, and no row overflow menu or duplicate
  file list.
- Fresh verification: API 48 files / 730 tests, Web 27 files / 372 tests, Edge
  4 tests, focused Stage 1 Playwright 10 tests, and the full configured Project
  Playwright baseline 19 tests across four viewports passed. Production
  API/Web/Edge builds passed. Prisma reports 57 migrations current. Fourteen
  ignored screenshots were opened and inspected.
- A real 64 MiB + 1 KiB browser upload used multiple part requests, showed
  confirmed progress above zero, finalized, linked, and survived reload. A
  real 20 GiB transfer was not run: `FULL_20_GIB_TRANSFER_NOT_VERIFIED`.
- Known repository-wide checks outside this P0 remain unchanged: the inactive
  document-ai placeholder's single health test hangs, and full Prettier checks
  preserved historical `.superpowers` evidence/old plan files. P0-touched files
  and `git diff --check` are clean.

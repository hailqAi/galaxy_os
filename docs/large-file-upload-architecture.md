# Large-file upload

The canonical per-file limit is 20 GiB
(`UPLOAD_MAX_FILE_BYTES=21474836480`). The development adapter streams 64 MiB
parts to `LOCAL_UPLOAD_PATH`; it does not buffer the object in NestJS or store
bytes in PostgreSQL. The Web proxy forwards request streams without converting
them to an in-memory `ArrayBuffer`.

`POST /uploads/initiate` validates permission, extension, and size. `POST /uploads/:id/parts` streams and SHA-256-checks one part. `GET /uploads/:id` supports browser restart recovery. `POST /complete` streams the ordered parts into the object and verifies its SHA-256; repeated completion is safe. Abort deletes temporary parts and refresh renews an active session. Part size grows automatically to remain below 10,000 provider parts.

Boundary tests accept exactly 20 GiB and reject 20 GiB plus one byte without
creating either file. A real browser transfer larger than one 64 MiB part is
the minimum end-to-end large-file acceptance case. A full 20 GiB transfer must
be reported separately and requires enough temporary and final storage
headroom.

The local adapter currently retains parts, assembles a complete temporary
object, validates it, and publishes a final copy. Configure the staging volume
for at least `ceil(2 * UPLOAD_GLOBAL_QUOTA_BYTES / 3)` so unreleased parts and
assembled copies left across restarts remain within provisioned capacity.
`FILE_STORAGE_PATH` and `LOCAL_UPLOAD_PATH` must be real directories owned by
the API operating-system account, not symlinks. Startup validates ownership and
remediates those roots and the staging root to `0700`; storage/session
directories are `0700`, and pending, part, complete, and final files are `0600`.
The service changes only configured or actively used paths and never recursively
changes ownership or deletes data while applying these modes.
DOCX/XLSX validation accepts bounded, single-disk ZIP64 metadata and rejects
unsafe or oversized containers.
Admission now charges physical bytes, unreleased staging, retained soft-deleted
files, metadata rows, reservations, and legacy unmeasured documents. Scheduled
cleanup expires abandoned sessions, preserves UploadSession history, retires
only unreferenced temporary FileAssets, and removes final bytes before releasing
their quota. Production still requires an S3-compatible adapter, short-lived
presigned URLs, and malware scanning; the LOCAL adapter remains development-only.

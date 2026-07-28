# Large-file upload

The default limit is 10 GiB (`MAX_OBJECT_SIZE_BYTES=10737418240`). The development adapter streams 64 MiB parts to `LOCAL_UPLOAD_PATH`; it does not buffer the object in NestJS or store bytes in PostgreSQL.

`POST /uploads/initiate` validates permission, extension, and size. `POST /uploads/:id/parts` streams and SHA-256-checks one part. `GET /uploads/:id` supports browser restart recovery. `POST /complete` streams the ordered parts into the object and verifies its SHA-256; repeated completion is safe. Abort deletes temporary parts and refresh renews an active session. Part size grows automatically to remain below 10,000 provider parts.

Production still requires an S3-compatible adapter, short-lived presigned URLs, malware scanning, quota accounting, and scheduled abandoned-upload cleanup. The automated 5.1 GiB test models the size without creating a large file.

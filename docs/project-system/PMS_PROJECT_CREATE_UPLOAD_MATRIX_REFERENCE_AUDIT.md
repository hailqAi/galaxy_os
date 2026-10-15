# PMS Project create, upload, and matrix reference audit

Date: 2026-08-14  
Reference: authorized temporary read-only browser inspection  
Artifacts: `.artifacts/pms-reference/p0-create-upload-matrix/`

## Inspection result

The temporary session authenticated successfully, inspected the Project selector
and Stage 1, captured `01-home.png` and `02-stage-one.png`, then closed the
browser session. No credential, cookie, token, or login screenshot was stored.

The reference Project selector lists the Projects available to the user. It did
not expose a distinct “new Project” item in the observed session, so the approved
Galaxy requirement for `/projects/new` governs create behavior.

The reference Stage 1 uses a pale blue page canvas, compact white cards, dark
navy primary actions, a wide left content column, and a narrower dark routing
card. Its hierarchy is:

1. Stage title and Project identity.
2. Four-field Project initiation card.
3. Initial five-row legal-document matrix.
4. Five numbered workflow cards.
5. One upload area and one submitted-file area.

## Matrix observations

The reference matrix is compact and has five visible business columns: document
name, workflow step, submission status, file, and action. It shows one Upload
button per row, no row-level overflow menu, and no duplicate filenames in a
second matrix column. Empty rows are visually quiet and do not dominate the
page.

The five workflow stages are intake/assignment, survey/team setup, proposal or
economic-technical report preparation, funding/capital planning, and Project
approval. Galaxy keeps the approved Vietnamese wording from the current P0
specification instead of copying raw reference codes.

## Galaxy adaptation

- `/projects/new` is the dedicated four-field create route.
- Successful creation redirects to the new Project's Stage 1, Step 1.
- Existing Stage 1 displays saved information and uses a separate edit command.
- The matrix has exactly five columns and one action per row.
- Files render directly in `TỆP ĐÍNH KÈM`; multiple files use compact chips plus
  an overflow count drawer.
- `QUẢN LÝ LOẠI HỒ SƠ` is the single matrix-level customization action.
- Upload remains the existing authorized resumable UploadSession/FileAsset
  pipeline and shows the effective server limit as 20 GB.
- Missing files remain optional and never block workflow navigation or
  completion.

## Visual acceptance criteria derived from the reference

- compact white cards on a pale canvas;
- strong navy primary buttons and restrained secondary actions;
- one clear table on desktop, one compact representation on mobile;
- consistent card spacing and readable table density;
- no raw enum values, storage paths, checksums, or developer workflow codes;
- no duplicate upload or submitted-file sections for the same matrix data.

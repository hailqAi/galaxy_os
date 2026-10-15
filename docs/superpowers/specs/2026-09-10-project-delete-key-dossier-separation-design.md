# Project Delete and Key Dossier Separation Design

**Status:** Approved by the user prompt on 2026-09-10. No additional approval gate is required.

## Boundary

Keep the current `ProjectRequiredDocument`, `ProjectStageOneDocument`,
`UploadSession`, `FileAsset`, storage, viewer, and audit infrastructure.
`ProjectRequiredDocument.initialMatrix = true` remains the persisted Key Dossier
item discriminator; `false` remains a Workflow document definition.

Add one independent `KeyDossierReferenceMilestone` catalogue. Key Dossier items
refer to it through `referenceMilestoneId`; Workflow keeps its five Step keys.
New Key Dossier targets do not send a Workflow Step. Existing Matrix Step values
are backfilled into independent snapshot milestones without changing Workflow.
Unclassified items remain valid.

## Upload and reads

The server derives a Matrix target from the persisted Key Dossier item and
rejects context drift. Workflow continues to require its exact Step. Upload
sessions remain actor/organization/Project/logical-target bound and are checked
again before file materialization and linkage.

The Stage 1 response exposes separate Key Dossier and Workflow collections.
Web form, selection, error, pending state, queue map, recovery request, and list
rendering are separated by context. Shared transfer code is parameterized only
by the immutable target context.

## Authorization and deletion

Reuse `project.delete` for Projects and `file.delete` for logical attachments.
Add only `project.key_dossier.manage` and
`project.key_dossier.item.delete`. Capabilities are Project-scoped through the
existing permission-source/target policy and are rechecked by every command.

Project deletion records `deletedAt`, `deletedBy`, and `deleteReason` with one
transactional audit. An exact retry is successful without another audit. All
normal Project reads/commands continue through the existing active-Project
policy; upload finalization/submission also locks and rechecks the Project.
Contracts, financial records, inventory, workflow history, attachments, and
physical files are untouched.

Key Dossier item deletion tombstones only the item. Its logical attachments are
hidden through the parent and become invalid upload targets; Workflow is
unchanged. Attachment deletion supersedes only the selected logical attachment
and preserves the item, versions, shared FileAsset, and storage bytes.

Deleting a milestone atomically moves affected items to another active
milestone or to unclassified, then tombstones the milestone. The response shows
only the affected count visible to the authorized actor; audit retains the
complete command result.

## UI and verification

One shared Project delete component is mounted in the Project dashboard and
shared Project header. It requires exact project code plus a non-empty reason,
stays open on server errors, and redirects only after confirmed deletion.

Use focused Vitest/API integration tests, existing Playwright Project fixtures,
and Chrome DevTools against a run-specific TEST Project. Never delete a customer
Project. Run Prisma validation/status, affected lint/typecheck/tests, Project
regression, production Web build, diff checks, then correctness, security,
authorization, UX, and Ponytail reviews with fresh verification after fixes.

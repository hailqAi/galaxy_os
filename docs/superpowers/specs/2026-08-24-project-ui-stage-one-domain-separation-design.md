# Project UI Reference Match and Stage 1 Domain Separation Design

**Status:** Approved by the user prompt on 2026-08-24. No additional product decision is required.

## Browser baseline

- PMS reference: 288 px sidebar, 79 px top bar, about 1,184 px content, 12–16 px card radius, 28 px stage controls, 59 px Matrix rows, and 30–36 px actions. Its hierarchy and density are references; its construction/legal content, heavy hero shadow, raw enums, tiny type, and mobile viewport defect are not.
- Galaxy local: 272 px sidebar, 76 px top bar, 1,200 px desktop content. Project rows reach about 105 px, Matrix rows about 217 px, Workflow cards about 110 px, the Workflow form is always open, finance KPIs overflow, and the mobile shell places the full navigation before Project content.
- Reproduced domain defect: a Workflow queue in a non-terminal state disables every Matrix upload action because Matrix scans every queue, regardless of context.
- Reproduced empty-Matrix state: a Project with zero active Matrix definitions and 24 active Workflow definitions renders the Workflow upload scope, but exposes no `THÊM HỒ SƠ` action because the upload form is permanently mounted.
- Legacy-data defect: the additive `20260824010000_repair_stage_one_document_contexts` migration is pending, so several existing Projects still lack Workflow definitions.

## Domain boundary

Keep the existing physical stack:

`UploadSession -> FileAsset -> EntityAttachment -> preview/download/version/audit`

Keep `ProjectRequiredDocument` as the existing persisted definition table. `initialMatrix` remains the authoritative discriminator:

- `true` -> `STAGE_MATRIX_DOCUMENT`
- `false` -> `STAGE_WORKFLOW_STEP_DOCUMENT`

Matrix and Workflow definitions are different persisted rows. A logical `ProjectStageOneDocument` belongs to exactly one definition, and its context is derived from that definition. Upload initiation must provide the exact context and definition; the server rejects a mismatch and never falls back to the other domain. Queue identity retains Project, stage, workstream, definition, context, and target type.

Matrix list composition only accepts Matrix-context documents. Workflow Step lists only accept Workflow-context documents for that Step. Queue blocking and invalidation operate only on the selected logical context.

## Deletion

Reuse the existing explicit `file.delete` permission. Add a Stage 1 logical-document delete command rather than deleting `FileAsset` through the generic file endpoint.

The command must:

- require an active authenticated actor, Project-scoped `file.delete`, organization ownership, exact Project/document ownership, and exact `contextType`;
- apply finance visibility/manage policy where relevant;
- mark the logical document `SUPERSEDED`, preserve versions, FileAsset, EntityAttachment, and storage bytes;
- write Activity and Audit entries with actor, Project, context, logical document, and FileAsset metadata;
- return 404 for cross-Project or cross-context targets and 403 for a missing explicit permission.

The read model exposes `canDeleteProjectDocuments`. The UI omits Delete when false and uses one compact native confirmation dialog when true.

## Project UI

- One existing `ProjectStageHeader` remains the sole header for GĐ1–GĐ5.
- Shared canvas `#F5F7FB`; content maximum 1,280 px; cards radius 12–14 px, subtle shadow, 16–20 px section gaps; body 13–14 px; controls 34–38 px; desktop table rows 48–56 px.
- Stage accents: GĐ1 blue `#2563EB`, GĐ2 indigo `#4F46E5`, GĐ3 amber `#D97706`, GĐ4 emerald `#059669`, GĐ5 teal `#0F766E`. Primary system actions stay Galaxy blue.
- Stage 1 Matrix title becomes `HỒ SƠ CHỦ CHỐT CỦA DỰ ÁN`; Workflow becomes a compact five-card strip. Step upload is closed initially and opens from `THÊM HỒ SƠ`.
- Matrix and Workflow attachment actions are only `XEM`, `TẢI XUỐNG`, `XÓA`. No detail/history page or action is presented in the normal file list.
- Dashboard uses a compact `TỔNG QUAN DỰ ÁN` hero, permission-filtered KPIs, a truthful progress bar, dense horizontally controlled table, and `MỞ DỰ ÁN` action.
- Downstream labels are shortened to the approved Galaxy terms. Empty cards shrink to their content.
- Mobile keeps one DOM tree: compact shell, horizontally scrollable stage switch/tabs, full-width Project selector, controlled table overflow, and reachable file actions.

## Acceptance

Run focused unit/integration tests first, then API/Web typecheck, lint, Prisma checks/status, Project regressions, Playwright flows, and production Web build. Review the real browser at 1536x864, 1440x900, 1280x800, and 390x844 with Chrome DevTools MCP, including screenshots, DOM/computed dimensions, Console, Network, preview/download/delete, and Matrix/Workflow uploads in both orders.

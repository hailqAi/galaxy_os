# E04 R37 Goal-driven XLSX Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Owner chose inline execution and approved functional changes/current UI. Apply the addendum at the tested checkpoint; no parallel implementer.

**Spec/approval:** Owner's current E04 addendum, T01–T14. It supplements the approved E03/E04 plans and prioritizes answer 5cecbe18-b907-4c93-9066-911314992718. No new architecture or engine adoption gate.

**Goal:** Correct original request and selected source lead to a verified downloadable XLSX, with bounded necessary reads and truthful source/coverage evidence.

**Architecture:** Add a small versioned task contract to existing run/request metadata. Reuse existing extraction, reader sandbox, Create/Draft/Artifact, durable worker/checkpoints and source ACL. Batch preparation stays inside the executor; model receives pertinent values and can choose tools or finish. No model consciousness/understanding certification gate.

**Tech stack:** Existing strict TypeScript/Zod/Nest/Prisma/Next/ExcelJS/Poppler sandbox. No new server, dependency, migration or parallel orchestrator.

**Constraints:** Preserve source, original/hash/version, SIWC model/effort, P1-B, Create and business data. Workspace/paused providers OFF. No Git commit/push/reset, data deletion, blind fixture-name filter or external private egress. Successful tool results and saved artifacts survive continuation. No default total-time cutoff under the owner's preceding instruction; if a finite budget is explicitly selected, it is a cap, never a target. Per-tool timeouts, Stop, quotas and bounded retries remain; no infinite provider spend or silent deadline extension.

**Review focus:** Empty Create preset loses primary source; unrelated authorized files contaminate conversion; cached extraction belongs to changed/revoked source; repeated reads consume all work; a saved workbook disappears when final inference fails.

### Task 1 — Preserve request/output/source and prove the thirteen-call cause

- [ ] Read source, original stored message, pin/sent input/tool set/continuation, current extraction and fixture provenance. Save a private source/version timeline; missing timestamps remain UNKNOWN.
- [ ] RED: Create preserves original question and explicit format; selected PDF is primary; empty Create reuses only an unambiguous active attachment or asks for the missing source, never lists the Project blindly. Draft/retry/reload preserve the same contract.
- [ ] For the exact legacy deadline run, accept one explicit selected-source/output clarification only at a safe READY checkpoint without artifacts or pending writes. Archive prior task evidence, retain the original message/model/effort/shared quotas and retry identity; fresh source ACL/version checks apply. Never replay an uncertain write.
- [ ] Implement validated output/task metadata through UI, draft, DTO, request pin and run. Contract keeps original answer/message ID/revision, task type, outputs, primary versions, constraints, missing information and completion criteria. Permissions never expand from task metadata.

### Task 2 — Read the right amount and transition to artifact

- [ ] RED: conversion reuses matching full extraction in one backend batch; lookup reads its relevant range; unrelated files and verified acceptance fixtures stay out of default conversion. Changed/revoked content invalidates cache.
- [ ] Reuse stored extraction with page/range provenance. If incomplete, process missing pages/ranges inside the existing bounded reader/executor. Preserve cells, currency, units, missing values and required coverage; do not OCR every parser or make the model issue ten page calls.
- [ ] Pick the existing tool subset for the task, retaining creation/verification. Reuse successful same-version read results after fresh ACL checks; detect repeated no-progress requests and expose the remaining action/missing information.
- [ ] Use the existing artifact executor for workbook generation/reopen/verification/save/attach. Once data is sufficient, create a checked draft before optional research/review. Preserve partial verified work and idempotency on timeout/restart.

### Task 3 — Deliver and verify

- [ ] RED: discovered-only and duplicate source entries do not become answer citations; source/detail grouping preserves required web attribution and precise locators.
- [ ] Test T01–T14 with mocks/unit/integration/browser/process/provider/artifact evidence separated. Independently compare actual source rows, missing cells, units, currency, totals, hash and downloaded XLSX after reload.
- [ ] Measure queue/model/tool/parser/render/verify/persist time where trace provides evidence, unique reads, duplicates and first valid artifact. Do not optimize by dropping required data or changing model/effort.
- [ ] Fresh full checks, Ponytail/correctness/security/ACL/UX review, exact source freeze, backup and app-only release. Continue the exact owner run safely; do not claim completion until its actual XLSX is delivered and validated.
- [ ] Checkpoint each tested slice in /home/galaxy_os/prompt. Memory/team remains approved and deferred behind this fix, not discarded.

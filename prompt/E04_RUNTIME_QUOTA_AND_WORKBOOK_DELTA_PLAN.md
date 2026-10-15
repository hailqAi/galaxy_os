# E04 Runtime quota and workbook verification delta plan

> **For agentic workers:** Use superpowers:executing-plans. Codex CLI inline remains selected; no parallel implementer.

**Goal:** A saved workbook can be inspected and delivered without the obsolete Galaxy ten-provider/forty-tool total ceiling.

**Architecture:** Reuse ChatAiAnswer, its proof-bound checkpoint, existing source readers and private ChatRoom audit journal. Keep a bounded recent execution window in checkpoints, with cumulative counters and idempotent durable execution receipts. Stop repeated identical operations that do not change the source/dataset/artifact state. No new queue, model, migration or dependency.

**Tech stack:** Existing NestJS, Prisma, Zod and workbook sandbox.

**Spec and authorization:** Latest Joe Nguyen Owner addendum supersedes thirty-minute, ten-GB and total-call caps; E03/E04 functional designs and inline plans remain approved. This delta addresses the actual R38 TOOL_ROUND_LIMIT after a valid saved workbook. Astra, Owner rights, upload limits and pause/backoff remain separate required slices and must not be claimed implemented here.

**Constraints:** Preserve original question, selected source/version, saved artifact, SIWC/model/effort, P1-B, current ACL and dirty tree. Workspace/key providers remain OFF. Keep per-operation time/resource/context limits, Stop and bounded recovery. No commit/reset/database reset or replay of an uncertain write.

**Review focus:** Wrong XLSX MIME/name, revoked or changed output, repeat calls after restart, duplicate journal writes, lost saved artifacts after a final inference error.

### Task 1 — Read persisted XLSX using its actual reader

Files: project-ai.service.ts, ai-tools.ts, p1-project-ai.integration.test.ts.

- [x] RED: extend existing own-workbook execution test to read_project_source; require a real XLSX manifest result and the existing missing-receipt/revoke download negatives.
- [x] Route a text read of a verified XLSX to the existing manifest sandbox; report sheet/range capabilities accurately. No extraction of binary as text, fake full coverage or external URL.
- [ ] Run the focused real G00 test, relevant unit/type/lint/format checks.

### Task 2 — Durable progress without arbitrary total-call ceilings

Files: ai-run.ts/test, project-ai.service.ts, ai-chatgpt-service.test.ts, real G00 integration cases.

- [ ] RED: more than ten model rounds and forty distinct successful tools complete; receipts remain durable and bounded in the current checkpoint; restart keeps model/effort and does not replay writes.
- [ ] Remove total ceilings from loop, schema, prompt and recovery together. Archive private provider/tool receipts idempotently through the existing scoped audit table before compacting recent arrays.
- [ ] RED/GREEN: identical normalized arguments/source-version/result repeated without progress cause a useful loop error or transition; changing version, a failed read or a targeted fallback remains allowed. Keep fresh ACL before any cached result.
- [ ] Preserve a committed workbook through failure/recovery and finish the exact run from a safe checkpoint without a new message or duplicate file.

### Task 3 — Verify and release

- [ ] Fresh full checks, browser/reload/Stop, actual process recovery, source and Ponytail review; preserve rejected attempts.
- [ ] Back up main and wait for the zero-writer fence; app-only release with exact source/test/build identity and rollback.
- [ ] Recheck the actual Owner run, XLSX hash/download/reload and all80 source rows. Record provider telemetry separately; explicitly retain image-only coverage limitations.

The actual R38 workbook already validates as a text-table draft; this plan does not reinterpret its FAILED run as a successful run, or claim that its embedded pictures were converted.

Checkpoint CP79: task1 RED/GREEN; task2 unit176 and real G00 five focused cases PASS, strict API typecheck0. Full/release gates and actual same-answer continuation remain pending. Earlier failing receipts are retained. No commit or production mutation.

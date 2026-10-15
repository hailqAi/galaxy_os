# E04 R37 Completion without total deadline Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Codex CLI inline remains owner-selected.

**Goal:** Durable Galaxy runs finish their task without the old five/thirty minute cutoff; a deadline-interrupted run can continue from its committed checkpoint without duplicating the question.

**Spec/approval:** The owner's latest instruction explicitly removes total processing time limits and keeps functional implementation approved. It supersedes the E03/E04 1800-second workflow policy. Existing UI is approved; no repeated design or execution-method gate.

**Architecture:** Reuse ChatAiAnswer/worker/lease/checkpoint and the existing run endpoint. New workflows store deadlineAt=null. Preserve legacy finite-deadline records and their honest PARTIAL status. Explicit continuation uses the same answer and proof-bound READY/FINAL checkpoint, current owner/Project/source/provider authorization, model, effort and successful tool results. Do not automatically replay uncertain writes.

**Tech stack:** Existing NestJS/Prisma/Zod/Next; no dependency, queue, table or migration.

**Global constraints:** Preserve source dirty changes, original/hash, SIWC, P1-B, Create, business data and Project isolation. Workspace and paused providers remain OFF. No paid service, commit, push, reset or schema reset. Remove overall timeout only; per-tool/request timeouts, Stop, retry bounds, context guard and resource quotas remain. No speed/accuracy claim without evidence.

**Review focus:** A queued run older than thirty minutes still executes; shutdown does not create duplicates; Stop remains effective; legacy unsafe checkpoint cannot resume; revoked/private sources cannot resume or leak across Projects.

### Task 1 — No total deadline

Files: apps/api/src/project-chat/ai-run.ts, project-ai.service.ts, ai-run.test.ts, ai-chatgpt-service.test.ts; apps/web/features/project-chat/project-ai.tsx; apps/web/tests/browser/p1-project-ai.spec.ts.

- [ ] RED: queued NORMAL/DEEP deadline is null; advance clock past thirty minutes and complete a real tool continuation; legacy finite deadline still gives honest PARTIAL; malformed persisted state rejected.
- [ ] Store nullable deadline; guard expiry/lease/abort paths against null. Remove the thirty minute UI label. Preserve request timeout and cancellation.
- [ ] Run focused unit/service/browser checks, full regression and source review.

### Task 2 — Explicit continuation of interrupted work

Files: same existing service, UI and focused tests; reuse POST answers/:id/run.

- [ ] RED: deadline-PARTIAL with valid READY/FINAL proof continues under same ID/model/effort without repeated tool or message; repeated enqueue idempotent; unsafe checkpoint/other terminal/revoked source rejected.
- [ ] Freshly validate source scope, saved proof and connection; CAS requeue the same run without total deadline. Keep successful results/artifacts. Expose a continuation button only for eligible deadline-PARTIAL.
- [ ] Browser reload/Stop, actual-process restart and actual owner thirteen-tool Excel run acceptance. Output must be a verified downloadable XLSX; text alone is incomplete.

### Task 3 — Verify and release

- [ ] Preserve R36 snapshot before edits and checkpoint each tested slice under /home/galaxy_os/prompt.
- [ ] Freeze exact source; fresh lint/typecheck/tests/build/format and browser/process checks; independent Ponytail/correctness review.
- [ ] Back up main DB/storage, check active jobs, cut over app artifacts only, validate readiness and actual owner continuation/reload/download. No legacy PARTIAL record silently rewritten.
- [ ] Record root cause, source/tree/artifact, provider/tool evidence and remaining E03/E04 items. R4 approved work remains pending until this functional fix is released.

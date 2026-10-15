# E04 R4B Agent roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Owner chose Codex CLI inline; no implementer subagent or execution-method question.

**Spec:** /home/galaxy_os/prompt/E04_MEMORY_TEAM_DELTA_DESIGN.md — OWNER_APPROVED 2026-10-12.

**Plan approval:** Owner replied “Tập chung chức năng. thiết kế giao diện có sao cứ dùng vậy. tôi sẽ thiết kế lại sau” to the two-plan review in this session. Proceed inline after R1, using the current UI; no further execution-method/design question.

**Global constraints:** R1 release/real PDF first; preserve canonical dirty source and source freeze during release gates. Same SIWC/model/effort; Workspace/paused keys OFF; no paid service. No commit/tag/push/PR/reset/clean/stash or applied migration edits. Reuse P1-B/ChatAiAnswer/registry/File/Draft/Artifact. Fresh backend ACL, no private web egress or model-generated host shell. Keep durable RED/GREEN/review/verification/checkpoint after each slice.

**Goal:** Complex work can use specialist roles with real tool execution, shared permissions/budget and evidence-based verification; simple chat remains single-agent.

**Architecture:** Local delegation within existing ChatAiAnswer worker. Parent lead and child roles use the same model/effort/connection, existing executor/idempotency/source ledgers and run checkpoint; no SIWC multi_agent field or new queue.

**Tech Stack:** Existing NestJS orchestrator/Zod/tools/Prisma, SIWC respond adapter and deterministic Office/reader validators. No new provider/dependency.

## Review focus

Parent cancel/revoke during child write; hidden child budget multiplication; public role receives private context; partial child falsely claims full coverage; verifier degrades correct answer or duplicate artifact on replay. Tasks1–3 test these explicit failure modes.

### Task1 — Strict task and output contracts

Files: apps/api/src/project-chat/ai-run.ts, ai-tools.ts, ai-registry.ts; tests ai-run.test.ts, ai-tools.test.ts, ai-registry.test.ts.

Interfaces: roleTaskSchema holds taskId/parentRunId/organizationId/projectId/actorId/conversationId/sourcePins/model/effort/toolNames/deadline/status/output. RoleName = DOCUMENT_ANALYST|DATA_ARTIFACT|VERIFIER|MEMORY_CURATOR; parent is LEAD. Web continues research_public_sources enum query contract. SpecialistOutput = facts/locators/coverage/assumptions/unresolved/artifactRefs, strict JSON,32KB max; proposals use R4A contract.

- [ ] RED: forbidden actor/Project/path/SQL/permissions in delegate arguments, child delegation depth>1, wrong model/effort and forged source/coverage/artifact refs reject; schema over32KB rejects.
- [ ] Run focused helper tests, retain failures.
- [ ] Add strict local delegate_project_task schema and role allowlists; backend creates scope/task pins. Keep provider schema compatible, no unsupported route fields.
- [ ] GREEN helper/registry tests; update model-visible descriptions by role only, not entire external SKILL/README text.
- [ ] Durable checkpoint; no installed-only capability advertised READY.

### Task2 — Execute child roles with existing run fences

Files: apps/api/src/project-chat/project-ai.service.ts and only a focused ai-role-task helper if needed to reuse current closure/executor state; tests test/p1-project-ai.integration.test.ts and ai-chatgpt-service.test.ts.

Interfaces: executeRoleTask(task: RoleTask, current authorized run execution context) returns validated SpecialistOutput. Shared providerRounds/toolExecutions remain parent ledgers; max10 requests/40 tool calls. Latest owner addendum/R37 supersedes the old default1800s total: deadline is nullable, no total wall-time deadline by default; an explicitly selected finite budget or legacy finite deadline is honored. Per-tool timeout, Stop, heartbeat, lease, quota and bounded recovery remain. Child follows parent AbortSignal and claim fence, depth1, initial concurrency1.

- [ ] RED: model calls delegation, child model really calls allowed executor, matched callID returns output to child then lead; backend rejects uninstalled/disallowed tool; missing output/artifact/coverage is unresolved rather than success.
- [ ] Run G00 `-t 'E04 role task'`, retain failures.
- [ ] Reuse respond/sourceTool/projectReadTool/document executor and current checkpoint leases/idempotency. Child JSON plain text is parsed strictly, no unsupported response-format field; one bounded repair within shared budget if needed.
- [ ] Restrict Web role to existing public query pack/phase; never pass private original question/history/memory/file or token. Use same ACL at every child tool boundary.
- [ ] Preserve pending child state/receipt at each tool boundary, no replay of completed writes. Parent Stop/deadline/revoke stops child, saved FINAL is retained and no duplicated artifact/message.
- [ ] GREEN restart/cancel/revoke/model/effort/payload-sentinel/shared-budget integration tests; real child execution counts/returned model/effort ledger, UNKNOWN when not observed.
- [ ] Durable checkpoint before next role changes.

### Task3 — Verifier, selection and single-vs-team benchmark

Files: existing project-ai.service.ts/artifact validators and UI project-ai-surfaces.tsx; tests existing API/Web/browser specs; prompt/E04_EVAL_MANIFEST.json and private runtime benchmark receipts.

Interfaces: verifier output contains issue code/severity/locator/evidence and proposed correction. Backend compares source amounts/formula caches/coverage/file bytes/layout receipts before lead accepts correction. UI only shows real reading/research/checking phase and finished prose/artifact cards.

- [ ] RED: deliberately wrong numeric line or missing artifact is caught with locator; correct total is not rewritten incorrectly; simple no-file question has zero delegation; private public-query sentinel does not leave server; output JSON/trace is hidden.
- [ ] Run G00 role verifier/simple-chat and Web rendering tests.
- [ ] Apply validated issues through existing revise_draft/source version flow, retain originals and revisions. No reviewer business approval or weak-model rewrite.
- [ ] GREEN browser/model-tool/output-download/after-reload cases and parent cancellation cases.
- [ ] Benchmark same task/model/effort/source with single+tools and team; record accuracy/completeness/source coverage/artifacts/time/usage/RAM/CPU. Start sequential1; enable at most2 independent reading tasks only when measured resource and quality benefit are shown. No forced extra30min.
- [ ] Expose delegation only for benchmark-proven complex task profiles; simple chat remains single+tools. If a profile does not benefit, keep it single and record that benchmark result honestly.
- [ ] Fresh full checks, independent complete-diff review, frozen release and browser/provider live; update A01–A36/B01–B26, memory/tool matrix/checkpoint/STATUS. No whole E04 completion while exact quotation/files or required scope remains open.

## Execution

After R1 checkpoint and plan review, execute inline. R4A proposal contract is the only dependency; document/data/verifier child work otherwise uses current tools. Self-review covers approved sectionB, all five risk classes, exact limits and route restrictions. No new server/model/framework or model-generated shell.

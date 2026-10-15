# E04 R4A Memory correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Owner chose Codex CLI inline; no implementer subagent or execution-method question.

**Spec:** /home/galaxy_os/prompt/E04_MEMORY_TEAM_DELTA_DESIGN.md — OWNER_APPROVED 2026-10-12.

**Plan approval:** Owner replied “Tập chung chức năng. thiết kế giao diện có sao cứ dùng vậy. tôi sẽ thiết kế lại sau” to the two-plan review in this session. Proceed inline after R1, using the current UI; no further execution-method/design question.

**Global constraints:** R1 release/real PDF first; preserve canonical dirty source and source freeze during release gates. Same SIWC/model/effort; Workspace/paused keys OFF; no paid service. No commit/tag/push/PR/reset/clean/stash or applied migration edits. Reuse P1-B/ChatAiAnswer/registry/File/Draft/Artifact. Fresh backend ACL, no private web egress or model-generated host shell. Keep durable RED/GREEN/review/verification/checkpoint after each slice.

**Goal:** Correction can cite the original failed/PARTIAL question and become a reviewed private P1-B candidate without changing business decisions.

**Architecture:** Extend the existing AI_ANSWER locator with QUESTION, keeping the completed-answer selector unchanged. Persist model proposals in the current run result/checkpoint and save accepted proposals through the existing memoryCreate/idempotency flow.

**Tech Stack:** NestJS/Prisma/PostgreSQL, strict TypeScript/Zod, Next/React and existing P1-B services. No new dependency/table/migration.

## Review focus

Failed source later revoked must disappear; QUESTION never validates AI answer; malformed selector cannot access another actor; retry cannot duplicate note; unverified proposal cannot replace shared confirmed decision. Tasks1–3 each pin the relevant cases.

### Task1 — Source proof for the original question

Files: apps/api/src/project-chat/project-chat.dto.ts, project-ai-memory.service.ts, project-ai.service.ts; tests project-ai-memory.service.test.ts and test/p1-project-memory.integration.test.ts.

Interface: questionMemorySource(answer: Pick<ChatAiAnswer, 'id'|'question'|'ownerId'|'organizationId'|'projectId'|'conversationId'|'createdAt'>): MemorySourceRef returns AI_ANSWER, locator {part:'QUESTION'}, immutable-question digest. Existing ref with empty locator remains completed-answer evidence.

- [ ] RED: private correction source from FAILED/PARTIAL answer works, wrong actor/Project/stale version/revoked authority is404 or MEMORY_SOURCE_CHANGED; empty locator on failed answer remains404; QUESTION is not SOURCE_CONFIRMED.
- [ ] Run G00 `pnpm --filter @galaxy/api exec vitest run --no-file-parallelism --poolOptions.forks.singleFork test/p1-project-memory.integration.test.ts -t 'E04 question source'`; retain assertion failure.
- [ ] Extend strict source selector for AI_ANSWER only; resolve QUESTION through current ownedAnswer/view/fresh authority, terminal status and question digest. Use existing dependency/audit/visibility/version rules. Do not grant file/answer approval through question proof.
- [ ] Expose questionMemorySource on an authorized terminal answer view, distinct from current completed-answer memorySource. Run new targeted tests and existing P1-B source/revoke/decision tests GREEN.
- [ ] Durable snapshot/diff/checkpoint; preserve applied migration checksums.

### Task2 — Private proposal result contract

Files: apps/api/src/project-chat/ai-tools.ts, ai-run.ts, project-ai.service.ts; tests ai-tools.test.ts, ai-run.test.ts and test/p1-project-ai.integration.test.ts.

Interfaces: memoryProposalSchema = {content,category,sourceRefs,reason,expectedResult}; max5 proposals, content8000, refs20, strict properties. propose_project_memory returns proposalId tied to run/actor/Project; model supplies no actor/visibility/approval or DB path.

- [ ] RED: proposal is persisted through checkpoint/reload, no memory head created before user save, wrong source/ref or confirmed/shared write fails, proposal retry is idempotent, revoked source suppresses proposal on view.
- [ ] Run G00 integration test named `E04 memory proposal`, expect failure before implementation.
- [ ] Use existing source proof helpers/allowlist and run checkpoint; server supplies private/UNVERIFIED status. Validate references against current authorized request/turn source ledger. Keep old decisions and full transcript.
- [ ] Return projection without tool JSON/trace; run bounded malformed/over-limit and old strict tool-schema tests GREEN.
- [ ] Durable checkpoint; no model training/fine-tune claim.

### Task3 — Save candidate through P1-B UI and held-out eval

Files: apps/web/features/project-chat/project-ai-memory.tsx, project-ai.tsx, project-ai-surfaces.tsx; tests project-ai-memory.test.tsx/project-ai.test.tsx, tests/browser/p1-project-ai.spec.ts; existing API memory tests.

Interface: MemoryDraft uses content/category/sources array; update every existing caller from singleton source to source array. Existing completed-answer save stays categoryNOTE. Correction proposal pre-fills category and source refs, private/UNVERIFIED.

- [ ] RED: saved failed-turn question source opens draft; proposal card save retry produces one note, reload preserves version/provenance, another tab/actor cannot see note, user can cancel without losing original chat/file.
- [ ] Run focused web tests, preserve failed assertions.
- [ ] Reuse ProjectAiMemory form/API/command key; no auto shared publish or confirmed decision replacement. Viewer distinguishes source question from validated answer.
- [ ] GREEN web/API and browser acceptance using G00; actual owner read/save/reload uses explicitly supplied synthetic correction only, avoids changing business documents.
- [ ] Run held-out correction task before/after same model/effort/source, compare ground truth and isolation, record results rather than claiming better from self-score.
- [ ] Run full lint/typecheck/test/build/format, independent Ponytail/correctness/security/authorization/UX review, frozen release and fresh browser acceptance. Update E04 matrix/memory/checkpoint/STATUS with actual results.

## Execution

Implementation begins after R1 owner PDF/reload checkpoint and owner plan review. Codex CLI inline remains selected. Self-review: all approved sectionA requirements covered; exact source/status/privacy/idempotency tests assigned; no optional framework or unrelated refactor.

# E02 SIWC tools — Implementation Plan, first usable release

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline in the current Codex CLI session. Steps use checkbox syntax. No per-task implementer agents, no commit/tag/push/PR.

**Goal:** Workspace deferred; catalog/model/effort and real SIWC draft tools yield downloadable XLSX/PDF/DOCX without losing P1 memory or original context.

**Architecture:** Extend current ProjectAiService, SIWC codec/capability service and File/Draft render/storage pipeline. Keep Workspace history/config/schema dormant, fence its dispatch on backend and remove provider controls from chat. Preserve immutable deployed r3 until final source passes all dependent gates.

**Tech Stack:** installed strict TypeScript, NestJS/Next.js, Prisma6.19/PostgreSQL, Zod, ExcelJS/PDFKit/OOXML, Poppler, Vitest/Playwright; no new dependencies for first Office release.

**Spec:** [E02-SPEC-r1](E02_IMPLEMENTATION_DESIGN.md), owner approved directly in this session, SHA256 `77252373d22312013c0533fe91c2ad39c33e1e6bf85889ddf7da9e16885feaea`.
**ID/version/status:** E02-PLAN-r1 / r1 / OWNER_APPROVED — “Duyệt E02-PLAN-r1”; approved sha256 `151e1a278ce0cee34a9233861c3c7a0fcf415e02c157f6778b3965d367c4e819`; 2026-10-10, Asia/Bangkok. Execution method already Codex CLI/native. This plan covers E02-0/1/2 and verification of their dependencies. Subsequent independent E02-3/4/5/6 work uses the approved design direction plus detailed contracts/plans before code, without reopening P1/E01 or Workspace account setup.

## Global Constraints

- Canonical `/home/galaxy_os/.worktrees/m2-a-20260928`, base CODE_SHA `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`; preserve dirty/untracked/staged work. Root remains operational entry.
- No OAuth/callback/refresh changes, provider-key unpause, paid fallback, credits, Gmail or ChatGPT web control.
- Current main `local-651479a7e9ce`, schema90; no destructive migrations/DB reset/rollback/data cleanup. Workspace tables/config/assets remain.
- Workspace state `WORKSPACE_DEFERRED_BY_USER`; an old FEATURE_WORKSPACE_AGENTS=true must not permit external dispatch/poll/retry/fallback.
- Preserve P1 history/private-shared/source proof/ACL and exact question; selected model/effort pinned across tools/retry. Capability evidence stays connection-scoped.
- documentInput v1 remains docx/pdf/xlsx, exact numeric strings/no formulas. No silent formula/financial permissions expansion; DRAFT only. Existing resource bounds remain enforced.
- Only isolated fixture identity `galaxy_os_g00_20260930m3`; no main test DB, shared Docker/network change, down/reset or new provider secrets. Heavy tests/build run serially.
- Browser/provider/artifact validation and source tree identity required before main release. Source/static/unit success alone does not meet E02 acceptance.

## Review Focus

1. Old flag=true and queued Workspace job: no timer, poll/trigger/retry, while read/cancel/history keep current ACL. Task1.
2. SIWC max unsupported or provider silently reports a different effort: no selectable label or fallback; preserve requested/sent/observed distinction. Task2.
3. Several tools plus opaque reasoning and near-budget history: exact call IDs/linked records retained; chosen model/effort unchanged on every round. Task2/3.
4. Repeated document requests after timeout/cancel/revoke: no duplicates or late unauthorized file/answer; download rechecks current rights. Task3.
5. XLSX numeric strings/leading zeros/formula-looking text and PDF image/table layout: independent output read-back, Decimal total and image source identity. Task3.

## Task0 — unblock verification without affecting main

**Files:** existing `scripts/m3-isolated.env.example`, `docker-compose.g00.yml`, `apps/api/scripts/g00-isolated-environment.mjs`; only private `.runtime/e02-20261010/` env/receipt files if an override is necessary. Do not edit the shared example just to fit this host.
**Interfaces:** consumes assertG00Isolation(); produces verified fixture identity and private environment for all subsequent commands.

- [x] Fresh root/canonical Git, runtime/artifact/schema status; dependency map in spec.
- [x] Config isolation check PASS; existing PostgreSQL fixture start fails `/forwards/expose`500 at55435. Windows excluded ranges include55351–55450. No OOM. Redis56382 healthy.
- [ ] Verify selected unused loopback port outside current excluded ranges and occupied listeners. Keep main5432/3000/3001 and Redis56382 unchanged.
- [ ] Rebind only the existing Compose project's stopped PostgreSQL fixture, with the same image/project/service and no down/volume/data-reset command. Inspect tmpfs/data provenance before mutation; if it would destroy preserved data, stop and document. Private override updates G00_POSTGRES_PORT and DATABASE_URL together; assert isolation before connection.
- [ ] Verify PostgreSQL actual current_database/current_user, configured ports and Redis PONG; apply reviewed canonical additive migrations only to the isolated fixture if necessary. No migrate-dev/reset/db-push. Existing public migration history remains immutable.
- [ ] Reuse existing safe Chrome/Playwright path or connect available browser read-only. Missing browser/owner session blocks candidate live gates only; do not fabricate auth or reconfigure SIWC.

## Task1 — E02-0: Workspace deferred without losing Create

**Modify:** `apps/api/src/project-chat/project-ai-workspace.service.ts`, `workspace-connector-auth.ts`; Workspace settings service/UI, `apps/web/features/project-chat/project-ai.tsx` and related settings links only where needed.
**Tests:** existing Workspace service/security tests, `apps/web/features/project-chat/project-ai.test.tsx`, settings tests; `apps/api/test/p1-project-ai.integration.test.ts`.
**Interfaces:** keep existing models/prepareAuto/prepare/retry/tick/history/cancel endpoint shapes and ProjectAiService.ask/runChatGpt. New Workspace operations return409 WORKSPACE_DEFERRED_BY_USER; Workspace models empty, SIWC models unchanged.

- [ ] RED tests: flag=true cannot schedule or dispatch/poll/retry; explicit Workspace ask rejected; AUTO delegates SIWC only; no silent route/model replacement; browser chat never requests Workspace config/catalog. Assert SIWC tools contain create_document/revise_draft and memory tools.
- [ ] Implement minimal backend fences and remove provider route/config controls from chat. Keep local `presentation='workspace'`, shared artifact/file cards, source controls, memory and retained historical job evidence. No deep code/schema deletion.
- [ ] GREEN focused commands: `pnpm --filter @galaxy/api exec vitest run src/project-chat/project-ai-workspace.service.test.ts src/project-chat/workspace-connector-auth.test.ts src/settings/workspace-agent.service.test.ts --no-file-parallelism --poolOptions.forks.singleFork`; Web corresponding tests.
- [ ] Fixture negative-dependency acceptance: no Workspace network invocation while SIWC produces answer/tool result/files and P1 memory works. Check main active Workspace job count read-only before release; do not assume0 from R18.

## Task2 — E02-1: max, catalog evidence and continuation

**Modify:** `apps/api/src/settings/siwc-capabilities.ts`, `apps/web/features/settings/siwc-capabilities.tsx`, `apps/api/src/project-chat/project-chat.dto.ts`, `ai-chatgpt-plan.ts`, `project-ai.service.ts` only for evidence fields/pinned forwarding, corresponding tests. Reuse catalog and connection implementation, do not change OAuth code.
**Interfaces:** same capability-check body `{model,reasoningEfforts,webSearch}` with valid effort max added; chat request reasoning may be max only when current generation/model capability receipt allows it; wire `reasoning.effort='max'`. No alias to xhigh. Metadata records sent model/effort independently from observed null.

- [ ] RED max accepted by capability DTO/wire and forwarded exactly; unsupported model receipt does not make max selectable; provider effort mismatch is MISMATCH, never accepted. UI selection/request/persisted pin/continuation assertions.
- [ ] Implement smallest enum/caller/receipt changes; retain provider rejection and never retry by stripping reasoning. Keep catalog visibility=list and generation invalidation tests; remove any Workspace filtering discovered in Task1.
- [ ] GREEN `ai-chatgpt-plan.test.ts`, `siwc-capabilities.test.ts`, `ai-chatgpt-service.test.ts`, API DTO/pin tests and Web capability/composer tests.
- [ ] Provider live: read actual account catalog; one small allowed completion per selectable model where quota permits, representative high/max deep test. Record requested/sent/observed/accepted/evidence. No max PASS from mocks or public API model docs.

## Task3 — E02-2: existing Office tools produce real files

**Modify only if failing requirement proves necessary:** `ai-tools.ts`, `ai-document.ts`, `project-ai.service.ts` draftTool/execution/metadata, `project-ai.tsx` artifact cards. Existing installed renderers first.
**Tests:** `ai-document.test.ts`, `ai-tools.test.ts`, `ai-chatgpt-service.test.ts`, `test/p1-project-ai.integration.test.ts`, `apps/web/tests/browser/p1-project-ai.spec.ts` or focused Office browser case.
**Interfaces:** create_document/revise_draft v1 → renderDocument → FilesService.upload → answer usage.artifacts → ACL download, current source/version checks and deterministic answer/tool key. No host path returned as artifact.

- [ ] RED fixture: one SIWC question causes multiple tools (calculate/source read/create XLSX/create PDF), matched call_id reinjection and final answer; Workspace trigger/poll mocked fail if called. DOCX separate fixture. Cancel/revoke before commit deny late output; retry does not duplicate.
- [ ] Use synthetic permitted image and versioned price data. Independent workbook and PDF read-back assert code leading zeros, exact amount/quantity/tax/total, Vietnamese text, image bytes/provenance; missing price remains missing, formula-looking text remains inert v1.
- [ ] Reuse/repair existing renderer/adapter only for proven failures, with RED→GREEN. PDF Poppler real read/render; DOCX real render if a verified renderer exists. If missing DOCX preview is an actual gap, evaluate minimal OfficeCLI sandbox by pinned version/license/egress/resource/rollback before integration; do not install full stack.
- [ ] Integration: create/download/reload/hash, foreign Project404, revoked download denied, retained original on revise. Whole current context/history/memory still used under correct ACL. Artifact success requires bytes not a manifest alone.
- [ ] Browser/provider live first request: “Từ bảng giá và ảnh tổng hợp được phép, lập báo giá nháp, xuất Excel và PDF, trả cả hai file trong chat.” Preserve real call traces, requested/sent/observed model/effort, reopen both files and download after reload on exact candidate.

## Task4 — full verification, review and incremental release

**Files:** existing runtime/release scripts, prompt README/memory/matrix/checkpoint/acceptance, root+canonical STATUS/PROJECT_STATUS and handoff. No unrelated source.
**Interfaces:** immutable candidate built from final dirty source snapshot; schema90 compatibility and r3 app rollback; deployed identity and TESTED_TREE separately recorded.

- [ ] Targeted verification then full `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check` under verified isolated env and private PDF tools. Commands serial; inspect each result and record exact blocker instead of reusing2171/1900/2120 history.
- [ ] Invoke requesting-code-review and Ponytail diff review; one independent final reviewer of actual session delta plus connected callers for correctness/security/authorization/UX. Fix Critical/Important via regression RED→GREEN and rerun relevant/full checks; no commit/push.
- [ ] Freeze source/tested tree and build immutable candidate. Fresh backup/restore/compatible schema proof before release; no DB restoration into main. Candidate browser/provider/artifact acceptance, then app-only cutover under existing owner authorization. R3 fallback retained.
- [ ] Main/domain browser download/reload/ACL/model/memory smoke, fresh local:status/prod:verify-artifacts. If required gate fails, retain/restore safe app only with all data/history/artifacts preserved.
- [ ] Fill all E02-A01…A28 with fresh evidence type/time/artifact and PASS/FAIL/BLOCKED/NOT_RUN. Subsequent slices remain NOT_RUN/blocked conditions rather than completed by this release. Update memory/checkpoint/source change list and report CODE_SHA/TESTED_TREE/deployed artifact.

## Subsequent plans under E02, independent of first release

- E02-3 public-query search/read/citation and PDF/Excel/image chat inputs: reuse P2 privacy design and P3 source flow; detailed implementation contract/plan first, existing r6 web fence remains.
- E02-4 editable PPT and richer Office revise: choose OfficeCLI/PPT Master/PptxGenJS only after gap+pin+sandbox evidence; versioned formula/multisheet/edit CAS contract before code.
- E02-5 10GB/resume/retention/promote and deep PDF: reuse P3 detailed spec; resource/retention decisions and streamed workers required. No automatic data deletion policy.
- E02-6 generative images and advanced memory: engine/resource/license proof first; unavailable image does not block Office. P1 engine remains canonical.

## Self-review

Spec2/3→Task0/1; spec4→Task2; spec5→Task3; spec7→Task4. Spec6 later independent slices explicitly remain outside this first-release plan and have their own detailed contracts before code. Five Review Focus conditions map to named RED/validation steps. Workspace OFF cannot gate SIWC/Create; max remains real route value with evidence. No secret/data/credential mutation or destructive fixture reset is planned. Written-plan review approved by owner; CLI/native stays selected.

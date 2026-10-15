# E01 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in current Codex CLI/native session. Owner đã chọn phương thức; không hỏi lại. Steps use checkbox (`- [ ]`). Không commit/tag/push/PR.

**Goal:** SIWC bảo toàn model/câu hỏi/context ở mọi Project hợp lệ và Workspace text round-trip về đúng chat, bền vững, có server ACL và published model binding.

**Architecture:** Reuse ProjectAiService, P1 history/memory, Settings/IAM/Audit, existing source/Task/File helpers. Add separate encrypted Workspace configuration, published bindings and one scoped job linked to canonical ChatAiAnswer; implement result destination/MCP and DB lease worker in current Nest runtime. Feature disabled until entitlement/config/connector/model gates pass.

**Tech Stack:** installed NestJS/Next.js/strict TypeScript, Prisma6.19/PostgreSQL, Zod, Node crypto/fetch, Vitest/Playwright. Không thêm dependency cho text bridge.

**Spec:** [E01 spec r1](E01_IMPLEMENTATION_DESIGN.md), owner approved trong phiên; SHA256 `284005c29b4223e9655fd6ff03e8c96fd8e0beafafa9915d2b66d75a02520273`. [E01 requirement](GALAXY_AI_E01_SIWC_WORKSPACE_MODEL_BINDING_2026-10-09.txt). P1 spec/plan không đổi. Steering sau spec: context dài, không cắt nội dung tùy ý; token profile UNVERIFIED được owner cho phép, remaining release gates giữ nguyên.

**ID/version/status:** E01-PLAN-r1 / r1 / APPROVED_EXECUTING; 2026-10-09, Asia/Bangkok; source owner approval E01 spec r1 + direct user steering. Không product mutation mới theo plan trước written-plan review. Bugfix T1 đã được triển khai riêng theo approved P1/bug workflow.

## Global Constraints

- Canonical `/home/galaxy_os/.worktrees/m2-a-20260928`, HEAD `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`; dirty P1/SIWC preserved. No reset/clean/stash/staging/copy source về root.
- No SIWC OAuth/callback/refresh/remote changes; four API-key providers remain paused; no billing/credits/services.
- Exact question/revision preserved; Project context separately; backend binds tenant/Project/actor/visibility, never model-provided IDs as authority. No Auto model replacement or hidden fallback.
- Context dài: full originals/history remain persisted; no hard eight-turn cutoff or arbitrary content truncation. Transport/resource/model bounds reported accurately; provider limit unknown stays UNVERIFIED, never an invented token capacity. Retrieval/continuation is explicit coverage, not a claim of full transmission.
- requestedModel/configuredModel/observedModel separate; observed null without provider evidence. Stable binding to published channel/model/effort; no draft/Auto/self-report/display-name alias proof, no republish per message.
- Connector principal+job grant+current ACL at every boundary. Principal pilot scoped to Project/actor/visibility/binding; dependent jobs serialized. No global credential relying on prompt-only separation.
- Durable jobs before dispatch;202/provider completed != chat completion; only validated receiver result. Late/cancel/revoke/replay quarantined; bounded retry with same Idempotency-Key.
- File/image only reported when real bytes verified in Galaxy storage and downloadable; no sandbox path or remote URL masquerading as artifact. Text independent of missing media.
- Existing installed dependencies; no tools listed in Master installed for text bridge. Source/draft writes and financial field expansion outside T1 read delta.
- New documents/checkpoints under `/home/galaxy_os/prompt`. Private evidence/credentials/customer content outside Git. Update status after accepted checkpoint; master/P1 hashes unchanged.
- Full regression/review/backup/compatible migration/real browser/provider gates before main release. Owner approved specific token-profile UNVERIFIED exception, not a waiver of other gates.

## Review Focus

1. Question with whitespace/newline versus blank/file-only input, edited draft during retry: exact payload and state comparison. T1 tests.
2. Source revoked between tool/read and provider reinjection, late old-model job: current proof/pin checked at each boundary. T1/T3 tests.
3. Connector with two valid jobs or foreign source ID, caller with SYSTEM role: principal scope and one-active-job fence still enforce Project/actor. T3 tests.
4. POST accepted before network timeout and callback before trigger reply: same stable idempotency, CAS finalization, no two chat messages. T3 tests.
5. Published model changed/draft-only config or known name without official alias proof: invalidation blocks dispatch, observed null never copied from configuration. T2/T4 tests.

## Workspace and verification commands

Plan workspace `.superpowers/sdd/E01_IMPLEMENTATION_PLAN`, ledger `progress.md`; first line identifies absolute plan file. Reuse linked worktree and installed tools. Scratch logs may live there; summary/evidence always copied into `/prompt` checkpoint. Preserve ledger without commits.

Unit command `pnpm --filter @galaxy/api exec vitest run <named files> --no-file-parallelism --poolOptions.forks.singleFork`. API typecheck `pnpm --filter @galaxy/api typecheck`. Browser uses `playwright.m2.config.ts`, existing isolated ports33001/33002 and portable Chrome; never default browser config ports3000/3001 beside main.

Before DB/browser/full suite: `node --env-file=scripts/m3-isolated.env.example scripts/g00-isolated-test.mjs check`, expected explicit isolated identity `galaxy_os_g00_20260930m3` and ports55435/56382/33001. Reuse fixture; no run/down/reset. Env wrapper loads synthetic fixture only and verified private PDF binaries; never print env/credential values.

## Task 1 — SIWC read capability/context and original question

**Files:** `apps/api/src/project-chat/project-ai.service.ts`, `ai-chatgpt-plan.ts`, `ai-tools.ts`, `ai-registry.ts`; tests `ai-chatgpt-service.test.ts`, `ai-chatgpt-plan.test.ts`, `ai-registry.test.ts`, `test/p1-project-ai.integration.test.ts`; UI `apps/web/features/project-chat/project-ai.tsx`/`tests/browser/p1-project-ai.spec.ts`, provider fixture `scripts/m3-browser-provider-fixture.mjs`.

**Interfaces:** consumes `authorized(actor,projectId,run)`, `ownedAnswer`, `taskTool`, `sourceScope/checkSource`, `recordTool`, history version3/consumed proof and namespace function loop. Produces extended SIWC read allowlist/dispatch with matched call_id, consumed source dependency and exact model guard; request metadata retains scope/context/source revision and reasoning only when actual capability allows it. Public ask/history/run contracts remain compatible; transport-safe context is distinct from original question.

- [x] Bugfix already done: Chrome RED request lost whitespace → exact question and draft equality fix → GREEN exact POST/DB/reload; isolated build and independent review0findings. Full checks pending completion when plan written.
- [ ] Add failing service tests: non-Showroom general question unaffected; selected source/context accepted only when allowed; foreign/revoked source denied before I/O; task_get/history/calculate executed, matched outputs, exact requested model on every round; source revoke before reinjection fails closed. Regression original question >old8000cap preserved through question DTO/UI/request boundary when supported by actual route; blank still rejected.
- [ ] Run named service/codec/registry tests. Expected RED on blanket context/source rejection, missing allowed executors and arbitrary question cap; failures must match root causes.
- [ ] Remove obsolete application blocks, not ACL. Reuse source helpers and existing tools; split keyed-provider egress adapter at the existing helper boundary so SIWC checks its own server-approved source policy without constructing a fake keyed ConfiguredModel. Selected source text is bounded/covered derivative with immutable original refs; no image/PDF capability claim without proof. Lift arbitrary question-content caps coherently across DTO/UI/codec while retaining transport/resource checks with clear errors/coverage. Do not truncate question.
- [ ] Run GREEN targeted tests + real PostgreSQL P1 integration and Chrome P1 tests. Expected zero failures; no cross-Project/source leak, retry pin preserved. Native web unavailable returns explicit capability error; no keyed search fallback.
- [ ] Reuse approved P1 Task9 for SIWC independent release when gates ready; token-profile exception now approved. Verify exact selected model/general+Project questions in at least two real Projects after safe candidate preparation; owner login only if current session unavailable.

## Task 2 — Workspace secure settings and immutable published binding

**Files:** create `apps/api/src/settings/workspace-agent.service.ts`, `.test.ts`, `workspace-agent.dto.ts`; extend Settings controller/module, `apps/api/src/audit/audit.service.ts` redaction/feed exclusions where necessary; create UI `apps/web/features/settings/workspace-agents.tsx`, tests, link current AI settings page. Reuse SettingsService systemOnly and IAM permissions; no SIWC service changes.

**Interfaces:** `WorkspaceAgentService.metadata(actor):Promise<WorkspaceMetadata>`, `configure(actor,input:WorkspaceConfigInput):Promise<WorkspaceMetadata>`, `resolveBinding(actor,projectId,requestedModel,effort):Promise<WorkspaceBindingSnapshot>`. Snapshot holds organization/project/actor/visibility, binding ID/revision, API channel, requested/configured model/effort, published digest/proof, connector principal, credential revision and capability/budget policy. Public metadata excludes secrets. Config stored encrypted in SystemSetting with separate host key; key never copied from SIWC. Config CAS via expectedVersion.

- [ ] Write tests for unauthorized read/update/invoke, tenant substitution, ciphertext/no browser token, key missing/tamper/symlink/permissions, rotation/CAS, draft/Auto/missing proof, mismatched model/effort and unavailable binding => no dispatch; observedModel never supplied by owner/model input. Expected RED service absent.
- [ ] Implement encrypted config/key safety using Node crypto/fs patterns already established; purpose-separated AAD, revision snapshot and safe audit. Admin forms use TLS POST, clear secret field after save, no storage/echo/log. Metadata status stays NOT_CONFIGURED/UNVERIFIED until real checks.
- [ ] Implement exact binding resolver and trusted published evidence verification. Do not invent an undocumented published-config API. In session where official Workspace plugin/config UI can be inspected, record real published IDs/model/effort/revision and official identity mapping. Manual name/attestation alone stays UNVERIFIED and dispatch blocked.
- [ ] Run unit/UI tests + API/Web typecheck/lint. Expected PASS; disabled/missing Workspace leaves SIWC available. Prepare setup packet with exact admin token/connector steps after receiver code, never request token in chat.

## Task 3 — durable jobs, receiver/MCP, scoped grants and worker

**Files:** additive Prisma schema/migration under `apps/api/prisma`; create `apps/api/src/project-chat/project-ai-workspace.service.ts`, `project-ai-workspace.controller.ts`, focused tests/integration; create `workspace-agent-api.ts`/contract tests in ProjectChat for fixed provider adapter; register module. Extend ProjectAiService only at ask/run/history/cancel integration points. Connector grant/config data stored in dedicated scoped job/binding records or encrypted Settings; canonical answer remains ChatAiAnswer.

**Interfaces:** `prepare(actor,projectId,conversationId,input):Promise<JobView>` creates answer+job atomically and pins original/revision/context/source/model/binding before I/O; `getJobContext(principal,jobId)`, `readJobSource(principal,jobId,sourceRef)`, `submitJobResult(principal,jobId,result)`, `cancel(actor,projectId,jobId)`, `retry(actor,projectId,jobId)`, worker lease claim/reconcile. `WorkspaceResultV1` exactly `{contractVersion:1,answerMarkdown,sourceRefs,warnings,artifactRefs,memoryProposals}` validated with Zod; artifact refs require existing verified Galaxy asset.

- [ ] Tests RED: wrong principal/project/actor/visibility/source denied, jobId not credential; one active job per pilot principal, original exact+snapshot immutable;202 and provider completed leave answer non-completed; duplicate result one answer; different payload replay conflict; callback before accepted reply valid; cancel/revoke/rotation/expired lease/late worker cannot finalize; receiver transaction failure rolls back all. Unit/API plus real PostgreSQL FK/composite/idempotency constraints.
- [ ] Create migration with repository `prisma:migrate` in verified private fixture; stop if reset requested. Inspect additive SQL/locks/checks/FKs/indexes; never rewrite applied migration. Generate/validate, apply only fixture until release gate. No parallel domain model for question/result.
- [ ] Implement fixed trigger endpoint/body/202/run status parser; beta polling per current docs, stable idempotency and bounded backoff with DELIVERY_UNCERTAIN reconciliation. No per-trigger model field, missing final retrieval endpoint or fake remote cancel.
- [ ] Implement Nest receiver + minimal supported MCP transport for three text/source/result tools. Bearer/OAuth identity bound to immutable principal and job grant, never just body IDs. If native client requires OAuth, use standard authorization-code/PKCE and consent via existing Galaxy session/IAM in separate integration routes; no SIWC/login bypass. Consult current official MCP/client auth contract before exposing endpoint; unknown protocol blocks connection, not local persistence/security implementation.
- [ ] Persist validated full Markdown/receipt/citations/proposals under current ACL atomically, no forced SIWC rewrite. Reuse source dependency rechecks and scoped archive; private proposal cannot auto publish. Worker lifecycle with DB lease/CAS, restart/retry recovery; suspend if config/budget disabled.
- [ ] GREEN unit/security/DB + fake provider round-trip (not live). Expected every named case passes, no secrets in audit/errors. Preexisting SIWC tests still pass.

## Task 4 — Chat route and real Workspace text round-trip

**Files:** `apps/web/features/project-chat/project-ai.tsx`/tests; `apps/web/tests/browser/e01-workspace.spec.ts`; matching facade/controller routes from Task3; [setup packet](E01_WORKSPACE_SETUP.md) newly created under prompt when code ready.

**Interfaces:** extend ask DTO with route `AUTO|SIWC|WORKSPACE`; snapshot chosen route in answer request/Workspace job. Model changes new requests only. JobView displays requested/configured/observed model and evidence level, status/retry/cancel/error/source. History persists run across reload/scope changes.

- [ ] RED browser/API tests: Workspace unavailable does not block SIWC; missing exact binding no silent route/model change; two tabs/models/Projects and edit selection in running job remain pinned; results route original conversation, reload/restart; retry/cancel share backend state.
- [ ] Implement route UI/history/job polling without fake streaming/progress. Auto uses capability+binding+consent/budget, not model-dependent summary rewrite. No external dispatch unless Task2 config/principal/published model gates pass.
- [ ] GREEN fixture tests. Prepare approved synthetic text job, owner setup via TLS admin form/token secrets channel only. Inspect published configuration before triggering, no agent republish per request or unrelated agent edits.
- [ ] Preview receiver read/write, then user Galaxy request → actual published agent trigger → real result sink → same answer/conversation after reload. Save redacted receipt evidence. Report CONFIG_VERIFIED, RUN_MODEL_VERIFIED (or null/UNVERIFIED) and LIVE_CHAT_PASS independently; no202-only acceptance.

## Task 5 — one citation and optional real file/image

**Files:** source receiver tests + FileStorage/FileAsset existing path; artifact receiver adapter only if supported, frontend existing asset cards; no new heavy parser/media package.

- [ ] RED security/coverage case: granted synthetic source version reads, foreign/revoked denied; submitted citation must refer granted handle/version, full Markdown saved. Implement smallest permitted-source adapter; GREEN source version/ACL/reload test.
- [ ] Live one authorized source/citation through Workspace destination. Do not send whole Project by default; test coverage/ref matches original.
- [ ] If byte transport verified in actual client, implement streaming bounded upload -> MIME/hash/quota/storage -> asset reference/download; RED→GREEN duplicate/replay/cancel/revoke/download tests, then real file/image/open/preview/reload. Otherwise FILE_RETURN_BLOCKED/NOT_RUN documented; text does not wait. No videos/sandbox paths/manifest-only PASS.

## Task 6 — regression, evidence, backup/rollback and domain release

**Files:** no unrelated product changes; existing release scripts/immutable artifacts, prompt checkpoint/memory/matrix/README, canonical/root PROJECT_STATUS and docs STATUS/handoff links. New handoff resides prompt by user preference; preserve original inputs/spec hashes.

- [ ] Run targeted suites, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check` under correct fixture/build environment. Expected all exit0 or exact preexisting/unavailable blockers; full test PASS never substitutes live. Check known lint warnings explicitly, no unrelated cleanup.
- [ ] One fresh independent whole-change reviewer using requesting-code-review + Ponytail correctness/security/authorization/UX, baseline/session diff and ledger rulings; fix Critical/Important once with RED→GREEN+full checks, minors documented. T1 independent bug review already done, new features need final reviewer.
- [ ] Fresh private backup if data changed; restore/additive migration/business rows compatibility and previous P1-A rollback proof. Build immutable candidate from actual dirty source snapshot, source digest/tree/hash; no git commit implied.
- [ ] Real candidate/domain browser acceptance SIWC and Workspace/cancel/reload/source after all dependent gates; actual published binding evidence, model receipts separately. Main additive migration/cutover only when required acceptance/backup/compatibility gates pass; unsupported Workspace/media stays disabled while SIWC can release independently.
- [ ] `pnpm local:status`, `pnpm prod:verify-artifacts`, TLS/domain smoke verify actual serving release/build/schema and no browser secret. Store E01-A01…18/status matrix, commands/results, CODE_SHA/TESTED_TREE/dirty snapshot/artifact, exact blockers/next action in prompt; read back/links/diff/hash checks. No promise of background Codex work.

## Self-review and handoff

Spec sections1–2→T1;3→T2;4–6→T3;7→T4/T5;8→T6;9→T2/T4 readiness. Shared interface binding snapshot T2→T3, JobView/result envelope T3→T4/T5, FileAsset/source proofs T3/T5→T6 consistent. Model/account/transport gates conditional because official docs do not expose a verified published-config read tool in this session; no fabricated endpoint or proof. Content steering is requirement, not a claim unlimited provider capacity.

**Execution update r2 (2026-10-10):** owner approved exact r1 hash `35795bcd4725f7e1e50e46fa43a071284ab3c168c1771ce4139a48b940df982b`. This metadata update preserves the approved implementation scope; no new plan approval needed. CLI/native preserved; no method selection. Account/consent/budget/published mapping/source/File transport live checks occur at dependent steps after code/setup is concrete. Existing approved P1 Task9 proceeds independently with token exception recorded.

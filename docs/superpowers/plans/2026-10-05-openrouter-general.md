# OpenRouter GENERAL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Hai lượt chat OpenRouter FREE_ONLY trong popup localhost3000; LlamaCloud chỉ kết nối tài liệu.
**Architecture:** Mở rộng registry/adapter/env loader hiện hữu; JSON usage lưu metadata, không schema mới. Paused chặn outbound nhưng giữ history. Source tách artifact live.
**Tech Stack:** Native fetch, TypeScript strict/Zod, Python CLI, Vitest/Playwright hiện có.
**Spec:** `docs/superpowers/specs/2026-10-05-openrouter-general-design.md`, từ thiết kế owner đã chỉ định trong prompt.

## Global Constraints

- Worktree `/home/galaxy_os/.worktrees/m2-a-20260928`; giữ mọi dirty docs đầu lượt.
- GENERAL0source, IAM/ai.invoke/tenant/conversation owner/input policy còn nguyên.
- `openrouter/free` duy nhất; costMode FREE_ONLY, provider.max_price prompt/completion/request0.
- Canonical env0600/owner; không key argv/log/docs/frontend/artifact/JSON fallback mới.
- Gemini/Mistral paused, Kira không probe; LlamaCloud không inference/process/index/session.
- Không dependency/migration/DB mới, Figma/PDF/RAG/clock/LAN/domain hoặc model Codex.
- Inline theo task trong phiên; một writer Sol high, Astra high final review, root release/Chrome.
- Chỉ commit đường cụ thể được review; không add toàn repo/push/merge/amend/reset/stash.

## Review Focus

- Catalogue đổi/mất giá/text hoặc stale cache: fail closed, không paid/auto fallback.
- Pause giữa retry và lịch sử cũ: outbound dừng, answer cũ vẫn theo đúng ACL/policy.
- Vendor200 có error/empty/thought-only hoặc cost>0: không fake COMPLETED, chặn lượt tiếp cùng revision.
- Hai credential/env thêm mới: preserved siblings, host/key isolation, không Web/JSON secret.
- Popup reopen/reload/model switch: không duplicate, giữ conversation và chỉ history GENERAL hợp lệ.

### Task 1: Credential registry, pause và document connection

**Files:** scripts/ai-credentials.cjs/.d.cts; scripts/configure-ai.py/test_configure_ai.py; ai-registry.ts/test; project-ai.service.ts; project-chat.dto.ts; project-ai.tsx/test.
**Interfaces:** reuse readCredentials(source), configuredModel(config,id), modelChoices(config,org,project), selectedConfig(answer,revision), settings/egress endpoints. Add paused flag separate from enabled and connections.llama_cloud DOCUMENT_KNOWLEDGE metadata; never an AI chat model.

- [x] Viết test RED: add five allowed credential names, preserve env/key/revision sibling, hidden CLI rejects pipe/argv; LlamaCloud excluded from AI_MODELS; paused configured dispatch throws PROVIDER_PAUSED but terminal history remains authorized/readable.
- [x] Chạy Python unit và registry/Web tests: fail vì provider/paused/connections chưa có.
- [x] Bổ sung tối thiểu loader/types/CLI, OpenRouter fixed registry entry/env-only, GENERAL-only capability/DTO/input policy, LlamaCloud safe settings metadata, paused dispatch/history gates. Pause/resume không đổi input/source policy; live pause root thực hiện sau review.
- [x] Chạy cùng tests GREEN, API/Web typecheck, không vendor.

### Task 2: OpenRouter FREE_ONLY adapter và metadata

**Files:** ai-provider.ts; ai-multi-provider.test.ts hoặc test OpenRouter nhỏ mới; ai-registry.ts; project-ai.service.ts; project-ai.tsx/test.
**Interfaces:** extend answerFromProvider result với gatewayRequestId/provider/cost và catalogue timestamp, bounded scalar only. Persist trong ChatAiAnswer.usage/view, no schema. Reuse reserveProvider/operationalModels for durable cost violation stop on same config revision.

- [x] Test RED: paid/auto/online/manual request denied, catalogue text+zero required/TTL expiry, fixed host redirect:error/key isolation, no tools/plugins/BYOK; max_price0/data_collection deny; empty/error/reasoning-only rejected; output/historical text, requested/returned/gateway/provider/usage/cost UNKNOWN preserved; cost>0 blocks next outbound; 402/429/404 metadata sanitized, bounded retry/cancel no duplicates.
- [x] Run targeted API unit tests, observe expected RED.
- [x] Reuse native fetch/retry/response bounds. Only GENERAL plain text for OpenRouter; no free-model variant added. GET models without key with bounded60s cache, fixed endpoints only. GET key for read-only account limits when credential ready; never management API. Cost deviation stored and stopped before later dispatch/retry.
- [x] Extend view/UI minimal answer metadata and GENERAL-new-chat default; paused disabled/label; preserve active/history original model. Display document connection separately in existing config details.
- [x] Targeted API/Web/Python suites and types/lint GREEN. No live vendor during mock tests.

### Task 3: Review, local release, credential input và Chrome acceptance

**Files:** scoped tests/evidence/handoff/status only; private release/env/unit artifacts stay outside Git.
**Interfaces:** prepare-local-release.py build/candidate/stage-units and local-runtime.py; Chrome existing CDP33005/session localhost3000; configure-ai.py hidden local key input.

- [x] Ponytail diff + Astra high correctness/security/cost/policy review; fix Important/Critical via failing regression then GREEN. No extra minor polish.
- [x] Run scoped API/Web/Python tests, lint/types/format; commit reviewed product/test paths only. Artifact build recorded separately below.
- [x] Build frozen artifact and cutover using existing systemd pipeline; preserve DB/storage/session/Edge/keeper. Recheck READY/identity/artifact and secret boundaries.
- [x] Sau artifact mới READY, pause Gemini/Mistral using reviewed CLI, preserve credentials/history, no new probes. Register LlamaCloud metadata without consuming calls. If keys absent publish tested hidden-input command; loader artifact cũ chỉ whitelist3key nên không thêm key/connections trước cutover.
- [ ] When OpenRouter key loaded/metadata enabled: read-only catalogue/key metadata; approve only two exact public input questions through existing UI. Use new GENERAL personal conversation in same Chrome; send twice and check cost after first before second. Stop on vendor blockers/cost deviation, no paid fallback/retry-to-pass.
- [ ] Record requested/returned/gateway/status/retry/time/usage/cost,0sources, same conversation and reload persisted answers; no duplicate POST on popup reopen. LlamaCloud processing calls NOT_RUN.
- [ ] Update STATUS/PROJECT_STATUS/handoff with verified facts; commit only scoped docs, record DOCS_COMMIT_SHA separately. Final provider/credential/live status honest; stop after scope.

## Execution ledger

Owner authorized design, inline execution, local artifact release and scoped commits in current prompt. No repeated approval requested. Baseline HEAD ef4d4a4; runtime local-a33d8a12318c. New credential variables absent; live test waits for user hidden input, implementation does not.

Preflight: old env loader rejects unknown new key names; old strict metadata parser rejects connections. Deploy compatible artifact before canonical config/env mutation. No unsafe early credential input or pause via enabled=false.

Implementation verified: API62/62, Web11/11, CLI14/14; API/Web types and lint pass (Web pre-existing profile/page.tsx154 warning). Astra high cost/secret/auth/mode/policy and Ponytail review passed after cost-details, retry, account-limit schema, history/reasoning and cancellation-race fixes. Product CODE_SHA=TESTED_SHA `cc1efe8a5ee45246d4bbe135ec1b2adba680bbe8`. Artifact build in progress; no live OpenRouter generation yet.

Final code `dae8e081810490f53c13ad5010495a280ad9e4f9`: browser regression paused label fixed RED→GREEN; final Web13/13 +CLI15/15; API62/62 unaffected. Frozen release `local-fd0f306f0c40` READY and Chrome health/session/history/paused-label verified. OpenRouter/LlamaCloud new key variables absent; hidden input command published after compatible release READY and reply requested. No inference performed; two-turn/default/history OpenRouter acceptance remains pending credential. Scope docs/handoff records actual blocker; do not mark primary goal complete.

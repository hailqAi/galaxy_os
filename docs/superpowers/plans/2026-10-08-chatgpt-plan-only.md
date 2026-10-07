# Galaxy OS — ChatGPT plan only implementation plan

> **For agentic workers:** Use superpowers:executing-plans. One source writer; independent read-only review.

**Goal:** Deliver the existing P04/business workspace on the actual local runtime, with actor-owned official ChatGPT connections and no API-key dispatch.

**Architecture:** Extend the existing ProjectChat/ProjectAi services, domain tools, private configuration and immutable release mechanism. Preserve Galaxy identity/ACL separately from OpenAI identity and billing. Direct SIWC adapter is preferred; no shared Codex daemon or second chat engine.

**Tech Stack:** Existing Next.js, NestJS, Prisma/PostgreSQL, Python runtime tooling and local document engines.

**Spec:** `/home/galaxy_os/prompt/GALAXY_OS_CHATGPT_PLAN_ONLY_ADDENDUM_2026-10-08.txt` (359 lines), then `/home/galaxy_os/prompt/GALAXY_OS_CODEX_MASTER_PROMPT_2026-10-08.txt` (437 lines), both read in full. Addendum overrides provider/key/billing/capability/install requirements. The current user explicitly requests direct execution, local commits/releases and continuing independent work; no repeated implementation authorization.

## Global constraints

- CHATGPT_PLAN_ONLY; no API-key fallback, paid credit purchase or auto-topup.
- Never recover/recreate D-Bus, reexecute/restart the user manager or use equivalent workarounds without separate approval of the concrete operation.
- No reset/seed main, applied migration changes, secret exposure, remote push/merge/public hosting, or copying Codex/browser credentials.
- One Project and existing Task domain remain authoritative; approved documents immutable; derived data inherits source permissions.
- Preserve P04 five-PDF layout and actual source/session/file identities; no sample models or fake capabilities.
- Separate source, test, artifact, serving release and fixture/live evidence.

## Review focus

1. Bus unavailable while valid app remains serving: status must not label it stopped or READY; mutation commands must fail before side effects.
2. Config revoked between attempts/tools: no legacy dispatch or publication after revoke; history remains accessible under ACL.
3. Two actors/attempts and remote LAN callback: bind actor/session/state, reject replay and unsupported topology.
4. Partial SSE/identity-only grant/stale catalog: no false success, no inference without grant, no fabricated models.
5. Retry/export/task writes: preserve idempotency, money precision, source lineage and fresh authorization.

## Baseline and reuse map

| Requirement            | Existing evidence                                                                        | Delta / task                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Runtime/controller     | `scripts/local-runtime.py`, `infra/systemd/*.example`; main local-a0429faf5733           | R0: bus failure currently aborts inspection before health; template provenance/preflight             |
| P04 + ingestion/export | `project-ai*.tsx`, `ai-native-source.ts`, `ai-document.ts`; candidate local-a9b073642935 | R1: preserve existing code; current main predates candidate; fresh visual acceptance after cutover   |
| Provider routing       | `ai-registry.ts`, `ai-provider.ts`, `configure-ai.py`                                    | P0: pause current config now; durable global policy across all key dispatch paths                    |
| SIWC                   | no current connection service; official SIWC docs exist                                  | C0/C1: determine private-app eligibility, implement lifecycle/adapter/UI with truthful blocked state |
| Work tools             | `ai-tools.ts`, `project-ai.service.ts`, durable answer lease/status, local exporters     | W0: extend existing Task queries/commands and run recovery; no duplicate task domain                 |
| Project memory/ACL     | existing source/version/dependency/lineage checks                                        | W1: fresh cross-actor/Project/revoke regression and new tool authorization                           |
| Web/plugin/media       | guarded public fetch, Tavily, disabled OpenAI codecs                                     | W2: pause keyed web/media; reuse local tools, expose real capability metadata                        |
| Tool installation      | Superpowers/Ponytail/rg already present                                                  | Reuse skills; Graphify optional only if offline code graph adds needed capability                    |

## Tasks

### Task 1: R0/P0 immediate containment and runtime diagnostics

- [x] Read both specifications, AGENTS, canonical status/handoff, current source/callers, root/worktree state and manifest.
- [x] Reproduce user bus failure outside sandbox read-only; observe serving API/Web release without treating sandbox EPERM as host failure.
- [x] Atomically pause four configured model providers with existing private writer; preserve secret/metadata and protected rollback receipt.
- [x] Verify effective main model list and queued/running dispatch; inspect inactive extractor/web/legacy paths.
- [x] RED: extend `scripts/test_local_runtime.py` for serving/down with unavailable bus, nonzero status, and no mutation on up/stop.
- [x] GREEN: catch only controller transport failures, keep process identity/readiness evidence separate, fail mutation commands closed.
- [x] Test template rendering from chosen artifact, reject unresolved placeholders, use isolated validator runtime directory.
- [x] Run all script tests; independent correctness/Ponytail review; scoped local commit.

### Task 2: C0/P1 official route and permanent routing policy

- [x] Read official eligibility, registration, lifecycle, inference, limitations and self-hosted topology docs; save URLs/date and exact applicability.
- [x] Inventory app registration metadata only; do not probe login as another client or assume private app acceptance.
- [x] RED/GREEN: shared dispatch gate rejects all API-key calls/retry/tools/probes even when configured, while local public fetch remains available.
- [x] Expose CHATGPT_PLAN_ONLY metadata and connection status without keys or hardcoded models.
- [x] Unit/contract tests, typecheck/lint and review; commit.

### Task 3: C1 official connection and provider lifecycle

- [ ] Map official contract into existing authenticated routes and store; use reviewed OIDC library, exact issuer/audience/nonce/state/PKCE and callback.
- [ ] RED/GREEN: actor/session attempts, replay/timeout, staged connection, atomic refresh/CAS/revoke, run connection pin and stale-output rejection.
- [ ] RED/GREEN: account catalog cache and strict SIWC serializer/SSE terminal event/tool loop; no unsupported payload fields or fallback.
- [ ] Add account/AI connection UI and model card in P04; preserve drafts/files on return; distinguish remote LAN initiation.
- [ ] Contract/integration/browser fixture tests. Live stays blocked until applicable registration/grant and serving release exist.

### Task 4: W0/W1/W2 independent work functionality

- [x] Inspect Task services/callers, run/source/artifact schema and current tests before extending them.
- [ ] RED/GREEN: todo/tracker pagination/counts/history; ordinary task create/update permission, source deduplication, optimistic concurrency and audit.
- [ ] RED/GREEN: durable run resume/cancel/lease recovery and bounded tool iterations; preserve source/field ACL at every boundary.
- [ ] Reuse parsers/exporters; cover DOCX/PDF/XLSX bytes, locators, lineage/revoke, explicit cached-not-recalculated state.
- [ ] Minimal built-in registry/admin capability metadata; unsupported hosted/media capabilities disabled with actual reason.
- [ ] Scope full relevant regression and review before local commit.

### Task 5: R1/S3/S5 release and acceptance

- [ ] Prepare immutable candidate, source/test identity, validated templates and exact rollback; finish all safe preparation before requesting any rejected control-plane repair.
- [ ] Once separately authorized control plane is available, cut over only Galaxy API/Web through existing mechanism; preserve Edge/keeper/data.
- [ ] Verify fresh localhost/LAN/API/Web identity; five PDF states at 1440/1495/narrow/375/390; main source/task/export journeys in permitted acceptance Project.
- [ ] Only after main connection UI/callback is ready and app route eligible, request user login/MFA/consent on OpenAI.
- [ ] Verify real grant/catalog/completed inference/tool roundtrip; separate vendor live, fixture, main Chrome and physical device.
- [ ] Update STATUS, PROJECT_STATUS and handoff with actual SHAs/tree/artifact/release, remaining blockers and recovery steps.

## Execution ledger

2026-10-08: canonical worktree clean at `7b1408482adc059fa1d439b71509f8e2505be086`; production code baseline `0738358ed153195a8b68927945875e703eb3ae41`. Root untracked figma/prompt preserved. Host UID1000, PID1 systemd, user manager470, API643395/Web643396, both health responses local-a0429faf5733. Current shell sandbox PID1 differs, so host read-only checks used approved escalation. `/run/user/1000/bus` absent; no bus repair attempted. Pause receipt and backup: `.runtime/chatgpt-plan-20261008/` outside Git. Chrome MCP executable unavailable in this environment; browser verification not yet performed.

2026-10-08 checkpoint: policy/main pause evidence and route eligibility recorded in `docs/galaxy-os/handoffs/2026-10-08-chatgpt-plan-only.md`. Runtime scripts64PASS; task query unit RED/GREEN and actual PostgreSQL125row fixture PASS. Chrome Task pagination/retry/deferred-create fixture PASS. SIWC codec only, no dispatcher/lifecycle/live; task tool mutations and full tracker remain unfinished. Full regression rerun pending after stopping fixture processes; no main cutover.

2026-10-08 final verification checkpoint: CODE_SHA9a02b4c; TESTED_SHA232c4f7/tree d3bd974189faa24b176eb230c074573e926da7fe. Baseline timeout was split into7ordered phases with unchanged assertions/timeouts; review and full regression PASS API1386/Web568/Edge5/document1, runtime64, lint/types/format/build. Candidate local-63652e4cc6d8 production matches code commit; exact artifact Chrome2PASS/5widths. Main remains local-a0429faf5733. Maintenance restart draft REVIEW_BLOCKED (pre-restart admission/drain not established), not executed or presented as ready for approval. SIWC eligibility/callback/lifecycle, full Task tools/tracker/resume/registry and main/live acceptance remain unfinished; see current handoff.

# E05 Galaxy OS MCP Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this approved plan scope inline. Steps use checkbox (`- [ ]`) syntax for tracking. Owner approved E05-SPEC-r1 and explicitly selected inline implementation in the current conversation.

**Goal:** Deliver an authenticated HTTPS MCP endpoint and durable Work→Galaxy answer/file transport on the existing Project AI conversation.

**Architecture:** NestJS hosts the current MCP SDK and independent inbound OAuth. Existing ChatAiAnswer/Files/IAM remain canonical. PostgreSQL protocol outbox/receipts provide delivery and import recovery; Edge directs MCP/discovery traffic to API.

**Tech Stack:** Node20.20.2, TypeScript strict, NestJS11, Next.js, Prisma6/PostgreSQL, Zod4; MCP server2.3.1/Node adapter2.1.1/maintained @node-oauth/oauth2-server5.3.0 (native PKCE); StandardWebhooks1.1.1.

**Spec:** [E05-SPEC-r1](E05_MCP_WORK_IMPLEMENTATION_DESIGN.md).

## Global constraints

- Protocol `2026-07-28`, HTTPS canonical resource `https://os.galaxycentre.vn/mcp`.
- Reuse `ChatAiAnswer` as job/original message; do not add a parallel chat/job/file store or queue.
- Preserve SIWC and the existing dirty tree; Workspace remains deferred.
- No total job/tool/file ceiling; page/batch and use operational network/disk limits.
- Verify IAM, resource, issuer, scopes, expiry/revocation and exact source versions for every operation.
- Persist actual file bytes; requiredXLSX blocks completion until saved and validated.
- No secrets/signed download URLs in logs, templates or repository evidence.
- Additive migration only; never reset/modify applied migration/db-push.
- No commit/push/PR; session diffs and source hashes replace commit milestones.
- Native/inline execution as explicitly selected by owner; one fresh final reviewer.

## Review focus

1. Reconnecting OAuth with another organization/user must not read prior private jobs or subscriptions.
2. Cancel/revoke during download or finalize must prevent terminal/result writes while preserving stored bytes safely.
3. Replay of identical tool calls/refresh with reordered filter keys must return the same receipt, never duplicate answers/files.
4. Expired temporary URLs, DNS rebinding, redirects and misleading Office content must remain retryable errors, never completed artifacts.
5. A valid subscription arriving after job creation/restart must not lose the existing pending job or trigger the SIWC worker.

### Task1: Persistent contracts and domain preparation

**Files:** Prisma schema/new migration; new `apps/api/src/mcp/mcp.schemas.ts`, `mcp.contracts.test.ts`; shared `project-ai.service.ts` and related tests only at reuse boundaries.
**Interfaces:** `job_id=ChatAiAnswer.id`; versioned MCP metadata contains source/context/output/progress/actor references. Protocol records link to that ID. Shared preparation/check methods reuse IAM and source/version checks.

- [ ] Write failing contracts for genuine required artifacts, immutable destination, schema/fileParams and idempotency.
- [ ] ObserveRED with targetedVitest command before product code.
- [ ] Add the minimum persistent OAuth/subscription/outbox/result receipts and shared preparation hooks; review migrationSQL.
- [ ] Generate/validate Prisma; apply only to verifiedG00 DB through safe migrate workflow; observeGREEN.

### Task2: HTTPS routing and OAuth

**Files:** new `mcp.oauth.ts`, `mcp.oauth.test.ts`, `mcp.module.ts`; existing `app.module.ts`, `main.ts`, Edge configuration/tests; consent UI and proxy tests; config template/package+lock.
**Interfaces:** `McpOAuth.authenticate(token, requiredScopes)` returns freshGalaxy actor+grant identity; metadata announces exact resource/issuer/routes. DCR stores actual client redirect metadata.

- [ ] Write/observeRED: missing bearer401JSON+challenge, S256/code replay/resource/scopes/expiry/revoke negatives and discovery routing that avoidsNextlogin.
- [ ] Install pinned supported SDK packages, wire maintained OAuth handlers to persistentGalaxy adapter and existing session consent; implement exact route dispatch.
- [ ] VerifyRED→GREEN with realHTTP/SDK tests, including revoked membership and crossorganization.

### Task3: MCP job tools and explicit composer route

**Files:** new `mcp.jobs.service.ts`, `mcp.controller.ts`, `mcp.server.ts`, tests; existing ProjectAI composer/view/types/tests.
**Interfaces:** create/retry/cancel a job in the existing conversation; `galaxy_get_job`, context and input-file tools; job lookup derivesProject/thread solely from persisted answer.

- [ ] Write/observeRED: exact request/source retention, forgedProject/source/version/private-owner denial and SIWC worker exclusion.
- [ ] Create answer+outbox atomically through existing IAM transaction; expose paged authorizedcontext and real input-file download grants.
- [ ] Add explicitChatGPTWork execution choice, realphase display and same-answer retry/cancel; preserveSIWC default.
- [ ] ObserveGREEN for unit/integration/component tests and strict typing.

### Task4: Events subscription and delivery

**Files:** new `mcp.events.service.ts`, network module/tests, event integration tests.
**Interfaces:** Events list/subscribe/unsubscribe match official wire shape; durable subscription/outbox/delivery IDs; webhook acceptance separate from job completion.

- [ ] Write/observeRED: signed challenge, constant-time echoed ownership, StandardWebhooks verification,256KiB limit, unauthorizedfilter, duplicate refresh/unsubscribe and expired/revoked delivery.
- [ ] Implement public-addressHTTPS transport with pinnedDNS/no redirects; encrypt secrets; durable lease/backoff/rotation and pending-job reconciliation.
- [ ] ObserveGREEN through actualHTTP callback fixture, repeated/restart/connection-failure cases; no model/provider mocks called evidence of ChatGPTconnection.

### Task5: Progress and artifact/result ingress

**Files:** new `mcp.results.service.ts`, tests; internal existingUploads/Files hooks; sharedanswer/artifact view tests.
**Interfaces:** progress has `operation_id`; result tool has job/submission/sequence/content/files/finalize and documented `openai/fileParams`; import receipts retain canonicalFileAsset/source/checksum.

- [ ] Write/observeRED: downloadablevalidXLSX required, textalone blocked, duplicatebatch/finalize, URL renewal, misleadingcontainer, partialtransfer/restart and cancel/revoke during write.
- [ ] Stream through existing upload/storage validation+capacity path; atomically bind savedFiles and text to originalanswer; finalize with storedbytes/reopen proof.
- [ ] VerifyXLSX/DOCX/PDF/image/video fixtures by actual download+formatchecks; report precise unsupportedtypes.
- [ ] ObserveGREEN and confirm no temporary/sandboxlinks in storeduser results/logs.

### Task6: Integration, review and repository gates

**Files:** dedicatedG00 integration+browser tests; only release/runtime config changes necessary for MCP; E05 evidence/ledger.

- [ ] Exercise complete syntheticjob with callback and realinput/output bytes on isolatedcandidate.
- [ ] Run required lint/typecheck/test/build/format gates, recording pre-existingR41 failure separately and diagnosing any release-blocking failure.
- [ ] Browser acceptance: request/file/thread retention, realprogress, download/reload, retry/cancel andOAuthconsent.
- [ ] Fresh reviewer reads session-onlydiff, source/callers/tests and spec; Ponytail correctness/security/authorization/UX/lean review. Fix important findings withRED→GREEN.

### Task7: Frozen release and actual account connection

**Files:** currentrelease manifest/verifiedenv with privatekeys, no secrets inGit; E05 handoff/acceptancematrix.

- [ ] Freeze candidate hashes, preserveR40 rollback artifact, verifybackup and no activewriters before safe additive mainmigration and existingdeployment procedure.
- [ ] FreshpublicHTTPS test: JSONprotocol/discovery/OAuth/negativepermission gates; verifySIWC mainhealth remains unchanged in scope.
- [ ] Give owner testedendpoint/name/description/OAuthconnection steps. ActualChatGPT connection/subscription/job/file capabilities await owner's account action.
- [ ] After connection, collect actualB/C/D evidence; never replace account proof with fixtures.

### Task8: Documentation and handoff

**Files:** E05 evidence/matrix, existingREADME/PROJECT_STATUS, `/home/galaxy_os/prompt`memory/checkpoint/status/handoff.

- [ ] Record MCP_ENDPOINT/OAUTH/CHATGPT_CONNECTION/EVENTS_ROUNDTRIP/ARTIFACT_ROUNDTRIP with timestamp and concrete receipts.
- [ ] Supply subscription/stop prompts and originalGalaxyUI samplejob steps, testcommands/results, branchHEAD+sessiondiff and reversibleapp rollback preservingdata.
- [ ] Keep E04/CP91/R41 history intact; ownerauthorizedE05 is distinct from resuming unfinishedR41features.

Plan self-review: every requested behavior maps to Task1–8; each reviewfocus has a negative/recoverycase in Task2–5. ActualChatGPTroundtrip cannot be claimed before owner's connection action. No commitstep or newpaidservice is authorized.

# E05 — Galaxy OS MCP → ChatGPT Work → Project Chat

Version: E05-SPEC-r1. Written: 2026-10-12T06:58:30Z.
Status: APPROVED_BY_OWNER / IMPLEMENT_INLINE. Approval: owner selected "Duyệt thiết kế; triển khai inline" in the current conversation on12October2026. Product implementation begins from this approved scope.
Source: owner's MCP endpoint request in the current conversation, 12 October 2026.

## Outcome and scope

From the existing Project AI chat, the user selects ChatGPT Work, attaches original files and sends an original request. Galaxy saves a durable job in that same conversation. A verified MCP subscription receives a small `galaxy.ai_job.created` webhook. ChatGPT reads the job and its authorized files through MCP, reports actual progress, and returns text plus file references. Galaxy downloads, validates and stores actual output bytes in its existing Files storage before completing the original answer. Reload and service restart preserve the job and artifacts.

This is a new inbound MCP transport for the existing Galaxy application. SIWC remains a separate, working outbound integration. The deferred Workspace Agents path remains deferred. No paid API, new hosting service, account upgrade, new chat domain or second file store is part of this design.

## Evidence before implementation

- Root entry: `/home/galaxy_os`, branch `g00/build-test-isolation-20260914`, HEAD `1a59665854c99a1298f47a71c6852917eb2c8e7c`.
- Canonical application source: `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`, HEAD `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`; the substantial existing dirty tree is preserved.
- Fresh `python3 scripts/local-runtime.py status`: main R40 `local-a3f58e989d9f`, API 3001 and Web 3000 READY, database schema94, zero pending migrations. This describes the deployed artifact, not the dirty application source.
- Fresh public GET `https://os.galaxycentre.vn/mcp`: HTTP307, `Location: /login?returnTo=%2Fmcp`. The target MCP endpoint does not currently exist.
- Existing Edge terminates TLS on8443 and sends application traffic to Next.js. PostgreSQL5432 and Redis6379 are present. Document AI remains inactive.
- `WorkspaceConnectorAuth.enabled()` and `ProjectAiWorkspaceService.enabled()` deliberately reject Workspace calls. The old hand-written MCP controller supports older protocols and text-only results. It is not the requested endpoint and will not be enabled to implement this feature.
- CP91 records unfinished R41 source, including an API focused test failure. R41 is not deployed and must not be presented as verified MCP work or silently substituted for the R40 runtime.

## Protocol sources and pinned packages

Official OpenAI pages fetched on12October2026:

- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/build/mcp-events
- https://developers.openai.com/plugins/reference
- https://developers.openai.com/plugins/quickstart

The SDK upstream confirms MCP2.0/protocol `2026-07-28` uses the v2 split packages. Registry metadata currently reports:

- `@modelcontextprotocol/server`2.3.1, Node>=20.
- `@modelcontextprotocol/node`2.1.1, Node>=20.
- `@modelcontextprotocol/server-legacy`2.3.1, Node>=20; its OAuth authorization-server helpers are frozen compatibility APIs, as explicitly documented by the upstream.
- `standardwebhooks`1.1.1.

Use these exact versions and the installed Zod4 schemas. Use the current MCP server and Node adapter for protocol handling, with custom Events methods validated against the documented schemas. Use the SDK OAuth router/provider contract for authorization-code/PKCE/token/revocation behavior, with Galaxy-specific persistent storage and consent. This avoids implementing OAuth wire handling from scratch or upgrading the existing runtime.

Tradeoff: the upstream recommends a dedicated identity provider for new authorization servers. `oidc-provider`9.12.2 was inspected and requires Node22LTS or later; the actual runtime is Node20.20.2. A separate Node22 identity service would add runtime and deployment scope. The initial design therefore uses the current, published SDK compatibility OAuth helpers. It does not claim those helpers are the recommended greenfield IdP. Replacing them later does not change the resource/tools/job contract.

## Architecture and reuse

Recommended: integrate the MCP protocol boundary into the existing NestJS API. Edge routes the exact MCP and OAuth/discovery paths directly to that API. The authenticated Galaxy UI continues using the existing Web→API proxy. Alternatives considered: a separate MCP service adds a second deployment and access layer; enabling the old Workspace connector invokes a explicitly deferred execution model and does not support Events or artifacts. Neither is selected.

Canonical domain data remains:

- `ChatAiConversation`: the existing Project AI thread.
- `ChatAiAnswer`: the original immutable user request and durable job/result; `job_id` equals its existing answer ID. The saved original user-message identity is this ID, as in the existing SIWC task contract. No parallel `AiJob` or chat table is introduced.
- `ChatAiSourceIndex`/dependencies: selected original input files, exact versions, checksums, source provenance and authorization proofs.
- Existing Project context/history/memory services: server-filtered, versioned context.
- Existing IAM/`ProjectChatPolicy`: fresh account, organization, Project, room, source and file permissions.
- `FileAsset`, `EntityAttachment`, existing resumable uploads, `FileStorage` reservations/publish and download APIs: physical output storage.

New persistence is limited to protocol records: OAuth clients/grants, event subscriptions/outbox/delivery receipts, result-part/import receipts where required for idempotent transfer. These records reference the existing answer; they do not become another business job source of truth. Job creation and event outbox insertion occur in one database transaction. Outbox processing uses the existing database-worker/lease pattern, not another Redis/Bull queue.

The existing SIWC worker only claims its own workflow metadata. MCP jobs carry a distinct versioned transport marker and cannot be claimed by SIWC, even after restart. The old Workspace worker stays disabled.

## Routes and authentication

Public target: `https://os.galaxycentre.vn/mcp`.

- `/mcp`: MCP2.0 Streamable HTTP transport; `server/discover` advertises tools and events.
- `/.well-known/oauth-protected-resource/mcp`: canonical protected-resource metadata;401 carries its URL in `WWW-Authenticate`.
- `/.well-known/oauth-authorization-server`: metadata for the Galaxy inbound MCP authorization server, when enabled.
- `/mcp/oauth/authorize`, `/mcp/oauth/token`, `/mcp/oauth/register`, `/mcp/oauth/revoke`: the maintained SDK OAuth router's endpoints, mounted with configured canonical URLs.
- An authenticated Galaxy consent screen uses the existing login and session. No password or OAuth code is requested in chat.

Scopes: `galaxy.jobs.read`, `galaxy.jobs.write`, `galaxy.events`.
The client registration request supplies the actual client metadata and redirect URI. DCR stores the exact validated HTTPS redirect URIs received during connection; the implementation does not invent a client ID or a callback. Initially allow ChatGPT's documented `chatgpt.com` HTTPS origin, exact redirect matching, no credentials or fragment, authorization-code with PKCES256 and refresh tokens. Reject other grant types and arbitrary redirect destinations.

Galaxy issues independent inbound MCP tokens. Store only token/code hashes; bind tokens to issuer, canonical `/mcp` resource, expiration, scopes and the consenting Galaxy user/organization membership. Authentication and each data operation reload IAM and membership validity. A caller-supplied user/organization ID never defines authority. A job's requester and authorized Project determine the write destination.

Fresh Owner authority in their organization is honored through existing IAM. Do not create Owner impersonation, cross-organization privileges, permission grants or role-name bypasses. Disconnect/token revocation stops future tool access and subscription delivery. Token scopes do not grant business approval or access to financial fields beyond the actor's existing permissions.

## Durable job contract and UI

`ChatAiAnswer.question` preserves the exact text. Versioned MCP metadata retains organization/Project/conversation/original-message/requester identities, input-source versions/checksums, authorized context snapshot/references, required output format, status/progress/error and timestamps. No prompt/file/context is promoted into system authority.

The initial flow targets the existing private Project AI thread. It does not auto-publish private answers into a shared room or to external participants. Existing room/item context can be included only after IAM checks. The job cannot be relocated by any result argument.

Job phases: `WAITING_NOTIFICATION`, `NOTIFIED`, `PROCESSING`, `RECEIVING_FILES`, `NEEDS_INPUT`, `COMPLETED`, `ERROR`, `CANCELLED`; transport failures and retry scheduling are recorded independently. An expired network operation or failed download does not complete the job. There is no total job deadline, tool-call ceiling or total-file ceiling. Bounded HTTP bodies, per-operation network timeouts and actual disk capacity remain operational constraints; large context/text/results are paginated or transferred in batches.

Add a clearly named ChatGPT Work execution choice in the current composer without changing its SIWC default. The UI shows recorded progress, answer text, existing previews and Galaxy download links; diagnostics stay in expandable details. Reload reads the existing conversation history. Cancel and retry operate on the same answer/job ID. There is no claim of a complete activity stream or an enforced ChatGPT model/Ultra mode.

## Events

Expose `galaxy.ai_job.created` with an optional authorized `project_id` filter. Event data contains `job_id`, `project_id`, `thread_id`, `source_message_id`; full request/context/file bytes come from tools. Only jobs owned by the subscribing authenticated user and in their authorized organization/Project are eligible.

Implement `events/list`, `events/subscribe`, `events/unsubscribe` on the authenticated MCP endpoint. Normalize filter JSON before deriving a deterministic subscription ID from principal/name/filter/callback. Validate secret as `whsec_` plus base64 that decodes to24–64bytes. Encrypt stored callback secrets; temporary download credentials are also never logged.

Verify callback ownership with a signed, fresh, single-use, short-lived challenge and constant-time comparison of its2xx JSON echo before activating delivery. Require HTTPS, validate all DNS addresses at connection time, pin the connection to an approved public address while preserving TLS hostname verification, and block redirects/private/local addresses. The same checks apply to delivery.

Each delivery signs the exact serialized bytes once with Standard Webhooks and sends `webhook-id`, `webhook-timestamp`, `webhook-signature`, `X-MCP-Subscription-Id`, Content-TypeJSON. Reject event bodies over256KiB. A2xx response records notification acceptance only. Delivery retries use bounded backoff per attempt without abandoning the durable job after an arbitrary attempt count. Preserve event IDs across retries and use unique outbox/delivery identities.

Subscriptions survive restart, refresh in place, expire when their granted lifetime ends, stop after idempotent unsubscribe and recheck IAM before sending. Retain job outbox records independently of subscriptions so a disconnected/reconnected account can recover its own pending jobs. Do not advertise replay support unless its stored cursor semantics are implemented and tested. Completion/progress/artifact imports never emit `galaxy.ai_job.created` for the same job.

## Tools

Every tool has a Zod/JSON schema, accurate read/write/idempotency/open-world/destructive annotations, OAuth scopes, and a server-side job relationship check.

1. `galaxy_get_job(job_id)`: immutable request, input manifest, required output/completion criteria, status, origin identity and timestamps. It must not expose another user's private thread.
2. `galaxy_get_job_context(job_id, cursor?)`: Project facts, relevant memory with revision/verification/source/time, authorized prior conversation; pages declare coverage and a continuation cursor. Snapshot references are checked against fresh source access before returning.
3. `galaxy_get_input_file(job_id, source_id, version)`: exact permitted original bytes through a bounded Galaxy download grant, plus name/MIME/size/checksum. Its download route rechecks the job/source/version/access and can be consumed by ChatGPT's runtime. Reading bytes is verified in actual acceptance, not inferred from metadata.
4. `galaxy_report_job_progress(job_id, operation_id, stage, message?)`: idempotent durable state transition/receipt for accepted/processing/needs-input/receiving/error. No fabricated percentages or internal reasoning.
5. `galaxy_submit_job_result(job_id, submission_id, sequence?, content?, files?, finalize)`: append/checkpoint text and file batches; finalize only after the canonical answer and required artifacts have been verified and stored. Repeated parts/batches/finalize return the same saved receipt or a conflict when content differs. Arguments cannot specify a different destination Project/thread.

The top-level `files` array uses `_meta["openai/fileParams"]:["files"]`. Each item declares all four properties: required `download_url` and `file_id`; optional `mime_type`, `file_name`. Do not require the optional properties. No sandbox filesystem paths are treated as remote download URLs.

## Output byte transfer and completion

Validate supported HTTPS URL destinations at each connection, reject redirects/private addresses, preserve TLS validation, and stream remote bytes into the existing resumable-upload/storage path. Signed queries are allowed in this specific transfer path but never written to logs or returned to Galaxy users. Do not reuse the public-web reader's rule that rejects signed URL query parameters.

Bind imports to job+submission+externalfileID; preserve streaming checksums, reserved capacity, file-type validation, and publish-before-reference semantics. Verify content signatures and existing Office container checks. Create source/FileAsset links and the saved-artifact receipt in an authorized transaction. Record partial/failed transfer without losing completed files. A retried temporary URL for the same file must still satisfy stored identity/checksum semantics.

Supported output types follow actual existing file validators: XLSX/DOCX/PDF/images/video and other already accepted formats. Any format or ChatGPT runtime capability not verified is labeled unsupported/unverified. For requiredXLSX, finalize rejects missing/unavailable/invalid workbook; acceptance downloads the Galaxy file, reopens it with the existing workbook library, and checks expected sample values. Text tables never satisfy requiredXLSX.

The resulting artifacts are linked to the original conversation/answer and shown using the current artifact/download components. No temporary ChatGPT URL is substituted for a storedGalaxy file.

## Verification and release

A: protocol/discovery/OAuthDCR/PKCE/resource/issuer/scopes/expiry/revocation and negative cross-Project/user/organization/file cases; correct unauthenticated401JSON, no NextHTML/login redirect.

B: after the owner connects the tested endpoint, inspect tools/events discovery, actual subscription/challenge, delivery2xx, ChatGPT tool reads/progress/text result in the originalGalaxy thread. This needs an owner-side account action; local tests are not a substitute.

C: a synthetic quotation sample with known rows/totals; ChatGPT reads actual original bytes, generatesXLSX, passes a real `files` value, and Galaxy persists/downloads/reopens/validates it. GeneratedDOCX/PDF/image/video support is reported separately by actual type tested.

D: duplicate subscribe/webhook/result, interrupted imports, invalid URLs/containers, concurrent finalization/cancel, revoked access, expiration and restart. Jobs/results survive; missing required files never becomeCOMPLETED.

Run TDD and targeted tests first, then repository gates `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`. Keep any pre-existing failure separate and diagnose release-blocking failures before claiming a releasable tree. Run correctness/security/authorization/UX and Ponytail diff reviews. Use the existing G00 isolated database and browser fixture process, never reset the main database or overwrite live build artifacts.

Create additive Prisma migrations through the prescribed migrate workflow, reviewSQL, test with migrate deploy against the isolated database, then back up/verify before main application. No applied migration is edited. Preserve dirty source and pending R41 work; the release manifest must identify the exact candidate tree and explicitly account for included source.

Deploy through the current frozen-release/runtime procedure only after its gates. Rollback disables new MCP routing/worker and returns API/Web/Edge to the recorded previous artifacts. Keep additive migration data and existing jobs/files; use fix-forward database recovery, no destructive down migration.

## Expected source reach

- New protocol boundary under `apps/api/src/mcp/`: module, OAuth adapter/consent, server/tools, events/outbox, result transport and focused tests.
- Existing `apps/api/src/app.module.ts`, `main.ts`, `project-chat/project-chat.module.ts`: wiring/exports; MCP routes and SDK mounting.
- Existing `project-ai.service.ts`: reuse authenticated snapshot/proof/source operations; distinct MCP view/state and protection against SIWC claiming/retrying MCP answers.
- Existing Files/Uploads service: reuse streaming validation/reservation/linking and expose only the internal hooks necessary to attach returned artifacts atomically.
- Existing Prisma schema plus a new additive migration for protocol persistence.
- Existing `apps/edge/src/edge.ts` and tests: exact path routing to API; correct Host/HTTPS/header handling and scrubbed logs.
- Existing ProjectAI composer/answer types/tests plus consent page/proxy behavior: create/show/retry/cancelMCP jobs, preserveSIWC.
- Config template/README/runtime release verification and `/home/galaxy_os/prompt` checkpoint/status/handoff.

Do not modify financial/domain approvals, shared room publishing, SIWC credentials, Workspace configuration, DNS/router/firewall, or unrelated product behavior.

## Approval and honest handoff

The owner's request authorizes this feature and implementation/deployment work within available permissions. The owner explicitly approved this concrete written design and selected inline execution in the current conversation. Execution remains CodexCLI inline/native. No commit/push/tag/PR is authorized.

Until implementation and live checks occur: `MCP_ENDPOINT: NOT_IMPLEMENTED (public307 verified)`; `OAUTH: NOT_IMPLEMENTED_FOR_TARGET`; `CHATGPT_CONNECTION: NOT_TESTED`; `EVENTS_ROUNDTRIP: NOT_TESTED`; `ARTIFACT_ROUNDTRIP: NOT_TESTED`.

After release, the handoff gives the testedURL, nameGalaxyOS, accurate description, OAuth selection/DCR details, exact Work subscription/stop prompts and the existingGalaxy UI steps for the syntheticjob. Do not ask the owner to connect an endpoint still returning a login redirect.

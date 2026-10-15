# E05 Bidirectional Foundation Implementation Plan

> For agentic workers: use superpowers:executing-plans inline. Track each task and evidence below; never commit/push.

Goal: both @Galaxy OS and Galaxy answer real Project queries immediately through common services, SIWC handles language with minimal context, and Work jobs deliver durable real results with honest states.
Architecture: extend existing MCP/Nest domain modules and ProjectAiService/ChatAiAnswer; explicit executors plus direct data route; existing IAM, memory, Files and event outbox. No second business system.
Tech stack: strict TypeScript, NestJS, Prisma/PostgreSQL, Next.js, existing MCP2 SDK/OAuth/Standard Webhooks/SIWC provider.
Spec: /home/galaxy_os/prompt/E05_BIDIRECTIONAL_FOUNDATION_DESIGN.md — owner approved SPEC-F1 and inline in current session.

## Global constraints

Frozen r14 untouched; mainDB schema97 retained unless a reviewed additive migration is necessary. New release ID/hashes/full gates bind exact candidate. Existing dirty source/R41 preserved. Existing5jobtools compatible. New data scopes need genuine owner consent; SIWC independent. No paid API/Workspace Agents/UI automation ChatGPT, SQL/shell tool or identity injection. Read tools use current Project/domain permissions; no extra business approval for reads. No code/file/job result lost on reload/restart/retry/cancel.

## Review focus

- Nonempty read scope but revoked/staff Project permission must never expose another Project; Task2/3 ACL/revoke tests.
- Typing/upload/resume cannot submit twice or route differently from saved draft; Task1/4/6 browser/idempotency tests.
- Count with pageSize1/search/customer/status/Lead overlaps uses aggregate and same predicate, not array length; Task2 tests.
- Old version/operation retry after edit/revoke cannot overwrite/create another record; Task3 CAS/receipt tests.
- Work callback ACK/subscription cache does not imply model processing or effective model, and late output after cancel/attempt change cannot complete; Task1/5 tests.

## Task1 — Root trace and honest waiting UI

Files: apps/web/features/project-chat/project-ai.tsx, mcp-ui.test.tsx, new mcp-readiness.tsx/test; existing E05 browser spec. Preserve ProjectAiAnswer status internally; render mcpJob.state for Work and proper author; no generic RUNNING inference label. Read existing /mcp-connection for composer scope-aware readiness; callback cache expiry shown honestly. Same job can continue after subscribe; no cancellation at warning threshold.
Interfaces: McpReadiness(connection,projectId,now) → explicit connected/subscribed/project-filter state; no create job or inference. AiAnswer remains backwards compatible.

- [x] RED static renderer reproduces WAITING_SUBSCRIPTION + generic processing; GREEN4 focused.
- [ ] Add composer readiness/filter/expiry tests and implement minimal component/useEffect using existing API.
- [ ] Browser type-only, send greeting/one-character/count/file separately; assert type-only creates zero jobs, each actual submit one job/current thread. Record synthetic vs live explicitly.

## Task2 — Shared Project aggregate and MCP core read tools

Files: projects.service.ts/tests, projects.module.ts exports as needed, mcp.business.ts/schemas/test, mcp.server.ts/module.ts/oauth schemas, mcp-work.integration tests.
Interfaces: ProjectsService.count(actor, filters) uses listWhere shared with list; result count/scope/filters/queried_at. McpBusinessTools actor-first methods workspace/count/list/project/summary; transport wrapper verifies OAuth data.read then calls fresh permission/domain policy.

- [ ] RED aggregate ≠page length with multiple Project statuses/deleted/Lead and actor scopes.
- [ ] Extract existing list predicate once; count calls Prisma.count only; list still same filters and financial projection.
- [ ] Register schemas/descriptions/annotations for workspace context/count/list/get/summary + jobs list/status; old5 preserved. Add data.read/write to metadata; insufficient scope emits challenge.
- [ ] G00 end-to-end MCP positive scopes and crossOrg/Project/revoke/expired/no-permission negative tests; no read→inference/job loop.

## Task3 — Existing business records, files, memory and safe writes

Files: existing relevant module/services/controllers, mcp.business schemas/adapters tests; tasks.service.ts/test, existing Project memory functions, FilesService and mcp controller/file ticket.
Interfaces: typed RecordKind enum with explicit service/permission list/get methods and per-kind schemas; search uses shared service converted from SearchController when necessary. File reads/tickets check current actor/version and existing FilesService, no job requirement. Memory delegates existing version/provenance/clientKey logic. Task mutations use stable operation_id+payload digest+actor in existing Activity transaction, expected_version CAS and domain workflow.

- [ ] Build capability matrix from actual public service methods for all requested domains; mark absent backend/unsupported operation exactly.
- [ ] RED list/get/search/file/memory ACL/privacy/pagination/source-version tests; implement thin adapters and standalone original bytes/tickets, bounded text/parser reuse.
- [ ] RED note/task create replay, changed payload, old version, concurrent updates and lost rights; implement atomic domain receipt/version guard using existing Activity/Memory sources, preserve API callers.
- [ ] Expose valid existing draft/transition operations only with specific input schemas and permission/approval checks; add their focused tests; no broad entity mutate.

## Task4 — Galaxy direct route and SIWC lightweight execution

Files: new project-chat/ai-execution.ts/test; ProjectAiService/controller/DTO/module; existing ai-tools/ai-chatgpt-plan; UI composer/ai-draft types/tests.
Interfaces: requested_executor AUTO/SIWC/MCP_EVENTS; effective_executor GALAXY_DATA/SIWC/MCP_EVENTS. Router receives original question, attachment/output needs and existing conversation intent; direct count/list/search calls shared Task2/3 domain services; SIWC local function callbacks call same services.

- [ ] RED recognizable count →GALAXY_DATA/no provider/context files, greeting+ambiguous one-char →GENERAL SIWC, artifact need →Work only if ready, explicit choices never silently fallback.
- [ ] Persist original request/executors/settings in existing answer metadata, direct answer in same thread with receipt; no outbox for direct reads.
- [ ] Use current SIWC account catalog and existing refresh/respond terminal parser; context minimum required and history retained. No planner for plain GENERAL chat; function results returned to model for language queries.
- [ ] Add AUTO to composer/recoverable draft and display actual route; unavailable path explains immediately while preserving draft/job.
- [ ] Live SIWC catalog + one greeting/one ambiguous request; record first output/terminal/request/model/effort acceptance, no inference false success.

## Task5 — Shared context, Work lifecycle, trace and files

Files: existing workspacePrepare/ContextBuilder, mcp jobs/events/results/network/controller and tests, Project AI view/UI.
Interfaces: versioned trace request_id/message_id/job_id/attempt/event_id + phase timestamps/receipts (null when not observed); existing cursor/context/source refs; NEEDS_INPUT continuation same job/attempt.

- [ ] RED receive/noSub/ACK/read/progress/needs-input/file-save states do not imply completion; add safe trace spans and readback.
- [ ] Use common context retrieval and route-specific serialization; count avoids file/memory; real file snapshots preserve version, omissions/next cursor explicit.
- [ ] Continue same job for user reply to NEEDS_INPUT, output sequencing/file retries/late attempts and canceled target fenced; tests before fixes.
- [ ] Actual subscription/delivery/tool/result proof from current owner, then isolated live CSV+memory/XLSX download/reopen/retry/unsubscribe/revoke; never promote fixture evidence to live.

## Task6 — Model/reasoning/capabilities and latency

Files: existing connection/catalog/capability/provider and UI controls; targeted preference tests only relevant to new flow.
Interfaces: account catalog + current generation; requested/sent/provider-reported model+effort separate; service tier configured only with supported contract and live acceptance, otherwise unavailable. Work model/effort managed by Work, effective unknown.

- [ ] RED account/model switch invalidates unsupported preferences, plain fast mode does not always deep/max, manual supported settings transmitted unchanged.
- [ ] Preserve current SIWC login; current model list/refreshed catalog, wire evidence and first output observer; unsupported tier no fake controls.
- [ ] N repeated warm/cold acceptance/count readings with load/variance/errors, p95 from sample set; provider latency samples described individually if N small.

## Task7 — Candidate, checks, deployment and live acceptance

Files: runtime packaging/stage artifacts/scripts/checkpoint/status/handoff. Only source deltas from r14 approved scope in new release; unrelated paused R41 excluded unless deliberately covered and verified for current feature.

- [ ] Focused suites and browser acceptance for modified surfaces. Full lint/typecheck/test/build/format once on exact final candidate; only repeat for failure/new source risk.
- [ ] One independent whole-change correctness/security/ACL/UX/Ponytail review. Record root trace before/after, tool schema matrix, measured latency and exact live gaps.
- [ ] Freeze fresh release ID/checksums/private tree; manifest/schema/artifacts/units/env and compatible rollback validation. No secret in examples/logs.
- [ ] If sudo unavailable, prepare complete one owner command before interruption; verify public metadata/routing/tools after activation.
- [ ] Owner Rescan/consent new data scopes and live @plugin count/list/project/file/write; Galaxy count same definition, SIWC greeting/ambiguous, Work file/memory XLSX and retry/revoke. Any missing live stage stays unverified.

## Execution ledger

Canonical ledger /home/galaxy_os/prompt/E05_FOUNDATION_IMPLEMENTATION_LEDGER.md. Inline method persists. Ruling: no commit/branch finishing or scratch deletion because owner prohibits Git publication and needs durable evidence. Ruling: focused suites per task, one full final candidate regression per owner requirement; no blind broad reruns. Review/receipts bind frozen baseline and file hashes rather than HEAD-only diff, because source has preserved preexisting user work.

> Current review r4 / 2026-10-10T05:37:43+07:00: r6 native-web privacy fence closes the reachable mixed-private-context/public-search issue. Independent final four-file review:0Critical/Important, one optional Minor unreachable capability check at project-ai.service.ts:2927. TDD admission+queuedpin+UI RED→GREEN, fresh unit1900/static/build PASS. Full integration/exact browser release gate BLOCKED by Windows reserved fixture port55435; r6 is not deployed. Main safe r3/schema90 READY; owner personal-account Workspace ineligible/provider entitlement UNVERIFIED. [Final handoff](/home/galaxy_os/.worktrees/m2-a-20260928/docs/galaxy-os/handoffs/2026-10-10-e01-siwc-context-session-close.md). Earlier reviews below are historical.

> Current review r3 / 2026-10-09T19:30:55+00:00: independent whole-change review completed with four Important gaps; catalog isolation, exact discovery matcher, SIWC record/table reuse and Auto route are now implemented. Follow-up typed record-provenance defect reproduced and fixed,30unit PASS. Real PostgreSQL8PASS; independent focused re-review closes all Critical/Important findings. Full regression/build/browser/release gates remain pending. Earlier r2/r1 verdicts below are historical.

# E01 current review — r2, 2026-10-10

ID: E01-REVIEW-r2. Version: r2. Time: 2026-10-09T19:01:52+00:00. Type: CODE_REVIEW + VERIFIED_REGRESSION. Scope: E01 dirty canonical source and connected callers; one API instance, private published pilot per actor/Project, concurrent jobs are durable and lease-fenced. Source: independent reviewer messages and parent source/test inspection in CP-r14. Supersedes r1 open tool-budget finding; r1 remains below.

What this change does: It opens the tested SIWC tools, exact effort and native web request fields. It adds a separate Workspace credential, published model binding, scoped OAuth/MCP result destination and durable canonical chat jobs. It keeps answers and citations without another model rewriting them.

Fixed findings:

1. History/tool continuation could exceed64 records: lossless history JSON parts, original question and linked tool records preserved; repeated-round and Unicode regression.
2. First native MCP call returned proxy403 instead of OAuth401: originless connector calls reach backend authentication, cookies stripped, foreign Origin/business CSRF still denied; RED→GREEN50proxy tests.
3. Workspace reused remote context after cancelled/revoked jobs: key includes immutable answer ID; retry uses the same job key.
4. Expired/revoked Galaxy session left active jobs queued: UnauthorizedException now closes job/answer through existing compare-and-swap.
5. Workspace model selection depended on SIWC catalog: independent Project-scoped published/consent model+effort catalog and composer route.
6. Workspace ancestry re-entered proofs exponentially: one traversal/cache,12turns4095→≤24 answer reads; revoked ancestry denied.
7. One published agent could map separate principals without proven memory isolation: config validates unique agent as well as principal/channel; RED→GREEN11settings tests.

Existing minor r1 sourceConfirmed flag remains deferred; deleting a historical interface is unnecessary for E01 bridge. No new dependency, chat engine, memory engine, or paid service.

Verdict: release gates pending. Full independent reviewer stopped at usage limit after five Important findings; those were fixed/tested, but no full independent PASS is claimed. Parent correctness/security/ACL/UX review is continuing.
Not checked: real Workspace entitlement/published configuration/consent/round-trip/media; final source full regression/browser/deployment still pending.

## Historical review r1 — retained

# E01 Ponytail review — 2026-10-09

**ID:** E01-REVIEW-r1. **Version:** r1. **Time:** 2026-10-09T16:38:32.875889+00:00. **Type:** CODE_REVIEW + ARTIFACT_SELF_CHECK. **Status:** REVIEW_COMPLETE_WITH_OPEN_FINDING; no product fix or deployment. **Source:** user `$ponytail:ponytail-review`, current source, fresh unit tests and compiled serving-artifact self-check. **Scope:** all uncommitted product changes in canonical `/home/galaxy_os/.worktrees/m2-a-20260928`, plus root documentation; base HEAD `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`. **Supersedes:** E01-CP-r10's current no-open-review-finding status for this broader scope; its prior six-file review, 37 live answers and deployment remain historical evidence.

What this change does: It adds the owner SIWC connection, private and shared Project memory, longer chat history, summaries and memory tools. It checks current Project and source permissions before sending or showing results. I reviewed the uncommitted changes for multiple tabs, Projects and overlapping jobs on the current single API deployment.

**Must fix:**

1. **Long chats can fail after valid tool calls** ([ai-history.ts:179](/home/galaxy_os/.worktrees/m2-a-20260928/apps/api/src/project-chat/ai-history.ts:179), [project-ai.service.ts:4378](/home/galaxy_os/.worktrees/m2-a-20260928/apps/api/src/project-chat/project-ai.service.ts:4378)).
   - **What this is:** History packing leaves eight slots for tool work; each slot holds a message or tool record. The loop also keeps provider reasoning records, which carry state into the next request.
   - **Problem:** With 27 short history pairs, packing produces 56 records. Four accepted tool calls, one reasoning record and four results bring the next request to 65; the local 64-record limit rejects it with `INPUT_BUDGET_EXCEEDED` before the next provider call.
   - **Fix:** Make history packing account for each tool continuation, preserving the original question and complete call/result pairs. Add a regression for reasoning plus four calls near the limit and for repeated tool rounds.
   - **If we skip it:** A long conversation can fail instead of returning an answer even when the model and tools work correctly.

**Nice to have:**

2. **Remove the unused source-confirmation flag** ([project-ai-memory.service.ts:44](/home/galaxy_os/.worktrees/m2-a-20260928/apps/api/src/project-chat/project-ai-memory.service.ts:44)).
   - **What this is:** `sourceConfirmed` is carried in an internal source-proof object.
   - **Problem:** All ten assignments set it to `false`; no code reads or stores it. The unused flag adds maintenance work and suggests a check that does not run.
   - **Fix:** Delete the field and its assignments from production code and test fixtures: eleven lines total. Keep the existing stored verification states and permission checks.
   - **If we skip it:** Behavior stays the same, but developers continue maintaining a meaningless flag.

Fresh verification: API **103/103** and Web **22/22** unit tests passed; `git diff --check` passed before documentation recording. The serving artifact's actual response parser accepted the synthetic reasoning and all four calls, and each call's arguments passed its tool schema. Its actual history-budget code rejected 65 records; removing one complete old history pair gave 63 and passed. This self-check made **zero provider calls** and touched **no database**.

Commands run:

```sh
pnpm --filter @galaxy/api exec vitest run src/project-chat/ai-history.test.ts src/project-chat/project-ai-history.service.test.ts src/project-chat/project-ai-memory.service.test.ts src/project-chat/ai-chatgpt-service.test.ts src/project-chat/ai-chatgpt-plan.test.ts src/access-control/project-chat.policy.test.ts src/settings/chatgpt-connection.test.ts --no-file-parallelism --poolOptions.forks.singleFork
pnpm --filter @galaxy/web exec vitest run features/project-chat/project-ai.test.tsx features/project-chat/project-ai-memory.test.tsx
node /tmp/galaxy-e01-20261009/ponytail-review-tool-budget.cjs
```

Reproduction evidence retained here, independently of temporary logs:

| Field                                              | Actual result                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Artifact code inspected                            | `/home/galaxy_os/.runtime/releases/e01-t1-p1-b-20261009-r3/apps/api/dist/project-chat/` |
| Self-check time                                    | `2026-10-09T16:35:40.686Z`                                                              |
| Packed input / tool calls / reasoning / results    | 56 / 4 / 1 / 4                                                                          |
| Continued input / error                            | 65 / `INPUT_BUDGET_EXCEEDED`                                                            |
| Control with one complete history pair removed     | 63 / PASS                                                                               |
| Parser / tool argument schema                      | ACCEPTED / ACCEPTED                                                                     |
| Provider calls / DB touched / product code changed | 0 / false / false                                                                       |

The scratch self-check and raw receipt are under `/tmp/galaxy-e01-20261009`; the verified facts above are durable. Current source and artifact are not patched. No OAuth changes, installation, migration, rollback, stage, commit or push occurred. Full 2120-test regression and 37 live answers are previous E01-CP-r10 evidence, not tests rerun for this review; they did not establish this boundary case.

Next implementation step: reproduce finding 1 with a failing tool-loop regression, make the smallest history-budget fix, then rerun the affected tests and live long-history/tool acceptance before release. Reuse P1 approval; do not reopen its architecture or alter the existing 64-record/wire/ACL gates. E01 new-feature plan review and Workspace published binding/result delivery remain separate pending work.

Verdict: fix 1 first.

Lean: -11 lines possible.

Not checked: a live provider run at the failing boundary or larger load; Workspace/file acceptance; a fresh full regression. The deployed artifact still contains finding 1.

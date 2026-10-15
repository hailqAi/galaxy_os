# E05 continuation plan — 2026-10-13

Authority: current owner instruction to implement/test/deploy E05, plus approved E05-SPEC-r1 and inline execution. This refines the existing architecture; no new chat, queue, file store, paid provider, or Workspace Agent is introduced. Paused R41 changes and frozen r4 are excluded from the new candidate.

Design decisions: existing `notificationGeneration + 1` is the externally visible attempt. Every progress/result stage, including upload publication and error recording, checks that attempt inside the existing authorized transaction. Valid prior result checkpoints survive a retry. Own-account connection state uses persistent existing OAuth/subscription/delivery records, with public probe evidence stored in OrganizationSetting. Existing settings/Project Chat UI shows those facts and actual saved media. Deployment admission is enforced by the Edge and candidate API; the operator waits for admitted requests and the known job/upload/delivery workers to settle. A unique deployment journal, atomic config replacement, root preflight, exact schema readback, readiness/content checks, and reverse-order rollback replace handoff-r3 shell steps.

1. Reproduce and fix attempt fencing, readable persisted results, waiting-for-subscription state and OAuth boundary contracts with focused tests.
2. Add personal MCP status/public-probe/revoke endpoints and connection UI; improve saved result/media/progress UX with focused API/Web checks.
3. Add server admission and a tested deployment/recovery script. Refuse missing sudo authority before changing services. Check actual schema rather than copying a fingerprint; preserve current data.
4. Freeze r4 plus only this continuation's reviewed source changes as a new release. Run focused G00/recovery/browser tests and one set of mandatory full gates on those exact bytes. Request final independent review.
5. Activate within available authority; verify public protocol/OAuth and business write/read. If system Edge authority is still unavailable, hand the owner one fully prepared command that authenticates before any interruption and keep R40 serving. Proceed to owner OAuth/ChatGPT Events/XLSX only after public verification.

Review focus: stale results during an upload/retry; revoked identity/Project; metadata200 versus real account/subscription evidence; partial deployment failure and original-backup preservation; malformed OAuth errors without leaking credentials; request/worker drain races. Evidence is private under `/home/galaxy_os/.runtime/e05-mcp-20261013`. No commit/push or DB restore is authorized.

Fresh baseline: actual API/Web R40 health200, Edge old release; sudo requires password. Production probe using direct network path returns307 resource-metadata→Web login. Main/G00 schema definitions are identical (4456), applied97/unresolved0. r4 freeze metadata retained the pre-migration structure value; do not use that stale expectation or describe it as a G00 schema difference.

What this change does: The uncommitted P1/E01/E02 work keeps SIWC as the main chat route and disables new Workspace dispatch. It adds real Office files, source reading, web tools, resumable uploads and Project memory through the existing domains.

Reviewed on 2026-10-11 Asia/Bangkok. Scope: the dirty canonical checkout at `/home/galaxy_os/.worktrees/m2-a-20260928`, including connected callers, tests, migrations, configuration and release tooling. Expected load: one API process with concurrent users, Project tabs and file jobs. Root documentation was checked for release claims; unrelated design PDFs were excluded.

**Must fix**

1. **Files can use up their retries while waiting in the batch.** [project-ai.service.ts:1964](/home/galaxy_os/.worktrees/m2-a-20260928/apps/api/src/project-chat/project-ai.service.ts:1964)
   - **What this is:** Source indexing claims up to 25 files at once. A lease is the time during which a worker owns a file; every file receives the same 60-second deadline, but reads run one after another.
   - **Problem:** The deployed implementation was reproduced with 25 existing CSV sources and a controlled clock advancing 20 seconds per read. Only six sources become READY after three passes; 19 reach three failed attempts and a fourth pass processes none. Each individual read is below 60 seconds. The streamed publication guard rejects the expired lease at line 2098, and the error path spends the attempt. `hasMore` is also false in these passes. This is a deterministic scheduling test, not a measured disk-throughput result.
   - **Fix:** Claim each source immediately before reading it, using the existing guarded transaction, and count the attempt then. Add one regression with several queued sources whose combined read time exceeds the lease while each individual read fits.
   - **If we skip it:** A valid source can become unavailable to AI because other files took time. Normal index retries stop; the original uploaded file remains intact.

**Should fix**

2. **Failed SIWC calls disappear from the per-call model/MAX trace.** [project-ai.service.ts:6355](/home/galaxy_os/.worktrees/m2-a-20260928/apps/api/src/project-chat/project-ai.service.ts:6355)
   - **What this is:** `siwcRequests` records the requested, sent and observed model and effort for each provider round. A receipt is added only after the provider result resolves successfully.
   - **Problem:** A simulated HTTP 400 for `reasoning.effort` was passed through the real R8 request encoder, HTTP error decoder and `runChatGpt`. The wire contains `account-model` and `max`; the answer saves FAILED, HTTP 400 and the upstream request ID, but `siwcRequests` is empty. The connection service saves a last-error summary, not the missing per-call receipt. The same omission applies when a round times out or its stream breaks.
   - **Fix:** Record a receipt on the failure path as well. Preserve the known requested/sent fields and request ID; mark rejection or unknown acceptance explicitly and leave missing observations null. Distinguish errors before dispatch from calls actually sent, and test one rejected request.
   - **If we skip it:** Support cannot reconstruct all model/MAX attempts from the answer's trace. In a multi-round job, the failed final round is absent while earlier successful rounds remain.

Fresh checks: seven focused API test files, **228/228 PASS**, with the existing isolated G00 fixture configuration; `git diff --check` PASS. Both reproduction scripts assert the defects against compiled release R8; they use simulated storage/database/provider responses and make no real provider calls or database writes. A first direct test invocation failed because it lacked the test environment and sandbox permissions; the corrected invocation passed. No product fix was made.

Release binding: CODE_SHA `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`; prior release TESTED_TREE `d6ecacdfbea565e16f398782242fccd2db044d90`; artifact `local-2837e21d800f` at `/home/galaxy_os/.runtime/releases/e02-tools-20261010-r8`; sourceDigest `2837e21d800fd771ae70b65c794e63c5b2ae0e283a7981438fd2b253c1086dfc`. Fresh comparison of 923 manifest hashes found no product-source differences and only two previously changed STATUS documents. Review documentation is a later documentation delta, not a new build or tested tree.

Private technical evidence, without tokens or customer content:

- [Lease reproduction](/home/galaxy_os/.runtime/e02-review-20261011/source-lease-repro.cjs), output `source-lease-repro.json` in the same directory.
- [Failed-request reproduction](/home/galaxy_os/.runtime/e02-review-20261011/failed-request-trace-repro.cjs), output `failed-request-trace-repro.json` in the same directory.
- [Fresh test receipt](/home/galaxy_os/.runtime/e02-review-20261011/focused-tests.json) and [test log](/home/galaxy_os/.runtime/e02-review-20261011/focused-tests.log).
- [Source bindings](/home/galaxy_os/.runtime/e02-review-20261011/source-bindings.json).

Verdict: fix 1 first.

Not checked: fresh full regression/build, browser/provider live acceptance, physical 10 GB transfer or measured disk load. The earlier r44 acceptance keeps its original scope; it does not cover the newly reproduced batch and failed-call cases. This review leaves source, deployment, credentials and data unchanged; both findings remain open.

What this change does: E02-4 adds typed multi-sheet workbooks with formula caches, editable native PPTX drafts, and private Office previews to the existing document tool and file flow. It also pins the OfficeCLI runtime asset and keeps source/version checks around generation and storage.

Independent read-only Ponytail full, correctness, security, authorization, load and UX review against immutable `/home/galaxy_os/.runtime/releases/e02-tools-20261010-r4`. Canonical source is `/home/galaxy_os/.worktrees/m2-a-20260928`; both CODE_SHA values are `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`, so the snapshot hashes, not that shared Git SHA, identify this review. Scope follows the approved E02-4 design/plan. No implementation, database mutations, commits, credential reads or additional agents were used.

Reviewed identity: [32-file manifest](/home/galaxy_os/.runtime/e02-20261010/changed-files-r5.json), SHA256 `c34ad51c2b0393cee4b193644b105f4bb55da04ebe2c1c40b477b289485937d2`. All 32 file hashes matched when inspected. Key reviewed hashes:

| File                         | SHA256                                                             |
| ---------------------------- | ------------------------------------------------------------------ |
| `ai-workbook.ts`             | `a1041dce5ee4053cc72d4e3533e79f0a696df11002da7025b5e77d983129a9ad` |
| `office-presentation.ts`     | `a2025563fa7ac3f69113ff5d8d85ccc7ed7eb2f6bc26119601422d0d302cc978` |
| `ai-office-preview.ts`       | `349529ef212bcfa0d222a122421a8ec7e60809637160649e493cf15b575ca379` |
| `project-ai.service.ts`      | `020cb5c1a04ae39965f607d15899e4ef7fae56a1148cc65b479771ee7ab49913` |
| `project-chat.controller.ts` | `0e31f8f2f362258c131dfd21cce75dbe2a17869055ce3915253e16249a70479c` |
| `project-ai.tsx`             | `cd4a6c90d389eda27bd5e2b921dbcc9f17b9a7645ffa2c5b7ea5b73e37269347` |

**Must fix**

1. **The web path strips the preview security policy and blocks the iframe.** Connected files: `apps/web/app/api/v1/[...path]/route.ts:88,186`, `apps/web/proxy.ts:45`, `apps/web/next.config.ts:21`; new callers `project-chat.controller.ts:207`, `project-ai.tsx:477`.
   - **What this is:** The API emits a strict sandbox CSP for generated Office HTML, and the UI embeds that same-origin API URL.
   - **Problem:** The Next API proxy does not forward Content-Security-Policy. The parent page permits only blob frames, while every response receives X-Frame-Options:DENY. Thus the real iframe is blocked; direct preview navigation also loses the server sandbox policy. The new browser assertion for script-src 'none' cannot pass through this route.
   - **Fix:** Preserve the strict preview CSP through the API proxy and narrowly allow the existing scoped preview route to be framed, replacing DENY only there. Keep other routes protected. Test headers through the real web path and assert actual iframe content/rendering, not only that an iframe element exists.
   - **If we skip it:** Preview is unusable in the application, and generated HTML can be opened on its origin without the required CSP sandbox. API-only preview tests cannot catch this.

2. **Nested chart workbooks bypass the archive expansion budget before the sandbox.** `apps/api/src/files/office-presentation.ts:18,28,34`; callers `files.service.ts:320`, `ai-native-source.ts:50`; existing archive budget `office-archive.ts:11`.
   - **What this is:** Uploaded or indexed PPTX files can contain XLSX chart data; these ZIPs are expanded synchronously in the API process before OfficeCLI runs.
   - **Problem:** Each embedded archive starts a fresh 32MiB expansion/2048-entry budget. The code also accepts a named XLSX containing only arbitrary binary parts, without an XLSX main structure. A read-only actual-code reproduction accepted a 2,038-byte PPTX with three 16,512-byte embedded ZIPs and inflated 50,381,738 bytes. Each inner archive contained only `xl/blob.bin`.
   - **Fix:** Share an aggregate expanded-byte/entry budget across the outer PPTX and its embedded workbooks; enforce a small supported embedded-workbook count and validate the expected XLSX structure/content. Add an aggregate nested-archive regression, retaining the real generated chart positive case.
   - **If we skip it:** A small authorized upload can repeatedly expand far beyond the stated bound on the API event loop. The worker's no-network/memory/deadline safeguards arrive too late.

3. **Formula cache readback does not establish Excel arithmetic coherence.** `apps/api/src/project-chat/ai-workbook.ts:127,144,169,176,187,296`.
   - **What this is:** An 80-digit Decimal evaluator computes a cache, writes an Excel formula and sets fullCalcOnLoad. ExcelJS then reads back that same cache.
   - **Problem:** Operand and final checks allow precision-risk intermediate operations. Actual-code input add `[100000000000000,0.01,-100000000000000,1]`, decimalPlaces=2, is accepted with formula `ROUND(((100000000000000)+(0.01)+(-100000000000000)+(1)),2)` and cache/text `1.01`; the binary64 arithmetic chain is `1.015625`. The first intermediate exceeds the advertised 15-significant-digit subset. Excel uses binary arithmetic with additional near-zero compensation, so rereading the self-written cache cannot certify its recalculated result. This is an inference from the reproduced arithmetic and [Microsoft's documented Excel precision behavior](https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/floating-point-arithmetic-inaccurate-result), not a claim that installed Excel was run.
   - **Fix:** Fail closed on precision-risk intermediates, including this cancellation case. Add a regression and an independent formula/reference arithmetic check for the accepted subset; the cached-result readback should remain an integrity check, not be presented as recalculation evidence. No new calculation engine is required merely to reject this unsafe case.
   - **If we skip it:** Opening/recalculating an editable financial workbook can change a value that the stored text and receipt describe as verified.

**Should fix**

4. **A version2 Word/PDF draft receives an XLSX formula notice.** `apps/api/src/project-chat/ai-document.ts:82`, `project-ai.service.ts:4706`.
   - **What this is:** Version2 DOCX/PDF with blocks is accepted, including version-pinned revisions.
   - **Problem:** The output notice chooses the XLSX-v2 wording based only on version===2, so a Word/PDF tool result claims multi-sheet numeric/formula caches.
   - **Fix:** Also require format==='xlsx' on that notice branch. Preserve generic private DRAFT wording for DOCX/PDF.
   - **If we skip it:** Tool receipts misdescribe the artifact and can lead the model to repeat an unsupported formula claim.

Other connected checks: v1 text-only XLSX coercion remains inert; original files receive new binaries rather than overwrite. Exact predecessor/source pins and current actor/Project/source ACLs are rechecked in the upload transaction; preview authorization is checked before reading and again after rendering. Per-call replay keys, three-artifact limit, model/MAX continuation and the shared inference deadline remain. The native generator receives only schema-controlled values and verified image bytes; model paths, hosted images, arbitrary formulas, external relationships, macros and OLE are excluded. The worker uses a clean bwrap namespace with no network/home/auth mounts, read-only input, bounded processes/output and cancellation/time allowances. These controls do not resolve finding2.

Dependency review: package and lock pin PptxGenJS4.0.1 and npm integrity `sha512-TeJISr8wouAuXw4C1F/mC33xbZs/FuEG6nH9FG1Zj+nuPcGMP5YRHl6X+j3HSUnS1f3at6k75ZZXPMZlA5Lj9A==`. Its [upstream manifest](https://raw.githubusercontent.com/gitbrent/PptxGenJS/v4.0.1/package.json) declares MIT, and the [release](https://github.com/gitbrent/PptxGenJS/releases/tag/v4.0.1) identifies the signed3c9ec1b commit. The adapter does not expose upstream filesystem/HTTPS media arguments. The release helper hashes the configured OfficeCLI asset and includes it in runtime fingerprints. No extra engine/platform/domain model is recommended.

Evidence inspected: focused67/67, real OfficeCLI DOCX/XLSX/PPTX schema+HTML tests3/3, workbook revision and native PPT real-database tests. Reviewer independently reproduced findings2 and3 in memory using the actual TypeScript implementations and installed JSZip/ExcelJS/Decimal; no customer data or database was involved. Full-r7 was still running, with lint exit1/typecheck exit0 at inspection, so no full-pass claim is made. API-only worker/integration success does not certify the connected browser preview.

Revision evidence proves wrong sourceVersion rejection, original binary preservation and same-run replay. Competing revisions from one immutable predecessor were not tested; this report does not claim a single-winner concurrency CAS guarantee where branching semantics have not been specified.

During review, workbook/workbook-test, presentation/presentation-test and presentation-reader-test bytes changed after the reviewed manifest. This report applies to the manifest above; subsequent repairs require fresh hashes and re-review. It does not use previous R4 acceptance to certify E02-4.

Verdict: fix1–3 before release; fix4 for truthful tool receipts. No speculative lean refactor is required.

Not checked: actual installed Excel recalculation, the completed fresh full suite, frozen candidate identity/browser results, deployed native Office live acceptance or customer PPTX import fidelity.

---

Second read-only review, 2026-10-10 07:52 UTC. The initial report above is retained verbatim as the initial verdict and reproduced RED evidence. The original three Must-fix findings and format-notice finding are closed in the revised connected source. Final source verdict: no remaining concrete Must-fix or Should-fix at this inspection; release acceptance remains pending.

The complete second report is [review-r5-r2.md](/home/galaxy_os/.runtime/e02-20261010/review-r5-r2.md). It binds the 42-file manifest SHA256 e5ed862bcba784ee54229fad0b97dbc9981e944379a9d9332ba9202ce2d493ee and patch SHA256 4b84df84ff2b7624eec664684c336a270ce03af058b0551b36af709ff2d0c469 to seven explicitly re-reviewed replacement hashes. The supplied manifest/patch predate those repairs; a refreshed frozen identity and fresh checks are required before release.

Reviewer independently reran pure workbook/presentation/archive tests: 27/27 PASS. Financial/archive, connected web policy, native worker, notices and existing XLSX repair logs were inspected. Later static sheet visibility/image-anchor matching and scoped cancellation repairs are source-reviewed; actual iframe/browser, final full checks, frozen/deployed/provider acceptance and installed Excel recalculation are not certified by this addendum. Exact predecessor/replay/original preservation evidence does not establish unspecified single-winner revision branch semantics.

Final source binding, 2026-10-10 07:56 UTC: [42-file review3 manifest](/home/galaxy_os/.runtime/e02-20261010/changed-files-r5-review3.json) SHA256 842f3281ab9c5ba39cb0ceffbbe44fcdf38cdcbef69ae425735dc4eb53bc63a0; [complete R4 diff](/home/galaxy_os/.runtime/e02-20261010/e02-r5-review3-delta-r4.patch) SHA256 c04e05a0bf0d730d06d628b71327e3fac51185c36b760ed07140f66b5c9d9ecf. All42 hashes match; reviewer independently regenerated that full patch from immutable R4 and current files byte for byte. This final binding supersedes the intermediate review2-plus-replacements identity above. Latest media Buffer guard, PAGE field, image sheet/anchor/hash matching and scoped preview cancellation are re-reviewed. Focused38 API including actual worker3 and web58 PASS; API build repair inspected. R8 test/build/format failures are retained as failed evidence; fresh full-r9 is running with lint/typecheck0. Source verdict remains no concrete open Must-fix/Should-fix. Final full/frozen/browser/deployed/provider gates remain pending.

Attribution correction, 2026-10-10 08:09:49 UTC: the second runtime report incorrectly identified OfficeCLI source commit as 1a59665854c99a1298f47a71c6852917eb2c8e7c. That is the enclosing Galaxy OS root repository HEAD: Git traversed upward from the downloaded source archive. The verified OfficeCLI v1.0.156 tag points to component commit 699cafbc8f0b8a7841c6cca53dafd0c24e982f56, confirmed by [cached upstream tag record](/home/galaxy_os/.runtime/e02-20261010/officecli/tag.json) and the [canonical adoption record](/home/galaxy_os/prompt/GALAXY_AI_TOOL_ADOPTION_MATRIX.md:10). The runtime report attribution is corrected. The reviewed source manifest, OfficeCLI binary pin, earlier verdicts and evidence boundaries are unchanged; this correction adds no browser, provider or deployed acceptance claim.

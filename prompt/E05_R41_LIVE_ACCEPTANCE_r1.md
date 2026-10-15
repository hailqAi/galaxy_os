Owner update: “Thấy đủ, reload vẫn còn” confirms PUBLIC_BROWSER_ACCEPTANCE for the exact R41 thread. Additional independent XLSX preview defect was found afterward; source fix/tests are in CP-r28, not deployed yet. R41 original four-fix roundtrip acceptance remains PASS.

# R41 — actual Work acceptance

Updated 2026-10-14T20:51:39.194075+00:00. User activation completed; API/Web/Edge are running R41 `local-69a93613bb87`, WebBuildId `jv6Osgj6hyvPyud8hNCPr`, schema98, runtime persistence protocol `mcp-data-v3`. Deployment session `/home/galaxy_os/.runtime/e05-deployments/20261014T202116Z-78ed27774bae40b89877344fafb76b83`, state ACTIVE_PUBLIC_VERIFIED. No new deploy is required. Source/package hashes and four-fix regression details are in [patch report](/home/galaxy_os/prompt/E05_R39_REVIEW_PATCH_r1.md).

| Status                    | Result and scope                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| LOCAL_CODE_VERIFIED       | PASS frozen R41 scope and source-bound composite regression from CP-r25                    |
| RUNTIME_ACTIVE            | PASS actual API56724/Web56726/Edge57022 directories, readiness and schema checks           |
| PUBLIC_VERIFIED           | PASS six MCP/OAuth HTTPS contracts, correct release headers/resource/issuer                |
| OAUTH_AUTHENTICATED_TOOLS | PASS existing owner old/R21 connections; Project/memory/job reads and result replay        |
| EVENTS_LIVE_VERIFIED      | PASS real subscription callback ACK + Work tool/progress calls                             |
| WORK_ROUNDTRIP            | PASS original job processed by external Work, text/progress/results persisted              |
| ARTIFACT_ROUNDTRIP        | PASS real XLSX+PDF bytes persisted, downloaded from HTTPS Galaxy, content/formulas checked |
| PUBLIC_BROWSER_ACCEPTANCE | PASS_OWNER_CONFIRMED: full text + both files visible and retained after reload             |

## Actual job and usable files

[Open exact public thread](https://os.galaxycentre.vn/projects/f758dec5-3cd7-485d-b827-a8c563dd70cd/ai?ai=1daf50a2-db44-4769-95d6-c60d0c25e711).

- Project `E05 MCP Work nghiệm thu 14-10-2026`, UUID `f758dec5-3cd7-485d-b827-a8c563dd70cd`.
- Thread `1daf50a2-db44-4769-95d6-c60d0c25e711`; job/source message `02915ea0-5b94-4119-8f19-cef6450af48f`; attempt1.
- Event `0a20123b-8c39-435a-9316-a035ae101bc2`; request `e05-r41-live-cad82986-ab4d-4bee-91a2-831dc57da6ce`; submission `galaxy-02915ea0-5b94-4119-8f19-cef6450af48f`.
- [Download XLSX from Galaxy](https://os.galaxycentre.vn/api/v1/project-chat/projects/f758dec5-3cd7-485d-b827-a8c563dd70cd/ai/files/8a569b6f-1c03-4793-892f-f6794c90f52f/download): `E05_R41_Doi_chieu.xlsx`,5244bytes,FileAsset`f7a6c307-5369-4110-9bfe-58567fc6b796`,receipt`437b17cf-f875-47ec-9d39-3c094fdd444e`,SHA256`b56f0f077b1cafcde429dbcb1b4209ca0d7bf4425a009453265862810dd0db1d`.
- [Download PDF from Galaxy](https://os.galaxycentre.vn/api/v1/project-chat/projects/f758dec5-3cd7-485d-b827-a8c563dd70cd/ai/files/6729986f-4de9-4369-8e60-14deb90f8611/download): `E05_R41_Doi_chieu.pdf`,48061bytes,FileAsset`cb7d0d29-8911-48ed-a436-e104aca56164`,receipt`92aca6da-3034-423f-bfcd-222015bb788d`,SHA256`53e221c25344954bebcc483c8de28186965907fc4ed86f633b03619e2d55fa37`.

These are stable authenticated Galaxy download paths, not sandbox or signed temporary URLs. Test PDF input had only item codes/quantity/unit prices; discount10% and VAT8% were taken from existing confirmed private testProject memory. XLSX sheet `Doi chieu`: rows19/20 contain3×100000 and2×150000; E19/E20 formulas yield300000 each; E5=sum600000,E6=discount60000,E7=net540000,E8=VAT43200,E9=payment583200. All seven formula dependencies and independent arithmetic verified. PDF one page contains matching values and provenance. File bytes were not rewritten. Native Excel desktop was not tested; ExcelJS probe failed on prefixed OOXML, while the existing bounded XML decoder opened and verified it successfully.

Job created via actual compiled composer-domain service using verified current OAuth identity, not browser composer input. One durable job/outbox and original request/source pins; only serving process owned dispatch. Actual existing Work delivered text sequence0 before files; job remained incomplete until both receipts AVAILABLE, then finalized20:38:56.457Z. Authorized main-chat history returns full text1699UTF8 bytes and both file cards, stable job identity. Actual MCP replay of same text/sequence/submission/finalize returned COMPLETED with the same two receipts; fresh history read retained one assistant entry/onepart/two artifacts. No second message or file created. Owner confirmed the full text, both file cards and reload persistence in the exact public thread. The earlier service re-read alone was not used as browser proof.

## Latency — one sample

| Observed boundary                        |  Duration |
| ---------------------------------------- | --------: |
| Composer-domain create, excluding upload | 246.681ms |
| Context preparation                      | 142.675ms |
| Persistedjob→callbackACK                 |    2.631s |
| ACK→firstobservedWorkget_job             |   28.118s |
| Firsttool→firstprogressreceived          |   14.027s |
| Firsttool→firsttextpersisted             |  168.780s |
| Text→bothfilesAVAILABLE                  |   13.328s |
| Receiptallocation→XLSXAVAILABLE          |    1.866s |
| Receiptallocation→PDFAVAILABLE           |    1.220s |
| Persistedjob→COMPLETED                   |  236.667s |

Samples1, warm service, one user, two-row PDF+confirmed memory, existing active subscription. Callback exact successful status/send-start and internal Work scheduling/inference/model times were not persisted; label them unknown. Receipt duration includes validation/storage, not just network. Prior150.554s short-text case was a different workload; no p95 or causal speedup claim. Root Codex replay occurred only after Work completion, explicitly distinguished in trace/evidence.

## Owner browser check completed

Open the exact thread link above. Confirm full text and both file cards are in main chat, then reload and verify the same result/file cards without duplicates. Download both if desired; source/receipts above already confirm actual HTTPS bytes and valid content. No sudo or new activation needed. Owner replied “Thấy đủ, reload vẫn còn”. Automated connector browser tooling could not find Chrome; no login/session was fabricated. Additional XLSX preview source patch is tracked in CP-r28 and is not deployed yet.

Historical jobs `e3ad6597-5e2e-4a87-b8ef-165394f2f0e6` attempt1 and `821fee96-5d1a-4fd5-b985-2f9157cf1427` attempt3 remain ERROR with previous failed receipts. Actual public get_job on R41 now correctly returns requestedxlsx even when old metadata was empty. Installed cached old/R21 submit schemas currently expose only old arguments, omitting new optional artifact_id and supersede_failed_artifact_ids; targeted failed-reference recovery therefore needs supported tool/schema refresh and fresh Work references, then current attempt/submission/receipt verification. No bulk replay or forced DB completion. The existing old connector successfully processed the new job, so deleting it is not established as a file-failure fix.

## Evidence

[Runtime identities/schema](/home/galaxy_os/.runtime/e05-reviewpatch-20261015/runtime-active-r41.json), [six public contracts](/home/galaxy_os/.runtime/e05-reviewpatch-20261015/public-r41-live.json), [live acceptance and limits](/home/galaxy_os/.runtime/e05-reviewpatch-20261015/live-r41-acceptance.json), [actual content/formulas](/home/galaxy_os/.runtime/e05-reviewpatch-20261015/live-r41-content-verified.json), [safe tool trace](/home/galaxy_os/.runtime/e05-reviewpatch-20261015/live-r41-tool-trace.json), [same-result replay](/home/galaxy_os/.runtime/e05-reviewpatch-20261015/live-r41-replay-receipt.json). Canonical business source unchanged since frozenR41; only runtime probes/checkpoints added. No commit/push/reset/migration/production restart during acceptance.

If rollback is actually needed, use this compatible v3 session, retain current DB/files:

```sh
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261015-r41/scripts/deploy-mcp-release.py rollback --plan /home/galaxy_os/.runtime/e05-reviewpatch-20261015/runtime-stage-r41/plan.json --session /home/galaxy_os/.runtime/e05-deployments/20261014T202116Z-78ed27774bae40b89877344fafb76b83 --authenticate-sudo
```

Do not run rollback for pending browser confirmation. Model/reasoning work remains deferred; images/audio/video and capacity-exhaustion production events were not live-tested in this acceptance.

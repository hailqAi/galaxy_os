[Latest R41 activation and real Work acceptance](/home/galaxy_os/prompt/E05_R41_LIVE_ACCEPTANCE_r1.md): R41 is now ACTIVE/public verified, real XLSX+PDF roundtrip PASS. Activation-pending details below are historical; do not run activation again. Public browser confirmation remains pending.

# E05/R39 review patch — R41

Updated 2026-10-14T20:08:36.346160+00:00. Code/local verification/stage review complete; R41 is not activated. API, Web and Edge are serving **R39 `local-fe9c081d9a91`**, verified from process directories, systemd units, runtime manifest and HTTPS release headers. Wire MCP2 protocol2026-07-28; runtime persistence protocol `mcp-data-v3`, actual schema98. No migration or production business-data write was needed.

## Four findings

| Finding                                            | Reproduction                                                  | Correction                                                                                                                                                                                                      | Evidence                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Excel requirement lost; text-only completion       | RED shared helper and actual isolated job/finalize service    | Shared normalization preserves Unicode/clause boundaries; explicit export/convert/spreadsheet phrases; structured requirements union text; finalize lists all missing formats, legacy original request fallback | red-output / red-integration / red-newline → final MCP+helper GREEN                |
| Generic PDF wrongly treated as requested XLSX      | RED actual download/storage service with generic MIME/no name | Detect staged bytes before using a format assumption; PDF/XLSX actual content, OOXML decoder; ZIP/DOCX/corruption/conflicting metadata denied; streaming/checksum retained                                      | red-file-isolated → final MCP GREEN                                                |
| Saved partial text remains NOTIFIED                | RED API service and compiled R39 browser                      | Only accepted new current-attempt text promotes waiting→PROCESSING in checked transaction; RECEIVING_FILES/ERROR/NEEDS_INPUT/cancel/completed and replay rules preserved; publish after commit                  | red-browser-repro → compiled R41 mainchat/reload PASS                              |
| Midstream size limit disguised as transfer failure | RED actual small streamed fixture and UI/cause checks         | Preserve classified limit; reject excessive content length before stream; separate disk space/quota; safe receipt/audit/progress and actionable UI; cleanup temporary failed import                             | red-capacity-causes / red-capacity-ui / red-capacity-progress → final MCP/UI GREEN |

Output references with ERROR/superseded receipts, absent bytes/checksum/asset, or Markdown filename cannot satisfy finalize. XLSX+PDF requires both current valid persisted formats. Read-only questions about Excel are not export requirements. Replay does not create progress, duplicate text or another FileAsset. The new first_answer_received_at records Galaxy receipt; it is not a model-start timestamp.

## Changed source

Canonical worktree `/home/galaxy_os/.worktrees/m2-a-20260928`; branch `m2/project-chat-20260928`, HEAD `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`, dirty user work retained. No commit/push/reset. Eleven implementation/test paths:

- `apps/api/src/project-chat/ai-execution.ts`, `ai-execution.test.ts`.
- `apps/api/src/mcp/mcp.results.service.ts`, `mcp.jobs.service.ts`, `mcp.server.ts`, `mcp.artifact-errors.ts`, `mcp.artifact-errors.test.ts`.
- `apps/api/test/mcp-work.integration.test.ts`.
- `apps/web/features/project-chat/project-ai.tsx`, `mcp-ui.test.tsx`.
- `apps/web/tests/browser/e05-mcp-work.spec.ts`.

Root/canonical PROJECT_STATUS and implementation status plus prompt checkpoints updated. All11 code/test paths match the frozen candidate. No product dependency or schema change, no release R39 edit. The R41 snapshot carries preparation-time status; final status written outside the frozen release.

## Exact candidate and checks

Release `/home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261015-r41`, releaseId `local-69a93613bb87`, WebBuildId `jv6Osgj6hyvPyud8hNCPr`.

- Source SHA256: `69a93613bb871599d3db2fea904fc5c2c012c2f589f11bb58e214c9c1d8cda3e`.
- Package SHA256: `c5e5b0779444d4669675930ef548165bd1269dc00c761125c13ca98b91a83152`.
- Metadata SHA256: `29d145e5e8e5d6299068ee204bd5f9aa6f6cc9d0a8bbddc44613e8f56a73b0ae`.
- Plan SHA256: `95357354dbfbf3a46480aa7b4fd85121d6913dc10d92853d06089c1009c82c35`.

Fresh R41 commands from the frozen candidate, with existing isolated G00 environment (never point integration tests at mainDB):

```sh
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
pnpm --filter @galaxy/api exec vitest run test/mcp-work.integration.test.ts src/project-chat/ai-execution.test.ts src/mcp/mcp.artifact-errors.test.ts --no-file-parallelism --poolOptions.forks.singleFork
pnpm --filter @galaxy/web exec vitest run features/project-chat/mcp-ui.test.tsx
python3 -m unittest discover -s scripts -p 'test_*.py'
```

All above PASS. API scope98PASS (MCP64/helper28/error6), UI11PASS, Python95PASS including deployment17, document1PASS. Compiled local browser1PASS before+afterreload and real isolated API SIGKILL/restart/replay1PASS. Recovery job `3756d845-6243-4c22-9f2f-212faf989d2b`, thread `b86041f7-7b1a-4145-a1ef-5627b488878f` is **G00 synthetic, not a ChatGPT roundtrip**.

Broad regression was run once on the R40 patch baseline:113 unaffected API files PASS, Web647/Edge9PASS, but7 MCP tests failed due fixture concurrency/thread history and obsolete ACK-state expectation. Original exit1 and logs remain. Whole MCP module, including its57 PASS cases, is excluded and replaced by fresh finalR41 complete64PASS; fresh document1 completes **2748 composite PASS +1 SKIP**. Independent reviewer verified978/980 unchanged source inputs and coverage of both changed inputs. This is **not fresh full pnpm test on R41**, and no R39 2719 result is reused. See [resolved regression receipt](/home/galaxy_os/.runtime/e05-reviewpatch-20261015/regression-resolved-r41.json) and [source equivalence](/home/galaxy_os/.runtime/e05-reviewpatch-20261015/source-equivalence-r40-r41.json).

[Final independent review](/home/galaxy_os/.runtime/e05-reviewpatch-20261015/final-stage-review-r41.json): SHIP_FOR_OWNER_ACTIVATION, no blockers; all8 plan hashes/15 artifact-config digests/12 bound evidence hashes verified. Frozen release's own `check` PASS against actual main schema98, no fingerprint bypass. API/Web remain user hailq_glx; only Edge/nft administration needs terminal sudo.

## Activation — one owner terminal command

Noninteractive sudo requires owner authentication; Codex has not interrupted any main service. Run exactly this one line in the Galaxy Ubuntu terminal. Password is entered only at sudo's terminal prompt.

```sh
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261015-r41/scripts/deploy-mcp-release.py activate --plan /home/galaxy_os/.runtime/e05-reviewpatch-20261015/runtime-stage-r41/plan.json --authenticate-sudo
```

The existing script rechecks current R39/schema and frozen identity before drain; tracks unique-session backups and switched components, waits for readiness/public content and automatically restores compatible components on failure. Do not run an old activation or copy DB backups. On success retain the returned session path and send the JSON result. The candidate remains staged while waiting; no admin password through chat.

Rollback, only if required, uses the **exact session returned by that activation**:

```sh
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261015-r41/scripts/deploy-mcp-release.py rollback --plan /home/galaxy_os/.runtime/e05-reviewpatch-20261015/runtime-stage-r41/plan.json --session <exact-session-path-returned-by-activate> --authenticate-sudo
```

This restores R39 **v3**, retains current DB/files/keys, verifies drain/readiness. R32/v2 downgrade is forbidden after v3 admission. No session path invented in advance. [Rollback compatibility proof](/home/galaxy_os/.runtime/e05-reviewpatch-20261015/rollback-v3-proof.json).

## Public and real Work acceptance still required

| Status              | Actual result                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------ |
| LOCAL_CODE_VERIFIED | PASS scoped exact R41 + explicitly bound composite regression, browser/restart             |
| RUNTIME_ACTIVE      | R39 API/Web/Edge; R41 NOT_ACTIVE                                                           |
| PUBLIC_VERIFIED     | R39 six HTTPS MCP/OAuth contracts PASS at2026-10-14T20:06:18.904951Z; R41 not checked live |
| WORK_ROUNDTRIP      | R41 NOT_VERIFIED                                                                           |
| ARTIFACT_ROUNDTRIP  | R41 XLSX+PDF NOT_VERIFIED                                                                  |

After activation, run the prepared read-only verifier `/usr/bin/python3 /home/galaxy_os/.runtime/e05-reviewpatch-20261015/public-verify-r41.py` (it refuses another active release); then verify API/Web/Edge process build identities and core business reads. Check existing subscription ownership/refreshBefore/callback verification before dispatch; one eligible subscription existed earlier, do not create a competing watcher. Connector name alone is not evidence of binding or file failure. No new OAuth scope or connection rebuild is needed for this patch.

Create **one** request in existing test Project `E05 MCP Work nghiệm thu 14-10-2026`, select Work, attach the intended price PDF and explicitly request “Chuyển báo giá thành Excel có công thức, đồng thời xuất bản PDF đối chiếu. Gửi đầy đủ câu trả lời, XLSX và PDF về chính job này.” Preserve original request and scoped Project memory. Read job id/attempt/submission and trace from real records. Executor accepts early, reads actual context/file bytes, sends ordered complete user content and both native file references, checks receipts before finalize. Never replace files with sandbox-path text. Do not create another watcher to accelerate the same job.

Verify text/progress in main assistant message before completion; each imported file has bytes, FileAssetId, checksum and valid receipt; authenticated Galaxy download opens workbook/PDF, correct data/formulas; reload gives same message/files without duplicates; finalize remains blocked until both available. Retain evidence UTC/job/attempt/event/submission ids and hashes, no credentials/signedURLs. Only then mark live statuses PASS. Current default Python UA gets Cloudflare1010; deployment readiness User-Agent passes all6 contracts, so do not mislabel that probe rejection as an app outage.

Historical jobs `e3ad6597-5e2e-4a87-b8ef-165394f2f0e6` (attempt1) and `821fee96-5d1a-4fd5-b985-2f9157cf1427` (attempt3) still have ERROR receipts with no persisted assets/checksums. Recheck actual current state before recovery. Use existing artifact_id/reference refresh and explicit failed-reference supersession only after import succeeds; preserve submission and text. Expired references require fresh native references from Work. No bulk replay, directDB forcecompletion or assumption both original failures had the same cause.

Not checked: R41 production deployment/real Work XLSX+PDF; model control deliberately deferred. No new Work latency claim or p95 from a handful of samples. Original Bus error/import investigation evidence and all business files remain preserved.

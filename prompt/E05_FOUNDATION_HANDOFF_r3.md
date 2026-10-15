# E05 Foundation handoff r3 — diagnosed drain correction R32

Updated 2026-10-14T05:47:06.015855+00:00. R32 is locally verified/staged; serving runtime is still R21. This supersedes R30/R31 activation instructions. Existing approved SPEC-F1 inline scope retained; branch `m2/project-chat-20260928`, HEAD `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`, canonical source `/home/galaxy_os/.worktrees/m2-a-20260928`; dirty user work preserved, no commit/push.

## Concrete owner command

Run as `hailq_glx` in the Galaxy terminal, with sudo only where the script needs Edge/nft system administration. Enter the password at the terminal only. The script refuses root execution; API/Web remain user services.

```bash
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261014-r32/scripts/deploy-mcp-release.py activate --plan /home/galaxy_os/.runtime/e05-foundation-20261014/runtime-stage-r32/plan.json --authenticate-sudo
```

Expected final state `ACTIVE_PUBLIC_VERIFIED` plus exact session path. Send that JSON; if FAILED send safe code. This session's `sudo -n -v` reports password required, so activation was not attempted here. R21 remains healthy while waiting. Keep the current Galaxy OS R21 plugin.

## Cause and correction

R30 aborted before app switch; unique journal/snapshot retained at `/home/galaxy_os/.runtime/e05-deployments/20261014T044102Z-f76d1582a9084721af7740d5be4c3ab9`. A durable native QUEUED job with no provider/lease/attempt was counted active and stuck behind an earlier same-thread Work notification. No active DB transaction/blocking lock or actual provider dispatch was observed. The fixed code keeps native FIFO among native jobs, accounts process claims before DB awaits, stops new polling on drain, and preserves conservative guards on uncertain work. Legacy R21 exception is limited to a genuine matching earlier NOTIFIED blocker. Three read-only actual main samples changed census active1→0 and waiting1; this is not a fenced live cutover proof.

Production changes vs failedR30 are `apps/api/src/deployment-admission.ts`, `health.controller.ts`, `project-chat/project-ai.service.ts`, `scripts/deploy-mcp-release.py`, `scripts/mcp-drain-probe.cjs`. Regression tests cover claims waiting before a DB transaction, drain between poll/claim, native FIFO and unsafe legacy blocker states/principal/order. Provider unit fixture gained the missing `$queryRaw` mock; source/auth assertions stayed intact. R30 frozen bytes were not changed.

## Immutable candidate and verification

- Release: `/home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261014-r32`; releaseId `local-d2565a503380`.
- SourceSHA `d2565a5033807f3b241b4de4751617f844a71ea9d4a19af41b104391b8db9cf1`; packageSHA `7272f939145d5f28234ea55adcbce1fd8685af77144f65d0794c26a350ce82df`.
- MetadataSHA `e071549124e5fa7180115a3ddf276cfce88978a016a30101435dd60e5dd962f1`; tested tree `8c5ea25dc418d137214dc0ab8b6a7e3238c3b88a`; BUILD_ID `39v0wBQAI45EDZpcK15W1`.
- Plan `/home/galaxy_os/.runtime/e05-foundation-20261014/runtime-stage-r32/plan.json`, SHA `4737467ca6cb5b4fc9b7ad61bf0e03caa674f3f85fa7b71b0138f74e391267da`, actual schema98 guard and preserved key/env.
- Local coverage2692PASS+1SKIP is composed, not a single successful full R32 invocation. R31 full had only38 provider-mock failures;112 other API files/Web643/Edge9 passed. Actual975-input byte equivalence established; exactR32 provider115/doc1 passed, API2001−77+115=2039. Original exit1 logs preserved.
- FreshR32 lint/type/format/build, deployment17, browser1, native kill/restart checkpoint/duplicate1 PASS. Artifact digests before/after exercises equal. Stage check and safe isolated user-unit checks PASS, live control-plane sockets unchanged. Final review SHIP_FOR_OWNER_ACTIVATION.
- Evidence: `release-r32-frozen.json`, `regression-resolved-r32.json`, `exercised-artifacts-r32.json`, `stage-check-r32.json`, `stage-units-r32.json`, `final-review-r32.json` under `/home/galaxy_os/.runtime/e05-foundation-20261014`.

Commands actually used for gates: `/usr/bin/python3 /home/galaxy_os/.runtime/e05-foundation-20261014/candidate-gates-r32.py lint typecheck format-check build deployment`; `/usr/bin/python3 /home/galaxy_os/.runtime/e05-foundation-20261014/candidate-extra-gates-r32.py all`; `/usr/bin/python3 /home/galaxy_os/.runtime/e05-foundation-20261014/exercise-r32.py`. These evidence runners protect existing logs and should not be rerun just to display status. Inspect receipts instead. Full R31 command was `pnpm test` via permitted G00 runner, original exit1 retained.

## Verification states

| State                  | Verified scope                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| LOCAL_CODE_VERIFIED    | PASS R32 bounded correction, exact source/build/gates above                                          |
| RUNTIME_ACTIVE         | R21 READY/schema98; R32 NOT_ACTIVE                                                                   |
| PUBLIC_MCP_VERIFIED    | Prior R21 six HTTPS contracts; R32 NOT_RUN                                                           |
| OAUTH_LIVE_VERIFIED    | Existing owner five-scope Galaxy OS R21 consent/tools; R32 NOT_RUN                                   |
| CHATGPT_TOOLS_VERIFIED | Owner count10, Project name/summary, private unverified note write/readback on R21; R32 NOT_RUN      |
| EVENTS_LIVE_VERIFIED   | Real earlier callback/job tools/progress/input bytes on R21; R32 NOT_RUN                             |
| ARTIFACT_LIVE_VERIFIED | NOT_VERIFIED: real XLSX job NEEDS_INPUT/no output artifact; synthetic fixtures remain local evidence |

## OAuth fields

Values unchanged from verified public R21 metadata and source/config R32. R32 public metadata itself is not yet verified. No scope change in this fix; no new consent/reinstall is required.

| ChatGPT field                                        | Value                                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Name                                                 | Galaxy OS (existing plugin Galaxy OS R21 remains valid)                                         |
| Description                                          | Đọc dữ liệu Galaxy được cấp quyền; nhận job Work và lưu câu trả lời/file về đúng Project/thread |
| Server URL                                           | https://os.galaxycentre.vn/mcp                                                                  |
| Authentication                                       | OAuth                                                                                           |
| Registration method                                  | DCR                                                                                             |
| Client ID / Client secret                            | Không nhập thủ công; DCR cung cấp client ID, public client không dùng secret                    |
| Token endpoint auth method                           | none                                                                                            |
| Default scopes                                       | để trống                                                                                        |
| Base scopes                                          | galaxy.jobs.read galaxy.jobs.write galaxy.events galaxy.data.read galaxy.data.write             |
| Auth URL                                             | https://os.galaxycentre.vn/mcp/oauth/authorize                                                  |
| Token URL                                            | https://os.galaxycentre.vn/mcp/oauth/token                                                      |
| Registration URL                                     | https://os.galaxycentre.vn/mcp/oauth/register                                                   |
| Authorization server base                            | https://os.galaxycentre.vn                                                                      |
| Resource                                             | https://os.galaxycentre.vn/mcp                                                                  |
| OIDC enabled                                         | không bật                                                                                       |
| OIDC configuration / userinfo endpoint / OIDC scopes | để trống                                                                                        |

## Post-activation continuation

Prepared bound helpers, not executed on main: `public-verify-r32.py` (six public JSON/401/400 contracts +API/Edge release headers), `run-business-smoke-r32.py` (fresh owner rights, same aggregate Project count, one private trial note with idempotent replay/readback, actual HTTPS input bytes), `run-resume-live-trial-r32.py` (SAME trial clarify with stable operation/attempt/new event), `run-watch-trial-r32.py` (safe IDs/states/checksums, no signed URL/token log). Guards require actual active `local-d2565a503380`. Do not run resume before public/business verification.

Same trial Project `f758dec5-3cd7-485d-b827-a8c563dd70cd`, thread `1e179d35-d5e8-414e-9e30-24e5030ec79a`, job `821fee96-5d1a-4fd5-b985-2f9157cf1427`; original file read by real Work, confirmed memory previously omitted. Oracle gross600000/discount60000/net540000/VAT43200/total583200. Keep original requirement/file/identity and source-backed confirmed memory. After result receipt download Galaxy XLSX, reopen and inspect real cells/formulas; verify reload/retry/no duplicate before PASS. Full capability matrix/AUTO/business-draft gaps remain OPEN.

## Recovery

Activation performs preflight before interruption, unique per-session backups, admission fencing/settle, API/Web→Edge switch, readiness/public content verification, and automatic pre-public rollback of only changed components, retaining current DB/files. No DB restore or applied migration rewrite.

If automatic recovery needs retry before public activation, use the exact `session` returned by the activation JSON (never another deployment's snapshot):

```bash
e05_session='/home/galaxy_os/.runtime/e05-deployments/EXACT_SESSION_FROM_ACTIVATION_JSON'
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261014-r32/scripts/deploy-mcp-release.py rollback --plan /home/galaxy_os/.runtime/e05-foundation-20261014/runtime-stage-r32/plan.json --session "$e05_session" --authenticate-sudo
```

After public MCP-data-v2 admission, downgrade to older R21 receiver is blocked even with no pending jobs. Keep current DB/files/keys and recover forward with a reviewed compatible v2 runtime. Do not manually restore R21 units/Edge or restore an old DB dump to bypass the guard. No live cutover failure drill or live XLSX completion was claimed.

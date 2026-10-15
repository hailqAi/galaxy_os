# E05 nền hai chiều — bàn giao r2 — R30 frozen/staged, R21 đang phục vụ

Cập nhật 2026-10-14T04:10:12.516727+00:00. R30 đã qua kiểm chứng local và stage check; final stage review SHIP, owner activation còn chờ. Chưa chuyển runtime.

Runtime thật: frozen R21 `local-f5576eb2bd2d`, API/Web READY/main schema98 (đo04:08:45Z). Public6contracts đã PASS01:41:02Z. Owner đã cài Galaxy OS R21/five scopes và nghiệm thu thật count10, tìm/tóm tắt Project theo tên, ghi chú riêng PRIVATE/UNVERIFIED/version1; readback03:04:31.753Z, đúng nội dung và Project. Không cần tạo lại plugin/consent cho bản sửa này: tool names/input schemas/scopes giữ nguyên.

Candidate R30 `local-bbdaede6be81`, sourceSHA `bbdaede6be8193725e74209c8330fd98ad99b4b8c234697629f3335c2bc4114b`, packetSHA `ec38a7d60c085bf1c6f1c48252218482bd59e99850178487c877d2bfad86e23e`. Lint/type/format/build PASS; deployment16/browser1/native restart1 PASS; source/preparation review SHIP. Coverage2687PASS+1SKIP ghép từ full run (sole5s timeout, nguyên nhân chưa xác định), full MCP41 chạy lại PASS không đổi mã/timeout và document1 bổ sung. Full run gốc exit1 được giữ nguyên; không nói một lần pnpm test toàn bộ đã PASS. Frozen/stage/check và safe unit verify PASS; final stage review SHIP, owner activation còn chờ. R29 rejected vì typing test; R26 fullFAIL27 giữ nguyên bằng chứng, không reuse thành PASS. Branch m2/project-chat-20260928, HEAD dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e; uncommitted diff, không commit/push.

## OAuth điền theo metadata public R21

Bảng PUBLIC_VERIFIED theo receipt metadata/public01:41Z và actualowner consent02:10Z. Candidate30 config đối chiếu giống public; PUBLIC_NEW_RELEASE chưa chạy.

| Ô giao diện                | Giá trị                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Name                       | Galaxy OS R21 — kết nối hiện có                                                     |
| Description                | Đọc dữ liệu Galaxy theo quyền, nhận Work jobs và lưu text/file về job/thread nguồn  |
| Server URL                 | https://os.galaxycentre.vn/mcp                                                      |
| Authentication             | OAuth                                                                               |
| Registration method        | DCR                                                                                 |
| Client ID / Client secret  | Không nhập thủ công; DCR cấp client ID, public client không có secret               |
| Token endpoint auth method | none                                                                                |
| Default scopes             | Để trống                                                                            |
| Base scopes                | galaxy.jobs.read galaxy.jobs.write galaxy.events galaxy.data.read galaxy.data.write |
| Auth URL                   | https://os.galaxycentre.vn/mcp/oauth/authorize                                      |
| Token URL                  | https://os.galaxycentre.vn/mcp/oauth/token                                          |
| Registration URL           | https://os.galaxycentre.vn/mcp/oauth/register                                       |
| Authorization server base  | https://os.galaxycentre.vn                                                          |
| Resource                   | https://os.galaxycentre.vn/mcp                                                      |
| OIDC enabled               | Không bật                                                                           |
| OIDC configuration URL     | Để trống                                                                            |
| Userinfo endpoint          | Để trống                                                                            |
| OIDC scopes                | Để trống; không quảng bá openid/profile/email                                       |

## Các sửa đổi và bằng chứng

- Work/SIWC context đọc đủ các quy tắc USER_CONFIRMED còn quyền theo trang, cộng các note liên quan; không yêu cầu câu hỏi chứa nguyên văn keyword của memory. Context nguồn/phiên bản được giữ, quá giới hạn SIWC báo rõ thay vì âm thầm bỏ quy tắc.
- Clarify cùng job refresh memory trong transaction; giữ nguyên request/file/thread và artifact/source-backed lineage, tăng attempt và event đúng fence; operation retry không tạo event trùng.
- list_files/read_file đọc private Chat attachments của chính connected owner qua source IDs và checkSource hiện hữu. Hai nhóm Files/privateChat có pagination/count rõ; thiếu private access không báo số0 giả. Financial classification/revoke áp dụng cả ticket cũ.
- Proof memo theo authority context, native ancestry được tái dùng khi đã kiểm cùng call; mutable leaves vẫn đọc lại ở call mới, cycle/sourceversion/quyền tổng vẫn kiểm. Persisted flattened summaries chỉ được dùng sau kiểm owning answer; direct raw summary/missingancestor bị từ chối.
- Receiver `mcp-data-v2`: sau mở public, chặn mọi downgrade sang v1, kể cả không còn pending state. Recovery phải dùng receiver v2 tương thích, không xóa dữ liệu/khôi phục DB cũ. Lỗi cutover trước mở public vẫn có rollback tổ hợp API/Web/Edge dưới admission fence.

Focused source35unit PASS; G00 native24turn PASS108.305s, summary-origin/revokedsummary và uncommitted-target rollback2PASS; selected MCP/privatefiles/clarify/discovery/ACL đều qua. Coverage exactcandidate và toàn bộ gate đã được bind trước freeze; xem regression-resolved-r30.json với originalFullExit1.

## Vòng Work thật còn mở

Project “E05 MCP Work nghiệm thu 14-10-2026”, cùng job821fee96-5d1a-4fd5-b985-2f9157cf1427/thread1e179d35-d5e8-414e-9e30-24e5030ec79a. Event DELIVERED01:58:47.180Z, Work bắt đầu02:00:05.191Z, đọc6493B XLSX/đúngSHA và dữ liệu gross600000, NEEDS_INPUT02:00:34.422Z vì memories=[]; không generatedartifact, chưafinalize. Sau activate/public/business gates sẽ tiếp tục cùng job bằng domain clarify idempotent, không sửa DB snapshot hay tạo job thay thế. Oracle chỉ dùng thử: discount10%/VAT8% afterdiscount trong confirmed Project memory; expected583200. ChatGPT phải thực tạo XLSX, Galaxy tải/lưu bytes và mở lại workbook mới ghi ARTIFACT_LIVE_VERIFIED.

## Giới hạn bằng chứng

Actual @plugin count/name/summary/note và Work event/inputtext đã verified; private file lookup sau correction/chỉnh model trong UI/lưu XLSX thật/reload/retry artifact chưa đạt. G00 HTTP50warm count p9580.304ms/AUTO70.647ms, không đo latency provider/main. SIWC actual probes catalog7/gpt-6.1-sol low sent+provider-observed: greetingfirst2986ms/full3403ms, một ký tự2493/2783ms mỗi1mẫu; không phải p95. Work model/reasoning engine unknown, do Work quản lý; service tier không được quảng bá điều khiển.

AUTO direct chỉ count có intent xác định; workspace list/search/get direct AUTO chưa mở hết (MCP tương đương đã có). Domain20typedrecord reads đã expose theo service/quyền; write hiệntask/note vàjobresult. Standalonefile save/businessdraft/transitions và các ca nghiệm thu chưa làm nằm trong capability matrix, không báo “mở đầy đủ” giả.

Quyền quản trị: sudo-n hiện cần owner nhập tại terminal; không chạy toàn bộ Codex root/không yêu cầu mật khẩu qua chat. Final frozen/stage review SHIP_FOR_OWNER_ACTIVATION; lệnh exactactivate đã sẵn sàng. Galaxy giữ R21 READY trong khi chờ terminal owner.

## Frozen/stage identity và lệnh kiểm tra read-only

- MetadataSHA `46d2dda586547ba1a655289f31d9fc448f771ba5da379b95e3fd600e6783caa2`; testedTree `0c43f2c66da6508d74d00a9e645193697d83fbe7`.
- WebBUILD_ID `7RGVxxg--BnwQIYDF7XPM`; planSHA `01c7b3a7dc10354db4241059f28f58149b53c7f6e3e80da2c8b5a606d20e4916`.
- Stage `/home/galaxy_os/.runtime/e05-foundation-20261014/runtime-stage-r30`;8hashes/4artifactDigests/main98, không rotate keys.
- Stage check và isolated unit verify PASS04:35:54Z; bus/private socket inodes không đổi.

```bash
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261014-r30/scripts/deploy-mcp-release.py check --plan /home/galaxy_os/.runtime/e05-foundation-20261014/runtime-stage-r30/plan.json
GALAXY_LOCAL_RUNTIME_MANIFEST=/home/galaxy_os/.runtime/local-runtime.json /usr/bin/python3 /home/galaxy_os/.worktrees/m2-a-20260928/scripts/local-runtime.py status
```

Lệnh kiểm thử exactcandidate (môi trường G00/production build được các wrapper guard): `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test` (originalexit1 retained), `pnpm --filter @galaxy/api exec vitest run --no-file-parallelism --poolOptions.forks.singleFork test/mcp-work.integration.test.ts` (41PASS), `services/document-ai/.venv/bin/pytest services/document-ai` (1PASS), `pnpm build`, `python3 -m unittest scripts/test_deploy_mcp_release.py` (16PASS). Receipt/binder/exercise không thay bằng chứng ChatGPT thật.

## Kích hoạt được duyệt tại terminal owner

Review frozen/stage SHIP_FOR_OWNER_ACTIVATION; sudo-n passwordrequired đã xác minh. Chạy dưới hailq_glx, chỉ Edge/nft/system operations dùng sudo. Script xác thực sudo trước gây gián đoạn; snapshot theo phiên/atomic/journal; server admission/worker/socket fence; API/Web → Edge → readiness/public6contracts. Không restore DB/schema98, không sửa frozen R21/R30.

```bash
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261014-r30/scripts/deploy-mcp-release.py activate --plan /home/galaxy_os/.runtime/e05-foundation-20261014/runtime-stage-r30/plan.json --authenticate-sudo
```

Receipt cuối cung cấp state và session thật. Sudo nhập ở terminal máy Galaxy, không gửi qua chat. Sau receipt tôi kiểm tra runtime/public/business và clarify cùng job XLSX (helpers bound exactrelease) để phát event attempt mới, kiểm tra workbook thật khi có receipt.

Rollback trước mở public tự phục hồi tổ hợp API/Web/Edge theo journal và giữ dữ liệu hiện tại. Manual rollback cần exact session do activate trả, chưa có session R30 để bịa đường dẫn:

```text
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261014-r30/scripts/deploy-mcp-release.py rollback --plan /home/galaxy_os/.runtime/e05-foundation-20261014/runtime-stage-r30/plan.json --session <SESSION_TUYET_DOI_DO_ACTIVATE_TRA> --authenticate-sudo
```

Sau mở public mcp-data-v2, downgrade về R21/v1 bị chặn kể cả không còn pendingstate; recovery forward receiver v2 tương thích, không xóa receipts/jobs/tickets để ép guard. Lệnh rollback có thể báo ROLLBACK_PROTOCOL_STATE_INCOMPATIBLE_KEEP_CURRENT_RUNTIME và giữ receiver hiện tại.

| Trạng thái nghiệm thu  | Kết quả ở thời điểm bàn giao                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| LOCAL_CODE_VERIFIED    | R30 PASS;2687+1SKIP composite rõ originalfullExit1; browser/restart/build/deployment/review PASS                            |
| RUNTIME_ACTIVE         | R21 READY/schema98; R30 chưa activate                                                                                       |
| PUBLIC_MCP_VERIFIED    | R21 PASS6contracts; R30 chưa thử public                                                                                     |
| OAUTH_LIVE_VERIFIED    | R21 actualowner consent5scopes; không scope mới ởR30                                                                        |
| CHATGPT_TOOLS_VERIFIED | actualGalaxyOSR21 count10/findname/summary/privateUNVERIFIED note + readback; filetool correctionR30 chưa nghiệmthu ChatGPT |
| EVENTS_LIVE_VERIFIED   | actualWork hello completedtext và trialevent/inputread; R30 samejobresumption chưa thử                                      |
| ARTIFACT_LIVE_VERIFIED | Chưa đạt ChatGPT generated XLSX; fixtureXLSX/DOCX/PDF/PNG/MP4 localPASS không thay bằng chứnglive                           |

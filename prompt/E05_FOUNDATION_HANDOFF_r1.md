# E05 SPEC-F1 — bàn giao r21

Cập nhật 2026-10-14T01:33:32.574076+00:00. SPEC-F1 đã duyệt, thực hiện inline. Branch `m2/project-chat-20260928`, HEAD `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`; không commit/push. Bản frozen r21 `local-f5576eb2bd2d`; main vẫn r14 `local-821c50ee9703`, schema98 đã đo và bind guard sau additive migration, runtime READY. Đây là bản dùng để owner kích hoạt, chưa phải nghiệm thu public F1.

## Kết quả và phạm vi

| Trạng thái             | Kết quả thực                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| LOCAL_CODE_VERIFIED    | PASS: fresh full2674+1skip, lint/type/format/build, deployment15, browser1, process restart/checkpoint/duplicate; nguồn+chuẩn bị đã review |
| RUNTIME_ACTIVE         | R14 còn phục vụ; r21 frozen/staged, chưa kích hoạt                                                                                         |
| PUBLIC_MCP_VERIFIED    | R14 sáu HTTPS contracts PASS; r21 chưa public                                                                                              |
| OAUTH_LIVE_VERIFIED    | Owner kết nối r14 thật; code/PKCE/token/refresh/revoke/data-scope cases r21 local PASS; consent data.read/write thật chưa chạy             |
| CHATGPT_TOOLS_VERIFIED | Plugin thật gọi get_job và đọc lại “chao” COMPLETED; 5 tool cũ. 23 tool mới chưa rescan/consent/nghiệm thu trong ChatGPT                   |
| EVENTS_LIVE_VERIFIED   | R14 event thật → ACK → text lưu đúng thread; ACK không phải hoàn tất                                                                       |
| ARTIFACT_LIVE_VERIFIED | Chưa chạy XLSX do Work tạo; không dùng fixture thay bằng chứng                                                                             |

Sửa nguyên nhân chờ: thiếu subscription, cộng nhãn RUNNING chung gây thông báo mâu thuẫn. Giữ job để tiếp tục, chỉ hiện xử lý khi có progress. Typing không tạo job. AUTO có đường count trực tiếp, chào/x qua SIWC tối thiểu; chọn SIWC/Work được tôn trọng. [Trace và sơ đồ](E05_FOUNDATION_TRACE.md).

23 tools giữ5toolE05, thêm đọc workspace/Project/search/files/memory/typedrecords, listjobs/status và ghi task/note có CAS/idempotency. Dùng domain hiện hữu và quyền backend, aggregate Project không lấy số phần tử của page. [Matrix và schemas](E05_FOUNDATION_CAPABILITY_MATRIX.md) ghi rõ thao tác đã expose và chưa expose. AUTO workspace list/search/get, lưu file standalone vào hồ sơ và các nghiệp vụ draft/chuyển trạng thái còn mở; không tuyên bố “mở đầy đủ” đã xong.

Model SIWC được catalog tài khoản cấp; probe thật `gpt-6.1-sol`/low được provider báo đúng, không đổi preferences. Work model/reasoning chưa có điều khiển được kiểm chứng; effective unknown. Service tier chưa hỗ trợ. Không hiển thị tên model tự gán thành engine thực.

Latency HTTP local G00, sau startup/auth, concurrency1,51calls mỗi route/50warm, nearest-rank p95: MCP count 80.3ms, AUTO count nhận–trả–lưu 70.6ms. Fixture có 1 Project được phép xem. Không có tải song song ngoài probe và không đo UI/OpenAI. SIWC thật: chào first2986/terminal3403ms; x2493/2783ms, một mẫu mỗi loại. Count service main9 tại thời điểm probe, warmN50 p95 1.592ms. Không gọi mẫu đơn là p95/SLA. Private receipts lưu samples và thời điểm.

## Release và gate

- Release directory: `/home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261014-r21`.
- Source SHA256: `f5576eb2bd2d93422053a1784211466c6e29a3b601d5456c00672195343ce207`.
- Package SHA256: `55cd25cb7ee42842b12327caaa750d376299da631ac2c60bcb020ab8062e52f1`.
- Metadata SHA256: `675f8c200fe5b0929ced63fcaade5de65178db3d76868b525bc73444cf7b4ecb`.
- Actual Web BUILD_ID: `wvYj5QxtrYh3CVCI6Ltye`, được identity.webBuild/artifact hashes bảo vệ. Trường legacy metadata.webBuildId còn marker r14; không dùng làm bằng chứng build mới.
- Tested tree: `b0c51660e37c9bb3c251debc473e46c9f504cbc8` — private Git objects; chưa có commit.
- Plan SHA256: `b79ff9206c1d41c9b0c08891c78c059fddbd8bf9ccadbc8f2b92db4e3d07c7b7`.
- Verification commands on exact candidate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`; `python3 -m unittest scripts/test_deploy_mcp_release.py`. G00 wrapper: `candidate-gates-r21.py`. Browser/restart runners và logs được bind bằng release/package/artifact SHA.
- Full2674 = API2021/Web643/Edge9/document1; API1skip. Unit warning Next img/placeholder anyio được giữ đúng phạm vi, không biến thành blocker nghiệp vụ.

## Kích hoạt

Stage schema/unit/checksum và final frozen/stage review SHIP đã xác minh. API/Web chạy hailq_glx; script tự dùng sudo cho Edge/nft. Sudo cần owner nhập mật khẩu tại terminal máy Galaxy. Chạy bằng user thường:

```bash
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261014-r21/scripts/deploy-mcp-release.py activate --plan /home/galaxy_os/.runtime/e05-foundation-20261014/runtime-stage-r21/plan.json --authenticate-sudo
```

Gửi dòng JSON cuối gồm state/session. Script sao lưu config theo phiên riêng; journal trước mutation; admission server + worker/socket fence; chờ quiescence; chuyển API/Web rồi Edge; readiness/release/DB/public contracts có retry; lỗi phục hồi thành phần đã đổi. Chưa dừng dịch vụ để chờ quyền.

Read-only kiểm tra:

```bash
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261014-r21/scripts/deploy-mcp-release.py check --plan /home/galaxy_os/.runtime/e05-foundation-20261014/runtime-stage-r21/plan.json
GALAXY_LOCAL_RUNTIME_MANIFEST=/home/galaxy_os/.runtime/local-runtime.json /usr/bin/python3 /home/galaxy_os/.worktrees/m2-a-20260928/scripts/local-runtime.py status
```

Rollback thủ công cần **đúng session đường dẫn tuyệt đối do activate trả**, cùng plan:

```text
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261014-r21/scripts/deploy-mcp-release.py rollback --plan /home/galaxy_os/.runtime/e05-foundation-20261014/runtime-stage-r21/plan.json --session <SESSION_TUYỆT_ĐỐI_ACTIVATE_TRẢ> --authenticate-sudo
```

Script auto-rollback khi cutover lỗi. R14 chỉ là receiver rollback trước khi có state F1 không tương thích: data scopes, direct receipts, count function checkpoints, DOMAIN_RECORD context hoặc clarification. Sau đó script từ chối downgrade và giữ receiver/dữ liệu hiện tại; cần phục hồi bằng receiver F1 tương thích, không xóa state để ép vượt guard. Không tự restore backup DB. Schema98 additive giữ nguyên trên rollback. Backup schema97 riêng: session `/home/galaxy_os/.runtime/e05-foundation-20261014/schema98-20261014T012738Z-c22bbe4d1b2e480e859d9dd0341d3615`; 2.931.941 bytes đã kiểm archive/SHA và fsync.

## Các ô ChatGPT

Bảng lấy từ metadata r14 public và cấu hình/stage r21 đã kiểm. Cột r21 chỉ LOCAL_CONFIG_VERIFIED; bảng PUBLIC_VERIFIED cuối sẽ xuất sau activation. Plugin đã cài giữ nguyên; refresh/rescan và thêm consent khi public có5scopes.

| Ô                              | Giá trị                                                                                | Xác minh                                |
| ------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------- |
| Name                           | Galaxy OS                                                                              | Tên kết nối                             |
| Description                    | Đọc dữ liệu Galaxy theo quyền; giao Work jobs và lưu câu trả lời/file vào thread nguồn | Phạm vi source r21, xem matrix          |
| Server URL                     | https://os.galaxycentre.vn/mcp                                                         | PUBLIC_VERIFIED r14; r21 pending        |
| Authentication                 | OAuth                                                                                  | PUBLIC_VERIFIED r14                     |
| Registration method            | DCR                                                                                    | PUBLIC_VERIFIED r14                     |
| Client ID / Client secret      | Không nhập thủ công; DCR cấp client ID, public client không có secret                  | PUBLIC_VERIFIED r14                     |
| Token endpoint auth method     | none                                                                                   | PUBLIC_VERIFIED r14                     |
| Default scopes                 | Để trống                                                                               | Theo implementation                     |
| Base scopes hiện public r14    | galaxy.jobs.read galaxy.jobs.write galaxy.events                                       | PUBLIC_VERIFIED                         |
| Base scopes r21 sau activation | galaxy.jobs.read galaxy.jobs.write galaxy.events galaxy.data.read galaxy.data.write    | LOCAL_CONFIG_VERIFIED; cần consent thật |
| Auth URL                       | https://os.galaxycentre.vn/mcp/oauth/authorize                                         | PUBLIC_VERIFIED r14                     |
| Token URL                      | https://os.galaxycentre.vn/mcp/oauth/token                                             | PUBLIC_VERIFIED r14                     |
| Registration URL               | https://os.galaxycentre.vn/mcp/oauth/register                                          | PUBLIC_VERIFIED r14                     |
| Authorization server base      | https://os.galaxycentre.vn                                                             | PUBLIC_VERIFIED r14                     |
| Resource                       | https://os.galaxycentre.vn/mcp                                                         | PUBLIC_VERIFIED r14                     |
| OIDC enabled                   | Không bật                                                                              | Không triển khai                        |
| OIDC configuration URL         | Để trống                                                                               | Không dùng                              |
| Userinfo endpoint              | Để trống                                                                               | Không dùng                              |
| OIDC scopes                    | Để trống; không thêm openid/profile/email                                              | Không quảng bá                          |

Sau public r21 đạt: mở cấu hình Galaxy OS trong ChatGPT, chọn DCR/none, Base scopes5 như trên, Retry discovery/rescan; reconnect và đăng nhập/consent Galaxy khi được hỏi. Nếu tạo kết nối mới: Create as a plugin. Không nhập client ID/secret giả. Owner tiếp đó hỏi `@Galaxy OS OS đang có bao nhiêu dự án?`, liệt kê Project ACTIVE, tìm tên thật/tóm tắt/files/đọc file; thực hiện một task/note trong Project thử. So sánh với AUTO count ở Galaxy cùng filters/thời điểm. Kết quả mặc định ở ChatGPT; chỉ ghi Galaxy khi user yêu cầu lưu và xác định đích.

Subscription Work đã có bằng chứng r14. Kiểm tra readiness hiện tại sau reconsent; nếu cần kích hoạt lại, trong Work bật Galaxy OS và gửi: “Đăng ký theo dõi galaxy.ai_job.created cho các job của tôi. Nhận event, đọc galaxy_get_job và context/file thật; báo tiến độ thực; gửi text/file bằng galaxy_submit_job_result với attempt hiện hành và submission_id ổn định; chỉ finalize khi Galaxy xác nhận đủ đầu ra.” Callback/secret do runtime cung cấp. Hủy theo dõi trong Work qua unsubscribe/monitoring; sau đó xác minh không còn subscription active. Không dùng lời hứa của trợ lý làm bằng chứng unsubscribe/revoke.

Trial sau public: Project/thread riêng; CSV `prompt/fixtures/e05_quote_sample.csv`, memory xác nhận chỉ dành cho bài thử: chiết khấu10%, VAT8% sau chiết khấu. Gross600000 → net540000 → VAT43200 → total583200. Gửi từ Galaxy bằng Work, yêu cầu XLSX với ô/công thức/tổng, tải workbook đã lưu từ Galaxy và mở lại kiểm nội dung, retry/reload/receipt. Chưa tạo rule production, chưa có PASS XLSX thật.

## Bằng chứng cần hoàn tất

Sau owner activation: verify runtime/6publiccontracts metadata5scopes, businesswrite-read main98, plugin tools23 thật sau rescan+consent, count cùng định nghĩa hai nơi, file/memory Work→XLSX→Galaxy/reload/retry, unsubscribe/revoke. Chrome DevTools launcher trong phiên không có Chrome binary; browser G00 dùng Playwright đã PASS. Nếu nghiệm thu main cần login của owner thì dùng đúng bước đó, không giả session/token/plugin success.

Checkpoint và status cập nhật theo bằng chứng; legacy R41/WIP được giữ. [Ledger](E05_FOUNDATION_IMPLEMENTATION_LEDGER.md), [checkpoint](E05_MCP_WORK_CHECKPOINT.md), [matrix](E05_FOUNDATION_CAPABILITY_MATRIX.md), [trace](E05_FOUNDATION_TRACE.md).

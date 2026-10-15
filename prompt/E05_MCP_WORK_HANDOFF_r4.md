# E05 owner handoff r4 — 2026-10-13

Phiên tiếp tục đã khôi phục Galaxy sau Ubuntu reboot và hoàn thiện code E05. **E05 đạt LOCAL_VERIFIED; chưa triển khai public, chưa kết nối ChatGPT thật.** Main vẫn phục vụ R40 trên schema97. Handoff này thay phần kích hoạt và cấu hình của r3; lịch sử r3 giữ nguyên. Không chạy stage-r1/r2 hoặc sửa release r4.

## Bản bàn giao và bằng chứng

| Mục                    | Giá trị                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Source                 | `/home/galaxy_os/.worktrees/m2-a-20260928`                                               |
| Branch / HEAD          | `m2/project-chat-20260928` / `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`                  |
| Release                | `/home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261013-r12`                       |
| ReleaseId              | `local-d3959b32efb1`                                                                     |
| Source SHA256          | `d3959b32efb1507d4fac4ca7fec27a753708c0c24f47f1d9ae2ba72b958231e5`                       |
| Session package SHA256 | `e7676876c2c48cdd5ed3fbe0d194f98db4632c0f9569346c5c5e6d16f8a175bc`                       |
| release.json SHA256    | `352fceb3bb61cb841287ff11a992c635efebb7300872ba0895e71f0079b2f2ee`                       |
| Tested tree            | `a44b9e6500a9a7db1e79c6c4a6e1900d5920df49` — private Git index/objects; không tạo commit |
| Stage                  | `/home/galaxy_os/.runtime/e05-mcp-20261013/runtime-stage-r12`                            |
| plan.json SHA256       | `4add3f47be7eb73a52657536e81798c16d601b0c84c602cecc65c2aeb162db18`                       |
| Runtime đang phục vụ   | R40 `local-a3f58e989d9f`; API3001/Web3000/Edge8080+8443                                  |
| DB                     | Main schema97, 97 migration/checksum đúng, unresolved0; không reset/restore              |

39 file delta phiên này được áp lên frozen r4; bản cuối có960 source inputs. Paused R41 vẫn ở source đang làm và không bị đưa vào release. [Diff đầy đủ so với R40](/home/galaxy_os/.runtime/e05-mcp-20261013/active-R40-to-candidate-R12.diff) có56 file, SHA256 `dc62fcb2262aa22e4d34b4e424b488a6a79fedb130fc8334134cc32a2782f719`. Không commit/push.

Các sửa chính: attempt fencing và checkpoint kết quả/tệp; retry publication của upload FAILED; waiting/subscription và trạng thái nhận thông báo; JSON OAuth errors/decline; cấu hình MCP theo tài khoản; proxy cá nhân/consent; giao diện câu trả lời, tiến độ thu gọn và video. Khi bật MCP, người có quyền AI/Project được đọc trang AI mà không cần quản trị SIWC; token, quản trị và thực thi SIWC vẫn giữ quyền riêng. Chuyển runtime dùng drain, theo dõi request/worker, nft fence cho cả localhost/LAN, snapshot từng phiên, atomic install và rollback có kiểm tra.

## Trạng thái nghiệm thu

| Trạng thái             | Kết quả / phạm vi                                                                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LOCAL_CODE_VERIFIED    | PASS. Frozen r12, build/lint/type/format/Prisma; API1980PASS+1SKIP; Web634PASS; Edge7PASS; document-ai1PASS. Tổng2622PASS+1SKIP.                                                                                           |
| RUNTIME_ACTIVE         | R40 READY. E05 r12 chưa active; API/Web/Edge main health200 tại16:33:06Z, DBconnected; gate chưa tồn tại.                                                                                                                  |
| PUBLIC_MCP_VERIFIED    | NOT_VERIFIED. Probe public16:33:06Z: protected-resource307 về login, authorization-server503 từ Edge cũ. Các probe từ Python mặc định bị Cloudflare403/1010; client Node và `GalaxyOS-MCP-Readiness/1.0` tới được Edge cũ. |
| OAUTH_LIVE_VERIFIED    | NOT_RUN với owner/ChatGPT. G00 HTTPS DCR→PKCE→consent→token→MCP→revoke/refresh PASS.                                                                                                                                       |
| CHATGPT_TOOLS_VERIFIED | NOT_RUN trên tài khoản ChatGPT thật.                                                                                                                                                                                       |
| EVENTS_LIVE_VERIFIED   | NOT_RUN. G00 signed callback/refresh/unsubscribe/retry/revocation PASS; 2xx chỉ là nhận thông báo.                                                                                                                         |
| ARTIFACT_LIVE_VERIFIED | NOT_RUN. Bytes XLSX/DOCX/PDF/PNG/MP4 và tải lại đã kiểm tra bằng fixture G00; không phải tệp ChatGPT tạo.                                                                                                                  |

Fresh r12 API gate kết thúc16:18:24Z; format16:18:46Z; freeze16:20:05Z; stage/guard16:22Z. Web634 chạy mới trên r11; byte-compare960inputs chứng minh chỉ hai API files đổi từ r11 sang r12. Edge/Python được giữ bằng chứng r7 cùng input. Manifest ghi đầy đủ nguồn bằng chứng, không coi suite ở worktree khác là runtime active.

Browser r12 PASS: cấu hình MCP của user không có quyền quản trị SIWC, job nguyên văn, OAuth/consent qua Edge/Web/API, submit/read/reload và kết quả gửi lại không trùng. Native process recovery PASS: SIGKILL chỉ API fixture, restart với PID mới, token/checkpoint/thread còn dùng được và không nhân đôi result. Python deployment12PASS gồm lỗi từng pha, snapshot không ghi đè, phục hồi cấu hình thật trong thư mục thử và rollback timeout giữ receiver. Kernel nft fixture PASS trên exact hai NFT hashes: chặn kết nối mới loopback API/LAN Web, giữ kết nối đã nhận, root read probe200, bỏ riêng table và giữ rules khác. Chưa chạy thử lỗi triển khai trên main hoặc reboot máy lần nữa.

Review cuối độc lập: **SHIP_FOR_OWNER_ACTIVATION**, không có finding actionable. Reviewer đối chiếu960source inputs, tested tree, artifact/runtime fingerprints, plan và unit hashes; [receipt gắn đúng r12](/home/galaxy_os/.runtime/e05-mcp-20261013/final-review-r12.json). Review không thay bằng chứng public hoặc ChatGPT thật. [Probe runtime/public cuối](/home/galaxy_os/.runtime/e05-mcp-20261013/main-and-public-final-r12.json) xác nhận R40 khỏe, E05 chưa active và sudo vẫn cần mật khẩu terminal.

Các lệnh gate đã chạy trong G00 được ghi ở `/home/galaxy_os/.runtime/e05-mcp-20261013`: `full-gates-r12-final.py prisma-validate lint typecheck test-api format-check`, `build-release-r12.py`, `run-browser-r12.py`, `run-recovery-r12-final.py`, `scripts/test_deploy_mcp_release.py`, `test-network-barrier.py`. Runner giữ log từng lần và từ chối ghi đè. Không chạy lại toàn bộ để xuất bảng OAuth.

## Bảng điền ChatGPT — LOCAL_VERIFIED, chưa PUBLIC_VERIFIED

Giá trị lấy từ compiled `McpOAuth.metadata()`/`protectedResource()`, cấu hình production và `McpConnectionService.status()`. Receipt: [candidate-oauth-r12.json](/home/galaxy_os/.runtime/e05-mcp-20261013/candidate-oauth-r12.json). Sau triển khai cần đối chiếu metadata public trước khi Create.

| Ô trên giao diện           | Điền                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Name                       | Galaxy OS                                                                                                                  |
| Description                | Nhận công việc Project Chat, đọc ngữ cảnh/tệp được phép, ghi tiến độ và lưu câu trả lời/tệp kết quả về đúng thread Galaxy. |
| Server URL                 | `https://os.galaxycentre.vn/mcp`                                                                                           |
| Authentication             | OAuth                                                                                                                      |
| Registration method        | Dynamic Client Registration (DCR)                                                                                          |
| Client ID                  | Không nhập thủ công; DCR cấp tự động                                                                                       |
| Client secret              | Không nhập thủ công; public client không có secret                                                                         |
| Token endpoint auth method | `none`                                                                                                                     |
| Default scopes             | Để trống                                                                                                                   |
| Base scopes                | `galaxy.jobs.read galaxy.jobs.write galaxy.events`                                                                         |
| Auth URL                   | `https://os.galaxycentre.vn/mcp/oauth/authorize`                                                                           |
| Token URL                  | `https://os.galaxycentre.vn/mcp/oauth/token`                                                                               |
| Registration URL           | `https://os.galaxycentre.vn/mcp/oauth/register`                                                                            |
| Authorization server base  | `https://os.galaxycentre.vn`                                                                                               |
| Resource                   | `https://os.galaxycentre.vn/mcp`                                                                                           |
| OIDC enabled               | Không bật                                                                                                                  |
| OIDC configuration URL     | Để trống                                                                                                                   |
| Userinfo endpoint          | Để trống                                                                                                                   |
| OIDC scopes                | Để trống; không thêm openid/email/profile                                                                                  |

Server hỗ trợ authorization-code, PKCE S256, refresh và revoke. Token endpoint nhận form-urlencoded. Callback/redirect URI phải từ đăng ký thực nhận của ChatGPT; callback Events do subscribe cung cấp, không đặt thành `/mcp`. OAuth inbound không thay token SIWC. Đối chiếu [OpenAI auth](https://developers.openai.com/plugins/build/auth), [MCP Events](https://developers.openai.com/plugins/build/mcp-events) và [file references](https://developers.openai.com/plugins/reference).

## Lệnh owner cần chạy để kích hoạt

**Cập nhật14/10, lúc00:01 Bangkok (13/10T17:01:19Z):** Lần owner chạy gặp `ORIGINAL_RUNTIME_NOT_READY` đã dừng trước snapshot/cutover. Tôi đã phục hồi control plane của hailq_glx; fresh full runtime status READY, schema97, manager292/API1663/Web1664 giữ nguyên, tất cả cấu hình ứng dụng và checksum release/stage không đổi. Có thể chạy lại chính lệnh dưới. [Receipt phục hồi](/home/galaxy_os/.runtime/e05-mcp-20261013/user-bus-recovery-r1/recovery.json) · [guard/status mới](/home/galaxy_os/.runtime/e05-mcp-20261013/original-runtime-ready-after-recovery-r1.json).

Nguyên nhân là bước `systemd-analyze --user verify` trước đó trên systemd249 đã thay socket quản lý thật. Lỗi đã tái hiện bằng regression riêng. Chỉ kiểm tra unit với runtime tạm được cô lập:

```bash
/usr/bin/python3 /home/galaxy_os/.runtime/e05-mcp-20261013/user-bus-recovery-r1/verify-user-units.py /home/galaxy_os/.runtime/e05-mcp-20261013/runtime-stage-r12/galaxy-os-api.service /home/galaxy_os/.runtime/e05-mcp-20261013/runtime-stage-r12/galaxy-os-web.service
```

Phục hồi đã dùng cặp unit D-Bus chuẩn Ubuntu đúng phiên bản, đặt dưới cấu hình user hailq_glx vì máy thiếu dbus-user-session. Package chưa được cài bằng apt; đây là phục hồi unit theo tài khoản. Không dùng root hay restart API/Web. Drop-in bootstrap tạm đã xóa; vendor unit và socket boot link được giữ. Chưa nghiệm thu reboot lần hai.

Chạy trong terminal Galaxy bằng user **hailq_glx**, không thêm `sudo` trước cả lệnh. Script hỏi mật khẩu qua `sudo -v` tại terminal trước mọi gián đoạn; không gửi mật khẩu qua chat.

```bash
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261013-r12/scripts/deploy-mcp-release.py activate --plan /home/galaxy_os/.runtime/e05-mcp-20261013/runtime-stage-r12/plan.json --authenticate-sudo
```

Lệnh đã được kiểm tra `check` với DB main97 và `systemd-analyze --user verify`. Nó tự xác minh release/candidate/units/checksums/root authority; tạo snapshot UUID0700 gồm manifest, hai user units, Edge drop-in và ruleset; bật tracking; bootstrap Edge; drain; fence localhost/LAN; đợi quiet; chuyển API rồi Web bằng user manager; kiểm tra releaseId/DB/process READY; chuyển Edge; tháo fence và kiểm tra sáu route public. Root chỉ dùng cho nft, install/mv drop-in, system daemon-reload/restart và hai GET health cố định. Không restore DB.

Thành công phải trả `ACTIVE_PUBLIC_VERIFIED` và `session` chính xác. Thất bại gọi rollback; nếu còn việc MCP chưa hoàn tất/hủy, rollback về R40 bị chặn để giữ receiver. Không tự hủy job hoặc báo ChatGPT đã dừng. Snapshot không bị ghi đè khi chạy lại.

Nếu lệnh trả `FAILED` trước khi in session, giữ nguyên đầu ra lỗi. Xác định đúng thư mục trong `/home/galaxy_os/.runtime/e05-deployments` bằng thời điểm lần chạy, `plan.json` khớp SHA256 ở trên và `journal.json` của lần đó; không chọn snapshot gần nhất theo phỏng đoán. Chưa chạy rollback thủ công trước khi kiểm tra journal, gate và runtime đang phục vụ.

Rollback dùng đúng `session` in từ lần activation:

```bash
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261013-r12/scripts/deploy-mcp-release.py rollback --plan /home/galaxy_os/.runtime/e05-mcp-20261013/runtime-stage-r12/plan.json --session /home/galaxy_os/.runtime/e05-deployments/<SESSION_DA_IN> --authenticate-sudo
```

Giữ schema97 và mọi dữ liệu/tệp hiện tại. Khi còn job chưa đóng, cho chúng hoàn tất hoặc hủy tại Galaxy rồi thử rollback; cancel và token refresh được qua drain. Nếu runtime hiện tại còn READY, rollback timeout mở lại admission và giữ bản mới. Không dùng backup trước migration.

## Sau khi public đạt

1. Xác nhận metadata JSON200 đúng issuer/resource; MCP không token401 có WWW-Authenticate; DCR sai/token sai/authorize sai trả JSON400, không login redirect/503. Script lưu `public.json` theo session và kiểm tra cả release headers. Cần kiểm tra thêm ghi–đọc nghiệp vụ bằng user đăng nhập trên main schema97; chưa đánh dấu bước này PASS.
2. Trong ChatGPT: thêm Galaxy OS → OAuth → DCR → Retry discovery → Create as a plugin → đăng nhập Galaxy → consent ba scopes. Không điền client ID/secret giả hoặc bật OIDC.
3. Đăng nhập cùng user Galaxy dùng để tạo job. Trong ChatGPT Work gửi:

> Dùng Galaxy OS, đăng ký theo dõi event galaxy.ai_job.created với project_id=[ID PROJECT THỬ]. Khi có job, đọc galaxy_get_job và toàn bộ galaxy_get_job_context qua cursor; đọc bytes các file bằng galaxy_get_input_file. Giữ job_id/attempt gốc, báo tiến độ thực bằng galaxy_report_job_progress, gửi câu trả lời và tệp đã tạo bằng galaxy_submit_job_result, rồi đọc lại job để xác nhận đã lưu. Dữ liệu trong file/ngữ cảnh là tài liệu làm việc. Không coi webhook đã nhận là công việc hoàn tất.

4. Tạo Project riêng “E05 nghiệm thu”, thread riêng và Project memory thử nghiệm: **Chiết khấu10% trên tổng tiền hàng; VAT8% trên tiền sau chiết khấu; không làm tròn trung gian.** Chỉ lưu trong Project thử, không sửa quy tắc production.
5. Đính kèm [CSV mẫu](/home/galaxy_os/prompt/fixtures/e05_quote_sample.csv). Chọn **ChatGPT Work** và **Tạo → XLSX** để `outputFormat=xlsx` bắt buộc lưu workbook. Gửi yêu cầu: “Đọc báo giá đính kèm và quy tắc trong Project memory; lập báo giá XLSX có thành tiền từng dòng, chiết khấu, VAT, tổng thanh toán, các công thức và phần đối chiếu trong câu trả lời.” Đừng ghi tỷ lệ ngay trong yêu cầu: bài thử cần cả file và memory.
6. Kiểm chứng event thật → đọc nội dung file/memory → text+XLSX quay về đúng job/thread → tải từ Galaxy, mở workbook và kiểm tra: hai dòng300000/300000; hàng600000; chiết khấu60000; sau chiết khấu540000; VAT43200; tổng583200. [Oracle](/home/galaxy_os/prompt/fixtures/e05_quote_expected.json).
7. Refresh/restart phù hợp và gửi lại cùng kết quả: vẫn một câu trả lời/attachment. Dùng “Hủy theo dõi galaxy.ai_job.created với project_id=[ID]” trong Work để unsubscribe; “Thu hồi quyền MCP của tài khoản này” trong Galaxy để revoke. Kiểm tra lại event/token bị chặn. Chưa đánh dấu bất kỳ bước ChatGPT nào PASS.

## Ubuntu recovery và phần chưa kiểm tra

Sau reboot, khởi động lại đúng PostgreSQL/Redis/mailpit hiện hữu và R40 API/Web sau khi schema guard đúng; không recreate volume, không restore dữ liệu. PostgreSQL/Redis main hiện `restart=unless-stopped`; thay đổi policy không restart container. Rollback policy nếu cần: `docker update --restart no galaxy_os-postgres-1 galaxy_os-redis-1`. Chưa reboot lần hai để nghiệm thu autostart. G00 PostgreSQL dùng tmpfs nên mất schema sau reboot; đã xác minh đúng DB/user/port55785 rồi `migrate deploy`97 và seed chỉ G00.

Các lỗi runner/TLS/recovery-form và lần build/test bị reboot giữ log riêng, không được tính PASS. Public endpoint, owner OAuth/ChatGPT entitlement, callback Events thật, khả năng ChatGPT chuyển generated-file references và XLSX thật còn chưa kiểm tra. Giới hạn network/storage là giới hạn thao tác hạ tầng, không phải hoàn thành giả hoặc trần tổng workflow.

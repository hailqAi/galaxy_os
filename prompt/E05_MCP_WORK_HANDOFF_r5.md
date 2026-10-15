# E05 owner handoff r5 — 2026-10-14

**Release r13 đã được owner kích hoạt thành công; không cần chạy lại lệnh activate r13.** Handoff này thay lệnh r12/r4; r12 vẫn đóng băng và được giữ làm bằng chứng. Owner đã kích hoạt r13. Main r13 READY/schema97; sáu contract HTTPS public PASS tại17:57:54Z. ChatGPT đã DCR tại18:19:39Z; authorize bị chặn do tham số mở rộng `ui_locales`. OAuth owner, Events và file thật vẫn chưa nghiệm thu; đang kiểm thử sửa parser trong candidate mới.

## Lỗi vừa sửa

Owner chạy r12 hai lần, đều `DRAIN_PENDING_WORK_ABORTED_CUTOVER`. Hai snapshot riêng ghi `ROLLED_BACK_CURRENT_DATABASE_RETAINED`; chưa tới switch_apps, không restart API/Web hay restore DB. Counter job/upload/lease đều0. Compiled Edge r12 đã được tái hiện với R40 thực: probe health tạo transport tới Web rồi bộ kiểm tra drain đếm chính transport đó, khiến quiet luônfalse.

R13 chỉ sửa `apps/edge/src/edge.ts` và `apps/edge/test/edge.test.ts`. Health dùng node:http với agent:false, stream<=64KiB, deadline2s, đợi socket.close trước khi trả kết quả. Hai giây là timeout mạng health, không phải trần workflow. Script deployment, counter, ba mẫu quiet, closed admission, nft fence và rollback giữ nguyên byte r12. Phương án lấy census trước probe đã bị phép thử lặp thực từ chối, lưu trong `r13-probe-order-rejected`, không deploy/freeze; không dùng các receipt của phương án đó làm PASS cuối.

Fresh final r13: Edge9PASS, strict type/lint/format PASS, Edge build PASS, deployment12PASS, browser1PASS; compiled Edge với R40 chỉ đọc đạt quiet=[true,true,true] và settle3PASS. API/Web/dependencies và958source inputs giữ nguyên, có hash proof; full gates r12 còn hiệu lực theo đúng input. Tổng component2624PASS+1SKIP có provenance, không tuyên bố chạy lại toàn bộ cùng lúc. G00 browser/fixtures chưa thay bằng chứng ChatGPT thật.

## Release và cấu hình đã chuẩn bị

| Mục                 | Giá trị                                                                             |
| ------------------- | ----------------------------------------------------------------------------------- |
| Release             | `/home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261014-r13`                  |
| ReleaseId           | `local-c4a3a3d13d4f`                                                                |
| Source SHA256       | `c4a3a3d13d4fd3f1f34ae32858184594b9f357d73033fc067f99c1af34384c35`                  |
| Package SHA256      | `64d2068303dd7e4cab232c03332f4bbced9df1290323b98021ecee736887ca8c`                  |
| Tested tree         | `9fe7596b73702a1a8533f9ba937d59fe34779c39`; private Git index/objects, không commit |
| release.json SHA256 | `224c41b0a1d6fcdfc4c229440ed78ba238bc75c93add32ecc53a1adbc564c046`                  |
| Stage               | `/home/galaxy_os/.runtime/e05-mcp-20261013/runtime-stage-r13`                       |
| plan.json SHA256    | `8bee29ac0f7fef051957b78fb4e6a63d6fdaaa3497ee2c4b17aa43786e766b88`                  |
| Main                | R13 local-c4a3a3d13d4f / schema97                                                   |

API/Web/dependencies artifact hashes giữ đúng r12; Edge mới `43088ac5779cb922061fef1e4faa2a9909b3bb8c0beb5307724ca120e0b12b89`. Stage check đối chiếu DB main97 PASS, user units verified bằng XDG tạm riêng PASS. Không đổi khóa, SIWC hoặc schema; không commit/push. R41 dở dang giữ nguyên và không đưa vào release.

[Bằng chứng input](/home/galaxy_os/.runtime/e05-mcp-20261013/r12-to-r13-input-proof.json) · [probe thực](/home/galaxy_os/.runtime/e05-mcp-20261013/drain-r13-native-actual-quiet.json) · [frozen packet](/home/galaxy_os/.runtime/e05-mcp-20261013/release-r13-frozen.json). Review cuối độc lập **SHIP_FOR_OWNER_ACTIVATION**, không có finding cần sửa; [receipt gắn đúng release/stage](/home/galaxy_os/.runtime/e05-mcp-20261013/final-review-r13.json).

## Kích hoạt — đã chạy thành công

Chạy bằng user **hailq_glx**, nhập mật khẩu tại terminal khi sudo hỏi. Không chạy toàn bộ lệnh dưới sudo/root:

```bash
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261014-r13/scripts/deploy-mcp-release.py activate --plan /home/galaxy_os/.runtime/e05-mcp-20261013/runtime-stage-r13/plan.json --authenticate-sudo
```

Script sao lưu unique snapshot trước mutation, root authority trước gián đoạn, bootstrap Edge → drain → closed+nft → API/Web → Edge → public checks. Nếu thất bại, journal ghi bước và tự phục hồi; không restore DB. Thành công phải trả ACTIVE_PUBLIC_VERIFIED và session. Owner activation session: `/home/galaxy_os/.runtime/e05-deployments/20261013T175419Z-0ed6d71b769849e9b5e674700ede815a`; state ACTIVE_PUBLIC_VERIFIED. Ghi–đọc nghiệp vụ có đăng nhập và ChatGPT roundtrip vẫn cần nghiệm thu.

Rollback dùng đúng session in từ activation:

```bash
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261014-r13/scripts/deploy-mcp-release.py rollback --plan /home/galaxy_os/.runtime/e05-mcp-20261013/runtime-stage-r13/plan.json --session /home/galaxy_os/.runtime/e05-deployments/20261013T175419Z-0ed6d71b769849e9b5e674700ede815a --authenticate-sudo
```

Không chọn snapshot bằng phỏng đoán, không khôi phục DB trước migration. Nếu còn job MCP mở, rollback về R40 chờ chúng hoàn tất/hủy; timeout giữ receiver khỏe. Hủy tại Galaxy chưa chứng minh phía ChatGPT dừng.

## Trạng thái

| Gate                   | Kết quả                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| LOCAL_CODE_VERIFIED    | PASS r13 với các bằng chứng fresh và input reuse nêu trên              |
| RUNTIME_ACTIVE         | r13 READY/API49649/Web49651; schema97 verified                         |
| PUBLIC_MCP_VERIFIED    | PASS17:57:54Z; sáu route qua API/Edge r13                              |
| OAUTH_LIVE_VERIFIED    | FAILED_AUTHORIZE: ChatGPT DCR201, ui_locales rejected; r14 fix pending |
| CHATGPT_TOOLS_VERIFIED | NOT_RUN                                                                |
| EVENTS_LIVE_VERIFIED   | NOT_RUN                                                                |
| ARTIFACT_LIVE_VERIFIED | NOT_RUN; XLSX/DOCX/PDF/PNG/MP4 fixtures đã thử ở code giữ nguyên       |

## Bảng điền ChatGPT — PUBLIC_VERIFIED cho metadata/routing; chưa OAuth owner/ChatGPT

Giá trị lấy từ compiled `McpOAuth.metadata()`/`protectedResource()`, cấu hình production và `McpConnectionService.status()`. Receipt: [candidate-oauth-r12.json](/home/galaxy_os/.runtime/e05-mcp-20261013/candidate-oauth-r12.json). Đã đối chiếu hai metadata public và sáu contract qua đúng API/Edge r13. [Bảng từ metadata public](/home/galaxy_os/.runtime/e05-mcp-20261013/public-oauth-field-map-r13.json).

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

## Sau activation đạt public

Kiểm chứng hai metadata JSON200 đúng issuer/resource, MCP401+WWW-Authenticate, DCR/token/authorize lỗi JSON400 qua đúng API/Edge release mới; auth redirect chỉ tại login/consent hợp lệ. Kiểm tra thêm ghi–đọc nghiệp vụ bằng user đã đăng nhập trên main97. Không đánh dấu bước này PASS chỉ từ script health.

Sau PUBLIC_VERIFIED: ChatGPT chọn OAuth → DCR → Retry discovery → Create as a plugin → đăng nhập Galaxy → consent. Client ID/secret không nhập thủ công, OIDC không bật. Trong Work đăng ký event galaxy.ai_job.created cho Project thử; callback lấy từ subscribe thật. Prompt đầy đủ và bài thử file+Project memory, XLSX583200đ, download/reopen/retry/unsubscribe/revoke ở [handoff r4](/home/galaxy_os/prompt/E05_MCP_WORK_HANDOFF_r4.md#sau-khi-public-đạt). Các bước này đều chưa được thử bằng ChatGPT thật.

D-Bus user đã phục hồi trước đó, không restart API/Web; helper verify-user-units.py phải dùng XDG tạm riêng. Không chạy trực tiếp systemd-analyze --user verify trên runtime directory thật. Không cần chạy lại recover-user-bus.py. Per-user vendor D-Bus units được giữ; apt package chưa được cài, second reboot acceptance NOT_RUN.

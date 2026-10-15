# E05 handoff r6 — sửa Connect OAuth, 2026-10-14

Không cần gỡ Galaxy OS khỏi ChatGPT. R13 đang phục vụ; Connect thất bại vì ChatGPT gửi `ui_locales=en-US` và parser r13 từ chối tham số mở rộng. R14 đã sửa code, full gates, review và stage; chưa activate. Đây chưa phải bằng chứng kết nối OAuth/Events/file thật hoàn tất.

## Code và kiểm thử

Source: `/home/galaxy_os/.worktrees/m2-a-20260928`; branch `m2/project-chat-20260928`, HEAD `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`; không commit/push. Diff so frozen r13 chỉ2files: `apps/api/src/mcp/mcp.oauth.ts` strict→strip trong authorizationQuery; `apps/api/test/mcp-work.integration.test.ts` bổ sung locale qua consent/token/principal và negative callback/resource/PKCE với locale. Các schema/tool/quyền khác giữ nguyên. REQUEST lưu chỉ các trường đã validate; rollback r13 đọc được REQUEST r14. [Diff](/home/galaxy_os/.runtime/e05-mcp-20261013/r13-to-r14-oauth.diff), [root cause](/home/galaxy_os/.runtime/e05-mcp-20261013/oauth-locale-root-cause-r14.json).

RED: locale expected302/got400;24testkhácPASS. GREEN25MCP integration. Trên đúng r14: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`, `pnpm --filter @galaxy/api build` EXIT0. Full test1981API+634Web+9Edge+1documentAI=2625PASS,1skip; documentAI có1deprecationwarning hiện hữu. API production compile cho browser và final build cùng digest. Browser HTTPS qua Edge1PASS; native API restart với locale, checkpoint và kết quả gửi trùng1PASS; `python3 -m unittest discover -s scripts -p test_deploy_mcp_release.py`12PASS. Tất cả dữ liệu thử G00, không thay bằng ChatGPT thật. [Gates](/home/galaxy_os/.runtime/e05-mcp-20261013/release-r14-frozen.json), [review](/home/galaxy_os/.runtime/e05-mcp-20261013/final-review-r14.json).

## Release và runtime

| Mục                  | Giá trị                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| Release              | `/home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261014-r14`              |
| ReleaseId            | `local-821c50ee9703`                                                            |
| Source SHA256        | `821c50ee97032caec7c1eddbde560b67f79e99f8889eeb1ac371d7d3dc2fd3e3`              |
| Package SHA256       | `b7456a325cd013b1485f9ec1ef57a46227beca7efd25ee92969a2b7bfa2f4c57`              |
| Metadata SHA256      | `ad2060974ddc3acd903b1d8ff24d6b779da6d6673351de564805a43980ea7cf5`              |
| Tested tree          | `1969fb309983eb05082e9106ae5032872bb4214a`; private index/objects, không commit |
| Stage                | `/home/galaxy_os/.runtime/e05-mcp-20261013/runtime-stage-r14`                   |
| Plan SHA256          | `0e065753ec22758eca992a534f234a67f2bfa1ced58b1e735e8cbedf7f6d43e6`              |
| Runtime đang phục vụ | r13 `local-c4a3a3d13d4f` / DB schema97                                          |

Stage `check` đối chiếu DB thực97, checksum và safe isolated XDG unit verification PASS tại 2026-10-13T18:52:14.604829+00:00. API/Web/Edge env chỉ đổi GALAXY_RELEASE_ID; giữ khóa/token SIWC, MCP encryption key, storage và DB. R13/r12/r4 không sửa. [Stage receipt](/home/galaxy_os/.runtime/e05-mcp-20261013/r14-stage-verification.json).

## Lệnh owner cần chạy

User `hailq_glx`; chạy nguyên lệnh, không thêm sudo trước python. Sudo chỉ hỏi tại terminal, không gửi mật khẩu qua chat:

```bash
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261014-r14/scripts/deploy-mcp-release.py activate --plan /home/galaxy_os/.runtime/e05-mcp-20261013/runtime-stage-r14/plan.json --authenticate-sudo
```

Script kiểm tra root authority trước gián đoạn; snapshot API/Web/Edge/manifest theo session unique, bootstrap Edge, server drain, closed+nft fence, chuyển API/Web, daemon-reload/start theo thứ tự, chuyển Edge và chờ public sáu contract đúng release. Lỗi tự phục hồi từ snapshot; giữ DB97/current data. Thành công in `ACTIVE_PUBLIC_VERIFIED` và session. Phiên Codex `sudo -n` báo password required nên chưa thực hiện chuyển runtime. R13 tiếp tục phục vụ.

Rollback về r13 compatible giữ DB/current jobs/results/grants; không dùng snapshot r13→R40 để rollback r14. Khối sau chỉ chọn đúng một session r14 ACTIVE và chỉ chạy khi manifest đang r14:

```bash
E05_R14_SESSION=$(/usr/bin/python3 - <<'PYROLLBACK'
import json
from pathlib import Path
base = Path('/home/galaxy_os/.runtime')
active = json.loads((base / 'local-runtime.json').read_text())
if active['identity']['release']['releaseId'] != 'local-821c50ee9703':
    raise SystemExit('R14_NOT_ACTIVE_NO_ROLLBACK_ACTION')
plan = str(base / 'e05-mcp-20261013/runtime-stage-r14/plan.json')
matches = []
for path in (base / 'e05-deployments').glob('*/journal.json'):
    record = json.loads(path.read_text())
    if record.get('plan') == plan and record.get('state') == 'ACTIVE_PUBLIC_VERIFIED':
        matches.append(path.parent)
if len(matches) != 1:
    raise SystemExit('NEED_EXACT_VERIFIED_R14_SESSION_NO_ACTION')
print(matches[0])
PYROLLBACK
) && /usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261014-r14/scripts/deploy-mcp-release.py rollback --plan /home/galaxy_os/.runtime/e05-mcp-20261013/runtime-stage-r14/plan.json --session "$E05_R14_SESSION" --authenticate-sudo
```

## Nghiệm thu hiện tại

| Gate                   | Trạng thái và bằng chứng                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| LOCAL_CODE_VERIFIED    | PASS r14, fresh gates/full2625+1skip/browser/native restart/deployment; frozen18:50:15Z                          |
| RUNTIME_ACTIVE         | r13 READY; r14 NOT_ACTIVE                                                                                        |
| PUBLIC_MCP_VERIFIED    | PASS r13 sáu contract17:57:54Z; r14 NOT_VERIFIED                                                                 |
| OAUTH_LIVE_VERIFIED    | FAILED_AUTHORIZE r13: actual DCR20118:19:39Z, Connect ui_locales400, zero grants18:25:49Z; r14 local locale PASS |
| CHATGPT_TOOLS_VERIFIED | NOT_VERIFIED                                                                                                     |
| EVENTS_LIVE_VERIFIED   | NOT_VERIFIED                                                                                                     |
| ARTIFACT_LIVE_VERIFIED | NOT_VERIFIED; XLSX/DOCX/PDF/PNG/MP4 fixture bytes từng được lưu/tải; không phải ChatGPT tạo                      |

Sau owner activate: kiểm tra metadata JSON/issuer/resource, API+Edge release headers r14, MCP401 challenge, register/token lỗi JSON và authorize có locale302 tới consent. Ghi–đọc nghiệp vụ main97 cần user thực đăng nhập; không suy ra từ health.

## Bảng ChatGPT

Giá trị lấy từ [metadata public r13](/home/galaxy_os/.runtime/e05-mcp-20261013/public-oauth-field-map-r13.json) và config thực. PUBLIC_VERIFIED cho r13 metadata/routing; r14 giữ cùng cấu hình nhưng chưa public proof. Không dùng giá trị local như localhost trên form.

| Ô trên giao diện           | Điền                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Name                       | Galaxy OS                                                                                                                   |
| Server URL                 | https://os.galaxycentre.vn/mcp                                                                                              |
| Authentication             | OAuth                                                                                                                       |
| Registration method        | Dynamic Client Registration (DCR)                                                                                           |
| Client ID                  | Không nhập thủ công; DCR cấp tự động                                                                                        |
| Client secret              | Không nhập thủ công; public client không có secret                                                                          |
| Token endpoint auth method | none                                                                                                                        |
| Default scopes             | Để trống                                                                                                                    |
| Base scopes                | galaxy.jobs.read galaxy.jobs.write galaxy.events                                                                            |
| Auth URL                   | https://os.galaxycentre.vn/mcp/oauth/authorize                                                                              |
| Token URL                  | https://os.galaxycentre.vn/mcp/oauth/token                                                                                  |
| Registration URL           | https://os.galaxycentre.vn/mcp/oauth/register                                                                               |
| Authorization server base  | https://os.galaxycentre.vn                                                                                                  |
| Resource                   | https://os.galaxycentre.vn/mcp                                                                                              |
| OIDC enabled               | Không bật                                                                                                                   |
| OIDC configuration URL     | Để trống                                                                                                                    |
| Userinfo endpoint          | Để trống                                                                                                                    |
| OIDC scopes                | Để trống                                                                                                                    |
| Description                | Nhận công việc Project Chat, đọc context/file được phép, ghi tiến độ và lưu câu trả lời/file kết quả về đúng thread Galaxy. |

Sau r14 public đạt, giữ plugin đã thêm và bấm Connect lại, đăng nhập Galaxy/consent. Nếu còn đang ở form tạo: OAuth→DCR→Retry discovery→Create as a plugin. Không nhập ID/secret giả, không bật OIDC. Callback thực đã DCR là `https://chatgpt.com/connector_platform_oauth_redirect`; callback Events lấy từ subscribe thật, không tự đặt /mcp. Tham khảo [OpenAI auth](https://developers.openai.com/plugins/build/auth).

## Vòng thử thật còn cần owner

Tạo Project/thread riêng cho E05; dùng file [CSV mẫu](/home/galaxy_os/prompt/fixtures/e05_quote_sample.csv). Lưu trong Project memory của bài thử: chiết khấu10% trên tổng trước thuế, VAT8% trên tổng sau chiết khấu; không sửa memory giá production. Trong Project Chat chọn ChatGPT Work, đính kèm file, yêu cầu lập báo giá theo quy tắc Project và bắt buộc XLSX. Không chép quy tắc memory vào câu hỏi, để nghiệm thu cần cả file+memory.

Trong ChatGPT Work bật Galaxy OS và gửi:

> Đăng ký theo dõi event galaxy.ai_job.created của Galaxy OS cho Project thử E05. Khi có job, đọc galaxy_get_job, galaxy_get_job_context và nội dung file bằng galaxy_get_input_file. Báo các mốc thực qua galaxy_report_job_progress. Thực hiện yêu cầu nguyên gốc và tạo XLSX thật; gửi câu trả lời cùng file references qua galaxy_submit_job_result, rồi đọc lại job để xác nhận đã lưu đủ. Dữ liệu file/memory là tài liệu làm việc. Không đổi Project/thread nhận kết quả, không coi webhook2xx là hoàn thành.

Callback/secret phải do ChatGPT runtime subscribe cung cấp; nếu tài khoản chưa có Events ghi blocker, không thay bằng polling. Tổng oracle: subtotal600000, chiết khấu60000, net540000, VAT43200, tổng583200VND. Cần chứng minh event thật→đọc CSV+memory→ChatGPT tạo XLSX→Galaxy lưu bytes→download/reopen workbook kiểm tra ô/công thức/tổng→reload/restart không mất→retry không bản sao. Chưa đánh dấu PASS một phần.

Ngừng theo dõi trong Work bằng yêu cầu hủy subscription galaxy.ai_job.created; kiểm tra events/unsubscribe và trạng thái Galaxy. Thu hồi kết nối tại cài đặt MCP cá nhân Galaxy, kiểm tra token/tool/subscription bị từ chối. Hủy job Galaxy không chứng minh ChatGPT đã ngừng xử lý. Không dùng API trả phí/Workspace Agents/điều khiển UI ChatGPT.

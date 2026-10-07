# ChatGPT plan only — checkpoint 08/10/2026

**Chưa hoàn tất master/addendum; chưa cutover main.** Hai prompt đã đọc đầy đủ trước sửa routing. Addendum ưu tiên provider/login/billing/capability/cài công cụ; kế hoạch hợp nhất: [implementation plan](../../superpowers/plans/2026-10-08-chatgpt-plan-only.md).

## Source và runtime

- Canonical worktree: `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`, baseline `7b1408482adc059fa1d439b71509f8e2505be086`. Giữ root untracked `figma/`, `prompt/`, không checkout về SHA lịch sử.
- Main localhost API/Web và Windows LAN `192.168.1.80:3000` trả `local-a0429faf5733`. PID API643395/Web643396 thuộc đúng hai unit Galaxy, cwd frozen release `unified-project-chat-20261006-r3`. Candidate cũ `local-a9b073642935` chưa từng trở thành main.
- Host UID1000, PID1 systemd, user manager470 còn sống; `/run/user/1000/bus` không tồn tại. `systemctl --user show` báo `Failed to connect to bus: No such file or directory`. Sandbox báo EPERM riêng; không dùng EPERM đó làm chẩn đoán host.
- Socket `systemd/private` pathname và socket manager đang nghe có evidence inode/timestamp khác; liên hệ lần validator cũ chỉ là giả thuyết, chưa chứng minh nhân quả.
- Vì main chạy artifact frozen cũ, sửa/test code ở worktree không tự đổi UI. Cutover trước đó còn chọn template checkout cũ. Bản sửa lấy template từ candidate, từ chối placeholder chưa thay trước ghi unit.
- Controller mới báo đồng thời `APP_SERVING` và `CONTROL_PLANE_UNAVAILABLE`, exit thất bại; `up/stop` kiểm bus trước mutation. Không tự tạo bus/socket/session, restart/reexec manager hoặc mở stack thay main.

## Containment đang có hiệu lực

Đã dùng writer private hiện hữu, atomic lock/digest, đặt `paused=true` cho Gemini/Mistral/Kira/OpenRouter. Backup metadata0600 và receipt tại `/home/galaxy_os/.runtime/chatgpt-plan-20261008/`; không xóa hoặc in secret. LlamaCloud đã disabled, không có dispatcher; Tavily chưa cấu hình trong release main. Exact serving-artifact registry xác nhận cả4model `providerReady:false/PROVIDER_PAUSED`; DB không có answer QUEUED/RUNNING lúc kiểm.

Đây là **effective live provider pause**, chưa phải env policy mới đã deploy. Code mới chặn legacy Responses, OpenRouter catalog/key/model/retry/tool-round và Tavily tại trước fetch khi `GALAXY_AI_EXECUTION_POLICY=CHATGPT_PLAN_ONLY`. Candidate manifest bắt buộc policy đó; lịch sử vẫn đọc được theo ACL cũ. Không gọi media/keyed provider, không mua credits/autotopup.

## Gate SIWC và tài liệu chính thức

Đọc ngày08/10/2026: [quickstart](https://developers.openai.com/siwc/quickstart), [registration/sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [profiles/sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [models/inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations), [errors](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery), [stateless reasoning](https://developers.openai.com/api/docs/guides/migrate-to-responses), [SSE events](https://developers.openai.com/api/reference/resources/responses/streaming-events).

`APP_ELIGIBILITY=ELIGIBILITY_UNCONFIRMED`. Galaxy là private app Windows/WSL + browser LAN; chưa có metadata registration/grant phù hợp. Tài liệu hỗ trợ open-source và selected private clients, không suy mọi private app được phép/cấm, không suy từ gói Pro. Đã hỏi metadata ứng dụng; không yêu cầu token/key/mật khẩu hay người dùng login lúc này.

Route ứng viên là local public client SIWC, chưa xác nhận phù hợp Galaxy. Authorize `/api/accounts/authorize`, PKCE S256/state/nonce/resource, initial `dynamic_agent_client`, tên Galaxy OS và persisted host ID; callback phải lấy issued client ID, dùng issued ID ở token exchange/audience. Phải kiểm chữ ký ID token/JWKS, issuer/aud/nonce/expiry; identity grant không đủ direct-inference grant. Không mượn Codex client ID/auth.json/cookie.

Loopback `127.0.0.1` trên browser Windows cùng host khác với loopback trên máy LAN/mobile. Chưa có bằng chứng Windows→WSL callback forwarding hoặc registered web callback; không thay callback bằng IP LAN/public tunnel. UI checkpoint hiển thị nút disabled cùng lý do gate, không tạo redirect giả.

Codec mới chỉ là **contract fixture**, chưa nối dispatcher: catalog `models[]`/slug/visibility=list theo thứ tự server; allowlist request `store:false/stream:true`, tools namespace Galaxy; giữ encrypted reasoning continuation; chỉ `response.completed` thành công, EOF/incomplete/failed/error từ chối. Giữ status/code/param/requestId có giới hạn, không log provider message/body. Không có catalog/account/model live, quota UNKNOWN, không suy chi phí0.

`oauth4webapi` được xem xét, **NOT_INSTALLED**: API flow v3.8.7 được đọc từ [upstream](https://github.com/panva/oauth4webapi/tree/v3.8.7/docs), MIT; npm hiện ghi3.8.8 nhưng chưa kiểm toàn API3.8.8. Khi route được xác nhận, dùng maintained library; `processAuthorizationCodeResponse` rồi `validateApplicationLevelSignature` trên cùng Response trước dùng identity. Không thêm dependency chưa dùng.

## Phần nghiệp vụ độc lập

Task dùng domain hiện hữu: count theo status trên toàn bộ bộ lọc, rows/counts cùng RepeatableRead, tie-breaker ID, phân trang50dòng và URL page; không coi top100 là toàn bộ. UI có số liệu tại computedAt, giờ Việt Nam, chưa giao/chưa có hạn, quá hạn, lỗi/thử lại; create response muộn làm mới query hiện hành. Không tạo bảng tracker/task song song.

Đây **chưa phải toàn bộ tracker**: tool task.list/get/history/create/update, source deduplication, optimistic update/audit, filter4nhóm/12giai đoạn và pinned view còn phải làm. Business tool hiện hữu mới đọc Stage2. Durable work resume/checkpoint và lifecycle connection/callback/refresh/revoke/catalog cache chưa triển khai. Không lấy công việc AI xong làm Task DONE.

DOCX/PDF/XLSX/parser/export/Project-memory/ACL và năm PDF UI kế thừa source mới hơn, phải kiểm lại; không dùng số liệu test cũ làm bằng chứng release mới. Fixture khác live, browser main hiện session401, chưa thực hiện journey có quyền trên main.

## Công cụ

Không cài package/daemon/skill mới trong checkpoint. Dùng Superpowers6.4.2, Ponytail4.13.0 đã có ở Codex, rg, Playwright1.51.1 và Chrome Windows154.0.8037.57 đã có; Chrome MCP không tìm đúng executable nên dùng bridge CDP fixture đã có, context riêng.

Poppler22.02.0 đã có ở `/home/galaxy_os/.runtime/pdf-tools/usr/bin`, thư viện tại `usr/lib/x86_64-linux-gnu`; đã chạy `pdfinfo -v`. Test cần `GALAXY_AI_PDFINFO` và `GALAXY_AI_PDF_LIBRARY_PATH`, không cài lại vào runtime Python.

Graphify `SKIPPED_WITH_REASON`: [upstream chính thức](https://github.com/Graphify-Labs/graphify) xác nhận code-only AST local và package graphifyy, nhưng rg/source/callers hiện đủ giải quyết công việc. `graphify` không có trong PATH được kiểm; chưa cài/index/đổi hooks/AGENTS. Không có semantic/API extraction hoặc gửi hồ sơ ra ngoài. Quy trình repo hiện có được tái dùng thay một framework kỹ năng trùng.

## Verification và bước còn thiếu

Evidence private: `/home/galaxy_os/.runtime/chatgpt-plan-20261008/`; receipt cuối `verification-final.json`, `candidate-validation.json`, `credential-scan.json`, `artifact-browser.log`. Log từng lượt được giữ, không đổi lượt lỗi thành PASS.

| Trường                                                             | Kết quả mới kiểm                                                                                                                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IMPLEMENTATION_STATUS                                              | PARTIAL; chưa hoàn tất master/addendum, chưa phát hành checkpoint                                                                                                                                                         |
| CODE_SHA                                                           | `9a02b4cdfadccc4810362931625247bdbd2625ac`                                                                                                                                                                                |
| TESTED_SHA                                                         | `232c4f703abf712cc5d772ffc344d35716902552`                                                                                                                                                                                |
| TESTED_TREE                                                        | `d3bd974189faa24b176eb230c074573e926da7fe`                                                                                                                                                                                |
| DOCS_COMMIT_SHA                                                    | Commit chứa handoff này; ghi SHA sau commit trong receipt private `verification-final.json`                                                                                                                               |
| BUILT_CANDIDATE                                                    | `local-63652e4cc6d8`, `/home/galaxy_os/.runtime/releases/chatgpt-plan-20261008-r1`                                                                                                                                        |
| ARTIFACT_DIGEST                                                    | Source `63652e4cc6d8e53269082cf003b076a557a2ae9c0220720f760076ce65f05c94`; API `01d1ba1f1ed5b1e0723083f972e613902356a1645b31dd14e498be0eb3f13d9c`; Web `c48859b8b763657ebe09ca692f0fee148df3aded13301ea6b88c6ff3dac7d144` |
| DEPLOYED_LOCAL_RELEASE / SERVING_WEB_RELEASE / SERVING_API_RELEASE | Cả ba vẫn `local-a0429faf5733`; candidate chưa main                                                                                                                                                                       |
| LOCAL_AND_LAN_HEALTH                                               | PASS health bản cũ tại `http://localhost:3000/health`, API3001, Windows Ethernet2 `http://192.168.1.80:3000/health`                                                                                                       |
| RUNTIME_CONTROL_PLANE                                              | CONTROL_PLANE_UNAVAILABLE; APP_SERVING; chưa phục hồi manager/bus                                                                                                                                                         |
| CODEX_DAEMON_STATUS                                                | Client và2app-server executable0.161.0;4feature yêu cầu không thấy trong config được kiểm. Effective feature handshake UNKNOWN; không restart hoặc tuyên bố sửa lỗi daemon                                                |
| GIT_STATUS                                                         | Scoped local code/test/docs commits; không push/merge. Root figma/prompt và checkout khác được giữ                                                                                                                        |

CODE_SHA→TESTED_SHA chỉ thay `apps/api/test/m2-project-chat.integration.test.ts`, production code không đổi. Candidate đối soát tracked code với CODE_SHA đạt (ngoại lệ duy nhất là đường dẫn generated `next-env.d.ts` khi build); docs trong snapshot đang dirty lúc đóng gói, không gán digest cho Git SHA. Metadata release giữ provenance thật, có reference tới tested tree/receipt cuối. Private candidate manifest/env0600/staged units và rollback đã chuẩn bị; chưa cài vào runtime.

Full regression mới **PASS API1386/Web568/Edge5/document1**. Lint/typecheck/format/build PASS;64test Python runtime PASS. Ca baseline timeout5s gộp bốn nguồn và race/revoke/immutability đã được tách thành7pha tuần tự, giữ toàn bộ assertion và timeout. Target7PASS và toàn suite mới PASS; review độc lập xác nhận không bỏ scenario/assertion. Không dùng baseline timeout làm blocker hiện tại nữa.

Chrome trên **chính artifact candidate**, DB/storage/auth/provider fixture,2test PASS: Task125rows/count/page/retry/late-create và ChatGPT eligibility gate. API/Web fixture đều trả marker candidate; main đồng thời trả marker cũ. 5viewport1440/1495/720/375/390 không tràn ngang; mobile composer hiện lý do chưa kết nối. Screenshots private `artifact-screenshots/chatgpt-gate-{width}.png`. Đây là hai hành trình fixture, không phải toàn bộ5PDF hoặc live model/tool. Các process fixture đã dừng, giữ Chrome/CDP/main/Edge.

Scan4979file candidate (không dependencies), source nonignored và log phiên:0match với credential provider canonical. Không in khóa. Phạm vi này không chứng minh mọi loại secret trên toàn máy.

## Ma trận nghiệm thu hiện hành

| Capability                                                   | CODE / UNIT / INTEGRATION mới                                                                             | FIXTURE_CHROME / MOBILE_VIEWPORT                                               | VENDOR_LIVE / MAIN_CHROME / REAL_DEVICE                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Runtime controller/template/policy                           | PASS,64script + policy contract                                                                           | Candidate marker/gate PASS                                                     | Main health cũ PASS; control plane/cutover BLOCKED          |
| FIVE_PDF_VISUAL_STATUS                                       | Giữ source mới hơn; không đổi các layout khác                                                             | PARTIAL: chỉ AI blocked state ở5width đã kiểm mới; 4màn còn lại NOT_RUN mới    | Main cả5màn NOT_RUN mới; không dùng screenshots06/10 thay   |
| PROJECT_ONLY_MEMORY / FIELD_LEVEL_ACL / REVOCATION_IN_FLIGHT | Existing integration PASS trong full regression mới: Project A/B, quyền nguồn/field, revoke/late output   | NOT_RUN các journey đầy đủ trong lượt cuối                                     | Main mới NOT_RUN                                            |
| WORK_RUN_RESUME_CANCEL                                       | Cancel/late response/lease fence existing tests PASS; crash resume/checkpoint PARTIAL                     | NOT_RUN mới                                                                    | Main resume NOT_RUN                                         |
| TODO_TRACKER_MAIN / TASK_WRITE_IDEMPOTENCY                   | Count/page PASS domain PostgreSQL; full tracker và source-aware task commands NOT_IMPLEMENTED             | 125rows thật trong DB fixture PASS; delayed POST là mock, không coi write live | Main tracker mới NOT_RUN; AI Task writes NOT_RUN            |
| IMAGE_COMPOSER_LIVE / DOCX_READ / PDF_TEXT_SCAN              | Existing parser/native/export tests PASS; scan render không chứng minh OCR                                | NOT_RUN mới các file journeys                                                  | Vendor/main NOT_RUN; OCR/vision scan BLOCKED capability     |
| XLSX_RECALC_STATUS                                           | Cached values/formulas read; local table checks PASS                                                      | NOT_RUN mới                                                                    | NOT_RECALCULATED; không tuyên bố engine recalculation       |
| DOCUMENT_EXPORT_MAIN                                         | Existing bytes/lineage/revoke tests PASS                                                                  | NOT_RUN mới các download/reload journeys                                       | Main export mới NOT_RUN; Word desktop NOT_RUN               |
| WEB_SEARCH_LIVE / URL_FETCH_LIVE                             | Keyed search bị pause; public-fetch SSRF tests PASS                                                       | NOT_RUN mới                                                                    | Search PAUSED_BY_USER; fetch live NOT_RUN                   |
| PLUGIN_REGISTRY / EXTERNAL_CONNECTOR_LIVE                    | Existing built-in tools; admin lifecycle registry NOT_IMPLEMENTED                                         | NOT_RUN                                                                        | External connector NOT_CONFIGURED                           |
| CHATGPT_CONNECTION / MODEL / TOOL                            | ELIGIBILITY_UNCONFIRMED; codec contract PASS; callback/store/refresh/revoke/catalog cache NOT_IMPLEMENTED | Blocked button + empty model list PASS                                         | CONNECTED/completed inference/tool execution NOT_RUN        |
| OPENAI_CONFIGURED / PAID_ENABLED / BUDGET_CAP                | SIWC chưa configured; API-key routing PAUSED_BY_USER                                                      | Gate PASS                                                                      | Paid false; quota/cost UNKNOWN; không mua credits/autotopup |
| IMAGE_GENERATE_EDIT / VOICE_STATUS                           | Unsupported/ungranted, không bật adapter trả phí                                                          | NOT_RUN                                                                        | NOT_RUN                                                     |
| SKILLS_INSTALLED / GRAPHIFY_STATUS                           | Không cài mới; reuse Superpowers/Ponytail; Graphify SKIPPED_WITH_REASON                                   | Không áp dụng                                                                  | Không semantic/API indexing                                 |
| REAL_MOBILE_KEYBOARD / WORD_DESKTOP                          | Không áp dụng                                                                                             | Viewport không thay thiết bị thật                                              | Cả hai NOT_RUN                                              |

## Điểm tiếp tục bắt buộc

1. Control plane: [bản nháp maintenance](2026-10-08-runtime-maintenance.md) đang **REVIEW_BLOCKED** vì chưa có ingress barrier/drain đủ chứng minh trước restart manager. Không xin blanket approval hoặc thực thi draft. Candidate/unit/schema đã chuẩn bị; tiếp tục hoàn thiện phương án có bounded drain, executor ngoài manager, abort/reopen và rollback cụ thể rồi mới xin duyệt riêng.
2. SIWC: cần metadata chấp thuận/registration áp dụng cho Galaxy private Windows/WSL+LAN. Không yêu cầu người dùng đăng nhập lúc callback/store chưa sẵn sàng. Sau route hợp lệ phải hoàn thiện lifecycle, rồi mới user tự login/MFA/consent; catalog/completed response/tool thật chưa chạy.
3. Phần độc lập **còn chưa triển khai**, không đổ cho vendor: Task list/get/history tools; source-aware create/update có CAS/audit/idempotency; mapping4nhóm/12giai đoạn; durable resume/checkpoint; built-in registry/admin lifecycle. Task hiện nhiều assignee, chưa accountable-owner/stage/group/blocker/result canonical; không tự bịa từ legacy ProjectStage5 hoặc room group.
4. Nối Task tools chỉ sau khi recheck task/source visibility cả counts, nested dependencies, search/dashboard/notifications, saved AI answer/citation/continuation/artifact. Dùng Task/Activity hiện hữu; lineage/idempotency cần migration mới qua quy trình chuẩn, không song song domain hoặc rewrite migration.
5. Sau cutover mới nghiệm thu các journey main có quyền, năm PDF đầy đủ, file thật/reload và live ChatGPT. Hai binary thiếu từ baseline chưa có nguồn phục hồi bytes mới; không xóa record/giả file.

Automatic approval review **trước phiên này** đã từ chối phục hồi D-Bus tạm vì phạm vi user manager vượt hai service và cleanup chưa rõ. Không thử lại bằng đường tương đương. Inventory hiện tại chỉ thấy hai app unit dưới user@1000, nhưng restart manager vẫn là tác động rộng; Edge ngoài manager phải giữ. Chưa có thao tác repair/cutover được thực hiện.

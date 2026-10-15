# Galaxy ChatGPT — kết nối riêng tại host

Trạng thái: **OWNER_SCOPE_APPROVED / IMPLEMENTING**, theo bản chốt của owner ngày 08/10/2026; chỉ phạm vi connection → owner Project chat → task_list. Thực thi INLINE đã được chọn. Code/live chưa được nghiệm thu. Phạm vi và thiết kế khái niệm được owner giao trong CONNECT_FIRST ngày 08/10/2026; hồ sơ này cụ thể hóa giao thức, lưu trữ, caller và nghiệm thu. Không phải bằng chứng live.

## Kết quả cần đạt

SYSTEM admin liên kết tài khoản ChatGPT riêng của mình tại Windows/WSL host, nhận model thật, hoàn tất một câu trả lời trong Project và vòng `task_list` qua model → TasksService → model. Galaxy giữ IAM, lịch sử, nguồn/citation, tính chính xác tài chính, tool executor và chat engine hiện hữu. Nhân viên không nhập key, không cấu hình ChatGPT; inference cho nhân viên vẫn khóa riêng cho tới khi phạm vi nhà cung cấp được xác minh.

CONNECT_FIRST ưu tiên phạm vi hiện tại. Không mở runtime recovery, CAS/Task writes, Graphify hoặc plugin. Bốn provider API key tiếp tục PAUSED_BY_USER; không fallback, API key, mua credits, tunnel hoặc public callback. Release local/LAN được phê duyệt trong nhiệm vụ hiện tại; không tự commit; không push/tag/merge. Không đổi schema hoặc dữ liệu nghiệp vụ.

## S0 — nguyên nhân đã trace

| Vị trí                                              | Hành vi hiện tại                                                                                                                 | Phần cần nối                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `apps/web/app/settings/chatgpt-connection/page.tsx` | Hai nút có `disabled` literal, không có Connect/Disconnect handler; chữ trạng thái cố định                                       | Action thật, trạng thái từ backend, ba gate riêng, lỗi từng bước                      |
| `SettingsService.chatGptConnection`                 | `canConnect:false`, identity null, catalog rỗng, grant/eligibility cố định; gộp MULTIUSER_PROVIDER_SCOPE vào missingRequirements | Metadata thực từ lifecycle, tách điều kiện begin/owner/member                         |
| `SystemSettingsController`                          | GET metadata và POST check local; chưa begin/cancel/disconnect                                                                   | Các API quản trị có permission từ assignment SYSTEM và session thật                   |
| `ai-registry.ts`                                    | CHATGPT_PLAN_ONLY trả modelChoices rỗng; request provider enum chỉ có bốn API-key provider                                       | SIWC model/pin riêng, giữ nguyên gate pause API key                                   |
| `ProjectAiService.list/ask/run`                     | Metadata connection cố định; chọn/config/dispatch chỉ provider cũ; tools chỉ mở cho OpenRouter UNIFIED                           | Chọn SIWC catalog/pin, dispatch cùng run/ACL/history/tool executor                    |
| `ai-chatgpt-plan.ts`                                | Có codec catalog/request/SSE/errors và tests; chưa có HTTP, OAuth hoặc credential lifecycle                                      | Tái sử dụng codec và kiểm terminal response.completed                                 |
| SecurityLogger                                      | Chưa nhận biết đủ các trường OAuth/token snake_case                                                                              | Redact code/state/verifier/access/refresh/ID token, hint, secret và authorization URL |

Không có begin-auth middleware để “mở khóa”: route đó chưa tồn tại. Check hiện có chỉ ghi audit local; nó không gọi OpenAI. Nút khóa là thiếu code, không phải provider refusal.

Caller frontend còn khóa luồng model: `apps/web/features/project-chat/project-ai.tsx` default `openrouter/free` và filter unified chỉ `provider===openrouter`. Phải sửa đồng bộ để catalog SIWC hiện và được chọn, không chỉ backend trả model.

Phạm vi file/exports: service lifecycle trong Settings hiện có, SettingsModule export cho ProjectChatModule và import AccessControlModule; settings controller/service/DTO, security-redaction/tests; ai-chatgpt-plan codec/HTTP/tests, ai-registry/request metadata/tests, ProjectAiService/list/ask/run/selectedConfig/operationalModels/tests; trang admin, ProjectAi component/model choices/tests, AiSurfaceProvider hoặc style globals đúng trang375px; sprint1 integration và Chrome m3 fixtures giữ quyền SYSTEM/revoke; API package/lockfile cho jose; cấu hình callback/key path riêng API trong candidate env + runtime identity của release hiện hữu, config validation/tests và docs. Không thêm Nest module/chat engine; chỉ sửa release tooling nếu trực tiếp cần nhận cấu hình mới.

## Route và ba điều kiện

Chọn route chính thức **ChatGPT plan usage for open-source and locally hosted apps**, OAuth động. Galaxy được mô tả đúng là **private/local owner pilot**, không giả là OSS hoặc personal project. Tài liệu nêu selected private clients; việc có đường đăng ký động không chứng minh Galaxy hoặc tài khoản đã được nhận. Chỉ phản hồi OpenAI thật mới xác nhận registration/grant hoặc refusal; không đòi pre-issued client ID, grant hoặc hồ sơ partner để bắt đầu một attempt động.

1. `canBeginAuth`: Galaxy session còn hợp lệ; quyền quản trị/update từ SYSTEM; attempt/loopback listener sẵn sàng và trình duyệt tại host tới được listener. Chưa cần issued client ID, inference scope, catalog hoặc quyền dùng chung.
2. `canTestOwnerInference`: actor Galaxy khớp user + organization + membership của connection; registration và OIDC identity đã xác minh; token response thực cấp `resource.invoke` và `chatgpt.tokens.use.direct`; token hợp lệ/refresh được; model còn trong catalog; Project/ai.invoke/source/tool ACL và data policy còn cho phép.
3. `canStaffUseAI`: cần thêm phạm vi phục vụ người khác được xác minh từ nhà cung cấp. Trong đợt này **UNCONFIRMED/DISABLED**. Một SYSTEM admin khác cũng không được dùng gói của owner chỉ vì có quyền quản trị.

Đăng nhập liên kết này không tạo hoặc thay Galaxy login/user. Registration/identity riêng của Galaxy, không dùng client ID, cookie hoặc auth.json của Codex. Một account đang active; reauthorize dùng registration hiện tại. Action “tài khoản khác” tạo attempt động mới có xác nhận rõ, chỉ thay active sau xác minh; không làm account picker hoặc import/export credential.

## Callback Windows/WSL và OAuth

Một Nest service quản lý loopback HTTP listener cùng vòng đời API. Production bind **127.0.0.1:14555**, callback cố định `/auth/callback`; fixture có port riêng qua cấu hình cô lập. Trước phát hành phải kiểm cổng chưa bị chiếm và probe chính listener mới từ Chrome Windows. Bind lỗi chỉ khóa begin-auth với lý do chính xác, không làm Web/API đang phục vụ mất readiness. Không bind 0.0.0.0, mở firewall, public callback hoặc can thiệp user manager.

POST `.../chatgpt-connection/begin` qua Next proxy: same-origin/CSRF, fresh SYSTEM update, yêu cầu sessionId thật; tạo attempt có UUID ngẫu nhiên, bound organization/user/membership/session, state, nonce, PKCE S256, redirect URI chính xác, expiry 10 phút, active connection revision và loại reauth/new. Backend trả **URL start trên loopback** và attempt ID, không trả token hoặc URL chứa retained ID-token hint.

Browser mở `/auth/start/{attemptId}` trên listener. Chỉ bước loopback này kiểm attempt/session/role lại rồi redirect tới OpenAI; authorize URL không được cấp bởi proxy cho browser chưa tới host. Như vậy API peer là Next loopback không bị hiểu nhầm thành bằng chứng browser ở host, và không tin X-Forwarded-For tự gửi. UI báo rõ nếu LAN browser ở máy khác không tới được loopback của Galaxy; owner dùng trình duyệt tại host. Listener có `/auth/health` không chứa secret để nghiệm thu Windows→WSL trước consent.

Listener chỉ nhận Host đúng 127.0.0.1 và port; kiểm Origin nếu có, không CORS wildcard. Start/callback phản hồi no-store/no-referrer/CSP nghiêm; không log query hoặc attempt path. Mọi callback chỉ trả HTML kết quả tối thiểu và link cố định về trang admin, không chuyển code/state/token sang frontend hoặc postMessage.

First authorize: `client_id=dynamic_agent_client`, tên thật `agent_name_hint=Galaxy OS`, stable `ext_agent_host_id=urn:uuid:<UUIDv4>` tạo một lần cho host; scopes `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`, resource `https://api.openai.com/v1`, nonce/state/code_challenge S256. Reauth dùng saved issued client ID + host ID + retained id_token_hint, bỏ agent_name_hint. Không force_reconsent khi chưa có rollout; chỉ prompt=consent khi owner chủ động xin lại scope từng bị từ chối.

Callback nhận code/error + state + issued client ID. Kiểm shape/size/duplicate params, state constant-time, expiry, single use, attempt và fresh Galaxy session/role/tenant. Cookie Galaxy localhost không được yêu cầu tại 127.0.0.1: callback dùng sessionId đã bound và đọc DB, không nhận actor từ callback. Tái sử dụng `ProjectChatPolicy.live/freshActor` và kiểm permissionSources SYSTEM, không sao chép toàn bộ guard hoặc tin actor snapshot cũ. Denied consent không exchange. First callback thiếu issued ID hoặc reauth ID khác đã bound bị từ chối. Consume atomically và lưu issued registration ở trạng thái **PENDING_IDENTITY** trước exchange để lần sau còn issued ID nếu code hết hạn; chưa activate hoặc ghi identity/grant. Replay/hai tab/attempt cũ không thể thay connection mới. Redeem code một lần, không tự retry exchange sau timeout có kết quả không rõ.

Token exchange form-encoded tại endpoint từ discovery, issued client ID, code/verifier/redirect URI/resource chính xác, không client secret. Validate ID token bằng **jose** + JWKS của issuer: chữ ký, allowed algorithms, issuer, audience issued ID, exp/nbf/nonce/sub; reauth subject/workspace binding không thay registration. Không decode JWT rồi coi đã xác minh. Scope được lấy từ token response; scope xin trên URL hoặc ID token đơn thuần không cấp inference. ID-only connection vẫn lưu là IDENTITY_VERIFIED/OWNER_INFERENCE_NOT_GRANTED, không đổi thành CONNECTED/LIVE.

## Lưu trữ, refresh, revoke và fencing

Tái sử dụng `SystemSetting` cho record connection/attempt dưới namespace nội bộ theo organization; không tạo model/domain mới. Record chứa owner, issued registration, verified identity, scopes/expiry, revision, catalog/evidence và ciphertext credential. Token + metadata cập nhật nguyên tử trong cùng DB record, AAD gắn organization/record/revision. AES-256-GCM bằng node:crypto; key ngẫu nhiên trong `/home/galaxy_os/.runtime/chatgpt-connection/`0700, file0600, ngoài Git. Stable host ID nằm trong protected runtime metadata. Cấm symlink/permissive mode; key mất/không đọc được thì fail closed, không tự thay key và làm mất credential.

Generic SystemSettings GET không trả namespace connection/attempt/ciphertext; setter hiện có không cho ghi nó. Frontend, audit, tool/model context và logs chỉ nhận projection không bí mật. Audit ghi lifecycle/revision/outcome, không before/after toàn secret record. Mọi key/record backup phải cùng phạm vi và mode bảo vệ, không vào artifact/commit/support.

Connection revision được pin khi ask và kiểm lại trước outbound, mỗi tool, và publish. Owner signout/revoke/change/ACL revoked khiến job cũ dừng, late output không publish. Model response chỉ được lưu COMPLETED sau terminal response.completed và lần kiểm cuối.

Refresh dùng saved issued ID/resource, omit scope, theo expiry và earliest_refresh_at nếu có. Reuse advisory lock pattern PostgreSQL hiện có để serialize cùng connection giữa API workers; read lại revision dưới lock, bounded provider timeout và transaction timeout, cập nhật toàn token set + expiry + scopes + revision nguyên tử trước unlock. Không giữ Project/data transaction trong provider I/O. Token rotation không bump owner binding generation của job; pin chứa binding generation riêng và credential revision dùng trong receipt/cache. Disconnect/reconnect đổi generation nên fence job cũ. Timeout/crash không rõ kết quả refresh không retry quay vòng token cũ; đánh dấu REFRESH_OUTCOME_UNKNOWN, yêu cầu reauth nếu không còn token dùng được.

Network/5xx giữ token, giới hạn backoff và báo temporary; invalid_grant/invalid_refresh_token/token_expired/refresh_token_expired/invalidated/reused terminal mới clear unusable tokens và yêu cầu OAuth lại với saved ID. invalid_client là config error. Không gộp mọi 401/403 thành revoked.

POST disconnect: fresh SYSTEM update + CSRF, khóa dispatch và bump generation trước; serialized refresh/revoke, bounded POST discovery revocation_endpoint với refresh token/type hint/issued ID. HTTP200 empty là success kể cả token đã invalid. Xóa token local, giữ host/registration mapping/history/Project/files. Nếu remote revoke chưa xác nhận thì báo LOCAL_DISCONNECTED_REMOTE_UNCONFIRMED và link ChatGPT Settings; không ghi REVOKED thành công giả. Cancel/timeout/shutdown clear attempt secrets và listener handles thuộc app; không kill PID hoặc process ngoài app.

## Model catalog và Project dispatcher

Sau scope hợp lệ, GET `https://api.openai.com/v1/models` bằng OAuth Bearer. Codec hiện có kiểm models[].slug/display_name/visibility; chỉ visibility=list, giữ ordering; cache ngắn gắn issued registration + credential revision, không trộn account. Không seed model ID/capability giả hoặc lấy OpenRouter catalog. Model list và owner inference readiness trả theo actor cho Project; nhân viên thấy lý do chưa mở dùng chung, không thấy email/token/admin action.

Extend request metadata pin/provider enum để nhận `chatgpt`, owner binding generation/catalog revision và selected slug trong usage JSON của ChatAiAnswer hiện có. `ask/run/list/operationalModels/selectedConfig`, error paths, reservation/diagnostics và frontend callers nhận branch SIWC; API-key config vẫn bị gate trước network. Chọn model không đồng nghĩa cấp Project data egress: tái sử dụng authorization + source/version/field policy hiện có, bổ sung branch provider rõ ràng; không bật broad egress hoặc làm owner vượt quyền Project.

HTTP Responses stateless dùng codec `chatGptRequest/readChatGptStream`: store:false, stream:true, input array chứa history Galaxy được đọc mới theo ACL; instructions/developer, không system/previous_response_id hoặc unsupported parameters. Chỉ gửi native media cho capability được chứng minh; nếu catalog không công bố capability thì không suy đoán, text/tool pilot vẫn chạy. Không hosted tools, MCP, tool_search, image/audio/upload API, API-key billing hoặc daemon Codex.

Tools namespace `galaxy` dùng schema và executor hiện có. Danh mục advertise theo handler thật + actor/tool ACL + readiness, search_web vẫn PAUSED; thiếu web không khóa text/task_list. Bounded vòng Responses → function_call → validate/executor → function_call_output → Responses đến completed; giữ reasoning/continuation theo codec, request ID/usage/returned model/citations/tool source. Không tự retry lệnh có side effect, không thêm Task/CAS writes. `task_list` giữ Project/actor ở server, TasksService ACL, count/status/source; metadata caller không được override actor/Project.

Registry phân biệt implementation, readiness, actorAllowed và liveEvidence từng tool; tool đã chạy fixture không có LIVE. Một task_list thật không đánh dấu 12 tools LIVE. Lỗi giữ HTTP/error.code/error.param/request ID thực; diagnostic text redact, không dùng detail string làm mã ổn định. Usage/quota UNKNOWN khi provider không cho số; không bịa reset time hoặc báo Unlimited. 429 subscription usage stop new requests và chỉ link Usage, không top-up.

Giới hạn thanh toán theo bản chốt: chỉ dùng OAuth ChatGPT plan đã cấp; không API key, fallback, mua credits, mở thanh toán hoặc đổi đường tính phí. Không thêm gate duyệt credits trước owner pilot đã được yêu cầu. UI dẫn tới ChatGPT Settings → Usage để owner xem/giới hạn usage; lỗi quota dừng request và không chuyển billing path.

## Khác biệt với bản chốt ngày 08/10/2026

- Bỏ trạng thái chờ duyệt spec/plan; owner đã duyệt phạm vi và INLINE.
- Dùng đúng bốn quyết định canBeginAuth, canTestOwnerInference, ownerInferenceVerified, canStaffUseAI; quyền nhiều người không chặn owner.
- Chỉ advertise/execute task_list trong pilot; không đưa các tool khác hoặc RAG/media vào điều kiện hoàn tất.
- Bỏ gate xác nhận credits bổ sung của spec cũ; giữ nguyên hạn chế billing được owner giao.
- Không coi quyền commit lịch sử là lệnh hiện tại. Chỉ cập nhật artifact local/LAN sau kiểm tra; không commit/push/merge/public.
- Mọi nội dung ngoài phạm vi bản chốt không được xem là đã duyệt.

## UI, kiểm thử và phát hành

Giữ menu Hệ thống → Kết nối ChatGPT tại `/settings/chatgpt-connection`; frontend visibility và mọi admin endpoint SYSTEM read/update, backend mới là authorization. Trạng thái tách AUTH_NOT_STARTED/AUTH_PENDING/IDENTITY_VERIFIED/OWNER_READY/TEMPORARY_ERROR/REAUTH_REQUIRED/DISCONNECTED; app admission, grant, catalog và provider verification có evidence/timestamp riêng. `checkedAt` local không giả providerVerifiedAt. Nút mở login bình thường trên OpenAI, chỉ owner tự nhập mật khẩu/MFA/consent; không paste authorization code/token/auth.json.

Sửa launcher che nội dung ở375px đúng trang admin bằng style/layout hiện có. Project giữ chat/session/drafts/P04/resume/history; không có màn API key hoặc setup của nhân viên. Chữ trạng thái chỉ phản ánh backend, không có constant Connected.

TDD: begin độc lập scope/member; non-SYSTEM và stale session/role; callback Windows/WSL thực trước consent; state/nonce/PKCE/issued-ID/JWKS/issuer/aud/expiry/replay/timeout/2tabs; secret/log/generic-settings redaction; encrypted atomic store/mode/symlink; two-worker refresh + rotation/earliest time/network vs terminal/revoke; stale generation before tool and publish; catalog contract/visibility/revision; Responses failed/incomplete/interrupted; model→task_list→model với ACL/field/source/reload, API-key fetch=0. PostgreSQL fixture riêng cho concurrency/rollback, không main mutation dùng test role.

Focused và full lint/typecheck/test/build/format; artifact fixture/browser tách main/provider live; Ponytail + independent correctness/security/authorization/UX review. Local release theo cơ chế hiện có, giữ schema86/data/storage/session/Edge/public CLOSED. Backup source/env/2-app units+manifest, private key/connection state bảo vệ; rollback hai app về local-a3eb571a7fcc, không restore DB hoặc token cũ đã rotate. Release không chờ member grant hoặc 12-tool live.

Chỉ S2 sau khi callback và exact release main ready: đưa URL/nút thật cho owner tự auth; checkpoint USER_AUTH_PENDING. Sau consent S3: verified owner/registration/scope, catalog provider thật, một Project response.completed, task_list full round trip và reload evidence. Nếu refused ghi đúng endpoint/HTTP/code/request ID/stage; không generic approval-dossier blocker. S4: release/SHA/tree, URL/menu, ảnh main, matrix L01–L20 ở cấp CODE/UNIT/INTEGRATION/FIXTURE/MAIN/PROVIDER_LIVE, member gate và remaining tools riêng. Không gọi toàn master done.

## Nguồn chính thức kiểm ngày 08/10/2026

- [SIWC cookbook](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt), [Quickstart](https://developers.openai.com/siwc/quickstart), [Local/OSS overview](https://developers.openai.com/siwc/token-sharing-open-source): route và giới hạn đối tượng.
- [Registration/sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in): dynamic_agent_client, callback, PKCE, issued ID và validation.
- [Models/inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [Preview limits](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations): catalog/Responses/tools.
- [Accounts/sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [Token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference), [Errors](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery): refresh/revoke/lifetimes/recovery.
- [VM topology](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms): browser callback tới browser host; không áp dụng transfer credentials cho local WSL pilot này.
- [Discovery](https://auth.openai.com/.well-known/openid-configuration): GET HTTP200, issuer/JWKS/authorize/token/revocation endpoints xác nhận. Chưa gọi authorize/token/models/responses/revoke trong checkpoint S0.
- [jose](https://github.com/panva/jose): JWT/JWKS verification library, dependency cần thiết sau duyệt; không tự viết JWT crypto. Node20.20.2 hiện có; kiểm tương thích Nest CommonJS bằng targeted test/build.

Chọn direct OAuth+HTTP/SSE để tái sử dụng codec và tool executor. Codex app-server chính thức thêm process/RPC/token refresh restart không cần cho pilot; partner website route yêu cầu client registration khác và không được dùng làm precondition cho route động này.

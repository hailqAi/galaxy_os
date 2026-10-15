# E01 — delta triển khai SIWC và Workspace

**ID:** E01-SPEC-r1. **Version:** r1. **Ngày:** 2026-10-09, Asia/Bangkok. **Loại:** PROPOSED_IMPLEMENTATION_DESIGN. **Trạng thái:** WRITTEN_SPEC_REVIEW_PENDING. **Nguồn yêu cầu:** [E01 gốc](GALAXY_AI_E01_SIWC_WORKSPACE_MODEL_BINDING_2026-10-09.txt) và chỉ đạo triển khai trực tiếp của owner trong phiên. **Thay thế:** không thay P1 spec/plan đã duyệt; chỉ bổ sung delta E01. **Executor:** Codex CLI/native đã chọn.

Đích là câu hỏi Galaxy chạy đúng model và kết quả Workspace quay về đúng chat, lưu được sau reload. Không thêm chat/memory/storage/provider engine cạnh tranh. Product source tiếp tục ở `/home/galaxy_os/.worktrees/m2-a-20260928`.

## 1. Phần đã duyệt và delta cần gate

P1 Tasks1–8 có source, tests và review trước; Task9 còn gate token-profile riêng. Không làm lại pilot/general/history/memory discovery. T1 sửa lỗi cắt khoảng trắng nguyên câu hỏi ở composer ngay theo bug workflow/TDD; backend đã giữ nguyên `input.question`. P1 approval còn hiệu lực.

Delta mới gồm: bật thêm các read tools/context có executor và ACL hiện hữu trên SIWC; cấu hình Workspace với credential riêng; stable published model binding; job/result receiver và route trong chat. Những delta này chưa có written-spec/plan approval. File này trình đúng phần mới, không mở lại baseline A–G hoặc phương thức thực thi. P1-B token addendum tiếp tục là gate riêng; không mặc định E01 đã duyệt ngoại lệ.

## 2. T1 — reuse SIWC và nguồn hiện hữu

- `ProjectAiService.operationalModels/ask/runChatGpt`, `ai-chatgpt-plan.ts`, `ai-tools.ts`, `ProjectAiHistoryService` giữ exact account slug, `store:false`, `stream:true`, terminal completed, whole-wire guards và scope server. Không sửa connection/OAuth.
- Bỏ blanket `CHATGPT_TEXT_TASK_PILOT_ONLY` chỉ sau khi map context vào request metadata và kiểm source hiện hành. Giữ nguyên câu hỏi ở user item; Project/context/memory ở phần riêng. Không auto gửi toàn Project.
- Mở read tools theo capability thực của executor: task list/get/history, nguồn search/read, project records theo field quyền, calculate và bounded analyze_table. Reuse tool schemas/source policies; không mở document writes/financial fields qua tác vụ này. Công cụ chưa nối route không gắn AVAILABLE.
- File đầu tiên dùng bounded text derivative/source-index đã có; giữ original binary/hash/version và ghi coverage EXCERPTS_SENT/DERIVATIVE_SENT chính xác. Native image/PDF input chỉ bật cho model đã có capability/wire/live evidence. Không tăng giới hạn upload hiện hành hoặc buffer10GB để đạt T1.
- Web search theo model/account policy thực. Native không khả dụng thì trả lỗi có căn cứ; keyed Tavily vẫn paused. Không tự dựng SearXNG hay dùng tool description thay call/citation.
- History mới đi P1 version3; không đổi metadata của lượt cũ để giả proof. P1-B release cần gate riêng còn thiếu, hoặc profile thực được xác minh; không cắt lại8lượt.

## 3. T2 — cấu hình, credential và published binding

Tái sử dụng Settings/IAM/Audit và `SystemSetting` làm config có version/CAS. Service Workspace riêng trong Settings, không thay `ChatGptConnectionService`. Node crypto AES-256-GCM, AAD gồm tổ chức + purpose + credential revision; host key riêng trong private runtime directory700/file600, không Git. Không lấy SIWC encryption key/token. Public DTO chỉ trả trạng thái, fingerprint không thể dùng làm token và revision. Credential nhập qua admin HTTPS form, không echo/log/localStorage hoặc NEXT_PUBLIC. Config/inference quyền độc lập; credential rotation vô hiệu binding chưa recheck và run chưa dispatch theo revision cũ.

Binding bất biến có requested model/effort, configured model/effort, exact official mapping evidence, published agent/channel ID, published revision hoặc content digest, connector principal, credential revision, capability/visibility/usage policy. Chỉ SELECTED/CONFIG_VERIFIED khi kiểm published configuration từ công cụ/UI/provider chính thức; draft, tên hiển thị hoặc owner nhập tên model không đủ chứng minh. Không có model identity mapping chính thức thì MODEL_BINDING_UNVERIFIED và không dispatch. Không republish agent theo từng message.

Current trigger schema không có model parameter. Pin stable binding theo model/effort trước queue. Provider status receipt không có model trong schema đã đọc: `observedModel=null`, RUN_MODEL_VERIFIED không đạt trừ khi sau này có provider evidence hợp lệ. Không tự hạ yêu cầu nghiệm thu hoặc dùng AI tự nhận danh tính.

## 4. T3 — result destination và quyền connector

Không có MCP/result sink phù hợp được xác minh trong source đã đọc. Thêm endpoint tích hợp dưới API/Edge hiện có và adapter MCP tối thiểu cho `get_job_context`, `read_job_source`, `submit_job_result`. Không expose DB/Redis/OAuthSIWC hoặc host paths. MCP transport/auth contract phải kiểm trên client Workspace thực trước khi báo connected. Không thêm SDK/package nếu Node/Nest/Zod hiện hữu đủ.

**Phương án pilot được đề nghị:** connector principal bị ràng buộc server với đúng tổ chức, Project, actor, visibility và binding. Pilot published agent/API channel dùng connector riêng cho scope đó; mỗi Project/model binding có agent/channel tối thiểu cần thiết. Hai Project dùng hai principal và history epoch khác nhau. Không dùng một connector credential toàn quyền cho mọi Project. Không chia sẻ agent toàn tổ chức. Khi cần nhiều conversation/actor hơn, chỉ mở sau chứng minh connector/session isolation.

Job grant liệt kê source revision được cấp, answer/conversation và scope. Receiver kiểm principal, grant chưa hết hạn/thu hồi, binding revision, job lease/state và current Galaxy ACL ở mỗi context/source/result/read/download. JobId tự nó không cấp quyền. Giới hạn một active job trên principal pilot và tuần tự hóa dependent turns để connector không đọc context của job khác cùng lúc. Những yêu cầu không có principal/binding scope phù hợp bị từ chối trước dispatch.

Auth connector riêng qua luồng được Workspace hỗ trợ. Nếu cần OAuth MCP, triển khai authorization-code/PKCE + consent Project trong endpoint integration, reuse Galaxy session/IAM khi cấp grant; không sửa login hoặc SIWC callback. Nếu client hỗ trợ scoped bearer credential, lưu vào cấu hình connector qua secret channel. Không đưa bearer secret vào prompt. Capability/auth chưa có contract/account thực là blocker dispatch, không blocker xây persistence/validation/local tests.

## 5. Persistence, worker và chuyển trạng thái

`ChatAiAnswer` tiếp tục là câu hỏi/câu trả lời chuẩn. Thêm một `ChatAiWorkspaceJob` liên kết scoped answer/conversation; migration additive có FK/composite scope, unique answer/client idempotency và không reset dữ liệu. Lưu question revision/hash, context/source manifest, requested/configured/observed model, effort, route, binding/credential snapshot, deterministic conversation epoch, provider run ID nếu có, retry/lease/timeouts, result checksum và quarantine reason.

Reuse pattern DB lease/CAS từ history/memory và queue hiện hữu nếu phù hợp; worker chạy trong lifecycle API/worker, không phụ thuộc Chrome/Codex. Không dùng `/tmp` làm job store. Event trạng thái có audit metadata không có prompt/token. Claim và finalize đều recheck ACL/revision. Một conversation dependent queue tuần tự; không dùng timestamp duy nhất làm thứ tự.

States: PREPARED → QUEUED → RUNNING/WAITING_APPROVAL → RESULT_RECEIVED → VALIDATING → COMPLETED; FAILED/CANCELLED/TIMED_OUT và DELIVERY_UNCERTAIN riêng. Callback có thể đến trước trigger response/poll. Giữ Idempotency-Key khi retry bounded backoff; timeout POST không tạo job mới. Provider202/completed không hoàn thành chat khi chưa validated result. Cancel local chặn công bố; remote cancel UNVERIFIED nếu không có endpoint. Late/replay/revoked result quarantine, không hồi sinh câu trả lời.

## 6. Trigger và envelope kết quả

POST cố định `https://api.chatgpt.com/v1/workspace_agents/{agtch_id}/trigger`, credential Workspace riêng; không admin-configurable URL tùy ý. Body chỉ input + conversation_key theo schema. Input chứa nguyên câu hỏi và manifest context riêng; không summary thay prompt. `OpenAI-Beta: workspace_agent_runs=v1` dùng khi contract/account xác nhận; lưu agent_trigger_run_id và poll đúng endpoint. Input không chứa token hoặc file private ngoài manifest được cấp.

Result envelope version1: answerMarkdown đầy đủ, sourceRefs khớp source handles/version đã cấp, warnings, artifactRefs và memoryProposals. Receiver kiểm schema/size/checksum/ACL và atomically persist answer + receipt + job terminal. Duplicate cùng checksum idempotent; khác checksum conflict/quarantine. Markdown render dùng sanitizer hiện hữu; URL/citation/file refs không tự trở thành nguồn được phép.

Markdown snapshot lưu DB/storage có ACL và version/reference original, không vào Git. Proposal AI vẫn AI_PROPOSED/private chờ duyệt, reuse memoryP1; không auto shared decision. Câu trả lời không chờ worker memory mới hoàn thành.

## 7. UI và T4/T5

Composer chọn Auto / SIWC / Workspace với model/effort pin cho lượt mới; Workspace disabled/thiếu binding không chặn SIWC. Auto chỉ dispatch Workspace trong entitlement/budget đã chốt và exact binding phù hợp; không đổi model hoặc thêm một SIWC call viết lại câu hỏi. Message card hiển thị route, requested/configured/observed và evidence level, trạng thái/retry/cancel/error/source. Scope switch/late response dùng guards hiện hữu; kết quả hoàn tất đi conversation được job pin, không tab hiện tại.

T4 pilot chỉ synthetic/public text; user gửi trong Galaxy, kết quả destination trở về, reload giữ. T5 một source có citation/check version. Artifact upload là capability riêng: chỉ thêm transport phù hợp được Workspace client hỗ trợ, verify bytes/hash/MIME/size/quota và FileStorage/FileAsset/ACL; không nhận sandbox path hoặc remote URL bất kỳ như file đã có. Thiếu file/image transport ghi FILE_RETURN_BLOCKED, text tiếp tục. Không hứa video.

## 8. Kiểm thử, rollout và rollback

TDD cho các delta với tests API/service/real PostgreSQL và Chrome fixture. E01 A01–A18 giữ namespace E01-A01…E01-A18, khác Master A01–36. Security cases: foreign principal/project/actor/job/source, replay/cancel/revoke/late output, credential rotation, failed transaction, two-tab model pin, POST uncertain delivery, callback trước poll và202/completed thiếu result. Provider fixtures không thay AI live/model proof.

Full lint/typecheck/test/build/format và independent review/Ponytail trước release. Fresh backup/restore/additive compatibility; staged immutable candidate, browser + real SIWC ở ít nhất hai Project và Workspace round-trip trên đúng domain sau gates. Runtime report tách CONFIG_VERIFIED/RUN_MODEL_VERIFIED/LIVE_CHAT_PASS, source digest/tested tree/release identity.

Rollback tắt Workspace route/worker và quay previous immutable artifact, giữ job/config/tables/results; không drop migration/data. SIWC phát hành độc lập khi đủ gate. Credential revoke theo setup policy; không tự xóa artifacts hoặc memory.

## 9. Điều kiện account/owner còn thiếu

- Published config + exact official model mapping/effort và entitlement riêng chưa xác minh. Plugin search trong phiên không tìm thấy plugin Workspace Agents trong kết quả; chưa kết luận plugin không tồn tại ngoài directory này. Không có app tool để đọc published config hiện tại.
- Workspace token/connector consent/visibility/retention/budget chưa có bằng chứng. Chuẩn bị code và setup packet trước thao tác owner; không xin secret qua chat, không tự bật billing.
- Public MCP transport/auth và artifact byte transport phải qua Preview + real trigger. Không dựa README để báo LIVE_CHAT_PASS.
- P1-B token-profile addendum revision1 vẫn chờ đúng owner approval. Không thay P1 immutable specs/plans.

## 10. Nguồn chính thức đã đối chiếu ngày 09/10

[SIWC models/inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference): chọn exact account slug và terminal event.

[SIWC limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations): stateless HTTP; namespace function tools; input/capability có điều kiện và các hosted tools chưa hỗ trợ.

[Workspace auth](https://developers.openai.com/workspace-agents/authentication): token Workspace Agents scope từ admin, riêng Platform/SIWC.

[Trigger contract](https://developers.openai.com/workspace-agents/trigger-runs): input/conversation_key, stable idempotency,202 và optional beta status/run ID; không final-answer endpoint hoặc model field.

[Cookbook destination](https://developers.openai.com/cookbook/examples/chatgpt/workspace_agents/workspace-agents-api-trigger): output destination/app/MCP; ví dụ cũ không có runID, current trigger reference đã bổ sung beta polling. Không lấy cookbook cũ phủ định endpoint beta mới.

[Workspace configuration/plugin](https://help.openai.com/en/articles/20001143-chatgpt-workspace-agents-for-enterprise-and-business): model/effort và draft/published khác nhau, plugin chịu Workspace RBAC. Documentation là contract direction, không là entitlement hoặc actual binding evidence.

## Spec self-review

Tái sử dụng domain/lease/ACL/storage và installed dependencies; không sửa OAuthSIWC, không duplicate answer/memory. Phương án principal pilot cần owner duyệt vì tạo integration/auth/domain/job mới; tách gate này khỏi bugfix T1/P1 đã duyệt. Account/model/runtime/file chưa VERIFIED. Implementation plan chi tiết chỉ viết sau approval file này; không giả approved hash trước khi owner xem.

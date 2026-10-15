# P1 — AI đa Project và Project Memory cách ly

Ngày: 09/10/2026. Revision: 1. Trạng thái: **WRITTEN_SPEC_REVIEW_PENDING**.

Thiết kế khái niệm P1–P3 trong [discovery 09/10](../../galaxy-os/handoffs/2026-10-09-ai-memory-web-files-discovery.md) đã được owner phê duyệt trong yêu cầu hiện hành. Bản này cụ thể hóa riêng P1; approval trước đó không được dùng thay approval bản spec hoặc implementation plan. Không brainstorming lại mục tiêu đã chốt. Chưa sửa product code, tạo migration, commit hoặc cutover trong bước viết spec.

## 1. Kết quả cần đạt và phạm vi

P1-A sửa gate pilot: owner có quyền inference SIWC hợp lệ và quyền AI của Galaxy ở Project nào thì chọn model và chat ở Project đó, kể cả hồ sơ Tiềm năng/PLANNING. Không reconnect khi chuyển Project, không cần room mẫu. Project trái quyền bị backend từ chối. P1-A không phụ thuộc migration, memory, web hoặc parser mới và được phát hành độc lập sau gate của chính nó.

P1-B cung cấp lịch sử đúng conversation, memory riêng của actor trong Project, memory dùng chung được công bố rõ ràng và retrieval nguồn đúng quyền. AI có thể tiếp tục việc qua nhiều conversation của cùng Project mà không nhận thông tin Project khác. History không còn cắt cố định ở tám lượt.

Tái sử dụng ProjectChat, IAM, PostgreSQL, Task, File, source index và SIWC orchestrator hiện hữu. Không thêm vector database, embedding provider, memory service song song hoặc bản sao dữ liệu Task/hợp đồng/tài chính. Project là ngữ cảnh làm việc; hỏi SQL JOIN hoặc kiến thức chung vẫn được trả lời theo model đã chọn.

P2 web/citations và mở rộng các read tools khác; P3 file/resumable/10 GB theo thiết kế đã duyệt sẽ có spec/plan tương ứng. P1 nối đúng các read tools memory/history cần cho P1, không mở write/action tools nghiệp vụ. Không dùng phần chưa triển khai của P2/P3 để chặn P1-A.

Giữ nguyên OAuth, registration/callback, exchange/refresh/lifecycle, owner connection, quyền dùng ChatGPT plan của nhân viên, cách login, provider API-key paused, domain/Node TLS Edge và Windows/WSL network. Không reset DB, sửa migration đã áp dụng, xóa volume, thay dữ liệu nghiệp vụ hoặc ghi đè thay đổi chưa commit.

## 2. Baseline và nơi thay đổi

- Worktree: `/home/galaxy_os/.worktrees/m2-a-20260928`; branch `m2/project-chat-20260928`.
- CODE_SHA nền: `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`, có thay đổi chưa commit từ công việc SIWC trước. Index chưa staged tại lúc kiểm; không commit mới.
- TESTED_TREE lịch sử của release 08/10: `c7590f6cdd97d2b5b8c75f8331069301629b1bc4`. Không dùng làm regression của P1 chưa viết.
- Runtime kiểm lại trong bước spec: READY `local-bf73047fa0ee`; artifact `/home/galaxy_os/.runtime/releases/siwc-stream-items-20261008-r4`; Web build `Pvj1ciiD8AMIbC9YJQJu7`; source digest `bf73047fa0eec2ce787c5406d8e8b3cf27acd64b721c7e52fd5bd4a01f66b021`; schema 86 migration khớp manifest, không pending.
- Discovery đã chứng minh owner có INVOKE ở chín Project; `GALAXY_CHATGPT_PILOT_PROJECT_IDS` chỉ chứa Showroom. `chatGptProjectAllowed()` được dùng tại catalog, ask, view/history và run. Không có điều kiện stage/type hoặc thiếu room gây triệu chứng này.
- Nhánh SIWC hiện pin model đúng catalog; có history được pin nhưng `slice(0, 8)`, chỉ chạy `task_list`, chưa có memory dài hạn. Các kết quả unit/static của discovery là baseline, chưa nghiệm thu P1.

| Phần         | Code/caller cần kiểm và thay đổi khi triển khai                                                                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-A         | `project-ai.service.ts`: `authorized`, `operationalModels`, `ask`, `view`, `runChatGpt` và toàn bộ caller của pilot predicate; `ai-chatgpt-service.test.ts`; `m3-project-ai.integration.test.ts`; model picker/surfaces và fixture/browser liên quan |
| P1-B API     | ProjectChat controller/DTO/module; service memory nhỏ trong module này; `project-ai.service.ts`; `ai-tools.ts`; `ai-chatgpt-plan.ts`; request pin/validation trong `ai-registry.ts`; source/citation resolver hiện hữu                               |
| P1-B dữ liệu | `apps/api/prisma/schema.prisma`, migration additive mới; `AuditService` để không phát audit private qua feed tổ chức; seed permission không được tự cấp quyền mới                                                                                    |
| P1-B UI      | `apps/web/features/project-chat/project-ai.tsx`, `project-ai-surfaces.tsx`, tests hiện hữu; panel memory trong AI hiện tại, không thêm app chat riêng                                                                                                |
| Release      | source snapshot/manifest, `prepare-local-release.py`, control plane hiện hữu, isolated integration/browser fixture, handoff/STATUS                                                                                                                   |

Các path trong bảng tính từ worktree. Implementation phải grep lại callers, DTO consumers, fixtures, exports và config; không chỉ sửa frontend visibility. Không refactor toàn bộ service AI vì kích thước file.

## 3. P1-A: thay gate pilot bằng quyền hiện hành

### 3.1. Quy tắc backend

Một request SIWC cần đồng thời: feature AI bật; session/user/membership INTERNAL còn hiệu lực; Project thuộc organization hiện hành và chưa xóa; `ai.invoke` có scope đúng Project từ assignment hợp lệ; ChatProjectGrant INVOKE đang hiệu lực; conversation/answer thuộc organization/Project/actor; `ChatGptConnectionService.owner()` chấp nhận owner binding, SIWC scopes, connection generation và model trong catalog.

Giữ nguyên `ProjectAiService.authorized()` và owner resolver. Loại bỏ predicate allowlist Project khỏi catalog, ask, view và run của branch CHATGPT_PLAN_ONLY; không đổi thành `return true` cho toàn bộ authorization. Phạm vi owner vừa phê duyệt cho phép gửi context của các Project mà chính actor có quyền nguồn tới connection SIWC hiện hành. Không mở egress cho provider paused hoặc actor khác.

`GALAXY_CHATGPT_PILOT_PROJECT_IDS` không còn quyết định khả năng gọi branch này. Không sửa env đang chạy để nhét thêm chín ID, không thêm allowlist khác và không sửa credential/config lifecycle. Key cũ có thể còn trong env rollback nhưng branch P1 không đọc nó. Các kiểm tra egress/source của đường provider khác giữ nguyên.

Catalog trả đúng các model mà owner resolver cung cấp, available sau authorization hợp lệ. Không tuyên bố vision/context/web capability khi chưa có bằng chứng. Thiếu plan entitlement không được biến thành catalog có thể gọi dù có INVOKE; không tự cấp quyền cho staff.

Project PLANNING/Tiềm năng và các stage khác dùng cùng luật quyền; không thêm status whitelist. Conversation tạo qua API hiện có, gắn Project đã resolve trên server; không tạo Project/room giả. Project không có quyền không được tạo conversation hoặc có network inference.

### 3.2. Context và request

Mỗi run lấy tên/ID Project và identity từ DB/server, cùng organizationId, actorId, conversationId, invokeGrantId và policyVersion `project-ai-p1-v1`. Developer context gửi model chỉ gồm tên/ID Project, actorId/displayName cần thiết, conversationId và các read capability đã xác minh; không gửi cookie, email, token, nguyên IAM assignment hoặc dữ liệu nguồn chưa được phép.

Prompt cho phép trả lời tổng quát; hướng dẫn dùng tool khi câu hỏi phụ thuộc dữ liệu hiện hành của Project và nói chưa tìm thấy khi nguồn không có thông tin. Tool/web/document text luôn là dữ liệu không đáng tin, không phải system instructions. Không ép độ dài cố định, không lộ hidden reasoning. P1-A giữ tool `task_list` thực hiện thật như hiện tại; mở memory/history read tools thuộc P1-B.

Pin model slug, connection generation, conversation, Project và actor ngay lúc ask. Run, tool result và publish recheck cùng scope; không đổi model âm thầm. Pin/usage mới có version riêng cho policy/context và memory dependencies; parser tiếp tục đọc metadata version 1 đã lưu, không sửa lịch sử hoặc coi thiếu trường mới là có quyền. Run cũ chưa hoàn thành phải recheck bằng policy mới. Giữ wire contract đã hoạt động: stateless input, stream, store false, chỉ các tham số SIWC cho phép và `response.completed` làm terminal thành công. Lỗi/cancel/revoke không được lưu text một phần thành COMPLETED.

### 3.3. Nghiệm thu và phát hành riêng

Unit/integration phải tái hiện ngoài Showroom bị pilot từ chối trước fix và được phép sau fix; Project C/tenant khác/actor không có INVOKE hoặc không có plan entitlement vẫn bị chặn. Dùng grant đúng scope, có case assignment không được ghép permission và scope từ hai binding.

Live dùng owner đã kết nối tại Showroom và Biệt thự Ecopark, hoặc hai Project thật có quyền khác nếu ACL hiện hành thay đổi. Chọn cùng model thật được cấp, ghi requested/returned model và `response.completed` ở cả hai; chuyển Project không reconnect. Chỉ thêm các câu hỏi/lịch sử AI cần cho bài thử, không sửa Task/hợp đồng/thanh toán. Không tự thu hồi owner grant thật để tạo demo denied; case denied đầy đủ chạy trên DB fixture cô lập, báo riêng với main. Nếu main có Project thật mà owner không có quyền thì thêm bài main negative; hiện discovery chưa có Project như vậy.

P1-A đủ release gate khi targeted/full regression, build/static checks, fixture backend negative và browser đúng artifact đạt, rồi main acceptance xác nhận hai Project. Không dùng mock inference làm live evidence. P1-A không phải đợi memory schema, tokenizer profile, web hoặc upload của các checkpoint sau.

## 4. P1-B: data model trong domain ProjectChat

`organizationId` là tenant scope, không tạo tenant model song song. UUID do server cấp; clientKey là idempotency key, không phải quyền truy cập. Nội dung nằm ở immutable revision, không có bản text thứ hai trong head record.

### 4.1. Các thực thể

| Thực thể                     | Trường và ràng buộc bắt buộc                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatAiMemory                 | `id`, `organizationId`, `projectId`, `ownerId` (người tạo, bắt buộc), `visibility` PRIVATE/SHARED, `kind` NOTE/CONVERSATION_SUMMARY, `conversationId` nullable, `clientKey`, `payloadHash`, `currentVersion` int dương, `inactiveAt` nullable, `createdAt`, `updatedAt`. Visibility bất biến; summary luôn PRIVATE, conversation bắt buộc và cùng owner. NOTE là namespace của actor trong Project, dùng được qua nhiều conversation                                                                      |
| ChatAiMemoryRevision         | `id`, `memoryId`, `organizationId`, `projectId`, `version`, `previousVersion` nullable, `content`, `category` NOTE/REQUIREMENT/TECHNICAL/DECISION/ISSUE/SUMMARY, `verification` UNVERIFIED/USER_CONFIRMED/SOURCE_CONFIRMED, `editorId`, `clientKey`, `payloadHash`, `createdAt`. Summary có `coveredAnswerIds`, `inputDigest`, `model`, `policyVersion`, `tokenizerVersion`/budget evidence và `summaryStatus` READY/STALE. Metadata summary nullable đối với NOTE. Không update nội dung revision đã lưu |
| ChatAiMemoryDependency       | `revisionId`, `organizationId`, `projectId`, `sourceKind`, `sourceId`, `sourceVersion`, `locator`, `sourceOwnerId`/`sourceConversationId` khi private, quyền hành động cần kiểm. Mỗi dòng là tham chiếu nguồn được server xác minh; không chứa credential hoặc bản sao toàn nguồn. Nguồn AI_ANSWER, CHAT_MESSAGE, FILE_INDEX, TASK, PROJECT_RECORD hoặc MEMORY_REVISION                                                                                                                                   |
| ChatAiAnswerMemoryDependency | `answerId`, `memoryRevisionId`, `organizationId`, `projectId`; unique cặp answer/revision; liên kết những memory/summary/history thực sự đã gửi model để view/citation recheck                                                                                                                                                                                                                                                                                                                            |

Các ID là UUID; sourceVersion là string có giới hạn 200 ký tự; locator là JSON được validate theo source kind (page/sheet/range/line/turn/record); thời gian là DateTime UTC, digest SHA256 là hex 64 ký tự. Revision content tối đa 8.000 ký tự; summary cũng phải đáp ứng token/byte budget, không ghi nguyên history vào trường content. coveredAnswerIds và dependency tạo theo từng batch có budget, không quét/gom mọi conversation trong RAM.

Memory và revision dùng composite unique với organization/project để mọi relation scoped có composite FK. FK Project dùng `[organizationId, projectId]`; creator/editor dùng OrganizationMembership `[organizationId, userId]`; summary conversation dùng `[conversationId, organizationId, projectId, ownerId]`. Revision version unique `[memoryId, version]`, clientKey unique trong memory. Memory create unique `[organizationId, projectId, ownerId, clientKey]`.

Source dependency có composite FK tới revision và các nguồn AI answer/index/message/memory revision khi schema hiện hữu hỗ trợ, qua typed FK nullable đúng một loại; sourceId là ID tương ứng để lookup. Unique dependency là `[revisionId, sourceKind, sourceId, sourceVersion, locatorHash]`, locatorHash do server tạo. Nguồn polymorphic Task/record vẫn phải resolver server đối chiếu tenant/Project/version trước insert và mỗi read; không dùng JSON từ client làm ACL. Dependency chỉ trỏ tới nguồn/revision đã tồn tại, chặn tự tham chiếu/cycle; ACL traversal có visited set và giới hạn tài nguyên, vượt giới hạn trả denied/error chứ không bỏ kiểm tra nguồn. Migration có CHECK visibility/kind/version, summary scope và số trường nguồn hợp lệ; việc xác nhận trạng thái nghiệp vụ nằm ở domain service, không CHECK dựa vào text. Index chính là `[organizationId, projectId, visibility, ownerId, inactiveAt, updatedAt]`, revision `[memoryId, version]`, dependency `[organizationId, projectId, sourceKind, sourceId]`.

Không vector/embedding/cache toàn cục trong P1. Lexical query ở PostgreSQL lọc scope trước khi chấm điểm, phân trang và giới hạn kết quả. Nếu sau này thêm embedding, vẫn phải giữ namespace/dependency này; việc đó không nằm trong P1.

### 4.2. Provenance và xác nhận

NOTE người dùng nhập có provenance USER_INPUT với editor/thời điểm/revision; note lấy từ nguồn phải lưu source ID, version và locator thật. Một AI answer không phải nguồn xác nhận độc lập của chính suy luận đó. Citation từ answer được mở tới dependency nguồn gốc, giữ lineage, không chỉ lưu câu trả lời AI.

UNVERIFIED là mặc định cho thông tin do AI đề xuất, summary và điều chưa đối chiếu. USER_CONFIRMED là người dùng xác nhận ghi chú, không có nghĩa quyết định/hợp đồng đã được duyệt. Nhãn UI phải ghi rõ sự khác biệt. SOURCE_CONFIRMED chỉ khi resolver xác minh nguồn nghiệp vụ đã xác nhận và actor được quyền nguồn/hành động tương ứng. Với category DECISION, việc hiển thị “quyết định đã duyệt” bắt buộc có nguồn/domain status thực; memory không tạo approval nghiệp vụ. Không nhận `confirmedBy` hoặc trạng thái nguồn tự khai từ client/model.

Update tạo revision N+1, compare-and-set `expectedVersion`, cập nhật head và audit cùng transaction. Hai tab sửa N: chỉ một transaction thành công, còn lại 409 MEMORY_VERSION_CONFLICT, không ghi đè. Delete làm inactive, audit và chặn retrieval ngay; không xóa nguồn nghiệp vụ hoặc revision audit. Phạm vi “xóa” P1 là vô hiệu hóa memory khỏi UI/AI, hiển thị rõ chính sách này. Privacy purge vật lý cần chính sách retention riêng, không tự xóa audit hiện hành.

Memory cũ không tự được dùng sau thay nguồn. Dependency sai version/revoked khiến revision STALE; thiếu quyền đọc của actor thì không trả nội dung cho actor đó, không đánh dấu shared note bị hỏng cho mọi người. summaryStatus là trạng thái xử lý derived, không sửa content/provenance bất biến. Head còn nhưng UI chỉ báo nguồn đã thay đổi/không còn truy cập cho actor còn quyền quản lý note, không tiết lộ nội dung nguồn bị thu hồi. Người có quyền sửa/tạo revision mới để đối chiếu lại; không sửa revision cũ hoặc tự nâng trạng thái xác nhận.

## 5. IAM/ACL và private/shared

Quyền Galaxy đọc/ghi memory tách với plan entitlement. Endpoint quản lý memory không gọi OpenAI và không yêu cầu owner credential; vẫn yêu cầu session INTERNAL, quyền Project và INVOKE hiện hành. Dùng memory trong inference còn cần owner/plan fence không thay đổi. Nhân viên có Galaxy INVOKE nhưng chưa có plan entitlement có thể quản lý memory theo quyền mà không được gọi owner credential.

| Hành động               | Kiểm tra bắt buộc trên server                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Xem/search private NOTE | active actor + Project `ai.invoke`/INVOKE, `ownerId=actor.userId`, đúng organization/Project, memory active, mọi dependency còn quyền và version hợp lệ                                                                                  |
| Tạo/sửa private         | như trên; chỉ owner; expectedVersion/clientKey/payloadHash; sửa kiểm quyền nguồn trước và trong transaction                                                                                                                              |
| Xem shared              | active actor + Project `ai.invoke`/INVOKE và `project.read` đúng binding/scope; mọi dependency đọc được; không cấp READ room/download/tài chính chỉ vì note SHARED                                                                       |
| Tạo/sửa/công bố shared  | như đọc shared + scoped `chat.publish` và ChatProjectGrant PUBLISH hiện hành; mọi nguồn đủ quyền cho hành động tương ứng; ghi editor/audit; không lấy roleName “owner/manager” làm bypass                                                |
| Inactive note           | cùng organization/Project, active INVOKE; PRIVATE chỉ owner, SHARED thêm scoped `project.read`/`chat.publish` và PUBLISH. Không yêu cầu đọc lại content của nguồn đã revoke để vô hiệu hóa; thao tác chỉ nhận ID/version, không trả text |
| Summary/history riêng   | cùng owner+conversation+Project; INVOKE hiện hành; quyền của tất cả nguồn/turn thuộc phần summary đang dùng; không xem summary actor khác                                                                                                |
| Xác nhận nghiệp vụ      | gọi/check domain policy của nguồn đã xác nhận; PUBLISH chỉ cho công bố note, không cấp quyền duyệt tiền/hợp đồng/thiết kế                                                                                                                |

Không tự cấp ChatProjectGrant PUBLISH hoặc permission mới. Thiếu PUBLISH: UI shared chỉ đọc nếu đủ quyền, báo rõ không được công bố. Không dùng room mẫu làm điều kiện memory Project.

SHARED là khả năng chia sẻ trong Project với điều kiện ACL nguồn; không đồng nghĩa mọi thành viên xem được mọi note. Note từ room riêng/file/tài chính hạn chế vẫn chỉ trả cho giao quyền của note và nguồn. Query lọc các record không đọc được trước trả total/count/snippet/ranking; không báo tên hay citation của nguồn trái quyền.

Tạo shared note là thao tác người dùng rõ ràng: nhập/chọn nội dung, xem trước phạm vi và bấm “Công bố”. Private record không đổi visibility. Có thể tạo shared NOTE mới từ phần private USER_INPUT do chính actor lựa chọn/xác nhận, provenance ghi người công bố và revision gốc trong audit nội bộ; không trả nội dung/private ID cho người khác. Đây là công bố nội dung đã chọn, không phải công bố cả hội thoại. Với thông tin dẫn từ file/chat/record, phải giữ dependency gốc và ACL; không xóa dependency để biến private thành public. Derived CONVERSATION_SUMMARY không được công bố hoặc dùng làm shortcut chia sẻ trong P1.

AI chỉ đề xuất note riêng; người dùng bấm “Lưu riêng” để tạo hoặc sửa. Không mở memory write function tool trong P1. Tự động summary trong conversation được bật khi cần compaction, chỉ riêng actor/conversation, là dữ liệu hỗ trợ UNVERIFIED, không phải shared note hoặc quyết định. Như vậy memory tự động hỗ trợ history, còn lưu fact lâu dài và chia sẻ có thao tác kiểm soát rõ ràng.

Audit dùng AuditService hiện hữu, cùng transaction, chỉ action/entity/version/hash/scope và actor, không ghi content trong beforeData/afterData/metadata. Các event mới entityType ChatAiMemory không xuất ở feed audit organization/system chung; lịch sử revision/audit của memory đi qua endpoint memory đã kiểm quyền. Không phát notification chứa note riêng.

## 6. API và read-tool contracts

Prefix thực: `/api/v1/project-chat/projects/:projectId/ai`. `projectId` từ path được resolve server; organization/actor/session từ CurrentActor đã recheck. Body/tool không nhận organizationId/actorId hoặc Project khác. UUID, enums, độ dài, limit, cursor và expectedVersion được DTO/Zod strict validate; unknown fields bị từ chối.

### 6.1. Memory API

| Method/path                       | Input                                                                                                                                                                                                            | Output/hành vi                                                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/memory`                     | visibility PRIVATE/SHARED, query tối đa 200 ký tự optional, cursor optional, limit 1–50 mặc định 20                                                                                                              | chỉ NOTE được phép; summary nằm ở conversation history; items/id/revision/content/category/verification/provenance/timestamps/canEdit và nextCursor, không total trái ACL                                       |
| POST `/memory`                    | clientKey UUID, visibility, content 1–8.000 ký tự, category trừ SUMMARY, verification UNVERIFIED hoặc USER_CONFIRMED; sourceRefs tối đa 20 optional; publishFrom `{ memoryId, version }` optional chỉ với SHARED | PRIVATE tạo ngay theo owner; SHARED là công bố explicit sau UI preview và PUBLISH check. SOURCE_CONFIRMED do server resolver quyết định, không nhận tự khai. Idempotent same key/hash trả bản cũ, hash khác 409 |
| GET `/memory/:memoryId`           | version optional (int dương)                                                                                                                                                                                     | head/revision được phép + locators/capabilities nguồn, không render nguồn trái quyền                                                                                                                            |
| GET `/memory/:memoryId/revisions` | cursor, limit 1–50                                                                                                                                                                                               | revision/audit metadata đã kiểm quyền; content của revision chỉ khi mọi nguồn revision còn được phép                                                                                                            |
| PATCH `/memory/:memoryId`         | clientKey, expectedVersion, content/category/verification/sourceRefs như create                                                                                                                                  | tạo revision mới atomic, không đổi visibility/owner/Project                                                                                                                                                     |
| DELETE `/memory/:memoryId`        | clientKey, expectedVersion                                                                                                                                                                                       | inactive idempotent, hủy sử dụng trong retrieval/history/output còn chưa publish; không hard-delete audit                                                                                                       |

`sourceRefs` là loại + id/version/locator, không content/permission. Backend resolver xác minh mỗi nguồn, không chấp nhận source từ Project khác dù cùng tenant. Provenance USER_INPUT được server tạo. Khi lấy note từ một answer, server resolve answer và nguồn gốc, kiểm actor/Project và lineage. `publishFrom` bắt buộc là PRIVATE NOTE của chính actor, cùng Project và currentVersion khớp; source-derived note tự kế thừa dependency gốc, client không được bỏ. Note USER_INPUT không có nguồn hạn chế có thể công bố nội dung người dùng đã chọn; origin private chỉ giữ trong audit nội bộ. Không nhận summary hoặc private note actor khác làm origin.

Lỗi công khai: 400 invalid input; 401 session invalid; 404 không có Project/memory trong scope hoặc source ID trái quyền để tránh oracle; 403 cho hành động công bố bị cấm trên target người dùng đã được phép xem; 409 version/idempotency/source stale; 429 admission/rate limit hiện hành. Không trả body của note/file/task trong lỗi.

### 6.2. Tools cho SIWC ở P1-B

Thêm vào registry/namespace `galaxy` hiện hữu, strict input/output, dispatcher chạy service thực. Không truyền owner token vào tool. Chỉ actor/Project/conversation từ execution scope, không tin argument do model khai.

| Tool                          | Input                                                        | Output giới hạn                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_project_memory`       | query 1–200 ký tự, visibility PRIVATE/SHARED/ALL, limit 1–10 | id, revision, category, verification, excerpt, handles/locators thật; tối đa 16KB mỗi result batch, chỉ nguồn được phép                                 |
| `read_project_memory`         | memoryId, version int dương                                  | note revision hiện được phép; tối đa 8.000 ký tự content; handle citation và provenance, stale trả mã trạng thái không content                          |
| `search_conversation_history` | query 1–200 ký tự, limit 1–10                                | question/answer excerpts từ cùng conversation, completed và đã kiểm source/grant lineage; handle answer/turn, không tìm conversation actor/Project khác |

Memory NOTE private của actor có thể dùng qua các conversation cùng Project; summary chỉ của conversation hiện hành. History tool không mở toàn bộ cuộc trò chuyện riêng của mọi người. Câu “memory của Project B” trong Project A không đổi execution Project, không trả B. Read tasks tiếp tục `task_list` và ACL hiện hữu; Project Knowledge giữ các source/task services hiện tại. File tools ở SIWC được nối trong P2/P3 theo contract được duyệt, chưa là kết quả nghiệm thu của P1.

Tool output nhận về trước reinjection phải recheck quyền; citations do server cấp, gắn memoryRevision/answer/source version. Không dùng citation text do model tự bịa. Dùng route citation answer hiện hữu với resolver memory/history; actor mất quyền thì link không còn trả nội dung. Không chỉ gửi tool definition để báo tool PASS.

## 7. Scope, stream, cache và worker

Execution scope bất biến gồm `organizationId`, `projectId`, `actorId`, `conversationId`, `answerId`, `invokeGrantId`, connection generation, selected model và policyVersion. Source grant/version được pin khi lấy từng nguồn và kiểm lại tại execution/egress/output. PolicyVersion mô tả phiên bản luật, không thay quyền đang sống; không coi pin quyền lúc ask là quyền vĩnh viễn.

Kiểm tra server tại ask, claim run, trước request OpenAI, trước/sau mỗi tool, khi đọc summary/memory, trước reinjection, trước lưu COMPLETED và khi view/history/citation. Nếu một dependency bị thu hồi/thay version trong lúc đang chạy, không publish nội dung derived đã dùng nguồn đó; chuyển trạng thái denied/stale/cancel theo semantics hiện hữu. Trước mỗi lần lộ nội dung tiếp theo phải kiểm quyền mới; không hứa thu hồi bytes đã được đọc hợp lệ.

Frontend request closure/abort controller gắn Project+conversation+answer. Chuyển A→B không copy messages/memory/sourceIds/context sang B. Hủy UI request A khi component mất scope; provider execution A nếu tiếp tục chỉ được lưu vào answer A và phải recheck quyền. Response về trễ chỉ cập nhật component A có identity khớp; không set state của B. Reload/two tabs mỗi tab lấy active Project và conversation từ server, không dùng singleton global memory/chat context. Server không dựa activeProjectId localStorage để authorization.

Không thêm shared retrieval cache trong P1. Cache/UI hiện hữu phải có organization+actor+Project+conversation+policyVersion và source/memory version; mỗi cache hit vẫn recheck ACL, invalidate khi version/revoke/cancel. Không dùng cache authorization lâu dài, không reuse encrypted reasoning/continuation của A cho B.

Summary job chỉ chạy trong pipeline conversation của ProjectChat, dùng lease/token/CAS theo pattern index hiện hữu. Job payload giữ scope/owner/coveredAnswerIds, không đọc “active Project” từ process/global/frontend. Worker recheck session/grant/connection và toàn dependency trước read, trước provider và trước transaction publish; scope mismatch/job trễ thì không ghi. Không giữ DB lock trong network call. Không worker dùng credential hệ thống để tóm tắt conversation của staff chưa có entitlement.

## 8. History assembly theo token budget

### 8.1. Profile và giới hạn

Bỏ `slice(0, 8)` bằng assembler, giữ các câu hỏi/câu trả lời gốc trong Galaxy. Không dựa vào provider conversation persistence. Mỗi selected model có profile chỉ khi context limit/tokenizer/route limit được xác minh từ metadata route hoặc tài liệu chính thức cho đúng slug và probe tương ứng; profile ghi evidence URL/metadata version, thời điểm, tokenizer version. Không mượn context window của model tên gần giống. Không thay model khi profile thiếu.

Codebase chưa có tokenizer cho model. Chỉ thêm thư viện tokenizer đã kiểm chứng cho encoding của selected model nếu standard library/dependency hiện hữu không đáp ứng; không tự viết tokenizer hoặc thêm framework AI. Token count đo toàn instructions/developer context, tool schemas, input/history, memory, summary và tool outputs. Kiểm soát riêng byte/item limits của codec; token vừa đủ không có nghĩa wire hợp lệ.

Với profile đã xác minh: budget input là context capacity trừ dự phòng reasoning/output và overhead theo giới hạn/evidence của route; mặc định dự phòng 25% context, không dưới 4.096 tokens, tăng nếu documented output limit yêu cầu. Đây là khoảng dự phòng của assembler, không gửi `max_output_tokens` hay tham số SIWC không hỗ trợ. Budget còn phải đáp ứng byte/item ceiling đã được kiểm qua wire codec. Không hạ output stream/text ceiling để làm history dài hơn.

Profile chưa biết: không ghi `contextLimit` giả hoặc gọi cách đếm ký tự/4 là token thực. Chat P1-A vẫn hoạt động với envelope bảo thủ đã kiểm chứng hiện hành; P1-B chỉ dùng phần input mà token/wire budget đã chứng minh được, hiển thị budget status UNVERIFIED và thông báo nếu không thể đưa phần lịch sử cần thiết vào. Không âm thầm dùng tám lượt làm fallback hoặc báo advanced history của model đó PASS. Implementation phải thu được profile/budget evidence cho model dùng trong nghiệm thu P1-B; capability model khác ghi riêng, không chặn phát hành P1-A.

### 8.2. Thuật toán

1. Recheck scope và pin danh sách completed answers/revisions được phép ở cùng conversation. Không đưa failed/cancelled/queued turn vào history. Question hiện hành và developer context là phần bắt buộc; vượt budget riêng phần bắt buộc trả lỗi INPUT_BUDGET_EXCEEDED có thể xử lý, không cắt câu hỏi giữa chừng.
2. Đếm token toàn request. Giữ các turn gần nhất theo cặp question/answer, ưu tiên từ mới về cũ, chỉ nhận cặp đầy đủ. Có chỗ thì giữ hơn tám lượt; không đặt số lượt cố định làm giới hạn lịch sử. Token/item/byte guard đều áp dụng.
3. Phần cũ cần compaction tạo summary PRIVATE của đúng conversation: facts, yêu cầu, quyết định có nguồn, thông số/đơn vị, việc còn mở, các câu hỏi liên quan và coveredAnswerIds. Không summary hidden reasoning. Giữ locator/version và phân biệt người nói/AI suy luận. Summary bị thiếu hoặc lỗi không được bịa; trả trạng thái lịch sử chưa xử lý và giữ originals để retrieval.
4. Summary inference dùng chính selected model/connection nếu được phép, request riêng stateless có budget, có `response.completed`, không đổi model rẻ hơn. Các batch theo budget không overlap mất kiểm soát; coveredAnswerIds/inputDigest và toàn dependency gốc của input do server persist với lease/CAS. Không dùng source ID hoặc “đã xác nhận” do model tự khai làm provenance; handle không có trong tập input được phép bị từ chối. Nếu nguồn đổi/revoke lúc job chạy, không publish summary.
5. Khi summary cũ còn hợp lệ, đưa vào như dữ liệu có provenance. Nếu đã STALE hoặc mất quyền nguồn, loại toàn summary và chỉ tái tạo từ turn còn được phép; không cho model tự lọc bí mật. Ghi quyết định/thông số xác nhận vào summary không tự tạo shared memory.
6. Retrieval lấy private/shared NOTE đúng actor/Project và đoạn lịch sử liên quan tới câu hỏi, ưu tiên nguồn/version đã xác nhận, cấp handles. Nội dung trùng lượt gần nhất/summary không được thêm hai lần. Giới hạn theo phần budget còn lại, giữ provenance ngoài phần excerpt; source truncate có cờ, không claim đọc toàn bộ.
7. Trước mỗi tool round, tính lại budget với function call/output và continuation. Giữ liên kết call_id và output, không tạo input orphan. Tool result quá lớn trả snippet/paging có cờ thay vì lặng lẽ cắt JSON; vượt input bắt buộc báo lỗi rõ. Không retry vô hạn hoặc bỏ tool lỗi rồi trả fake result.
8. Persist receipt an toàn: selected/returned model, budget/profile status, input tokens/byte count/item count, history IDs/count, summary/revision IDs, tool executions/latency/error và terminal. Không log nội dung nhạy cảm hoặc hidden reasoning. View/citation recheck tất cả dependency đã sử dụng.

Summary lưu lâu dài là dữ liệu derived có thể dựng lại, không thay hội thoại gốc. Memory NOTE USER_INPUT không bị compaction xóa. Lượt cũ ngoài budget vẫn tra cứu được qua tool khi có quyền; không hứa model luôn nhận toàn bộ lịch sử hoặc nhớ mọi câu trong mọi conversation.

## 9. UI và hành vi người dùng

P1-A dùng model picker/chat hiện hữu, catalog khả dụng ở từng Project có quyền. Khi bị từ chối, UI hiển thị lý do quyền/plan/provider tương ứng, không đề nghị reconnect chỉ vì chuyển Project. Model chọn lưu theo scope hiện hữu, request phải pin lựa chọn thật. Không thay màn hình kết nối ChatGPT.

P1-B thêm panel “Bộ nhớ dự án” ngay trong AI: hai tab “Riêng của tôi”/“Dùng chung”, list/search, xem nội dung/nguồn/phiên bản/tình trạng xác minh; tạo/sửa/vô hiệu hóa với kết quả server thật. PRIVATE mặc định; “Công bố dùng chung” có preview và chỉ hiện khi backend capabilities cho phép. Summary có nhãn ngữ cảnh riêng của conversation, không xuất trong tab dùng chung.

Trong câu trả lời, nguồn memory/history có handle/link tới revision/turn đã dùng. Không trả tài liệu khác Project để tạo preview. Nguồn stale/private denied chỉ báo trạng thái phù hợp, không render excerpt cũ. Memory delete/inactive cập nhật retrieval/context tiếp theo và báo rõ lịch sử audit vẫn giữ; lỗi giữ draft, CAS conflict cho reload revision rồi sửa lại.

Chuyển Project/reload/two tabs phải giữ đúng selected conversation, nguồn, history và drafts trong phạm vi riêng; không ghi response A vào B. Test desktop/mobile/keyboard các control mới, nhãn visibility rõ, không tràn màn hình hoặc bắt người dùng chọn room để chat. Không hiển thị chi tiết tokenizer/policy kỹ thuật trong flow thường; chỉ báo thiếu ngữ cảnh khi ảnh hưởng câu trả lời, diagnostics thuộc màn hình/trace phù hợp.

## 10. Migration, release và rollback

P1-A không migration, giữ schema 86 và storage/lifecycle hiện tại. Snapshot candidate đúng dirty source được review, không copy root checkout hoặc sửa bundle main tại chỗ. Build/typecheck/lint/format/full regression xong mới gate browser/candidate. `prepare-local-release.py` hiện hữu chuẩn bị artifact; ghi CODE_SHA, tested-source tree/digest và manifest chứa thay đổi chưa commit. TESTED_TREE mới chỉ gắn snapshot đã thực sự chạy checks.

P1-B tạo migration additive qua `prisma:migrate --create-only` trên DB fixture/development cô lập đã được kiểm identity; dừng nếu CLI yêu cầu reset. Review SQL CHECK/FK/index và lock impact; không sửa migration đã áp dụng hoặc dùng db push. `prisma:validate`, generate, migration apply/reapply/status và integration trên fixture. Main chỉ dùng `prisma:deploy` sau backup và review; không chạy migrate dev trên main.

Trước apply/cutover: backup main DB và manifest schema/credentials/storage mapping hiện hữu; kiểm checksum/khả năng restore trên DB cô lập; không xuất secret trong báo cáo. P1-B không yêu cầu copy binary toàn bộ storage do không đổi file contract. Đo thời gian/lock apply trên fixture gần schema thực, kiểm API cũ vẫn chạy với schema additive và API mới không khởi chạy nếu migration chưa đủ.

P1-A release không chứa migration/feature P1-B chưa nghiệm thu. P1-B release compatibility manifest cập nhật số migration/digest sau review. Control plane/schema probe phải khớp artifact; không nới validator cho qua. Trước/sau main acceptance đối chiếu hash/count của dữ liệu nghiệp vụ liên quan, credential generation/connection status và schema/storage contract; không ghi credential ra log.

Gate mỗi checkpoint: TDD targeted, PostgreSQL integration/security, full regression + lint/typecheck/build/format, Ponytail/correctness/security/authorization/UX review, browser đúng candidate artifact và release backup/rollback. Cutover chỉ sau gate an toàn; live inference trên candidate dùng route/account thật được phép, main smoke sau cutover xác minh đúng artifact. Nếu không có cách nghiệm thu live trước release an toàn, checkpoint giữ candidate và ghi BLOCKED, không phát hành chỉ để có PASS. Không tạo nhiều candidate trùng khi chưa giải quyết gate.

CDP33005 chưa nối được ở discovery; không đổi topology/OAuth/remote debugging. Dùng Playwright dự án với port/baseURL cô lập không đụng main 3000/3001, hoặc flow manual trên runtime được phép. Fixture browser không thay main owner live. Nếu browser bắt buộc chưa có bằng chứng, vẫn triển khai code và unit/integration hợp lệ sau approvals, nhưng browser live ghi BLOCKED và không tuyên bố release đạt.

Rollback P1-A trả artifact `local-bf73047fa0ee`, cùng schema/env/credential, bảo toàn conversation đã ghi. Rollback P1-B trả artifact P1-A cuối đã nghiệm thu, giữ nguyên tables/revisions/additive migration và mọi note đã lưu; không drop tables/reset hoặc restore backup đè dữ liệu mới. Bản cũ không đọc memory nhưng không làm mất memory. Backup restore là phương án phục hồi có kiểm soát riêng nếu dữ liệu thật bị hỏng, không là rollback app mặc định. Kill switch feature AI hiện hữu có thể dừng AI khi cần, không tắt IAM hoặc provider policy.

## 11. Test cases và evidence nghiệm thu

Fixture dùng tenant T1/T2, actors owner/member/revoked/không plan, Project A/B/C và dữ liệu sentinel X chỉ A, Y chỉ B. Dữ liệu nghiệp vụ thử chỉ tạo trong DB fixture đã guard. Main không tạo Project giả, cấp grant mới hoặc sửa Task để demo. Memory/chat main nếu thử sẽ tạo private sentinel không chứa thông tin thật bí mật, đặt tên rõ test và inactive sau khi nghiệm thu bằng API; không xóa lịch sử audit.

| Nhóm                    | Bài thử bắt buộc                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-A bug + backend      | trước fix ngoài pilot catalog/ask/run bị chặn; sau fix A/B được phép, PLANNING không bị khóa, không room vẫn chat; C/tenant khác/no INVOKE/no plan đúng lỗi và 0 provider call; catalog slug/request không đổi; revoke giữa ask/run và trước publish                                                                         |
| Memory data/API         | private create/update/inactive/idempotency; version conflict hai tab; immutable revisions; invalid source/version/tenant/Project/malformed IDs; transaction audit failure rollback; no content in generic audit/log                                                                                                          |
| Memory ACL              | X riêng actor1 không lộ actor2; X tại A trả đúng, Y tại B trả đúng, X tại B không lộ; same actor khác tenant denied; shared cần PUBLISH, nguồn hạn chế không mở cho actor thiếu quyền; USER_CONFIRMED không biến thành approval                                                                                              |
| Retrieval/tool executor | query/count/snippet/cache không lộ denied memory; model tự khai Project khác bị bỏ/denied; tool chạy thật trong fixture backend và reinjection receipt; source/version revoked sau retrieve hoặc trước output không publish; citations pin revision, route rechecks                                                          |
| Summary/worker          | chỉ đúng owner/Project/conversation; covered turn/version/source lineage; lease mất/chạy lặp/stale worker không ghi nhầm; model failure/thiếu completed không lưu READY; revoke nguồn/history/cancel/inactive memory làm derived answer không còn trả nội dung                                                               |
| History/context         | hơn tám lượt có chỗ phải được giữ; thông số X ở lượt cũ tìm đúng sau compaction, source locator thật; mandatory question không bị truncate; model unknown budget ghi UNVERIFIED; token+item+byte guards; tool round không orphan; không replay continuation A ở B                                                            |
| Browser fixture         | chọn model A/B, chuyển nhanh A→B→A, reload, hai tabs, late answer, private/shared panel, CAS conflict, inactive/revoke, mobile và keyboard; request payload/state đúng Project và không POST trùng                                                                                                                           |
| Main + OpenAI live      | owner hai Project thật, exact selected/returned model, `response.completed`, context đúng Project, task_list có actual execution; private X/Y theo Project và hỏi lại qua conversation mới; long-history/summary và memory tools actual execution tới completed; shared/negative actor cần phiên/quyền thật để báo MAIN PASS |

Unit dùng mock để kiểm logic, không là inference live. Integration dùng PostgreSQL/actual IAM và service/tool executor, transport stub chỉ khi ghi rõ. Fixture browser chỉ chứng minh flow. Main browser/AI live có request IDs, terminal, model, source handles và latency redacted. Không mở quyền staff dùng plan chỉ để nghiệm thu shared; shared API có thể thử bằng phiên actor hợp lệ không cần gọi OpenAI. Nếu thiếu phiên actor thật thì báo phần main đó NOT_RUN/BLOCKED, không gán fixture thành main.

Full checks theo repo: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`; integration/browser dùng guard/config fixture hiện hữu, verify `prisma:validate`/generate/deploy status khi có migration. PDF tools private của baseline được cấu hình đúng cho full checks; không sửa parser hoặc tăng timeout để che lỗi môi trường. Mỗi invocation ghi exit code, số test, tree/digest; không dùng số test để thay nghiệm thu hành vi.

P1-A hoàn thành khi hai Project thật chat/model/completed đúng và fixture denied/ACL+browser gates đạt trên artifact đã phát hành. P1-B hoàn thành khi note private/shared management, retrieval/history/summary dùng dữ liệu thật đúng scope, tests security cách ly và main evidence cho các chức năng tương ứng đạt. Phần live chưa có không được báo PASS. Không gọi toàn P1–P3 hoàn thành từ việc sửa pilot hoặc prompt.

## 12. Self-review và gate tiếp theo

Self-review bản 1: không placeholder, không triển khai P2/P3 trong P1; P1-A độc lập schema/budget mới; không bypass `authorized`/plan fence; private summary không publish; SHARED không mở nguồn hẹp; token profile chưa biết không gán số giả; audit không chứa memory text; revision/CAS/lease và source revoke có tests; rollback giữ dữ liệu mới. Đây là review spec, không là code review hoặc nghiệm thu chức năng.

Các giới hạn cần thể hiện trong implementation evidence: context/tokenizer capability của bảy model chưa xác minh toàn bộ; owner hiện có quyền ở cả chín Project nên main negative chưa có target; staff plan entitlement không thay; CDP chưa có kết nối. Chúng có gate cụ thể trong mục 3/8/10/11, không là việc chưa quyết định thiết kế và không chặn việc viết plan P1-A sau spec approval.

Gate hiện tại: owner review chính file revision 1 này. Sau approval mới gọi writing-plans để viết plan P1, tách execution/release P1-A trước P1-B; trình written plan và phương thức thực thi theo Superpowers. Chưa có approval written plan hoặc quyền commit. Không yêu cầu owner duyệt lại thiết kế khái niệm P1–P3.

Nguồn quy trình: [AGENTS.md](../../../AGENTS.md) và [Superpowers brainstorming](/home/hailq_glx/.codex/plugins/cache/openai-curated-remote/superpowers/6.4.2/skills/brainstorming/SKILL.md): “Architectural: the human partner reviews and approves the written spec, then reviews the written implementation plan and selects its execution method.” Đây là gate tài liệu, không là bằng chứng code đã được phép bỏ checks.

Nguồn hợp đồng SIWC đã đọc trong discovery: [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) và [models/inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference). Khi triển khai phải đối chiếu lại contract thực cho capability được dùng; không sửa connection lifecycle để có memory/history.

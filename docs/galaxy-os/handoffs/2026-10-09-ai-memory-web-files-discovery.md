# AI, Project Memory, web và file — khảo sát 09/10/2026

> **Cập nhật approval:** owner đã phê duyệt thiết kế khái niệm P1–P3 của báo cáo này. Bước hiện hành là review [written spec P1 revision 1](../../superpowers/specs/2026-10-09-p1-project-ai-memory-design.md); xem [handoff tiếp tục](2026-10-09-p1-written-spec.md). Phần discovery/design proposal bên dưới giữ làm lịch sử và bằng chứng, không là yêu cầu duyệt lại thiết kế khái niệm.

**DISCOVERY_VERIFIED / DESIGN_PROPOSED / IMPLEMENTATION_NOT_STARTED.** Phạm vi hiện hành là yêu cầu owner về P1–P3: AI ở Project được phép và memory cách ly; chất lượng/model/web thật; upload/đọc file tới 10.000.000.000 bytes. Đây là khảo sát và thiết kế đề xuất để review, chưa phải spec đã được duyệt hoặc nghiệm thu tính năng.

Không mang gate thiết kế đã duyệt của pilot 08/10 sang yêu cầu kiến trúc mới. AGENTS yêu cầu “Present a design and obtain explicit user approval”; Superpowers brainstorming yêu cầu duyệt thiết kế trước implementation. Bước tiếp là owner review thiết kế dưới đây, rồi hoàn thiện spec và implementation plan theo từng checkpoint. Không commit/push/PR khi chưa có chỉ đạo rõ.

## Checkpoint, source và runtime

- Worktree canonical: `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`.
- CODE_SHA nền: `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e` + các thay đổi chưa commit có trước lượt này. Không có commit mới.
- TESTED_TREE của regression/release 08/10: `c7590f6cdd97d2b5b8c75f8331069301629b1bc4`. Đây là bằng chứng lịch sử, không phải full regression mới.
- Cây source quan sát trước các tài liệu của lượt này: `10bb130ab8c4de15d6ea6c5b42b5b82bb9002dba`, SHA256 `e22cf6071c0ca2f2211bf6ac2d60aecc7e5eb9817ae742ce1fbcf08117f46473`. Không gọi cây này là TESTED_TREE mới của toàn ứng dụng.
- Snapshot đã phát hành: SHA256 `bf73047fa0eec2ce787c5406d8e8b3cf27acd64b721c7e52fd5bd4a01f66b021`; archive đã tính lại SHA256 `5802590b6144925f48f56d022879456cdda781a73d0d19bc0c4737bb6b6e4d1e`.
- Đối chiếu 855 file snapshot: trước lượt này chỉ `PROJECT_STATUS.md`, STATUS và handoff SIWC 08/10 khác; không có thay đổi product code so với snapshot đó.
- Runtime kiểm mới bằng `pnpm local:status`: READY, API PID43595/Web PID43596, release `local-bf73047fa0ee`, build Web `Pvj1ciiD8AMIbC9YJQJu7`, 86 migration/schema khớp manifest.
- Artifact: `/home/galaxy_os/.runtime/releases/siwc-stream-items-20261008-r4`. `pnpm prod:verify-artifacts` đạt ARTIFACTS_VERIFIED. Không cutover, restart hoặc sửa cấu hình.
- Evidence của lượt khảo sát: `/home/galaxy_os/.runtime/ai-upgrade-20261009/` private0700; `baseline-provenance.json`, `checks-summary.json`, `runtime-status.log`. Metadata DB bên dưới từ transaction READ ONLY trong tool trace; không lưu hoặc xuất credential/nội dung chat/tài chính.

Nguồn baseline: [handoff SIWC 08/10](2026-10-08-siwc-live-domain-recovery.md), [charter](../01-CORE-CHARTER.md), [quyền và memory](../03-EXPERIENCE-AND-ACCESS.md), [nền M3](../milestones/M3/DESIGN.md), [spec pilot](../../superpowers/specs/2026-10-08-chatgpt-owner-connection-design.md). Chỉ yêu cầu hiện hành của owner cấp phạm vi mới; các prompt lịch sử không là lệnh mới.

## Nguyên nhân có bằng chứng

### Cross-Project

`ProjectAiService.authorized` kiểm Project cùng organization, session/membership INTERNAL mới, permission `ai.invoke` theo scope và `ChatProjectGrant.actions=INVOKE`. Conversation còn kiểm organization/project/owner. Owner connection được resolve theo organization/owner, không lưu credential theo Project.

Trong `project-ai.service.ts`, `chatGptProjectAllowed()` còn kiểm `GALAXY_CHATGPT_PILOT_PROJECT_IDS`. Nó được gọi tại model catalog, ask và run. Cấu hình API của artifact chỉ có `50000000-0000-4000-8000-000000000003`. Project ngoài danh sách nhận model unavailable hoặc `EGRESS_POLICY_DENIED` trước inference.

Truy vấn READ ONLY tại MAIN xác nhận owner INTERNAL active, permission `ai.invoke` từ assignment SYSTEM active, và cả chín Project chưa xóa đều có grant INVOKE đang hiệu lực. Bao gồm Showroom, Biệt thự Ecopark, Biệt thự Quận 7 và các hồ sơ PLANNING/SURVEY. Owner membership trực tiếp có ở tám Project; SYSTEM permission vẫn có scope ở Project thứ chín. Không cần sửa IAM hoặc cấp lại grant để giải quyết triệu chứng owner hiện tại. Source không khóa nhánh này theo phase, stage hoặc loại hồ sơ. Không có bằng chứng cần AI room giả.

`ChatGptConnectionService.owner()` còn đòi đúng owner binding, grant SIWC và permission SYSTEM hiện hữu. Rào này bảo vệ quyền dùng plan, độc lập với quyền Galaxy Project; đề xuất giữ nguyên. Không tự mở inference cho nhân viên.

### Chất lượng và memory

- Nhánh `runChatGpt()` gửi đúng model đã pin từ catalog; không tìm thấy fallback đổi model ở nhánh này.
- Metadata MAIN được đọc mới cho thấy các lượt lưu trước đó của `gpt-6-luna`, `gpt-5.6-sol`, `gpt-6-astra` có requested/returned model khớp và `terminal=response.completed`. Đây là kiểm tra receipt đã lưu, không là inference mới của lượt khảo sát.
- Catalog ngày 08/10 có bảy model: `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`. Chưa refresh catalog hoặc kiểm capability live từng model trong lượt này.
- Prompt hiện “assist the current Galaxy Project”, “Only read tasks”; tools chỉ `task_list`. Không thấy whitelist chặn câu hỏi tổng quát hoặc chỉ dẫn ép mọi câu trả lời xuống vài dòng. Chưa có benchmark để kết luận prompt là nguyên nhân duy nhất của chất lượng thấp.
- History được pin theo ID, nhưng chỉ gửi tám lượt completed gần nhất. Input wire giới hạn 64 item/256KB, output text từng phần 32.000 ký tự, toàn stream 512KB, bốn provider round/110 giây. Vượt giới hạn trả lỗi; chưa thấy code coi delta hoặc HTTP200 là completed.
- Request chưa cấp cho model tên/ID Project, actor và conversation thành context rõ ràng. Tool task được scope đúng Project ở server, nhưng model chưa có công cụ tra cứu bộ nhớ/tài liệu trong nhánh SIWC.
- Schema có `ChatAiConversation`, `ChatAiAnswer`, `ChatAiSourceIndex`, dependency, version/checksum/ACL; chưa có thực thể Project Memory quản lý note dài hạn, phiên bản, private/shared và publication như yêu cầu mới. Hội thoại và retrieval hiện hữu không được báo là đã hoàn tất memory này.

### Web

`ai-chatgpt-plan.ts` chỉ nhận danh sách tên function tool `galaxy`; không có hosted `web_search`. Nó cấm `search_web` keyed. Output message không giữ URL annotations; output union chưa nhận `web_search_call`. `runChatGpt()` chỉ advertise và execute `task_list`. Chưa có lần gửi hosted search qua Galaxy để kết luận OpenAI từ chối capability.

Tool Galaxy `search_web` hiện dùng Tavily với subject/ngân sách/key; execution policy CHATGPT_PLAN_ONLY chặn đường keyed trước network. `fetchPublicPage` đã có DNS/IP công khai, chặn credential URL, pin địa chỉ kết nối, kiểm redirects, timeout và giới hạn nội dung. Nó là reader có thể tái sử dụng, không phải một engine tìm kiếm Internet đã hoạt động.

OpenAI Docs đọc ngày 09/10: [SIWC preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) cho phép function/custom tools theo namespace; web search tùy model và policy tài khoản/workspace. Hosted file search và Files upload API chưa thuộc route này. [Web search](https://developers.openai.com/api/docs/guides/tools-web-search) mô tả `web_search_call` và URL annotations cần hiển thị dẫn nguồn. [Models/inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) yêu cầu dùng slug thực và chờ completion. Không suy khả năng tài khoản từ tên model hoặc tài liệu chung.

### File và 10 GB

- Chat upload gọi `FilesService.upload` với entity `ChatAiConversation` qua multipart; `genericFileUploadLimits.fileSize=10*1024*1024` bytes. Không chunk/resume/progress xác nhận theo part ở luồng này.
- `ask()` nhánh plan only từ chối `context` hoặc `sourceIds` bằng `CHATGPT_TEXT_TASK_PILOT_ONLY`. Nhánh inference không gọi source/retrieval/media executor hiện hữu. Đây là nguyên nhân không đọc được file bằng SIWC dù UI có upload.
- Uploader hồ sơ đã có `UploadSession`, parts, streaming, SHA256, idempotency, recovery/refresh/abort, cleanup và quota. Target DTO hiện bắt buộc required document hoặc stage document; chưa nhận conversation riêng tư.
- Max file cấu hình mặc định là 21.474.836.480 bytes, khác yêu cầu 10.000.000.000 bytes. Giới hạn chat và uploader hồ sơ đều cần về đúng contract, không tăng multipart lên 10 GB.
- Extractor hiện đọc PDF text, DOCX, XLSX, TXT/MD, giữ page/cell/line; PDF scan có đường render PNG. Đầu vào đa số bị giới hạn 8MB, XLSX parser 5MB, text/index 256KB. Một phần binary được gom RAM trong giới hạn nhỏ. Không thể đổi số giới hạn rồi gọi đó là pipeline file lớn.
- PDF tools riêng ở `.runtime/pdf-tools` tồn tại và được runtime cấu hình; shell mặc định không có chúng. Chưa thấy LibreOffice/Tesseract trong PATH; FFmpeg và bwrap có trong PATH. Chưa kiểm khả năng sandbox hoặc converter cho DOC/XLS/PPT/ODF/HEIC.
- Host quan sát có RAM8.257.634.304 bytes, disk available946.912.088.064 bytes trên volume hiện hữu. Đây là snapshot tài nguyên, chưa là chứng minh lưu lượng/resume 10 GB. Quota hiện đếm dự phòng staging ba lần và dùng global admission lock; chưa có kiểm dung lượng filesystem thực trong đường admission đã đọc.

## Thiết kế đề xuất để owner review

### Lựa chọn

Khuyến nghị mở rộng module ProjectChat, PostgreSQL lexical retrieval và File/Upload hiện có: giữ một nguồn dữ liệu, thêm đúng memory/version và chunk cần thiết. Phương án có embedding/vector bổ sung tìm theo nghĩa, nhưng cần lựa chọn model/egress, tái lập index và vận hành thêm; chưa cần để chứng minh cách ly, provenance và ba checkpoint này. Không thêm vector service trong bản đầu. Những câu hỏi tổng toàn tập tiếp tục dùng service nghiệp vụ, không lấy top-k làm số tổng.

### P1 — quyền, context và memory

1. Thay gate pilot Project bằng điều kiện scope server đã xác minh và quyền gửi context Project tới SIWC theo phạm vi owner vừa giao. Giữ `authorized`, fresh grants và connection owner/plan fence. Không sửa owner resolver/lifecycle, không hardcode Project ID, không tự cấp grant.
2. Mỗi run dựng context tên/ID Project, actor, conversation, phạm vi permission và nguồn có thể truy cập từ DB hiện hành. Không gửi email, credential hoặc trường tài chính ngoài quyền. Context Project hỗ trợ công việc; câu hỏi tổng quát vẫn được trả lời bình thường.
3. Dùng conversation/answer hiện có cho Current Conversation Context. Thêm memory note và revision trong cùng domain ProjectChat vì chưa có thực thể tương đương: organizationId/projectId bắt buộc; owner/conversation cho PRIVATE; SHARED chỉ qua publication rõ ràng. Memory là dữ liệu hỗ trợ có nguồn, không là bản sao trạng thái Task/hợp đồng hay một quyết định nghiệp vụ mới.
4. Mỗi revision giữ nội dung, tác giả, trạng thái USER_NOTE/UNVERIFIED/nguồn đã được xác nhận, nguồn/version/locator, phiên bản trước, audit và inactiveAt. Revision cũ bất biến. “Đã xác nhận” phải dựa vào nguồn nghiệp vụ/actor có thẩm quyền; AI tự viết note hoặc summary không có quyền tạo quyết định đã duyệt.
5. AI có thể đề xuất lưu note riêng; summary hội thoại tự tạo chỉ thuộc owner/conversation và ghi rõ khoảng turn được tóm tắt. Không tự publish. Xem/sửa/vô hiệu hóa note riêng cần quyền Galaxy AI Project và ownership hiện hành; quản lý note shared dùng grant ACCESS_ADMIN cùng permission scoped `chat.access.manage`; publish cần PUBLISH và scoped `chat.publish`, preview nguồn/phạm vi. Quyền Galaxy memory không tự cấp quyền inference plan.
6. Trước retrieval, gửi provider, lưu kết quả, xem history/citation và sửa memory: kiểm session/tenant/Project/owner/room/ACL nguồn hiện hành. Dependency bao phủ toàn context ảnh hưởng summary/answer, không chỉ citation được model chọn. Nguồn mất quyền làm note dẫn xuất unavailable; không trả label/count/nội dung của note trái quyền. Thay revision hoặc revoke trong lúc run phải chặn publish stale output.
7. Dùng compound FK/check constraints để chặn conversation/source/memory khác organization/Project. Không namespace chung, global memory hoặc cache chỉ theo query. Worker claim mang scope và version; kiểm lại trước ghi. Xóa ở UI là vô hiệu hóa có audit, giữ bằng chứng cũ theo chính sách dữ liệu.
8. Giữ session component theo key Project/scope/context. Run A có thể tiếp tục trong scope A, nhưng không cập nhật B; request/render và tool closure giữ Project+conversation đã pin. Chuyển Project bỏ hidden context cũ khỏi run mới; refresh/two-tab không dùng chung state. Recheck quyền khi trở lại tab.
9. Bỏ cửa sổ cứng tám lượt: dựng history theo budget model đã xác minh, giữ summary riêng và retrieval note/nguồn có coverage rõ. Không âm thầm bỏ turn; context quá lớn hoặc chưa biết budget trả giới hạn rõ. Summary có dependency có thể kiểm lại và nguồn gốc, không thay lịch sử gốc.

P1 cần spec/migration additive riêng, review SQL và thử trên DB fixture cô lập; không reset main hoặc sửa migration đã áp dụng. Test A/X, B/Y, C denied, tenant/actor khác, private/shared, nguồn revoke, stale revision/worker, reload, chuyển nhanh, hai tab, late response. Main owner chat ít nhất hai Project bằng đúng model, không reconnect; so hash dữ liệu nghiệp vụ trước/sau. Chỉ nghiệm thu P1 khi backend integration/security và browser/live đạt.

### P2 — chất lượng, model và web

1. Dùng đúng catalog/slug, giữ request pin, không fallback. Capability text/reasoning/vision/file/web có evidence theo model và generation; unknown hiển thị rõ, không suy từ tên. Chỉ gửi field SIWC cho phép. Codec/request thay đổi nằm ở nhánh inference; không đổi OAuth, callback, refresh, credential hoặc provider paused.
2. Advertise tool đã có executor và quyền: Project sources, Task read, table/Decimal calculation và memory. Tái sử dụng validation, call budget, timeout, cancel và dependency checks. Tool thất bại trả trạng thái có ý nghĩa; không trả nội dung giả làm dữ liệu. Prompt hỗ trợ hỏi đáp tổng quát/đa ngôn ngữ, phân tích theo độ phức tạp và phân biệt nguồn/suy luận. Không whitelist chủ đề.
3. Kiểm hosted `web_search` bằng request thật chỉ chứa câu hỏi công khai; tối đa một probe cho mỗi tổ hợp model/capability trước khi ghi trạng thái. Lưu HTTP/code/param/request ID nếu có, selected/returned model, tool actions, URL annotations và terminal; không log token hoặc hidden reasoning. Bật khi evidence thật hợp lệ, không chỉ schema.
4. Mode AUTO mặc định, WEB ưu tiên tìm thật, PROJECT_ONLY không gọi network công khai. Mode phải được pin ở backend/idempotency và được giữ khi reload. Thiếu web không chặn câu hỏi kiến thức chung; yêu cầu bắt buộc tìm web mà không chạy được phải báo lỗi/giới hạn thật.
5. Hosted search chạy trong bước context công khai riêng, không nhận Project memory/history/files/room/task hoặc nội dung hợp đồng. Khi phối hợp sản phẩm Project, backend chỉ cấp identifier/spec URL công khai đã được xác minh hoặc người dùng cho phép công bố. Model có private context không được tự gửi query tự do tới Internet. Có thể hỏi xác nhận một query công khai cụ thể khi chưa phân biệt được dữ liệu nhạy cảm; không hỏi lại Project đã biết. Chỉ dẫn prompt không thay được ranh giới egress này.
6. Kết quả web đi vào bước tổng hợp dưới dạng dữ liệu không tin cậy. Nguồn Project và nguồn ngoài có loại/locator riêng; URL/title/date/fetchedAt và annotation provenance được lưu. Recheck Project dependency trước delivery; công khai URL không làm public answer có dữ liệu Project.
7. Nếu hosted search bị từ chối: giữ receipt thật, không retry vô hạn/fallback keyed. Đánh giá nguồn search có API/điều khoản cho phép truy cập miễn phí; nối function tool Galaxy và reader `fetchPublicPage` hiện hữu. Chưa có engine miễn phí tổng quát được chứng minh trong khảo sát này. Nếu không có đường phù hợp, ghi BLOCKED đúng capability; fetch một URL hoặc snippets không được báo là search live đã đạt.

Benchmark cùng bộ câu hỏi cho từng model cần kiểm: kiến thức chung, code, kỹ thuật, so sánh, cập nhật, tài liệu, follow-up, dữ liệu Project. Giữ model/context/tool receipt/coverage/citation/latency/error; không lưu hidden reasoning. Không hứa tương đương toàn bộ tính năng riêng của ChatGPT. Sáu ca web của owner phải có trace network/tool thật và nguồn đọc được; chưa đủ thì không WEB_SEARCH_LIVE PASS.

### P3 — file, storage và processing

1. Mở rộng target `UploadSession` hiện hữu cho conversation private bằng organization/project/actor/conversation liên kết chặt. Giữ target hồ sơ cũ. Dùng uploader parts hiện có trong chat: progress theo bytes server xác nhận, cancel/abort, chọn lại file để resume, checksum mỗi part và toàn file, cleanup, quota, idempotency. Không tạo upload system thứ hai.
2. Max nhận file đúng 10.000.000.000 bytes ở validation frontend/backend/complete/storage. Không đưa binary vào PostgreSQL hoặc nâng multipart RAM limit. File đã tồn tại không bị sửa/xóa vì đổi limit; legacy metadata/quota chưa đo không được hạ dự phòng dẫn tới đếm thiếu dung lượng.
3. Admission dùng quota/reservation và global lock hiện hữu, thêm kiểm filesystem thực với dự phòng staging/finalization và headroom. Hạn mức cấu hình không được giả là dung lượng khả dụng. Hash và assemble streaming; client đọc/hash từng part, không `arrayBuffer()` nguyên file. Chỉ nhận file lớn khi tài nguyên và quyền đủ.
4. Giữ `FileAsset` gốc/version/checksum và `ChatAiSourceIndex` làm processing job. Nội dung lớn chuyển thành chunk rows có organization/project/source/version/extractor/page/sheet/cell/region/coverage; không một JSON/text chứa toàn file. Claim/lease/retry có giới hạn và recheck scope/version. Không giữ Project lock qua parser/provider I/O.
5. PDF text/page, DOCX và XLSX ưu tiên tái sử dụng parser; stream text/CSV/TSV/JSON/XML/YAML/code theo phần. HTML không chạy JS, XML không DTD/external entity, bảng không macro/tính công thức/external links. DOC/XLS/PPT/ODF/RTF và ảnh khác cần converter được xác minh; PPTX giữ slide/notes, DOCX giữ paragraph/table, XLSX giữ sheet/range/đơn vị/Decimal provenance. Không hiển thị capability extract/AI khi chỉ storage đạt.
6. Converter chạy worker có sandbox filesystem/network, giới hạn CPU/RAM/time/output/ZIP expansion, tên file an toàn; không thực thi file/macro. PDF scan/OCR và vision theo capability model đã có live evidence; resize/tiling giữ ảnh gốc và locator. Resource limit hoặc parser thiếu trả processing status/error thật, không đọc kiến thức chung giả thành nội dung file.
7. Bảng capability theo từng format: storage, preview, extraction, AI. CAD/BIM/ZIP/audio/video chỉ mở phần parser/converter đã được kiểm chứng; metadata/preview không được gọi là đã đọc toàn bộ hình học hoặc kích thước. Chưa mở format chưa kiểm bằng cách chỉ thêm extension.
8. Mọi upload/index/search/read/download/send-to-provider/delete/update kiểm backend ownership, Project và nguồn. File riêng không tự publish; chia sẻ cần flow có quyền. Prompt injection trong file là dữ liệu, không điều khiển executor.

Kiểm 10 GB trên fixture storage/DB riêng, sau khi kiểm disk/quota: tests metadata đúng biên10.000.000.000/+1 và part geometry; file dữ liệu tạo streaming, upload/resume/hash/full finalize rồi đọc/hash lại; ghi peak RSS/disk amplification/thời gian; abort/cleanup và concurrent quota. Sparse file hay metadata-only không thay evidence full transfer. Không dùng main database cho stress/seed/reset. Browser PDF/Word/Excel/ảnh và citations phải đọc nội dung thật; chỉ cutover sau backup/rollback, migration rehearsal và đầy đủ gate checkpoint.

## Phạm vi code/caller cần chạm sau khi được duyệt

| Checkpoint | Domain/caller/test/migration                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1         | `project-ai.service.ts`, DTO/controller/module, `ai-registry.ts` request pins, ProjectChatPolicy hiện hữu; Prisma memory/revision/dependency và migration mới; `project-ai.tsx`/surfaces và tests; integration M3/ACL và browser A/B/revoke |
| P2         | `ai-chatgpt-plan.ts`/tests, tool definitions/executor và `ai-web.ts`; AI capability evidence, history/context budget; model/search mode/citation UI/tests; fixture contract và live benchmark receipts                                      |
| P3         | UploadSession schema/DTO/service/controller, FilesService/FileStorage/quota, upload queue/hash helpers; source index/chunk/extractors/worker; chat upload/status UI; format/ACL/parser/10 GB/security tests và migration mới                |

Không phải refactor toàn service hoặc dựng engine AI mới. Khi đổi API/DTO phải grep lại toàn caller, fixture, exports và checks; không chỉ sửa một nút frontend. File connection service chỉ là dependency hiện hữu; không có kế hoạch sửa lifecycle/registration/callback hoặc cấp quyền nhiều người.

## Kiểm tra đã chạy và giới hạn

- API codec/service/tools/source: 39/39 unit test đạt. Web `project-ai`/`project-chat`: 30/30 đạt.
- Web reader17/17 và file quota6/6 đạt. Native source ban đầu31pass/3PDF failure/1skip cùng invocation: shell không có đường private PDF tools. Chạy lại riêng bằng đúng `GALAXY_AI_PDFINFO` và library path của runtime:12/12 đạt. Tổng các test API liên quan có kết quả cuối đạt là74, không có product fix để làm xanh.
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm prod:verify-artifacts`, runtime/schema read-only và archive/source comparison đạt. `git diff --check`, link handoff và16trạng thái đủ; recheck product source sau cập nhật docs vẫn khớp snapshot đã phát hành. Không migration mới hoặc migration validation cho feature chưa viết.
- Full `pnpm test`, build, integration/security của memory mới, browser fixture và OpenAI inference/search/file mới: NOT_RUN. Không dùng2036test của08/10 làm regression mới.
- Browser connector không tìm thấy executable Chrome. Endpoint CDP loopback33005 trả connection refused cả khi đọc ngoài filesystem sandbox. Không đổi Chrome/Windows/WSL/Edge/network; không kết luận Galaxy session hiện hết hạn hoặc yêu cầu reconnect ChatGPT.
- `pnpm local:status` trong sandbox ban đầu thiếu quyền netlink; cùng lệnh chỉ đọc ngoài sandbox được automatic approval và đạt. Không có automatic approval rejection trong lượt này.
- Ponytail/correctness/security/authorization/UX review khảo sát: mở rộng gate Project phải giữ independent plan owner check; memory mới cần compound scope+dependency và explicit publish; web cần ranh giới context công khai, không chỉ prompt; upload phải streaming và quota/disk admission. Các điểm này đã nằm trong đề xuất. Chưa có product diff mới để review hoặc approve ship.

## Trạng thái đối với yêu cầu mới

Các FAIL dưới đây là khoảng thiếu của baseline với phạm vi mới, không phải regression do lượt khảo sát gây ra. PASS runtime chỉ xác nhận release cũ được bảo toàn.

| Mục                     | Trạng thái | Bằng chứng/giới hạn                                                               |
| ----------------------- | ---------- | --------------------------------------------------------------------------------- |
| CROSS_PROJECT_AI        | FAIL       | Pilot gate chỉ Showroom dù owner có INVOKE tại9Project                            |
| MODEL_SELECTION         | NOT_RUN    | Source pin đúng; receipt đã lưu khớp3model; chưa kiểm toàn7model mới              |
| PROJECT_CONTEXT         | FAIL       | Scope server có; model context rõ Project/actor/conversation chưa được gửi đầy đủ |
| PROJECT_MEMORY          | FAIL       | Chưa có note/revision/private/shared management theo yêu cầu                      |
| MEMORY_ISOLATION        | NOT_RUN    | Scope conversation/source hiện hữu không thay tests của memory mới                |
| GENERAL_QA_QUALITY      | NOT_RUN    | Không whitelist được tìm thấy; chưa benchmark chất lượng                          |
| WEB_SEARCH_LIVE         | NOT_RUN    | Nhánh SIWC chưa gửi hosted search; chưa có upstream refusal mới                   |
| WEB_CITATIONS           | FAIL       | Codec SIWC chưa giữ URL annotations/web_search_call                               |
| PROJECT_WEB_COMBINATION | FAIL       | Chưa có web execution và context công khai riêng                                  |
| FILE_UPLOAD             | FAIL       | Chat10MiB multipart; target resumable chưa hỗ trợ conversation                    |
| FILE_EXTRACTION         | FAIL       | PDF/DOCX/XLSX/text nhỏ có12test; format/large-file contract mới chưa đủ           |
| FILE_AI_RETRIEVAL       | FAIL       | SIWC ask chặn sourceIds/context; run chỉ task_list                                |
| LARGE_FILE_10GB         | FAIL       | Hai limit hiện khác contract; chưa full-transfer evidence                         |
| SECURITY_ACL            | NOT_RUN    | Fresh IAM/grant read và unit có; tests memory/retrieval/worker mới chưa viết      |
| REGRESSION              | NOT_RUN    | Targeted74API+30Web/static đạt; full regression mới chưa chạy                     |
| DEPLOYED_RUNTIME        | PASS       | READY local-bf73047fa0ee/schema86; không có release mới                           |

## Bước tiếp

Owner review thiết kế P1–P3; spec/plan P1 trước, rồi TDD/fixture security/browser/live trên ít nhất hai Project được phép. P2 kiểm search thật và privacy trước mở; P3 migration/parser/streaming/resume/10 GB trước cutover. Mỗi checkpoint có evidence và gate riêng. Yêu cầu commit ở từng checkpoint không được suy từ “có thể commit”; phải có lệnh commit rõ.

OAuth/registration/callback/token exchange/refresh/credential lifecycle, owner connection, login ChatGPT, staff plan sharing, provider keyed paused, domain/Node TLS Edge/Windows–WSL network và kết nối ChatGPT từ máy khác vẫn ngoài phạm vi sửa. Giữ dữ liệu/main/runtime. Không tuyên bố “AI như ChatGPT” từ prompt, unit test hoặc schema tool.

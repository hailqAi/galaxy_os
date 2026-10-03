# M3 — Nền nguồn có quyền và provider

OWNER_DIRECTED theo prompt hợp nhất 2026-09-30. M2-A đã qua gate migration,
nghiệm thu và cutover; M3 source/schema/API/panel đã triển khai tại3000 trên cây
`fde08f8`. Provider hiện NOT_CONFIGURED, outbound dữ liệu Project tắt. Live smoke
chỉ chạy với key/model/allowlist/hạn mức hợp lệ và dữ liệu giả được phép; không
sử dụng backup/clone làm context. [Handoff hiện tại](../M2/HANDOFF.md) và
[bằng chứng](../M2/VERIFICATION.md) phân biệt code, mock, UI main và live provider.

Nền tối thiểu dùng module ProjectChat hiện hữu và Node fetch/Zod đã cài. Nguồn
canonical vẫn ChatMessage, ChatFile/FileAsset version và publication; extraction,
chunk/index là dữ liệu có thể dựng lại. Không bốn bộ nhớ hoặc vector service mới.
Bản đầu hỗ trợ message và text/plain UTF-8 thật; PDF/ảnh báo chưa hỗ trợ, không OCR
giả. Mỗi chunk giữ version/checksum và offset dòng. Retrieval lexical giữ mã hàng
nguyên dạng; không gọi đây là semantic/embedding hoàn chỉnh. Câu hỏi yêu cầu tổng
hợp đầy đủ phải dùng domain read đủ tập, không suy tổng từ top-k.

Provider gọi Responses API phía backend, endpoint allowlist, model phải được
cấu hình/allowlist riêng; không default/fallback model. Một lần gọi có timeout và
abort, không retry tự động gây thêm phí. `store:false` chỉ cấu hình application
state, không khẳng định không có mọi retention. Source là dữ liệu không tin cậy,
không tool SQL/shell/URL và không write tool. Output có schema strict và citation
handle do backend cấp; backend từ chối handle lạ, refusal, incomplete/cancelled.
Nguồn thiếu/mâu thuẫn được thể hiện; câu trả lời AI không tự là quyết định.

Phần tích hợp sau gate dùng grant INVOKE/ai.invoke riêng, recheck room READ/history
và file DOWNLOAD trước context, sau provider, khi mở lịch sử/citation. Dependency
là toàn bộ context có thể ảnh hưởng câu trả lời, không chỉ citation được model
chọn. Mất quyền bất kỳ dependency thì ẩn cả answer. Không giữ khóa Project qua
network provider. Conversation/answer/idempotency/quota cần lưu bền vững bằng
Prisma; không dùng cache RAM thay quyền hoặc lịch sử. Panel riêng trong Project,
không tự đăng bot vào room khách. Schema/API/panel đã có bằng chứng integration và Chrome; provider thật chưa
kiểm nên M3_IMPLEMENTED không đồng nghĩa LIVE_VERIFIED.

Sau khi đọc policy/callers, INVOKE nằm trong `ChatProjectGrant.actions`, ánh xạ
`ai.invoke`; không thêm vào room actions/ceiling. Cấp quyền dùng AI theo Project
qua cùng kiểm tra `delegate`/role binding. Mỗi nguồn vẫn kiểm READ/DOWNLOAD/history
riêng. Mọi entry AI yêu cầu membership INTERNAL mới đọc từ DB; annotation
AllowExternal của chat người–người không cấp quyền AI.

Lưu conversation riêng theo owner/Project, request/answer có client key và payload
hash, dependency của toàn bộ context, index theo định danh/version/extractor.
Index có trạng thái/lease ngay trong PostgreSQL hiện hữu; không cần một dịch vụ
queue hoặc vector mới. Job cũ không ghi đè version mới. Quota hữu hạn và trạng
thái provider được ghi bền vững; timeout/crash không tự gọi lại một request có thể
đã tính phí. Usage thực từ provider được giữ riêng, không bịa chi phí.

Nguồn publication đi qua quyền published recipient và thời gian phát hành của
`downloadRelease`, không dùng đường preview của preparer/publisher. ChatFile tái
dùng quyền và khoảng lịch sử trong `visibleFile`. Mọi dependency được kiểm lại
trước provider, delivery, history và citation; mất bất kỳ nguồn nào thì không
trả cả question/answer có thể chứa nội dung dẫn xuất. Citation mở endpoint backend
theo answer/handle, giữ version và link download cùng origin.

Nguồn API đã đọc: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses),
[Data controls](https://developers.openai.com/api/docs/guides/your-data).

Retrieval hiện dùng PostgreSQL lexical qua Prisma6.19 `fullTextSearchPostgres`
(Preview), giữ nguyên ACL `where`, xếp relevance trước LIMIT50 và bắt buộc match
mã có chữ/số trước giới hạn. Search text NFKC; chunks/locator/checksum giữ nguồn
nguyên bản. Giới hạn tải về50ứng viên, không khẳng định DB chỉ đọc50hàng hoặc đã
cóGIN index. [Giới hạn FTS của Prisma6](https://www.prisma.io/docs/orm/v6/prisma-client/queries/full-text-search)
được giữ rõ; chưa semantic/embeddings. Live provider vẫn NOT_RUN.

Giới hạn nguồn bản nền: đọc message, ChatFile gắn FileAsset/version và các nguồn
publication đã phát hành cho đúng recipient. Chưa có adapter Task hoặc toàn bộ
FileAsset/Document AI trong Project; không diễn giải “toàn hồ sơ” là đã index mọi
loại dữ liệu. UI báo trạng thái nguồn chưa đọc được/unsupported; tổng toàn tập
trả NEEDS_REPORT khi chưa có domain read đủ tập. Các mở rộng này cần task riêng,
không gửi thêm corpus ra provider chỉ vì đã bật panel.

## Mở rộng đa nhà cung cấp — 2026-10-03

Phạm vi do chủ dự án giao và chỉ định thực thi inline T1–T5: Gemini 3.8 Flash
(`google_gemini`), Mistral Medium 3.5 (`mistral`), Kira 3.5 Pro (`kira`).
Giữ ProjectChat/ChatAiConversation/ChatAiAnswer/SourceIndex/Dependency.
Không xây gateway, memory, index hay provider state song song.

- Registry backend tách công bố/capability, key thay thế, admin enable,
  account model access, live evidence, quyền người hỏi và egress. UI đọc registry.
- Dùng Node fetch hiện hữu, endpoint cố định, redirect:error, một lần gọi;
  Google Interactions native store:false; Mistral/Kira Chat Completions.
  Không tự fallback, không lưu/replay thought/signature hoặc raw response.
- Cấu hình JSON riêng ngoài Git/artifact, mode0600, đọc mới mỗi gate. Lệnh
  terminal getpass nhập khóa thay thế, không truyền key qua argv/UI HTTP.
  Các biến tham chiếu GEMINI_API_KEY/MISTRAL_API_KEY/KIRA_API_KEY giữ ở file riêng.
- Pilot chỉ synthetic/public-approved: quản trị duyệt Project và từng source
  ID/version; người hỏi xác nhận câu hỏi thuộc phạm vi pilot. READ/PUBLISHED
  không thay egress approval. Kiểm toàn bộ lịch sử được dùng và dependency
  trước outbound/delivery/history; bất kỳ nguồn bị cấm chặn cả câu trả lời.
- Chốt provider/model/revision/reasoning/data classification và nguồn trong
  metadata JSON có version của ChatAiAnswer. Tái sử dụng cột model/usage;
  không cần migration chỉ để chứa metadata. Giữ legacy rows có schema cũ.
- Model selection riêng actor/Project, request key pin toàn payload. Đổi model
  không đổi conversation. Context mỗi lượt dựng từ lịch sử chuẩn và nguồn có
  quyền, không chia sẻ opaque state nhà cung cấp.
- Reservation PostgreSQL advisory lock chung theo provider/account, giới hạn
  concurrency, bytes input và output token/lượt. Chủ dự án chọn không giới hạn
  lượt/ngày (`null`); không tự nạp tiền/bật billing. Timeout/cancel vẫn
  giữ reservation; usage thực lưu riêng, không bịa tiền hoặc exactly-once.
- Text và lexical retrieval trước. Native Gemini image/PDF có contract/size/
  MIME/checksum/nguồn/version/page riêng; capability chỉ bật khi có evidence
  cần thiết. Không provider file handle lâu dài. Mistral/Kira text-only ban đầu.
  Không có extractor Word/Excel tại nền AI: giữ unsupported, không tuyên bố đọc đủ.
- Cấu hình quản trị hiển thị host, policy, key state, budget và kiểm thử;
  backend yêu cầu ACCESS_ADMIN. Không endpoint trả key. Thay secret không
  yêu cầu restart toàn bộ stack; API đọc file đã chỉ định bởi service config.
- Build snapshot mới, test cô lập, cutover Web/API cùng release qua systemd;
  giữ Edge/keeper/public=false, DB/storage/account và bản rollback.

Nguồn kỹ thuật đối chiếu ngày 2026-10-03:
[Google models](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash),
[Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview),
[API](https://ai.google.dev/api/interactions-api),
[thinking](https://ai.google.dev/gemini-api/docs/thinking),
[PDF](https://ai.google.dev/gemini-api/docs/document-processing),
[key](https://ai.google.dev/gemini-api/docs/api-key),
[terms](https://ai.google.dev/gemini-api/terms),
[Mistral chat](https://docs.mistral.ai/studio/conversations/chat-completion),
[reasoning](https://docs.mistral.ai/studio/conversations/reasoning),
[models](https://docs.mistral.ai/api/endpoint/models),
[Kira model/API](https://kiraai.vn/models/kira-3.5-pro/),
[policy](https://kiraai.vn/chinh-sach/). Kira documents trả lỗi khi đọc;
không suy ra upstream/effort/file từ OpenAI compatibility. Google unpaid/unknown
không được nhận nội dung mật/cá nhân; Mistral retention/training và account tier
chưa xác minh; Kira qua trung gian, mặc định chỉ pilot.

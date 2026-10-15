# GALAXY AI — TIẾP TỤC TỪ R10: KIỂM TRA TOÀN DIỆN SIWC VÀ HOÀN TẤT WORKSPACE ROUND-TRIP

Ngày: 09/10/2026.
Đích thực hiện: Codex CLI trên máy có repository Galaxy OS.
Thư mục tài liệu chuẩn: /home/galaxy_os/prompt.
Chế độ: IMPLEMENT_AND_VERIFY. Đây là prompt giao việc, không phải báo cáo đã kiểm tra máy chủ.
Kế thừa Master v1.0, prompt E01 và các quyết định còn hiệu lực. Không tạo một dự án/harness mới.

## 0. CHẤP THUẬN TIẾP TỤC KẾ HOẠCH HIỆN CÓ

Tôi chấp thuận tiếp tục thực hiện implementation plan E01 hiện đã được Codex trình và đang chờ review tại:
/home/galaxy_os/prompt/E01_IMPLEMENTATION_PLAN.md

Phê duyệt này áp dụng cho phạm vi E01 đã chốt: hoàn thiện SIWC, Workspace connection/model binding, giao việc từ Galaxy, nhận kết quả về đúng chat, nguồn/tệp đầu ra và kiểm thử/phát hành an toàn. Không phải quyền thực hiện nội dung mới vượt phạm vi hoặc các hành động nguy hiểm trái các ràng buộc bên dưới.

Tôi chọn thực thi trực tiếp bằng Codex CLI trong phiên hiện tại. Đọc đúng plan, ghi revision/hash thực đang sử dụng và đối chiếu phạm vi. Không bịa rằng đã đọc một file thiếu. Nếu có thay đổi mới vượt phạm vi, tách đúng phần đó để quyết định; không mở lại cùng vòng brainstorming/spec/plan cho phần đã chốt và đã được duyệt.

Tiếp tục các task E01 chưa hoàn thành. P1-B và phần T1 đã đạt không được xây lại. Không kết thúc chỉ bằng báo cáo tài liệu khi task đã đủ điều kiện lập trình. Vẫn giữ code review, TDD, bảo mật, phê duyệt nghiệp vụ và gate phát hành.

Mục tiêu: SIWC khai thác đầy đủ năng lực hợp lệ; một Workspace Agent thực sự chạy trong ChatGPT nhận yêu cầu từ Galaxy và trả nội dung hoàn chỉnh, nguồn cùng sản phẩm được hỗ trợ về đúng Project Chat. Không chỉ gọi trigger rồi hiển thị một link sang ChatGPT.

## 1. CHECKPOINT R10 — XÁC MINH TỐI THIỂU, KHÔNG LÀM LẠI

Thông tin do người dùng chuyển từ báo cáo gần nhất, cần đối chiếu chứ chưa coi là kiểm chứng trong phiên mới:

- Deployed runtime: local-651479a7e9ce trên 3000/3001 và os.galaxycentre.vn.
- 37 câu trả lời thật; provider được báo xác nhận gpt-6.1-sol; reload giữ kết quả.
- Memory private/shared, isolation, citation, history vượt tám lượt và summary đã đạt.
- 2.120 test PASS; lint/typecheck/build/format đạt; review không còn finding.
- Checkpoint: /home/galaxy_os/prompt/GALAXY_AI_PLAN_AND_CHECKPOINT.md, revision r10.
- Token profile vẫn UNVERIFIED theo ngoại lệ đã được ghi nhận.
- Workspace/file/ảnh chưa hoàn tất.

Đọc README, long-term memory, E01 plan, checkpoint r10, handoff liên quan và AGENTS.md áp dụng. Root/worktree lịch sử là /home/galaxy_os và /home/galaxy_os/.worktrees/m2-a-20260928; xác định thực tế trước khi sửa.

Kiểm branch/HEAD/diff/untracked, schema, release manifest, process và artifact đang phục vụ. Tái sử dụng bằng chứng còn hợp lệ, không quét lại hàng trăm file để chỉ xác nhận chưa viết code. Không checkout lùi về SHA cũ.

Bảo toàn thay đổi dở. Giữ rollback ứng dụng tương thích dữ liệu và backup phù hợp. Không reset/clean/stash tự động, không git add toàn repo, không xóa volume/DB hoặc đổi stack.

## 2. ĐỊNH NGHĨA “FULL QUYỀN, FULL NỘI DUNG”

Full capability: bỏ chặn ứng dụng không cần thiết; model có thể hỏi đáp tổng quát, suy luận và dùng các công cụ sẵn sàng được nhà cung cấp cấp quyền. Không chỉ cho hỏi nghiệp vụ Galaxy hoặc chỉ cho Showroom hoạt động.

Full nội dung: bảo toàn câu hỏi gốc và nội dung trả lời công khai; giữ bảng, mã, nguồn, hình và file được tạo thật. Không tóm tắt thay thế yêu cầu, không cắt câu trả lời chỉ để giao diện ngắn. Không có nghĩa gửi mọi dữ liệu của công ty, vượt context/file limit hay truy xuất hidden chain-of-thought.

Full quyền làm việc: tự đọc/tìm kiếm/phân tích và tạo bản nháp trong đúng phạm vi đã cấp. Không bắt xác nhận lại mỗi thao tác READ hoặc trả kết quả vào chính job đã được người dùng yêu cầu. Thao tác tạo/sửa nghĩa vụ hợp đồng, phê duyệt, thanh toán, phát hành, gửi ngoài hoặc xóa dữ liệu vẫn theo quyền và approval nghiệp vụ.

Giữ IAM, ACL, source-egress policy và ranh giới private/shared. Không dùng token chủ kết nối để tự mở cho mọi nhân viên khi provider entitlement chưa cho phép. Không tắt biện pháp an toàn hoặc điều kiện nhà cung cấp để gọi là full.

## 3. KIỂM TRA CHẤT LƯỢNG SIWC TỪ REQUEST ĐẾN CÂU TRẢ LỜI

Không mặc định memory tốt hơn có nghĩa mọi capability đã mở. Kiểm từng tầng bằng source và trace đã che dữ liệu nhạy cảm:

A. Model: requestedModel, model slug trong request và model do provider báo. Không lấy lời AI tự nhận làm bằng chứng. Không xếp hạng model chỉ theo tên hoặc thứ tự catalog.

B. Reasoning: kiểm chế độ và effort thực sự được gửi, giá trị mặc định có đang thiên về tốc độ hay không. Ưu tiên chất lượng theo lựa chọn người dùng; chỉ dùng giá trị được model/route hỗ trợ. Nếu field bị từ chối, báo rõ, không bỏ field âm thầm rồi giữ nhãn “suy luận tối đa”. Không tự bật một chế độ trả phí/quyền mới chưa được cấp.

C. Prompt: tìm các chỉ dẫn ép ngắn, chỉ dùng dữ liệu Project, cấm kiến thức chung, cấm web, ép kết luận sơ sài hoặc dùng template fallback. Sửa đúng nguồn gây hạn chế; không chỉ nối thêm một prompt dài để bù prompt cũ mâu thuẫn.

D. User input: giữ nguyên Unicode, bảng/mã, điều kiện và file references của message revision. Test round-trip serialize/deserialize và hash nội dung nghiệp vụ, không chỉ hash raw JSON khác định dạng.

E. Context: kiểm những nguồn thực được đưa vào, thứ tự, phiên bản và điều kiện bắt buộc. Summary hỗ trợ, không thay dữ liệu chính thức; câu hỏi tổng quát không phải kèm mọi Project record.

F. Tools: đối chiếu tool registry với definitions thực gửi, executor, permission, timeout, tool result và lần inference tiếp theo. Tool đã có tên không đồng nghĩa dùng được. Tái sử dụng read/retrieval/draft tools sẵn sàng, không mở action nguy hiểm chỉ vì registry có contract.

G. Completion: đọc toàn bộ sự kiện, không chỉ delta text; giữ citations/output items được phép. Kiểm server/proxy/browser có cắt dữ liệu, bỏ bảng hoặc bỏ kết quả cuối không. Ghi riêng failed/incomplete/disconnect.

H. Presentation: giữ câu trả lời cuối từ tác nhân thực hiện. Không thêm bước model yếu viết lại/tóm tắt mặc định. Render Markdown an toàn nhưng không làm mất nội dung; nội dung nguồn không được trở thành chỉ dẫn hệ thống.

Tạo SIWC_CAPABILITY_AUDIT với bằng chứng từng capability:
GENERAL_QA, DEEP_REASONING, MODEL_MATCH, HISTORY, PROJECT_RETRIEVAL,
WEB_SEARCH, VISION, FILE_INPUT, READ_TOOLS, DRAFT_TOOLS, OUTPUT_COMPLETENESS.

Phân biệt AVAILABLE theo provider, WIRED trong source, LIVE_VERIFIED và UNAVAILABLE/BLOCKED có lý do. Không gộp thành một cờ “FULL=true”.

## 4. GIẢI QUYẾT TOKEN PROFILE UNVERIFIED ĐÚNG NGHĨA

Đọc định nghĩa token profile trong source/checkpoint. Xác định đó là hồ sơ tokenizer/context budget hay OAuth credential. Không đánh đồng hai khái niệm; không reconnect SIWC hoặc xóa token chỉ vì bộ đếm ngữ cảnh chưa được kiểm chứng.

Nếu là tokenizer/context profile, cần ghi:

- Model/version/encoding và nguồn xác minh.
- Context capacity/khả năng output thực biết được, không lấy của model khác.
- Token estimate và overhead của instructions, history, memory, tool schema,
  file/image và tool results; những phần chưa đếm chính xác phải ghi rõ.
- Khoảng dự phòng cho reasoning/output, mức sai số và chiến lược quá giới hạn.

Chỉ thử endpoint đếm token hoặc field bổ sung khi SIWC thực sự hỗ trợ. Không suy từ API thông thường rằng OAuth SIWC được gọi mọi endpoint.

Đối chiếu estimate với usage provider trong các phép thử có giới hạn. Không gửi thử vô hạn để dò context tối đa hoặc đốt hạn mức. Nếu thiếu bằng chứng, giữ trạng thái UNVERIFIED/ESTIMATED đúng nghĩa và áp dụng cấu hình dự phòng minh bạch có căn cứ; không giả đóng gate PASS.

Không chữa bằng cách đẩy input vô hạn. Không quay về cắt cứng tám lượt. Khi input quá dài: giữ nguyên câu hỏi, quyết định bắt buộc và nguồn cần thiết; truy xuất theo phần và chỉ loại phần bổ trợ thừa với manifest rõ ràng. Nếu bản thân yêu cầu gốc không thể chứa, giải thích và xin chia công việc, không âm thầm sửa câu hỏi.

Ngoại lệ token-profile đã được duyệt không được tự biến thành blocker toàn E01. Một phép thử Workspace với context nhỏ, an toàn và độc lập vẫn tiếp tục. Không hạ model để chữa context error.

## 5. GIỮ HỢP ĐỒNG SIWC, MỞ WEB/FILE/TOOLS THẬT

Đọc S1–S3 ở cuối tài liệu trước khi chỉnh adapter. Tài liệu API chung không thay giới hạn riêng SIWC.

Các điểm cần đối chiếu: store=false, stream=true, input array, instructions/developer hợp lệ; history HTTP do Galaxy cung cấp. Không thêm field hoặc hosted tool bị route từ chối để giả tăng năng lực. Function/custom tools phải theo namespace/cơ chế hợp lệ của route.

Kiểm web search native bằng model/tài khoản thực. Chỉ ghi WEB_SEARCH_LIVE khi có search thật, nội dung và citation được dùng trong câu trả lời. Khi user yêu cầu kiểm chứng mà search thất bại, không dùng kiến thức cũ rồi nói đã tra. Fallback công cụ Galaxy chỉ khi có đường hợp lệ đã được chọn, không kích hoạt provider-key.

Thử file/ảnh đầu vào đại diện theo capability hiện hành. Bảo toàn original tại Galaxy; truyền bản gốc khi hỗ trợ và vừa giới hạn, không cấm toàn bộ file/context. Nếu phải dùng dẫn xuất hoặc trích đoạn, nêu rõ. 10 GB là giới hạn storage Galaxy, không phải quyền gửi một request 10 GB.

Các capability tạo ảnh/file không được SIWC cung cấp trực tiếp phải chạy bằng Workspace/công cụ Galaxy hợp lệ, không giả có hosted tool.

## 6. KẾT NỐI WORKSPACE — LÀM THẬT, CREDENTIAL RIÊNG

Ưu tiên thực hiện các task còn lại trong E01 plan thay vì viết một plan mới.

Phân biệt ChatGPT Workspace Agents với Responses API, Agents SDK và tự động hóa browser ChatGPT. Không scraping chatgpt.com, đọc cookie, dùng backend-api, token Codex hoặc dựng cuộc chat bí mật giả.

Thiết lập ba lớp danh tính độc lập:

1. Galaxy → Workspace Agents API: credential và scope Workspace chính thức.
2. Workspace → Galaxy result/source tools: credential connector riêng.
3. Người yêu cầu trong Galaxy: actor/project/source permissions được backend kiểm.

Kiểm workspace đủ điều kiện, quyền tạo/edit/publish/run, model/effort, công cụ,
access-token scope, credit/allowance và chính sách dữ liệu. Không giả SIWC Pro đủ quyền Workspace hoặc có usage vô hạn.

Khảo sát plugin Workspace Agents chính thức trên chính máy Codex. Dùng chức năng thực được expose để inspect/create/update nếu có; không bịa command hay endpoint quản trị. Plugin ở ChatGPT này không chứng minh plugin đã có trên Codex của máy chủ.

Nếu cần cấu hình qua Agent Studio, chuẩn bị code/receiver trước, hướng dẫn một lần đúng các thao tác còn thiếu. Không xin mật khẩu/OTP/token qua chat; nhập secret vào UI quản trị bảo mật hoặc secret store hiện hữu. Redact credential và không in toàn bộ môi trường ra log.

Cho phép tạo/cấu hình số tối thiểu agent pilot dành riêng cho Galaxy. Tôi yêu cầu publish pilot phục vụ E01 sau khi đã kiểm đúng model, tools, access và result destination trong workspace đã được phép; không publish công khai hoặc chia sẻ toàn công ty. Nếu môi trường cần tôi bấm xác nhận cuối, nêu đúng thao tác. Không thay agent khác, thêm schedules hay bật ứng dụng ngoài nhu cầu.

Thiếu entitlement/credential/nguồn thanh toán đã duyệt phải báo sớm bằng bằng chứng; hoàn thành code và các phần độc lập, không phát sinh phí hoặc đổi gói để vượt blocker.

## 7. RÀNG BUỘC ĐÚNG MODEL TRÊN GALAXY VÀ WORKSPACE

Giữ yêu cầu E01: model chọn trên Galaxy phải là model chủ lực thực hiện ở nhánh Workspace. Không hạ tiêu chuẩn để báo đã kết nối.

Đọc schema trigger hiện hành: không tự thêm model per-request khi contract không có. Nếu phải cấu hình tại agent, dùng binding:
workspace + credential scope + model identity + effort
→ published agent + API trigger channel + cấu hình đã kiểm chứng.

Phân biệt draft/published. Kiểm lại trước khi bật binding và phát hiện drift. Không republish cùng một agent đổi model trước mỗi tin nhắn. Mỗi run chụp binding/model/effort/route revision; selection mới chỉ áp dụng lượt mới.

Phải lưu riêng:
requestedModel / configuredModel / observedModel,
requestedEffort / configuredEffort / observedEffort,
modelEvidenceLevel và provider identifiers.

Không có observedModel thì để null. Không điền từ tên agent/request hay lời AI tự nhận. Alias hoặc snapshot khác tên chỉ map nếu có bằng chứng tương đương chính thức.

Nếu published configuration bảo đảm model nhưng không có telemetry per-run, báo CONFIG_VERIFIED, không RUN_MODEL_VERIFIED. Nếu provider có routing/fallback không bảo đảm model yêu cầu, strict Workspace route phải báo MODEL_BINDING_UNSUPPORTED, không tự dùng model khác.

SIWC vẫn hiển thị model của chính catalog SIWC. Nhánh Workspace cho thấy model nào có binding hợp lệ, không thu hẹp SIWC vì Workspace thiếu model.

Model chủ lực khác mô hình tạo ảnh hoặc engine tính/render. Ghi riêng công cụ chuyên dụng; không nói mọi công cụ nội bộ đều chạy cùng GPT.

## 8. DỰNG RESULT DESTINATION TRƯỚC KHI BẤM TRIGGER LIVE

API trigger chỉ khởi tạo run, không mặc định trả answer, attachments hoặc webhook. Đọc S4–S6 và hiện thực đường nhận kết quả phía Galaxy.

Dùng MCP/connector được Workspace hỗ trợ, tái sử dụng domain HTTPS và service hiện hữu. Chỉ expose những endpoint tích hợp cần thiết có auth; không public API nội bộ, Redis, Postgres, CDP hoặc filesystem. Không sửa OAuth/callback SIWC.

Các capability logic cần có (tên cuối theo convention hiện hữu):

- read_job_context: câu hỏi gốc, yêu cầu đầu ra, manifest nguồn.
- read_job_source: đọc đúng phiên bản/phần nguồn đã cấp.
- submit_job_result: nộp nội dung cuối, nguồn, warnings và artifacts.
- artifact_transfer/finalize: chỉ khi có cơ chế truyền dữ liệu thực được hỗ trợ.

Một jobId/conversation_key chỉ là định danh, không phải quyền. Xây ánh xạ connector principal → job đã ủy quyền → Galaxy actor/Project/nguồn. Không cho credential chung đọc mọi job chỉ dựa vào prompt nhắc đừng truy cập chéo. Không gửi bearer secret trong model-visible input.

Nếu platform không cung cấp ràng buộc per-job an toàn cần thiết, giới hạn binding/connector theo phạm vi đã chứng minh hoặc giữ multi-Project Workspace blocked. SIWC đa Project không bị chặn theo.

Thử read/write result tại MCP đúng phạm vi: WRITE ở đây chỉ nộp bản trả lời/artifact vào job đã được yêu cầu. Cấu hình để thao tác trả kết quả thông thường không luôn treo vì yêu cầu phê duyệt người dùng; không tắt xác nhận ghi dữ liệu nghiệp vụ hoặc chính sách toàn workspace.

## 9. PIPELINE CHAT → WORKSPACE → GALAXY

Trong mode Workspace, giữ câu hỏi nguyên gốc và gói context được phép. Không bắt một model nhỏ diễn giải lại trước khi agent chủ lực đọc. Quy tắc route bảo đảm yêu cầu web/tạo file được đưa tới capability đúng.

Tạo job bền vững trước dispatch, có outbox hoặc cơ chế tương đương chống mất/nhân đôi yêu cầu khi process restart. Giữ message revision, origin content hash, tenant/Project/conversation/actor, source manifest, binding snapshot, credential revision, run attempt và idempotency key.

Theo contract công khai hiện hành, trigger dùng input và conversation_key với API channel identifier; xác minh lại trước code. Dùng cùng idempotency key khi retry cùng sự kiện; không nhầm hội thoại ổn định với từng lượt gửi.

202 chỉ là ACCEPTED. Nếu có run polling theo beta đang hỗ trợ, dùng đúng schema và trạng thái. Provider completed không đồng nghĩa Galaxy đã nhận nội dung. Nếu chưa có run ID, giữ trạng thái chờ result/delivery riêng, không bịa RUNNING hoặc progress giả.

conversation_key do server tạo, gắn Project/conversation/visibility và epoch phù hợp. Không giữ memory, attached knowledge hoặc lịch sử Workspace dùng chung chứa dữ liệu riêng của nhiều Project. Khi quyền hoặc binding thay đổi khiến context không còn an toàn, tạo epoch mới và dựng lại từ nguồn hợp lệ.

Giữ thứ tự lượt có phụ thuộc bằng version/sequence, không chỉ timestamp. Hai Project/two tabs có thể chạy độc lập mà không lẫn.

State machine phân biệt:
PREPARED, DISPATCHING, ACCEPTED, RUNNING, WAITING_ACTION,
RESULT_RECEIVED, VALIDATING, COMPLETED, FAILED, CANCELLED,
DELIVERY_TIMEOUT/STATUS_UNKNOWN khi phù hợp.

Timeout sau POST phải reconcile; không retry mù tạo run trùng. Tool result tới trước polling vẫn được xử lý đúng. Cancel local chặn nhận/hiển thị mới; không báo provider đã hủy nếu chưa có API xác nhận. Quyền bị thu hồi chặn source/tool/output, kể cả kết quả đến muộn.

Không dùng copy/paste thủ công từ ChatGPT làm nghiệm thu tự động. Không dùng screenshot/scrape trang conversation để lấy answer.

## 10. FULL OUTPUT: NỘI DUNG, NGUỒN, ẢNH VÀ FILE

Định nghĩa output contract có version, gồm nội dung người dùng thấy, citation refs, warnings, artifact refs và memory proposals. Job/model/actor/Project thực do server gắn, không tin payload tự khai báo.

Agent gửi câu trả lời cuối đầy đủ qua result tool. Độ dài lớn cần phiên nhận theo phần có sequence/hash/finalize, không cố nhét mọi thứ vào field nhỏ rồi cắt. Kiểm payload limit thực, chống thiếu phần/lặp phần; không biến JSON validation thành lý do vứt phần còn lại.

Bảo toàn bảng, code, nội dung và sources. Giao diện sanitize Markdown và link nhưng không tự paraphrase. AI kiểm tra phải chỉ ra lỗi cụ thể, không model yếu viết lại tất cả. Nếu cần sửa thì lưu version và giao lại tác nhân phù hợp.

Tệp/ảnh phải truyền byte thật về storage Galaxy bằng cơ chế platform hỗ trợ, hoặc công cụ Galaxy tạo artifact thật. Không nhận sandbox path, link không truy cập được, chuỗi AI nói đã tạo, hay base64 do model tự bịa làm tệp hợp lệ.

Mọi tải từ URL phải chống SSRF/redirect vào mạng riêng, kiểm allowlist nguồn cần thiết, MIME/hash/quota/scan và quyền. Không nhúng URL bearer dài hạn vào prompt/log. Nếu platform không cho xuất file theo cơ chế hợp lệ, báo FILE_DELIVERY_BLOCKED riêng, giữ kết quả văn bản đã đạt; không hứa giao diện có ảnh đồng nghĩa API trả ảnh được.

Tối thiểu: một báo cáo văn bản hoàn chỉnh, một tệp tài liệu và một ảnh nếu capability được cấp. Video giữ NOT_RUN/UNAVAILABLE khi chưa có tool và đường nhận được kiểm chứng; không kéo thêm GPU hoặc pipeline video để trì hoãn bridge.

Giữ original file đầu vào, tệp chat tạm bền vững và promote vào hồ sơ theo quyền. Markdown là dẫn xuất. Giữ giới hạn upload 10.000.000.000 byte của Master; không cần nghiệm thu file khổng lồ trước khi text round-trip chạy.

## 11. NỐI VÀO MEMORY P1-B ĐÃ TRIỂN KHAI

Không xây lại P1-B hoặc cài memory engine mới cho E01.

Dùng cùng pipeline quyền/provenance/version của r10:

- Lưu đầy đủ câu hỏi, câu trả lời công khai, sources, route/model và artifacts.
- Tạo Markdown snapshot truy được về message/file version.
- Trích memory cốt lõi riêng: fact, proposal, decision, unresolved issue.
- Không biến đề xuất AI thành quyết định dùng chung.
- Private không tự thành shared.
- File hết hạn/xóa/thu hồi quyền kéo theo xử lý derived/index/memory tương ứng.

Memory extraction không chặn hiển thị câu trả lời đã nhận đủ. Lượt tiếp theo có recent history ngay cả khi memory worker chưa xong. Kiểm tránh tự lặp đưa cùng summary vào memory nhiều lần.

Tài liệu phát triển nằm trong /prompt; nội dung khách hàng và log có nguồn riêng ở DB/storage có ACL, không ghi vào Git.

## 12. UI VÀ ONBOARDING ĐỂ NGƯỜI DÙNG DÙNG ĐƯỢC

Giữ một Project Chat. Có lựa chọn route rõ: SIWC trực tiếp / Workspace / Auto.

Workspace explicit không gọi SIWC chỉ để xin phép route hoặc viết lại câu hỏi. Auto chỉ dùng nhánh đủ model/capability/quyền/budget, không đổi âm thầm.

Hiển thị bằng trạng thái thật: model yêu cầu và mức xác minh; nguồn/tệp đã dùng; đang đợi điều gì; kết quả/tệp đã nhận; lỗi và nút tiếp tục phù hợp. Không đổi nhãn kết quả cũ khi user chọn model mới.

Chuẩn bị UI cấu hình Workspace riêng với masked metadata và bước kiểm đúng:
AUTH_READY, AGENT_PUBLISHED, MODEL_BOUND, TOOLS_READY,
RESULT_DESTINATION_READY, ROUNDTRIP_VERIFIED.

Không yêu cầu người dùng nhập credential vào chat. Gom thao tác bất khả tự làm thành một setup packet chính xác: màn hình, trường cần nhập, quyền, lý do, phần code đã sẵn sàng. Không để thiếu token bên ngoài thành lý do dừng mọi code độc lập.

Không tự mở rộng quyền chia sẻ agent, kết nối app cá nhân khác hoặc schedules. Pilot ở đúng người/nhóm được cấp phép; dùng dữ liệu tổng hợp trước khi gửi tài liệu Project thật.

Workspace có thể tạo conversation trong ChatGPT. Không hứa phiên ẩn. Nếu yêu cầu không lưu/không hiện ở đó còn là điều kiện bắt buộc, giải quyết visibility/retention trước khi đưa dữ liệu thật; test tổng hợp và SIWC tiếp tục độc lập.

## 13. KIỂM CHẤT LƯỢNG, KHÔNG CHỈ ĐẾM TEST PASS

Giữ regression nhưng thêm bộ câu hỏi thực, có kỳ vọng và dữ liệu nguồn kiểm được.

Tạo khoảng 12–16 bài vừa đủ bao phủ: kiến thức chung, lập trình, phân tích nhiều ràng buộc, tìm thông tin mới, tra Project, hỏi lại quá tám lượt, đổi quyết định, bảng có phép tính, PDF, hình ảnh, xuất tệp, yêu cầu thiếu nguồn.

So sánh trước/sau trên cùng model/effort và dữ liệu thử. Ghi source manifest và công cụ thực gọi. Chỉ thay một nhóm nguyên nhân khi có thể để biết cải thiện do đâu. Không nhận “câu trả lời dài hơn” là tự động tốt hơn.

Đo: đáp ứng yêu cầu, độ đúng với nguồn, đầy đủ, citation, tool/artifact correctness, memory isolation, độ trễ và usage khi provider có trả. Model judge không được là bằng chứng duy nhất; dùng kiểm tra xác định và rubric do người dùng kiểm được.

Không hứa giống 100% ứng dụng ChatGPT hoặc Workspace mạnh hơn SIWC chỉ vì tên sản phẩm. Kết quả phải tốt hơn bằng ví dụ cụ thể và công việc hoàn tất.

## 14. THỨ TỰ THỰC THI VÀ NGHIỆM THU

Checkpoint A: xác nhận r10; SIWC capability/quality audit và bản sửa tối thiểu.
Checkpoint B: Workspace credential/config/published-model binding + receiver auth.
Checkpoint C: Galaxy → Workspace → full text về đúng chat thật.
Checkpoint D: nguồn/đọc tệp; tệp đầu ra/ảnh về storage khi capability có.
Checkpoint E: regression, domain, restart/retry/cancel/isolation, release và rollback.

Ưu tiên ràng buộc model + receiver và text round-trip sau bước audit cần thiết; không chờ xử lý mọi parser, token edge case hoặc mọi Github repo mới làm Workspace.

Bài nghiệm thu tối thiểu:
A01. T1/P1-B r10 không hồi quy; đúng model SIWC theo provider.
A02. Câu hỏi gốc giữ nguyên; không hidden rewrite hoặc fallback.
A03. Effort/config thực khớp; profile estimate chưa verified không báo verified.
A04. Long context được quản lý, không cắt điều kiện hoặc gửi vượt vô hạn.
A05. Web có call/nguồn thật khi được yêu cầu; lỗi phản ánh đúng.
A06. Tool loop thực thi và hoàn tất, không chỉ render schema.
A07. Workspace credential khác SIWC và secret không lộ.
A08. Published binding đúng model; thiếu/sai model không được dispatch thay.
A09. 202/provider-completed thiếu output không thành chat-completed.
A10. Workspace text trở lại đúng chat qua receiver, reload/restart giữ kết quả.
A11. Hai Project/hai tab/đổi selection không lẫn model hoặc context.
A12. Retry/timeout/duplicate/early result không sinh hai câu trả lời hoặc tệp.
A13. Cancel/revoke/quyền thay đổi chặn source và output tới muộn.
A14. Connector job/source ACL hoạt động thực, không dựa vào jobId đơn thuần.
A15. Câu trả lời dài/bảng/code/citation đầy đủ sau ingest và render.
A16. Một file thực tải được và kiểm được; image riêng khi hỗ trợ.
A17. Private/shared memory giữ provenance; không tự biến đề xuất thành quyết định.
A18. Domain phục vụ đúng artifact; migration/backup/rollback giữ dữ liệu.

Automated/unit/fixture/live phải ghi tách biệt. Kết quả chỉ CONFIG_VERIFIED không được đổi thành RUN_MODEL_VERIFIED.

## 15. VẬN HÀNH, CÔNG CỤ VÀ BÀN GIAO

Không đổi OAuth/callback/refresh SIWC hoặc mở lại remote OAuth. Không reset clock/WSL/VM theo phỏng đoán. Giới hạn test/build concurrency phù hợp hạ tầng.

Chỉ cài dependency/plugin giải quyết nhu cầu cụ thể của bridge và tương thích. Đọc license/version/luồng dữ liệu, thử cách ly. Không cài mọi repo trong Master hoặc token SIWC vào library chỉ vì ghi OpenAI-compatible.

Bốn API-key provider tiếp tục paused. Không mua gói/credits/auto-topup. Existing usage chỉ sử dụng trong hạn mức được phép; không chạy trial lặp không giới hạn.

Phát hành theo cơ chế Galaxy hiện có sau gate, không mở stack tạm thay main. Giữ fallback thủ công/rollback runtime, không silent model fallback. Không làm mất dữ liệu P1-B đã chạy.

Cập nhật trong /home/galaxy_os/prompt:

- E01_IMPLEMENTATION_PLAN.md: ghi task thực đã hoàn thành và phần khác biệt được duyệt.
- GALAXY_AI_PLAN_AND_CHECKPOINT.md: checkpoint mới, không ghi đè r10 mất lịch sử.
- Long-term memory và tool matrix: chỉ quyết định kỹ thuật có nguồn, không nội dung khách hàng.

Báo CODE_SHA, TESTED_TREE, snapshot digest nếu còn dirty, DEPLOYED_ARTIFACT và nguồn kiểm chứng. Không lấy SHA256 snapshot thay Git commit.

Báo trạng thái riêng:
SIWC_MODEL, SIWC_REASONING, SIWC_CONTEXT_PROFILE, SIWC_WEB,
SIWC_TOOLS, ANSWER_QUALITY, WORKSPACE_ENTITLEMENT, WORKSPACE_AUTH,
WORKSPACE_MODEL_CONFIG, WORKSPACE_MODEL_RUNTIME, WORKSPACE_TRIGGER,
RESULT_RECEIVER, WORKSPACE_CHAT_ROUNDTRIP, FILE_ROUNDTRIP,
IMAGE_ROUNDTRIP, MEMORY_RETENTION, SECURITY, REGRESSION, DEPLOYED_RUNTIME.

PASS / FAIL / BLOCKED / NOT_RUN / UNVERIFIED phải có bằng chứng và phạm vi.
Nếu provider không hỗ trợ một capability, báo cụ thể và tiếp tục các phần độc lập.
Không kết thúc bằng “chờ duyệt lại E01” cho phạm vi vừa được chấp thuận.

## 16. TÀI LIỆU CHÍNH THỨC CẦN ĐỌC LẠI TRƯỚC KHI CODE

Ngày kiểm tra cho prompt: 09/10/2026. Tài liệu có thể thay đổi; ưu tiên schema hiện hành và bằng chứng runtime, ghi rõ mâu thuẫn nếu có.

S1 — SIWC models/inference:
https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
S2 — SIWC preview limitations:
https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
S3 — Reasoning (chỉ dùng field sau khi kiểm route/model tương thích):
https://developers.openai.com/api/docs/guides/reasoning
S4 — Workspace authentication:
https://developers.openai.com/workspace-agents/authentication
S5 — Workspace trigger/status:
https://developers.openai.com/workspace-agents/trigger-runs
S6 — Workspace trigger và output destination:
https://developers.openai.com/cookbook/examples/chatgpt/workspace_agents/workspace-agents-api-trigger
S7 — Agent builder, model, tools, plugin, publishing và quyền:
https://help.openai.com/en/articles/20001143-chatgpt-workspace-agents-for-enterprise-and-business
S8 — Usage hiện hành:
https://help.openai.com/en/articles/11481834-chatgpt-rate-card-business-enterpriseedu-credit-based-pricing

Các tên trạng thái/tool ở trên là đề xuất Galaxy, không tự coi là mã lỗi hay API OpenAI có sẵn. Không bịa trường, endpoint, quyền hoặc model ID.

ĐÍCH CUỐI: SIWC không bị giới hạn nhân tạo; Workspace thực hiện đúng agent/model đã cấu hình; câu hỏi nguyên gốc, ngữ cảnh đúng Project và kết quả đầy đủ quay về Galaxy. Chỉ báo hoàn tất khi người dùng sử dụng được trên runtime đã phát hành.

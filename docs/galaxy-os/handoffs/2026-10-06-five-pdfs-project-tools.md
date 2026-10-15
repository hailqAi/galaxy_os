# Năm PDF và công cụ Project-only — code đã kiểm, main chưa phát hành

Chỉ đạo chủ dự án ngày06/10: T0→T6 INLINE, một người ghi source, review độc lập; cho phép checkpoint/commit local theo scope. Giữ unified chat, không mode/approve/synthetic, không tự bật paid/web/media hoặc sửa env.

## Baseline thực

- BASE_HEAD: `32d62a244fce352e29a712bc3b19bfa9c66afab2`.
- DIRTY_TREE/SNAPSHOT receipt SHA256: `50551dc5655c974d4394c81e03938f5bc5140f96969287835af768227e70072f`; không phải Git SHA.
- CHECKPOINT_SHA: `1df19da106a4b563f3692c480a4cf08f0c7112ab`; tree `7172966db5a714845e44e97469440df1d7dae842`.33 paths nguồn cũ,28 code/test/migration byte-equal artifact r3;5 docs mới hơn, đã giữ.
- RUNNING_ARTIFACT: `local-a0429faf5733`, `.runtime/releases/unified-project-chat-20261006-r3`; WebBuildId `yDShl4tt3WFOqtWexrpdl`. Main chưa thay ở T1. LAN dùng `.80:3000`, không dùng `.90`.
- TESTED_TREE T1: dirty UI trên checkpoint; build11 fixture riêng, không ghi snapshot vào TESTED_SHA.

## T1 và kiểm thử

[Manifest năm PDF, ngoại lệ và ảnh đối chiếu](../milestones/M3/ui-figma/FIVE-PDFS-20261006.md). Chín hành trình Chrome fixture cuối build11 PASS (browser15+16); unit27, lint scoped/typecheck/build PASS. Hai lỗi fixture đã phân biệt với product: actor viewer thiếu IAM ai.invoke; ca surface phụ thuộc nguồn được tạo từ test trước. Guard/backend không nới.

Review Astra tìm và đã sửa: chọn lại phiên dùng URL làm nguồn duy nhất, ba native History API calls theo contract Next để đồng bộ router; history ngoài dùng lại transition select để không mang draft/file giữa conversation; chọn AI nằm trong leaveGuard; drawer dùng chung sidebar/center; mobile giữ danh sách room khi thiếu quyền AI. RED→GREEN có log riêng. Font/icon trước nằm ở public bị route protection chặn; chuyển qua cơ chế asset bundled hiện có, không mở auth path. Lint yêu cầu creation object mới khi retry; giữ clientKey/promise/idempotency.

Full test mới ở checkpoint: API1313/1314 (test M2 domain snapshots timeout5000ms), Web564/564, Edge5/5, document chưa chạy do pnpm fail. Test M2 riêng cùng source PASS5581ms với CLI timeout15000; không đổi chuẩn, chưa coi full regression GREEN. T6 phải chạy lại full.

## T2 file/memory — code và fixture, chưa main/vendor mới

DOCX dùng ZIP parser giới hạn đang có của Excel + Saxes đã cài: canonical OPC main part, XML không DTD, UTF-8 nghiêm, giới hạn giải nén32MiB/2048parts, chặn macro/embedded executable. Đọc đoạn/đề mục/bảng; giữ locator ảnh DrawingML/VML nhưng không giả đã đọc nội dung ảnh nhúng. Header/footer/footnote chưa trích, có ghi rõ phạm vi. XLSX giữ sheet/cell/công thức/cached value/định dạng; không tính lại và không đổi giá thiếu thành0.

PDF text vẫn Poppler local; chunks ghi rõ chỉ đọc lớp chữ, chưa đọc nội dung ảnh trong PDF hỗn hợp. PDF hoàn toàn khôngtext render PNG1600px bằng pdftoppm, tối đa3trang đầu/5giây mỗi trang/8MB cả payload, locator/sốtrang thật; dùng capability ảnh đã kiểm chứng, không gửi PDF như MIMEảnh hoặc bật parser/OCR trả phí. Hỏi tiếp nạp lại đúng binary còn quyền từ dependency của hội thoại. Nguồn DOCX/scan đã UNSUPPORTED ở bản cũ được nâng cấp có mục tiêu; giữ source/version/locator lịch sử, không sửa audit/business approval.

RED→GREEN: DOCX upload400→201, ZIP/macro/DTD/OPC/VML, XLSX thiếucached/formula, scan raster, index legacy. Full nhóm AI111/111 gồm36integration/44imports/10native/17OpenRouter/4source PASS (`/tmp/five-pdf-t2-ai-regression2.log`). Ca thiếuprovider được làm độc lập bằng config-path không tồn tại, thay vì bị configbrowser có sẵn chi phối; IAM giữ. Chrome fixture build13 composer DOCX/XLSX/PNG/scan4/4 PASS (`/tmp/five-pdf-browser17.log`), có filechooser event, private binary download byte-equal, nguồn/request, followup khôngupload; Lượt cuối Webbuild15/APIbuild4 Chrome5/5 PASS (`/tmp/five-pdf-browser18.log`), gồm unifiedjourney và picker nguồn scan đã lưu. Regression legacycitationtrang4 RED→GREEN; readable giữ đủlocator, chỉ explicitselection giới hạn3trang. Review Astra khôngcònblocker T2; APItypes/build và Webbuild PASS. Main/vendor cho bốn định dạng mới chưa chạy. Không đánh đồng renderer/mock với model đã đọc ảnh.

## T3 công cụ và web — code/local/mock

OpenRouter tool loop dùng cùng request, tối đa8calls/90giây, timeout từng tool20giây, retry chung2, token/context/media có giới hạn; không planner riêng. Tool arguments strict, không actor/Project/path/SQL. Kiểm quyền nguồn trước retrieval/dispatch/delivery/history; source metadata cũng thành dependency. Decimal80 giữ số tài chính lớn; XLSX đọc vùng tối đa400ô, công thức chỉ cached value, tổng chia theo định dạng và ghi rõ chưa là tổng nghiệp vụ được xác nhận. Business view hiện chỉ kế hoạch Stage2 qua service thật, loại options chứa dữ liệu ngoài Project; trường ngân sách theo quyền, thiếu vẫn null.

Tavily Search có adapter thật nhưng chưa cấu hình: query từ subject công khai quản trị chọn, không nhận văn bản riêng/model query tự do. Đây là giới hạn hiện tại; tìm web tự do chưa triển khai. Public fetch dùng URL literal người dùng/URL kết quả đã kiểm, handle backend cấp; chặn private/loopback/mapped-IP, kiểm mọi DNS answer, pin DNS, redirect kiểm lại ACL/IP, không cookie/auth;10giây/256KiB/MIME giới hạn. Parse5 chỉ đọc chữ, không thực thi script. Nguồn phân biệt SNIPPET/PAGE, URL/title/thời điểm/provider/request thật. Budget web riêng, reservation audit bền vững, receipt charge thiếu/bất thường khóa revision; không coi FREE_ONLY là tool miễn phí. Không sửa env/JSON hoặc bật provider.

Regression nhóm T3 ban đầu160/160 đạt; bổ sung3ca receipt null/[]/JSON hỏng RED→GREEN17web +7runner; integration response null ghi UNKNOWN và chặn lần sau đạt. Chi tiết `/tmp/five-pdf-t3-regression2.log`, `/tmp/five-pdf-web-receipt-{red,green,int}.log`. Astra đã đóng blocker precision, field inheritance, context handles, usage/cost mất khi lỗi, PDF locator race và web egress/receipt. Không claim main/vendor/live web từ mock. OpenAI Responses contract chuyển T5 cùng image/audio để dùng chung đường tích hợp, không bỏ yêu cầu.

Contract kỹ thuật đã kiểm: [OpenRouter tools](https://openrouter.ai/docs/guides/features/tool-calling), [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search). Chọn native public fetch thay Tavily Extract vì đã đủ đọc trang và không phát sinh dịch vụ trả phí thứ hai.

## T4 xuất tài liệu — code/local/Chrome fixture

DOCX dùng JSZip hiện có, OPC/DrawingML chuẩn; XLSX dùng ExcelJS hiện có; PDF bổ sung PDFKit0.20.2 local với font Be Vietnam Pro đã được duyệt trong repo. Không dịch vụ chuyển đổi bên ngoài. Đọc lại PDF bằng Poppler xác nhận tiếng Việt, bảng và trang; DOCX đọc bằng extractor/OPC thật, XLSX mở lại workbook thật. Chưa mở Word desktop để nghiệm thu rendering Word.

Tool create_document/revise_draft tạo FileAsset và source index riêng qua upload/storage hiện có. Attachment gắn conversation và answer gốc; AI_DRAFT, version/checksum, request/tool key, owner/Project, predecessor và diff. Revision tạo asset mới, bản cũ còn nguyên. Download/source/newchat kiểm lại origin answer và mọi dependency/field permission; generic file route chặn cả khi file còn có attachment Project. Lineage path tối đa16, memo thành công chỉ trong transaction; không cache quyền toàn cục. Index không claim artifact khi origin đang chạy; request thất bại/hủy không xuất nguồn như đã hoàn tất.

Giới hạn mỗi request3file, mỗi tài liệu24KB cấu trúc/400ô/3ảnh/20trang PDF, binary8MB; PNG kiểm pixel và giải nén có giới hạn. XLSX đầu ra lưu ô dạng text để giữ Decimal chính xác và chặn formula injection; không giả đã tạo công thức hoặc tính lại Excel. Diff đối chiếu dòng có giữ số lần lặp, giới hạn JSON8KB/100dòng mỗi phía và báo rút gọn; không khẳng định đối chiếu đầy đủ layout/ảnh/nghĩa vụ.

Fresh regression API225/225 và Web29/29 (`/tmp/five-pdf-t4-regression13.log`), thêm ca XLSX kế thừa quyền tài chính rồi revoke download PASS (`/tmp/five-pdf-artifact-finance-livefixture.log`). Chrome fixture3/3 (`/tmp/five-pdf-browser19.log`): composer→tool→binary→card→click download, checksum đúng. Review Astra không còn blocker static; lỗi index race/diff escape RED→GREEN, DAG memo có regression. API/Web build2, typecheck và scoped lint PASS. Full regression/main/vendor chờ T6, không lấy mock thay evidence live.

[PDFKit](https://pdfkit.org/docs/getting_started.html), [DrawingML của Microsoft](https://learn.microsoft.com/en-us/office/open-xml/word/how-to-insert-a-picture-into-a-word-processing-document) là nguồn contract engine. Thẻ file dùng style chip sẵn có, bổ sung state chức năng được brief yêu cầu; không đổi bố cục năm PDF.

## T5 contract OpenAI — disabled, chưa tích hợp paid

Wire codec Responses tái dùng tool schemas T3, function_call/call_id/function_call_output, continuation reasoning mã hóa riêng không đưa UI/log; store:false không được hiểu là không có mọi retention. Image generate/edit dùng endpoint riêng và multipart image[] bytes; WAV/WebM transcript và MP3 speech dùng audio endpoint riêng. Không pin model trả phí mặc định; model phải được quản trị xác minh access/capability/giá khi chọn kết nối. Không thêm env, key, SDK, provider router hoặc nút giả.

Năm mock contract đạt (`/tmp/five-pdf-t5-green4.log`): gate chặn trước network, strict tools, multipart binary, reasoning không thành answer, ảnh gần8MB không tràn stack, MP3 bounded. Đây là codec chuẩn bị, không phải orchestrator paid đã nối. Production không đăng ký media tools; dispatch luôn NEEDS_PROVIDER_CONFIGURATION_OR_BUDGET. Khi được bật còn phải nối reservation/receipt bền vững, current ACL/version, cancel/idempotency và lưu media/transcript vào FileAsset/conversation hiện hữu; các kiểm thử lifecycle đó chưa chạy với OpenAI. Không bật microphone khi chưa có capability; HTTP LAN cần HTTPS nội bộ cho getUserMedia, không dùng insecure flags. Voice/video và ảnh sinh/chỉnh live NOT_RUN.

Nguồn: [Responses function calling](https://developers.openai.com/api/docs/guides/function-calling), [stateless reasoning](https://developers.openai.com/api/docs/guides/migrate-to-responses), [image API](https://developers.openai.com/api/docs/guides/image-generation), [speech to text](https://developers.openai.com/api/docs/guides/speech-to-text), [text to speech](https://developers.openai.com/api/docs/guides/text-to-speech), [data controls](https://developers.openai.com/api/docs/guides/your-data). Không kiểm access tài khoản/chi phí bằng gọi inference trả phí.

## T6 — kiểm thử cuối và cutover chưa hoàn tất

Code T0–T6 đã commit local, CODE_SHA=TESTED_SHA `0738358ed153195a8b68927945875e703eb3ae41`, TESTED_TREE `f51d35d735efd236ce751f18fdb332f5d7e76892`. Full regression mới đạt API1370/Web567/Edge5/document1; lint/typecheck/format/build và59test scripts đạt. Chrome artifact r2 đạt các hành trình file/artifact, private/revoke/late response và popup viewport; có đối chiếu đủ năm PDF. Không gọi pixel-perfect hoặc keyboard thiết bị thật PASS.

**Chưa phát hành bản mới lên main.** Candidate `local-a9b073642935` đã build và đối soát production source; main vẫn `local-a0429faf5733`, localhost/LAN `.80:3000` health tốt. Cutover đầu lỗi template unit từ checkout cũ, rollback thành công. Sau lượt `systemd-analyze --user verify`249, socket private đổi inode; nghi liên quan dựa trên timestamp/inode, chưa tái hiện cô lập; user manager còn chạy nhưng không kết nối điều khiển được. Automatic approval review đã từ chối phục hồi D-Bus tạm vì phạm vi user manager vượt hai service app; đang chờ phê duyệt riêng, chưa thực hiện phục hồi. Không bypass, restart manager hay mở app tạm.

DOCX/PNG/XLSX/scan và xuất DOCX/PDF/XLSX đạt code/local/Chrome fixture; vendor/main mới NOT_RUN do cutover chưa xong. Tavily chưa cấu hình/ngân sách; OpenAI image/audio/Responses chỉ wire codec disabled, lifecycle paid chưa nối. Business tool giới hạn kế hoạch Stage2 và quyền trường, không đọc toàn ERP. Giữ env, schema86, storage/session/Edge và public đóng.

### Bằng chứng và định danh

- CODE_SHA / TESTED_SHA: `0738358ed153195a8b68927945875e703eb3ae41`; TESTED_TREE: `f51d35d735efd236ce751f18fdb332f5d7e76892`.
- Candidate artifact: `.runtime/releases/five-pdfs-project-tools-20261006-r2`, release `local-a9b073642935`, WebBuildId `ZV6DRq7egAZon3Xrl6JKg`. Source snapshot SHA256 `a9b073642935261ebb3604c29789aa29b1d7e583bcef48a191edeab8e3df7142` không phải Git SHA.
- `code-equivalence-r2.json`:831trackedpaths byte-equal. Hai khác biệt chỉ next-env.d.ts do Next build và browser harness mới chạy từ worktree; production source khớp commit. Snapshot base44d9911/dirty giữ đúng, không sửa thành clean giả.
- Full `pnpm test` lần cuối exit0: API1370/Web567/Edge5/document1, `/tmp/five-pdf-t6-full-tests2.log`. Lần trước có4timeout5000ms; chẩn đoán riêng rồi full lại khi build/browser ngừng, không nâng timeout chuẩn. Python có một deprecation warning của Starlette/AnyIO.
- Lint/typecheck/format/build PASS; scripts59PASS (`/tmp/five-pdf-t6-scripts2.log`). API/Web/Edge build artifact r2 PASS (`/tmp/five-pdf-t6-artifact-build2.log`).
- Chrome r2: popup1/1 browser27; browser29 đạt13, ba lỗi harness sau sửa đạt browser30/31. Tổng các hành trình liên quan đều có lượt PASS mới, không giả một lượt16/16. File composer8cases (unified/native picker +DOCX/XLSX/PNG/scan +3artifact download), cùng lifecycle/ACL/private/history/revoke/late200/403. Log `/tmp/five-pdf-browser{27,29,30,31}.log`.
- Root cause popup chiều cao thấp: model controls/history nằm ngoài vùng scroll chiếm phần composer; chuyển đúng hai node vào scroll body chỉ trên popup. RED683×384 sendbottom424; GREEN send/textarea đúng vùng trên6viewport, font16/26 và target44px. Không đổi layout workspace năm PDF.
- Reviewer Astra đã rà policy/ACL/web egress/cost/file/lineage/UX/Ponytail theo từng task. Cutover review phát hiện ownership/rollback/drain đã sửa. Finding đổi runtimeRoot sang canonical đã rút lại sau đọc root entry: **phải giữ old runtimeRoot worktree**, root entry hiện hữu sẽ chuyển tới đó. Không đổi root/controller ngoài phạm vi.

### Sự cố phát hành và bước tiếp tục

Cutover đầu đọc template `/home/galaxy_os/infra` cũ còn `<REPOSITORY_PATH>`, systemd từ chối; script phục hồi units/manifest cũ và readiness đạt. Backup private `rollback-r2` giữ nguyên. Không migration, không sửa credential/policy/Edge. Lần preflight sau dừng trước mutation vì user bus không truy cập được. User manager470 còn chạy và nghe inode cũ; socket private có timestamp đúng lượt verify, đường dẫn trỏ inode mới không listen. API643395/Web643396 cũ vẫn health tốt trên localhost và Chrome LAN; evidence `main-before-release-block.json`. Đây là sự cố bước release, không phải vendor hoặc app regression.

Đã hỏi chủ dự án riêng về phục hồi user manager sau automatic approval rejection. Không tạo unit D-Bus tạm, không thử workaround sau rejection. Kế hoạch reviewer đã rà: ghi PID/READY/hash baseline; tạo cặp socket/service runtime tạm (socket0600, daemon có sẵn); reconnect và xác minh bus owner đúng manager470; gọi Manager.Reexecute, kiểm PID API/Web/Edge không đổi; qua private socket đã hồi phục dừng đúng cặp tạm, xóa đúng file/hash tự tạo rồi reload/kiểm READY. Không restart user hoặc kill app. Kế hoạch này chưa thực thi, còn chờ phê duyệt. Mọi `systemd-analyze --user verify` tiếp theo phải dùng XDG_RUNTIME_DIR riêng, không đụng socket runtime hiện hành. Sau phục hồi: staging lấy template artifact, giữ old runtimeRoot/WorkingDirectory, preflight/ownership/drain/rollback rồi nghiệm thu main. Không đánh dấu T6 complete trước các bước này.

### Capability matrix tại thời điểm bàn giao

| Capability                           | Code/local/mock                                                | Chrome fixture r2                     | Vendor/main mới                          |
| ------------------------------------ | -------------------------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| Năm PDF/state                        | Đã triển khai, đối chiếu5ảnh                                   | Đạt desktop/mobile/reflow             | NOT_RUN release mới                      |
| Project-only/new chat/private/revoke | Đạt DB cô lập, kể cả nguồn artifact/financial                  | Đạt chuyển Project/actor, late200/403 | NOT_RUN mới                              |
| TXT/MD/PDF text                      | Đạt                                                            | Đạt binary/citation/followup          | Bản cũ PDF live đã đạt; bản mới NOT_RUN  |
| DOCX                                 | Paragraph/heading/table, image locator                         | Đạt composer/download                 | NOT_RUN                                  |
| PNG/JPG                              | Binary vision mapping                                          | PNG composer đạt                      | PNG bản cũ API đạt; composer mới NOT_RUN |
| PDF scan                             | Render tối đa3trang đầu, tool page≤10                          | Đạt composer/locator                  | NOT_RUN                                  |
| XLSX                                 | Formula/cached/sheet/cell, không recalc                        | Đạt composer                          | NOT_RUN                                  |
| Search web                           | Tavily adapter/credit/query guard mock                         | Không giả tìm web                     | NEEDS_PROVIDER_CONFIGURATION_OR_BUDGET   |
| Public URL fetch                     | SSRF/DNS/redirect/MIME/bounds tests đạt                        | UI trạng thái/citation có contract    | NOT_RUN main                             |
| Calculate/business                   | Decimal; chỉ Stage2 kế hoạch theo quyền trường                 | Contract/fixture                      | NOT_RUN main                             |
| DOCX/PDF/XLSX output/revision        | Binary thật/local render/readback, lineage/revoke              | 3file card/download đạt               | NOT_RUN                                  |
| OpenAI Responses/image/audio         | 5mock wire codec, production disabled; paid lifecycle chưa nối | Không nút giả/mic tự ghi              | NEEDS_PROVIDER_CONFIGURATION_OR_BUDGET   |

### Giới hạn chưa khép

Chưa main Chrome/vendor trên release mới, chưa physical mobile keyboard/native browser zoom200/Word desktop. Search hiện chỉ subject công khai quản trị chọn, chưa query web tự do. DOCX image chỉ locator; header/footer/footnote chưa đọc. PDF hỗn hợp mặc định lớp chữ, đọc ảnh theo trang chỉ định; scan không đọc toàn corpus. XLSX output text cells bảo toàn Decimal, không formula engine. Business chưa aggregate toàn bộ nghiệp vụ. OpenAI wire codec chưa thành production lifecycle; không gọi “ChatGPT parity”.

Chỉ khi chủ dự án chọn kết nối mới cần cấu hình quản trị API tương ứng và ngân sách: Tavily cho search; OpenAI cho Responses/image/audio. Không yêu cầu nhập lại OpenRouter, không thêm env/key, không trả phí tự động. Tất cả blocker tách riêng khỏi phần code/local đã đạt.

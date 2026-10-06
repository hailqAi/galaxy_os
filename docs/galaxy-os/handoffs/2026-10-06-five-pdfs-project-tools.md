# Năm PDF và công cụ Project-only — bàn giao đang triển khai

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

## Phần tiếp tục, chưa làm xong

T5 OpenAI Responses/image/audio contracts theo capability; T6 full regression, review và local release/main live. T2 code/fixture như trên; composer vendor/main và PDF hỗn hợp còn chờ nghiệm thu/đọc trang theo công cụ. Web/OpenAI/Tavily/image/audio paid không có cấu hình/ngân sách được bật; live tương ứng NEEDS_PROVIDER_CONFIGURATION_OR_BUDGET, không chặn các task local.

Không sửa credential, database/storage/session/Edge/keeper, không bật public hoặc paid. Không coi fixture/mock hoặc screenshot là vendor/main PASS.

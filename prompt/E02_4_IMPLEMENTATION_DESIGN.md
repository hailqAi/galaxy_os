# E02-4 — Workbook v2 và native PPTX, design r1

OWNER_APPROVED theo chỉ đạo 2026-10-10T05:28:19.856206+00:00: “Duyệt hết mọi thiết kế. xong chức năng tôi sẽ design lại toàn bộ giao diện”. Chỉ phạm vi chức năng E02; không quyền phát hành nghiệp vụ/gửi ngoài/tài chính. Thiết kế reviewable, không hỏi lại gate kỹ thuật; thực hiện sau release E02-3.

## Hiện trạng và gap

Canonical m2-a-20260928: documentInput/create_document/revise_draft/renderDocument đã tạo DOCX/PDF/XLSX DRAFT qua File/Artifact/P1 có nguồn/quyền/hash/version/download. XLSX v1 một sheet, tất cả cells là text/no formula, giữ tương thích. PPTX chưa có renderer/executor, không READY. ExcelJS/JSZip/Decimal và Sharp đã installed; không engine mới cho workbook/ảnh.

## Workbook version2

Mở contract có version rõ cho structured workbook: sheets có tên duy nhất hợp lệ, cells/ranges bounded, text và Decimal-number phân biệt; ảnh tham chiếu sourceId đã kiểm quyền/hash. Không tự chuyển mã/leadingzero thành số. Numeric cells chỉ nhận số biểu diễn an toàn ở độ chính xác Excel; giá trị cần hơn15 chữ số giữ text và báo rõ. Format tiền/đơn vị do input có schema, không suy đoán.

Formula chỉ có operations/refs trong allowlist tính toán hiện hữu, tạo biểu thức Excel từ dữ liệu có schema; không nhận arbitrary formula, DDE, external links, macro hoặc URL/path. Evaluator Decimal có bounded dependencies, phát hiện cycle/unknown reference/divide-zero, tính cached result thật; đọc lại workbook và đối chiếu formula+cache+precision trước storage. Không ghi công thức rồi claim đã tính. Legacy v1 contract/tests giữ nguyên.

## PPTX editable

Giữ tool names/create/revise/storage/ACL/job vòng SIWC hiện hữu. PPTX structured versioned slides, template master/theme (font/colors/header/footer/layout), native text/shapes/tables/charts, ảnh sourceId. Giới hạn slide/object/text/cell/bytes; text overflow có kiểm tra bounds và render lại. Native OOXML objects chỉnh sửa được; không deck toàn ảnh. DRAFT luôn rõ.

Ưu tiên reusable OfficeCLI validator/render nếu sandbox/pixel/layout proof đạt. PPT Master chỉ chọn workflow template/layout/native-edit và validation, không import skill engine/hooks/platform/auth. Gap native generator thử upstream gitbrent/PptxGenJS v4.0.1 MIT, signed release3c9ec1b; chưa SELECT/READY cho đến pin full commit/package integrity/dependency/license/outbound/sandbox proof. Adapter chỉ cấp bytes ảnh nguồn; cấm media path/URL/links/code từ model (upstream có filesystem/https loading khi path được cấp). Không raw token/model SDK.

Không giả rằng generator có thể import arbitrary customer PPTX. Template master có schema là đường đầu tiên; giữ original khi revise, provenance + source version pin và expected version/CAS đúng contract existing Draft. Import/edit existing uploaded native deck cần validate preserved objects/template hoặc capability-specific NOT_READY; không rasterize rồi báo native.

## An toàn và nghiệm thu

Reuse current mutable-source/actor/Project checks trước đọc/render/storage/final/download và idempotent per-call keys. Không approved/signed source overwrite, không tự phát hành/gửi ngoài. Render worker input read-only/output per-job/network off/resource caps, no repo/.env/auth mounts; không shell tùy ý. Rollback additive contract: v1 old calls vẫn accepted, original artifacts không xóa.

TDD: v1 unchanged; numeric/text/leadingzeros/multisheet/formula cache/dependencies/precision/injection; PPT editable shapes/text/image/chart/master native XML; render overflow/no external refs; revise/version/stale expected version/idempotent/no overwrite; actual chat tool→storage→preview/download→reload/ACL. Focused/full/Ponytail/correctness/security/UX/frozen/deployed proofs tách riêng. A11/A12/A15-write chưa PASS cho tới chạy thật.

Upstream nguồn: [PptxGenJS release](https://github.com/gitbrent/PptxGenJS/releases/tag/v4.0.1), [manifest](https://raw.githubusercontent.com/gitbrent/PptxGenJS/v4.0.1/package.json), [media loader](https://raw.githubusercontent.com/gitbrent/PptxGenJS/v4.0.1/src/gen-media.ts), [PPT Master optional dependencies](https://raw.githubusercontent.com/hugohe3/ppt-master/main/skills/ppt-master/requirements.txt). No install thực hiện trong design này.

Delta r2 (owner blanket approved): reuse existing Project-private file download ACL for on-demand preview, no preview database/domain model. A bounded hash-pinned OfficeCLI clean/no-network worker validates generated PPT and renders HTML; safe preview uses sandbox/CSP, never raw active HTML on application origin. Generic FilesService intentionally excludes chat-private attachments; add Project preview route through same authorization and recheck before return. Asset/readiness/source binary limits required before tool advertises PPTX. Source pure generation tests alone are not runtime READY. Word/PDF default native DRAFT header and page-number footer satisfy requested headers/footers without new model configuration.

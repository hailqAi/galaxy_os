# E04 — CP91: đã tạm dừng theo yêu cầu người dùng

Thời điểm: 2026-10-12T03:38:15.917623+00:00. Không tiếp tục code, kiểm thử, gọi model hoặc phát hành khi chưa có yêu cầu tiếp tục. Không dừng dịch vụ Galaxy hay hủy job của người dùng. Bridge CDP WSL và TLS fixture tạm không còn process/listener tại 33005/33003 lúc chốt checkpoint.

## Runtime đã phát hành và sản phẩm thật

- Main runtime: **R40 / local-a3f58e989d9f**, release `.runtime/releases/e03-context-20261011-functional-r40`, schema 94 không đổi.
- Source digest: `a3f58e989d9f31ab2ac6119859de9248cf24cfad66ebfa4dbf54854c9f1081b9`.
- TESTED_TREE: `7a74e87509598a80102dc6f6f3e6993db81eaa50`; Web build `fcAg2pe-tNdLKCvVuax7q`.
- Chính ca PDF / Answer `5cecbe18-b907-4c93-9066-911314992718` đã **COMPLETED** trên R40; original question, attachment và một XLSX còn sau reload. Không tạo trùng answer hoặc workbook.
- Artifact `8135de48-90ec-497e-9522-da2dd5e738ef`: 22.320 byte; SHA256 `07d92bd8a927c700bab1f2886fbe5d3db134ea729d076600775c3d5dc0ce0268`.
- [XLSX nháp đã kiểm](/home/galaxy_os/.runtime/e03-20261011/e04-owner-xlsx-r40-8135de48-90ec-497e-9522-da2dd5e738ef.xlsx): 80 dòng bảng chữ, 320 phép đối chiếu số; tên/mã/đơn vị/tiền tệ/tổng và công thức được kiểm độc lập. Đây là bản bảng chữ; ảnh, thông tin chỉ nằm trong ảnh và nhãn kích thước chưa được chuyển, workbook có ghi phạm vi thiếu.
- R40: full checks 2.573 PASS + 1 skip, browser 29 PASS. Năm bài khôi phục process dùng provider SYNTHETIC được ghi riêng, không thay bằng chứng Owner live.

## Nguyên nhân ca cũ và code đã sửa

Lượt gốc dùng câu hỏi Create tổng quát, không pin source; 13 calls là một search rỗng, mười lần đọc trang chữ và hai lần đọc ảnh. Deadline cũ năm phút kết thúc trước `create_document`: chưa có XLSX được tạo. Citation 22 entries không phải 22 calls; workbook tồn kho và bounded fixtures chỉ discovered, không được đọc trong 13 calls này. Câu hỏi trước preset chưa lưu không thể khôi phục và vẫn UNKNOWN.

R38 đã pin đúng file, tái sử dụng extraction và lưu XLSX, nhưng vướng trần nội bộ 10 provider rounds. R40 đã bỏ trần tổng 10 rounds/40 tools, giữ journal bền vững, chống loop không tiến triển và chống replay ghi; resume đúng answer tiếp tục và giao được cùng artifact. Công việc mới không còn deadline tổng cố định 30 phút; timeout từng thao tác và giới hạn vận hành vẫn giữ. Upload/count caps cũ chưa gỡ hết.

Ca XLSX thực giữ `gpt-6.1-sol/high`; không đổi sang Astra. Trace R40 cuối có bốn request SIWC mới đúng model/effort; hai tool lỗi có thể khôi phục được lưu, arguments cần audit tiếp khi resume.

## R41 — đã code, chưa phát hành

Source đang làm thật: `/home/galaxy_os/.worktrees/m2-a-20260928`; HEAD `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e` không đại diện dirty tree.

Đã thêm preference model/effort theo actor/organization trong SystemSetting hiện hữu, backend xác minh connection Owner và catalog, UI giữ lựa chọn đã lưu và không âm thầm thay model không khả dụng. Bảy file source/test đã chụp riêng vào private evidence `e04-paused-cp91-r41-source/snapshot.json`.

- Web focused: **43 PASS** (`e04-astra-web-green-r41-r1.log`).
- API focused: **5 PASS / 1 FAIL** (`e04-astra-settings-green-r41-r2.log`). Test native-image evidence hiện nhận UNVERIFIED; nguyên nhân chưa chẩn đoán. Không gọi là PASS hoặc quy cho sandbox khi chưa có bằng chứng.
- Full workspace typecheck: **PASS** (`e04-astra-typecheck-r41-r1.log`).
- R41 full regression/lint/build/browser/review/release: **NOT_RUN**. Chưa ghi preference Astra/MAX thực cho Owner; runtime/default hiện tại chưa đổi.

Astra/MAX đã có một lượt Owner SIWC live riêng, provider-observed `gpt-6-astra/max`, trả 42 cho 17+25. Lượt nhỏ không chứng minh toàn bộ context capacity. Ultra/x1.5/service tier và SIWC context capacity vẫn UNKNOWN. Owner đã có đủ 300 permissions; không thay role/grant, không cấp Owner cho actor khác.

## Chưa hoàn tất và bước tiếp tục

1. Chẩn đoán test native-image đang fail, review R41 và chạy gate đầy đủ trước phát hành; sau đó cấu hình preference Owner bằng endpoint hợp lệ và kiểm browser/request thực.
2. Gỡ đầy đủ upload/file-count caps ứng dụng cũ; hoàn thiện pause/resume, chờ quota/auth, multifile manifests và progress từ events.
3. Hoàn thiện batch conversion/ảnh khi bắt buộc, provenance fixture mặc định, citations USED, tools/web còn thiếu, R4 memory/team và toàn bộ A01–A36/B01–B26/T01–T14.

Không reset/clean/stash/commit/push, không đổi DB/OAuth/ACL, Workspace vẫn OFF và provider API-key paused giữ nguyên. Diff, artifacts, logs và checkpoints hiện có được bảo toàn. CP90 và lịch sử trước vẫn giữ nguyên dưới checkpoint này.

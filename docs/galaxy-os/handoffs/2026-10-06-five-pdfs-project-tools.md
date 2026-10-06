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

## Phần tiếp tục, chưa làm xong

T2 file/memory; T3 tool loop/web/Decimal/business views; T4 artifact DOCX/PDF/XLSX; T5 image/audio contracts theo capability; T6 full regression, review và local release/main live. DOCX/PDFscan chưa triển khai trong T1; PNG/XLSX composer vendor mới chưa chạy. Web/OpenAI/Tavily/image/audio paid không có cấu hình/ngân sách được bật; live tương ứng NEEDS_PROVIDER_CONFIGURATION_OR_BUDGET, không chặn các task local.

Không sửa credential, database/storage/session/Edge/keeper, không bật public hoặc paid. Không coi fixture/mock hoặc screenshot là vendor/main PASS.

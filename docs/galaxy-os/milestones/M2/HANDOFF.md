# M2 — Bàn giao trước gate phê duyệt

Ngày 2026-09-28, bắt đầu quan sát 04:55:44+07:00. START_SHA `0fea6cc53db41c6520fda942c3bf412c35ab3dbb`, tree `a7648137465aa44b711d62e89fb46403ae6ea9cd`; workspace `/home/galaxy_os`, branch `g00/build-test-isolation-20260914`. M0/M1 không thực hiện lại.

## Kết quả hiện tại

- M2_STATUS: AWAITING_OWNER_DECISIONS. Đã đối chiếu B1–B5, chưa có quyền code theo gate hiện hành.
- [DECISIONS](DECISIONS.md): giữ nguyên văn B1–B5, nguồn, phần đã giải quyết bởi chỉ đạo mới và phần cần quyết định. B1 TECHNICAL_PROPOSAL, B2–B5 còn NEEDS_OWNER_DECISION; một số rào an toàn con RESOLVED_BY_EXISTING_DECISION.
- [DESIGN](DESIGN.md): bản cập nhật để review cùng M1, không merge G02, prerequisite tối thiểu có review, 24 ca/hai tenant, đề xuất recipe test cô lập. DESIGN_APPROVAL_STATUS: NOT_APPROVED.
- PLAN_APPROVAL_STATUS: NOT_CREATED_AWAITING_DESIGN_APPROVAL; chưa tạo PLAN rỗng hoặc coi TASK1–5 của prompt là kế hoạch đã được duyệt. Chưa chọn phương thức thực thi.
- IMPLEMENTATION_GATE: BLOCKED_APPROVAL. Không source/config/schema/test/migration mới; không worktree triển khai, test stack, fixture/tài khoản hoặc UI demo.
- bwrap lookup1, Docker binary có; không cài hoặc lặp sudo. Test environment chưa tạo vì gate, không phải đã thử dựng rồi thất bại. Executor vẫn đọc và kiểm docs được.
- Không kiểm lại runtime; RUNTIME_VERSION_UNVERIFIED giữ nguyên. MAIN_RUNTIME_CHANGED: NO. PUSH_MERGE_DEPLOY: NOT_PERFORMED.

## File lượt này

Tạo bốn file: `docs/galaxy-os/milestones/M2/DECISIONS.md`, `DESIGN.md`, `VERIFICATION.md`, `HANDOFF.md`.

Cập nhật có mục tiêu: [PROJECT_STATUS](../../../../PROJECT_STATUS.md), [STATUS](../../05-IMPLEMENTATION-STATUS.md), [READ-FIRST](../../00-READ-FIRST.md) chỉ bỏ câu phạm vi M0 lỗi thời và dẫn scope theo STATUS/chỉ đạo hiện hành. Không đổi charter, acceptance gốc, M1 reports, AGENTS/bootstrap hoặc `.git` hướng dẫn/guard. Không tạo canonical trùng.

## Kiểm tra

Lệnh/Git/môi trường và giới hạn ở [VERIFICATION](VERIFICATION.md). App tests M2:0 chạy; 24 ca NOT_RUN, không tuyên bố unit/integration/browser PASS. Kiểm tài liệu bằng Node `fs`/`assert`: PASS, exit0, bảy file/82 đích liên kết tồn tại; B1–B5 khớp nguyên văn M1; 24 ca NOT_RUN; fixture tenant thứ hai có Project/room/file/actor; chưa có PLAN và chỉ một bootstrap. Prettier scoped và `git diff --check` đạt. Không generated application output hoặc cache test mới vì chưa chạy app test.

Review độc lập correctness/security/evidence và Ponytail đã hoàn tất cho docs. Đã sửa thiếu fixture đối chứng O2 và làm rõ phạm vi logic idempotency khác khóa unique vật lý; reviewer kiểm lại không còn phát hiện ở hai điểm này. Review không phê duyệt thay chủ dự án, không chứng minh sản phẩm chạy đúng. Privacy scan không tìm credential pattern; rà nội dung chỉ có nguồn code, hash, recipe và dữ liệu fixture đề nghị, không hồ sơ khách thật.

G02 dirty `apps/web/next-env.d.ts` giữ nguyên, hash đầu lượt `9edff1c7cacb3bfac9a1eadcf6f51eaa99565e38`. Workspace chính sạch trước lượt; index không có thay đổi người dùng. DOCS_COMMIT_SHA lấy từ Git sau commit và trả ở phản hồi, không self-reference trong docs.

## Tiếp tục

Chủ dự án đọc bảng lựa chọn cuối DECISIONS và DESIGN. Cần trả lời B2 lịch sử/nháp, B3 Project đã có hay gồm Lead-only, B4 thẩm quyền cấp/thu hồi/hạn/ủy quyền, B5 người kiểm/phát hành/nguồn/quyền file khách; B1 phương án prerequisite được review, không cho phép merge/cherry-pick. Không cần hỏi lại các nguyên tắc đã xác lập hoặc upload nguồn.

Ghi câu trả lời và nguồn trước khi cập nhật approval. Sau các quyết định, trình written spec đúng phiên bản; chỉ khi được duyệt mới invoke writing-plans, lập PLAN exact source paths/interfaces/assertions/commands, review plan/chọn phương thức. Sau gate mới tạo worktree/test stack được kiểm riêng và bắt đầu TDD TASK1–5. Các bước này chưa được thực hiện hoặc ngầm phê duyệt bởi commit docs.

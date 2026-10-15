# Chat AI thống nhất theo Project — 06/10/2026

## Quyết định và thiết kế đã được chủ dự án phê duyệt

Nguồn: chỉ đạo trực tiếp trong phiên 06/10/2026, “GALAXY OS — ĐƠN GIẢN HÓA AI THÀNH CHAT THEO DỰ ÁN”. OWNER_APPROVED_CURRENT_PROMPT; thực thi INLINE. Không tạo chữ ký hay gán quyết định này cho actor ứng dụng.

Mở Project → Galaxy AI → nhập câu hỏi/chọn tệp → Gửi. Bỏ mode GENERAL/PROJECT, duyệt/thu hồi từng câu và checkbox synthetic khỏi mọi màn chat. Request mới dùng orchestration server thống nhất; enum và audit lịch sử được giữ. Policy OpenRouter mới chỉ áp dụng organization Galaxy được xác minh ở runtime, actor có ai.invoke và quyền Project/nguồn. Không dùng approvedInputs/approvedSources như điều kiện pilot chung, không giả synthetic/public. Restriction và revocation độc lập vẫn chặn. Giữ FREE_ONLY, privacy vendor, provider đã bật và credential canonical.

Tái sử dụng ProjectAiService, FileAsset/storage, conversation, index và dependency/citation. Index mở rộng cho file riêng theo owner/Project, không cần room giả. Upload multipart thật, idempotent, nguồn riêng tìm lại được trong chat mới cùng Project. Generic file/search không được làm lộ nguồn AI riêng. Retrieval tự động trên nguồn có quyền toàn Project; nhóm là trọng tâm, không là kho riêng. File chọn và dependency hội thoại được ưu tiên, có giới hạn thật. Lỗi retrieval khác với không tìm được nguồn; câu thông thường vẫn được xử lý. Dữ liệu nguồn không là system instruction.

TXT/MD đọc text, PDF text dùng parser local và locator trang, ảnh dùng bytes đã kiểm quyền. PDF scan chỉ dùng đường render/vision nếu sẵn có và đã kiểm; định dạng chưa đọc được báo tại chip, không giả thành READY. DOCX/XLSX chỉ nhận là hỗ trợ nếu extractor thật và kiểm thử đạt. Gửi khi đang tải/đọc giữ đúng một lượt chờ; lỗi giữ nháp và chip, retry không nhân binary/request.

Giữ popup560/1100, chữ16/26, P04, nháp RAM, session, model pinning và idempotency. Policy/index/source được kiểm lại trước dispatch, delivery và mở lịch sử. Không AI write nghiệp vụ. Release artifact/systemd hiện hữu, không env mới, không provider mới, không public domain.

## Kế hoạch thực thi

Thực thi bằng superpowers:executing-plans và test-driven-development; một writer source, một controller Chrome/service, Astra high review chỉ đọc.

- [x] T1: `ai-registry.ts`, `ai-provider.ts`, `project-ai.service.ts`, `project-chat.dto.ts`, `project-ai.tsx`: RED→GREEN policy tenant cụ thể, câu mới không approval/mode, giữ denial tenant/source/paid; bỏ control thật và contract cũ khỏi request mới.
- [x] T2: `project-ai.service.ts`, `ai-source.ts`: retrieval tự động cả Project theo quyền, history/dependency/citation và nguồn rỗng/lỗi; kiểm hai Project, hai owner, revoked source và injection trên DB cô lập.
- [x] T3: schema/migration additive, `files.service.ts`, controller AI, extractor local và composer: RED→GREEN upload owner/Project/version/idempotency, input file LAN, trạng thái/wait/retry, PDF text/ảnh. Không sửa migration đã áp dụng.
- [x] T4: targeted API/Web, full lint/typecheck/test/build/format; Chrome fixture và review Ponytail/correctness/security/IAM/UX. Không chạy test phá dữ liệu trên main.
- [x] T5: backup/diễn tập migration nếu cần; build artifact, phát hành local, kiểm Chrome localhost/LAN và một conversation/file “Kiểm chứng AI” trong Project đang chọn, vendor thật, citation/download đúng bytes; cập nhật STATUS/PROJECT_STATUS/handoff bằng bằng chứng.

Lệnh kiểm: `pnpm --filter @galaxy/api test -- src/project-chat/ai-registry.test.ts src/project-chat/ai-openrouter.test.ts`; `pnpm --filter @galaxy/web test -- features/project-chat/project-ai.test.tsx`; toàn bộ `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`. DB/browser dùng recipe cô lập hiện hữu sau khi đọc bootstrap.

## Trọng điểm review

- Đổi Project/actor khi request upload/answer đến muộn không đưa nội dung sang nơi mới.
- Nguồn private không lộ qua generic file list/search/download hoặc cache lịch sử.
- Retry cùng key nhưng khác bytes/version/question phải conflict; lỗi link không upload lại bytes đã lưu.
- Không tìm được nguồn, index lỗi và PDF scan/password phải có kết quả khác nhau.
- Policy revision/ai.invoke/source revoke giữa dispatch và delivery phải fail closed; không paid/privacy fallback.

## Sổ tiến độ

- Baseline đọc thực: worktree m2-a-20260928 sạch, HEAD32d62a2; runtime local-d3fd75b21ffe/code6ffd636, schema84, API/Web READY. Chưa đổi runtime.
- Root cause source: nút hiện chỉ gọi cập nhật/chọn index, không input file/upload; index bắt buộc room và adapter OpenRouter không truyền sources. Chrome qua bridge33005 hoạt động; MCP Chrome không tìm thấy executable. LAN192.168.1.90 chưa kết nối được từ executor, chưa kết luận IP runtime.
- Ruling: dùng phê duyệt/INLINE rõ trong prompt làm authority thực thi, không hỏi lại các control đã yêu cầu bỏ. Không commit/push/merge vì chưa có chỉ đạo commit cụ thể trong lượt này; ghi tested tree/diff riêng.

## Kết quả bàn giao

Luồng chính đã phát hành local và live: [handoff06/10](../../handoffs/2026-10-06-unified-project-ai.md). T2 đạt retrieval/memory/isolation đã nêu trong kế hoạch; chưa có aggregate nghiệp vụ đầy đủ. T3: TXT/MD/PDFtext/XLSX extractor, ảnh vendor capability thật; DOCX/scan chưa hỗ trợ, upload ảnh main chưa nghiệm thu. T4 đạt full regression run7 API1314/Web564/Edge5/document1; giữ lại bằng chứng timeout M2 ở các lượt trước, không đổi timeout/test chuẩn. T5 release cuối local-a0429faf5733, schema86, cùng localhost/LAN. Các dòng baseline trong sổ tiến độ là lịch sử trước sửa.

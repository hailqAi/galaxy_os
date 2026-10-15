# E01 — nghiệm thu AI thật qua cổng test 33002

> **SUPERSEDED_NOT_ACTIVATED:** owner sau đó chỉ định dự án thật/cổng chính. Không đổi proxy33002 theo packet này; main candidate3000/3001 đang được nghiệm thu tại E01-CP-r5. Nội dung dưới giữ phương án đã trình làm lịch sử.

**ID/version:** E01-TEST-PORT-r1 / r1. **Loại:** PROPOSED_ENVIRONMENT_CHANGE. **Ngày:** 2026-10-09, Asia/Bangkok. **Trạng thái:** PREPARED_NOT_ACTIVATED; cần owner xác nhận đúng phần đổi môi trường này. Không thay spec/plan P1 hoặc E01 đã trình.

## Hiện trạng đã kiểm

- Owner đã đăng nhập test33002; kiểm browser thực lúc 19:52+07:00: `/api/v1/me`200. Blocker login test ở E01-CP-r3 đã được giải quyết.
- Tổ chức test trả SIWC `AUTH_NOT_STARTED`, `canTestOwnerInference=false`, catalog model rỗng; catalog AI ba Project kiểm trả404. Đối chiếu source và truy vấn DB chỉ đọc trong phiên: có `ai.invoke` cấp hệ thống, không có Project grant `INVOKE`, không có SystemSetting SIWC của tổ chức đó. Không sửa grant hoặc credential để vượt gate.
- Test API33001/Web33002 phục vụ candidate `local-e1067f575058`, WebBuild `PeRhFeBSg96j0HTN_HY69`. API đang preload provider synthetic và chặn egress; không thể nghiệm thu OpenAI thật bằng tuyến này.
- Main API3001/Web3000 vẫn P1-A `local-62edbe7afe76`, schema88; SIWC owner hiện hữu được bảo toàn. Browser hiện kiểm main `/me401`; cần owner đăng nhập Galaxy main hợp lệ sau khi đổi tuyến. Không gửi secret trong cuộc trò chuyện.

## Thay đổi tối thiểu đã chuẩn bị

Chỉ restart tiến trình **Web test33002 do phiên này khởi động**, từ cùng candidate/build đã kiểm. Dùng private Web env mới với `INTERNAL_API_URL=http://127.0.0.1:3001/api/v1`, tên cookie session theo main và marker candidate. Các biến khác giữ bằng fixture Web env. API main tự xác thực session/actor/Project/visibility và model; không tạo session thay owner.

Private packet đã chuẩn bị ngoài Git: `/home/galaxy_os/.runtime/e01-20261009/native-acceptance-web.env` (0600), `native-acceptance-prepared.json`. Runner tối thiểu dùng Next.js đã cài và config build: `/tmp/galaxy-e01-20261009/start-native-test-web.cjs`; kiểm cố định backend3001, production, dev-auth=false và release marker trước listen127.0.0.1:33002. Không cài package mới.

Không khởi động API/worker thứ hai trên DB main. Không đổi service/env/credential/OAuth/callback/refresh/permission main; không public/domain cutover. Test API33001 tiếp tục cách ly để regression fixture.

## Phạm vi ghi dữ liệu và bằng chứng

Sau owner xác nhận đổi tuyến và đăng nhập Galaxy main hợp lệ: dùng quyền Project hiện hữu, tạo riêng hội thoại nghiệm thu với câu hỏi tổng hợp, không đưa hồ sơ khách hàng vào thử. Giữ model composer chọn và câu hỏi nguyên byte; kiểm provider completion/model evidence thực nếu có, kết quả đầy đủ, lưu đúng Project/conversation và reload. Chỉ gửi test trong phạm vi quyền backend cấp. Không tự cấp thêm quyền.

Web33002 mới + API main P1-A là **hai artifact khác nhau**. Phép thử này chứng minh native SIWC text và delta frontend giữ nguyên câu hỏi; không chứng minh P1-B memory/history API, toàn bộ T1 E01 hoặc Workspace round-trip. `observedModel` chỉ có giá trị khi provider trả bằng chứng; thiếu bằng chứng thì null/UNVERIFIED. Không dùng nội dung AI tự nhận model.

Hội thoại/kết quả nghiệm thu được lưu thật trong DB main qua API hiện có và có thể phát sinh usage SIWC; không mua credits hoặc đổi gói. Không xóa dữ liệu sau test để giả rollback; audit/history giữ.

## Kích hoạt, kiểm và rollback

1. Kiểm lại main READY/schema88, release/build candidate và không có thay đổi đồng thời ở private env.
2. Khi đúng delta được owner xác nhận, dừng **chỉ** exec session Web test33002 của phiên này; chạy runner với private native Web env. Kiểm health33002 marker candidate, readiness main marker P1-A và session có quyền thật.
3. Owner đăng nhập Galaxy main tại cổng33002 khi cần; không thao tác SIWC OAuth hoặc token.
4. Nghiệm thu bằng browser hiện hữu; ghi evidence đã lọc vào checkpoint `/prompt`, giữ raw receipts riêng ngoài Git.
5. Nếu không đạt hoặc kết thúc native test: dừng chỉ Web test này và chạy lại `start-test-candidate-web.cjs` với fixture-web.env để trả33002 về API33001. Kiểm health/ready và session fixture cũ. Main dịch vụ/schema/credential không bị đổi bởi rollback này; chat test đã ghi vẫn giữ.

## Quyết định còn thiếu

Owner xác nhận có cho phép **chỉ Web test33002 dùng API main3001 để nghiệm thu native SIWC text**, cùng phạm vi ghi hội thoại tổng hợp vào main nêu trên. Đây là thay đổi môi trường test riêng, không yêu cầu duyệt lại E01/P1/CLI/model/context. Plan E01 r1 pending review vẫn được ghi riêng; không dùng kết quả thử này thay approval hoặc live Workspace.

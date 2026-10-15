# Ổ C và WSL — tiếp tục ngày 15/10/2026

Đây là checkpoint chuẩn bị an toàn, chưa phải bằng chứng đã compact.

- Đo Windows API lúc 2026-10-15T02:09:48Z: C còn 80924078080 bytes (~75,37 GiB); VHDX thực cấp phát 226077179904 bytes (~210,55 GiB), không sparse. Linux used ~67,71 GiB. Owner đã giải phóng thêm C; không quy toàn bộ mức tăng đó cho cleanup Linux.
- Cache build/dependency của R32/R33 v2 đã nghỉ: bốn đường dẫn cụ thể, 2241216512 bytes (~2,09 GiB) theo manifest riêng. Không xóa source/metadata/bằng chứng. Không cộng số này vào C reclaim.
- Retention hiện bảo vệ active R41, rollback v3 R39, candidate R42. Guard giữ tối đa ba release có build/dependency và yêu cầu C>=20 GiB trước đóng gói. Không xóa DB/Redis/uploads/AI artifacts/outbox/subscriptions/backup để vượt guard.
- VHDX đúng: `C:\Users\Admin\AppData\Local\wsl\{a3d59df2-b5da-4c10-b499-8acac4303f79}\ext4.vhdx`, distro `Ubuntu-22.04`.
- Windows Administrator trong phiên hiện tại: không có; sudo Linux cũng yêu cầu owner nhập tại terminal. Không yêu cầu credential qua chat.

Quy trình mới đã sẵn tại `C:\Users\Admin\GalaxyOS-Maintenance-20261015-R41\README.txt` và `compact-galaxy.ps1`, đọc được khi Ubuntu đã tắt. Helper Linux: `/home/galaxy_os/.runtime/storage-cleanup-20261015-r41/pause-for-compact.py`. Nó chỉ nhận R41 `local-69a93613bb87`, schema98/v3 và đúng metadata, container IDs/volumes hiện tại. Bốn mock test, audit read-only runtime READY, Windows PowerShell parser PASS. Đây không thay bằng chứng pause/resume/compact thật.

Thứ tự: hoàn tất Git push theo yêu cầu owner → mở PowerShell Administrator và kiểm tra cmdlets → đóng build/install/WSL client và Docker Desktop → owner chạy pause trong Ubuntu → chỉ khi PAUSED_FOR_OFFLINE_COMPACT mới chạy compact trên Windows → mở Ubuntu và chạy resume, yêu cầu RESUMED_PUBLIC_VERIFIED. Compact có downtime tạm thời; giữ nguyên dữ liệu và phải kiểm chứng lại dịch vụ. Nếu đã activate R42 hoặc release khác, helper R41 sẽ từ chối; chuẩn bị lại pin theo runtime thật, không đổi fingerprint để vượt guard.

Không chạy helper R32 cũ, không zero-fill, resize, sao chép VHDX sang C, xóa volume hoặc reset/restore DB. Không tự shutdown WSL từ phiên Codex. Exact commands và đường dẫn đã có trong README Windows. R42 có thể activate sau khi resume R41 đã PASS.

Đối chiếu tài liệu Microsoft: [Optimize-VHD](https://learn.microsoft.com/en-us/powershell/module/hyper-v/optimize-vhd) yêu cầu disk offline hoặc read-only; kết quả compact có thể không giảm kích thước. [WSL disk space](https://learn.microsoft.com/en-us/windows/wsl/disk-space) phân biệt dung lượng ảo trong Linux và dung lượng host. Chỉ báo C đã thu hồi sau khi đọc receipt before/after Windows thực.

# Ổ C và WSL — ngày 15/10/2026, SSH push và chuẩn bị offline compact

## Source đã bảo toàn trên GitHub

SSH push thực thành công lúc 2026-10-15T04:02:31Z. Nhánh `m2/project-chat-20260928`, repo `git@github.com:hailqAi/galaxy_os.git`, code commit `f9943b920ff1b6bb51581aac078f343cefd8ca20`; `ls-remote` khớp local SHA. Codex ban đầu thiếu `SSH_AUTH_SOCK` của SSH agent owner vừa mở, không phải cần đăng nhập GitHub lại. Không force-push, merge hoặc xóa worktree. Checkpoint cập nhật sau commit code được commit riêng, không thay code đã kiểm thử.

## Dọn Linux đã thực hiện

- Trước đó: bốn cache build/dependency của R32/R33 v2 đã nghỉ, 2241216512 bytes (~2,09 GiB), giữ source/metadata/bằng chứng.
- Đợt này: năm đường dẫn cache chính xác dưới `.runtime/e05-mcp-20261012/candidate-source` (root/apps node_modules và Web .next). Có dry-run, inode/device/mount/path guards; không có process/FD/map/config/dependency đang dùng; source/patches/lock/venv/dist giữ nguyên. Filesystem used giảm đúng 1040125952 bytes (~0,969 GiB) trong pha apply; net toàn đợt có sai số log/metadata nhỏ, không cộng máy móc du.
- `pnpm10.33.4 store prune` chạy đúng store v10 khi không có install/build; kết quả0files/0packages. Giữ store3,2GiB, không xóa ép dependency đang dùng.
- Active R41/v3 rollback R39/candidate R42 được pin. Guard tối đa3 release có build/dependency và C>=20GiB trước đóng gói vẫn nguyên. Không xóa DB/Redis/uploads/AI artifacts/queue/outbox/subscription/backup/source.
- Actual app history sau cleanup: job `02915ea0-5b94-4119-8f19-cef6450af48f` vẫn COMPLETED, đúng1message/1699UTF8bytes/2artifact. API/Web/Edge active; không replay job hoặc restart dịch vụ.

## Backup dữ liệu ứng dụng nằm ngoài C/VHDX

`D:\GalaxyOS-Backups\R41-20261015T040912Z` (Linux `/mnt/d/GalaxyOS-Backups/R41-20261015T040912Z`). D ban đầu còn22,23GiB; không đặt thêm bản sao dữ liệu lớn lên C. Thư mục có NTFS ACL riêng chỉ owner/SYSTEM/Administrators.

- PostgreSQL logical dump schema98:3015369bytes. `pg_restore --list` và xuất SQL đọc được; không restore lên production, không tuyên bố đã thử khôi phục toàn bộ DB.
- All132 Files hiện hành, tar1127249920bytes; toàn bộ hash gốc/archive khớp và storage không đổi trong backup.
- Manifest và API/Web/Edge config/unit thực R41 được giữ trong backup riêng có quyền; không đưa secret hoặc DB/files lên Git.
- Backup catalog, checksums và đường dẫn nằm trong `backup.json`; lệnh Windows kiểm tra lại toàn bộ hash trước khi pause.

## Trạng thái Windows và lệnh owner

VHDX đúng: `C:\Users\Admin\AppData\Local\wsl\{a3d59df2-b5da-4c10-b499-8acac4303f79}\ext4.vhdx`; distro `Ubuntu-22.04`. Phép đo Windows API trước compact: physical allocation226077179904bytes (~210,55GiB), không sparse; C còn khoảng75GiB. Linux free khác physical C reclaim. **Chưa pause/compact/shutdown**; chưa báo đã thu hồi C.

Owner đã xác nhận mở Windows PowerShell Administrator, đủ `Get-VHD/Mount-VHD/Optimize-VHD/Dismount-VHD`. Trong cửa sổ đó, sau khi đóng build/install/WSL client khác và Docker Desktop, chạy:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Admin\GalaxyOS-Maintenance-20261015-R41\run-offline-compact.ps1"
```

Giữ cửa sổ mở. Script xác minh Administrator, cmdlet, checksum script và backup D trước khi pause. Các bước hiện hữu: drain/chặn nhận việc mới → flush/dừng cùng DB/Redis và API/Web/Edge → fstrim → xác minh pause thật → terminate riêng Ubuntu → compact VHDX offline/read-only → dismount → resume cùng runtime/data và kiểm tra public trong finally. Mật khẩu sudo Linux nhập tại terminal, không qua chat; có thể hỏi lại sau Ubuntu restart. WSL tắt sẽ ngắt Codex; script chạy từ Windows tiếp tục độc lập. Không chạy Codex dưới root.

Chỉ báo xong khi có `RESUMED_PUBLIC_VERIFIED` và `OFFLINE_COMPACT_AND_GALAXY_RESUME_PASSED`. Receipt Windows before/after thật mới xác định bytes C/VHDX thu hồi. Final preflight: Mailpit restart=no sẽ không tự trở lại sau WSL; helper đã bổ sung vào cùng vòng pause/start/identity check. RED2newfail→GREEN6helpertests; actualaudit3containersREADY; reviewr2SHIP. PostgreSQL/Redis vẫn bắt buộc volume. HelperSHA `7278b39c1c6eccee86d987f8039de5b87fc52fa076c523cd131676b3d5df5742`. Latest scripts/review được lưu thêm trên D dưới maintenance-scripts.

Syntax và bốn mock flow (success/pausefail/compactfail/resumefail) đã PASS. Review độc lập SHIP_FOR_OWNER_OFFLINE_MAINTENANCE, không blocker; đã đối chiếu Windows copies,13backup hashes và132file. Entry SHA256 `e83c4760ec515ebe6fab74f99976121ff434498bb32e12d4597722d11343aadb`. Đây không thay phép thử offline thật.

Nếu resume lỗi, giữ receipt và mở Ubuntu bằng hailq_glx:

```bash
sudo -v
/usr/bin/python3 /home/galaxy_os/.runtime/storage-cleanup-20261015-r41/pause-for-compact.py resume
```

Không tự restore/reset DB để xử lý lỗi resume. Không chạy helper R32 cũ. Helper mới chỉ nhận R41 `local-69a93613bb87`/schema98/v3; sau khi activate R42/release khác phải chuẩn bị lại pin, không sửa fingerprint để vượt guard. R42 chưa active; có thể triển khai sau compact/resume/public R41 đã PASS.

[Windows README](/mnt/c/Users/Admin/GalaxyOS-Maintenance-20261015-R41/README.txt) giữ cả quy trình chi tiết và phục hồi thủ công. Evidence `.runtime/storage-cleanup-20261015-r41`: initial-candidate-cache.json, pnpm-prune-result.json, off-c-backup-target.json, app-data-after-cache-cleanup.json, entry-tests.json, maintenance-review-r2.json; push receipt `.runtime/e05-reviewpatch-20261015/git-source-push-ssh.json`.

Microsoft: [Optimize-VHD](https://learn.microsoft.com/en-us/powershell/module/hyper-v/optimize-vhd) yêu cầu disk offline hoặc read-only và không bảo đảm giảm một lượng cụ thể; [WSL disk space](https://learn.microsoft.com/en-us/windows/wsl/disk-space) phân biệt capacity Linux và host disk. Không zero-fill, resize, export toàn distro, copy VHDX lên C hoặc xóa data volumes.

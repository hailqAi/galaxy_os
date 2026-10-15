# E05 R42 — bản vá preview và bàn giao source

Cập nhật 2026-10-15T02:12:34.367248+00:00. R41 `local-69a93613bb87` vẫn đang phục vụ API/Web/Edge, schema98, `mcp-data-v3`. R42 đã đóng gói, chưa kích hoạt.

Owner xác nhận “Thấy đủ, reload vẫn còn” tại thread nghiệm thu R41 `1daf50a2-db44-4769-95d6-c60d0c25e711`, job `02915ea0-5b94-4119-8f19-cef6450af48f`. Work thật đã trả câu trả lời tổng583.200VND cùng XLSX5244B và PDF48061B; receipts AVAILABLE trước COMPLETED. Các bằng chứng R41 không thay thế việc kiểm chứng public R42.

Bản vá tiếp theo sửa preview XLSX Work dùng XML có tiền tố x:. Giữ nguyên bytes, checksum, giới hạn archive/shared-string/cell/row; bỏ bước parse ảnh khi HTML không có ảnh. Bốn file: imports.service.ts, imports.test.ts, ai-office-preview.ts, ai-office-preview.test.ts. Không đổi schema, dependency, quyền hoặc protocol. Đã tái hiện RED và kiểm tra122ca tập trung; actual compiled R42 preview chính hai file Work PASS, giữ nguyên biên nhận và nội dung đã lưu.

Gates: lint/typecheck/format/build PASS; Python95PASS (gồm deployment17), browser1PASS (chat chính/reload), native API restart/checkpoint/dedup1PASS. Regression2756PASS+1SKIP là tổ hợp có provenance: full source ban đầu exit1 với MCP15s timeout và Sprint1 callback-env mismatch; thay trọn hai module bằng85PASS chạy lại trên đúng candidate, cùng978input ứng dụng/test/config khớp. Log lỗi ban đầu giữ nguyên; không tăng timeout hoặc báo đây là một lần pnpm test toàn xanh. Independent source/evidence review không có finding; final stage review được lưu riêng.

Release: `local-7fa0526a9d23`. SourceSHA `7fa0526a9d238521438f46a1547fa289c4891040cbc6711505bb79811f0a7095`. PackageSHA `284fc4f91bfd51df02bce5c4d4f3c6636003d64bf82c5b629ef5dd11dfcbacdb`. MetadataSHA `d23a9cd3121b087df860fd5523d26528a9b0f1e5ce19f584f59fc037b7f52642`. Tree `1277d75a44359eb74dc1617623b96cb79187d729`. PlanSHA `a9d92f5140943466967a209092facc58106725d0f7b6207fad197a56d6f6507d`.

Chỉ kích hoạt sau khi hoàn tất thao tác offline compact nếu dùng helper R41 bên dưới. Lệnh owner (terminal Galaxy, user hailq_glx):

```bash
/usr/bin/python3 /home/galaxy_os/.runtime/releases/galaxy-os-mcp-e05-20261015-r42/scripts/deploy-mcp-release.py activate --plan /home/galaxy_os/.runtime/e05-reviewpatch-20261015/runtime-stage-r42/plan.json --authenticate-sudo
```

sudo-n hiện yêu cầu mật khẩu, nên chưa có cutover. Rollback chỉ về snapshot R41 v3 của chính session activation mới, giữ DB/files hiện tại; không dùng R32/v2 hoặc restore DB. Nếu cần manual rollback, dùng action rollback với đúng --session mà activation in ra, cùng plan R42 trên. Script có journal/rollback khi chuyển lỗi.

User đã cho phép commit/push đầy đủ source. Remote origin git@github.com:hailqAi/galaxy_os.git, branch m2/project-chat-20260928. SSH mặc định và key có sẵn đều bị Permission denied(publickey); gh chưa đăng nhập. Owner cần gh auth login --hostname github.com --git-protocol https --web rồi gh auth setup-git --hostname github.com. Không gửi token/password/mã đăng nhập trong chat. Git publication chỉ gồm source/migrations/tests/docs/prompt; cấu hình bí mật, runtime package, DB và uploads được giữ ở máy Galaxy.

Ổ C thật tại02:09:48Z còn80924078080B≈75,37GiB; VHDX physical allocation226077179904B≈210,55GiB, chưa sparse; Linux dùng72703676416B≈67,71GiB. Đã dọn4cache v2 cụ thể2241216512B≈2,09GiB Linux; không cộng vào số thu hồi C. Active R41/rollback R39/candidate R42 được pin, source/metadata cũ giữ nguyên. Không xóa DB/uploads/artifact/backup. Offline compact cần Windows Administrator và dừng ghi VHD; phiên hiện tại không có quyền Windows Admin. Helper mới chỉ dùng cho R41 tại .runtime/storage-cleanup-20261015-r41;4test và read-only auditPASS; không chạy helper R32 cũ. Nếu đã kích hoạt R42, helper R41 sẽ từ chối và phải chuẩn bị lại đúng release. Chưa pause/compact hoặc tự shutdown WSL.

Evidence chính: .runtime/e05-reviewpatch-20261015/release-r42-frozen.json, regression-resolved-r42.json, review-source-r42.json, preview-real-bytes-r42.json, browser-r42-acceptance.json, recovery-r42.json, runtime-stage-r42/plan.json; .runtime/storage-cleanup-20261015-r41/windows-before.json và runtime-audit.json. Chưa xác minh public R42 hoặc preview mới trên public. Model/reasoning để sau phạm vi này.

# Đề nghị bảo trì control plane — chưa thực hiện

**REVIEW_BLOCKED — chưa đủ điều kiện xin duyệt thực thi.** Review độc lập phát hiện bước restart trước barrier ngăn request mới có thể đua với write đang chạy, trong khi manager có TimeoutStopSec5s. Inventory/jobs0 chỉ là ảnh chụp, không chứng minh đã drain upload/finalize/cleanup và mọi request. Không chạy kế hoạch bên dưới; đây là bản nháp phải hoàn thiện ingress barrier, drain/abort/reopen và executor ngoài manager trước khi xin duyệt. API có shutdown hooks nhưng chưa có active-request counter; không suy từ đó rằng restart hiện tại an toàn.

## Bản chuẩn bị để review

- CODE_SHA `9a02b4cdfadccc4810362931625247bdbd2625ac`; TESTED_SHA `232c4f703abf712cc5d772ffc344d35716902552`, TESTED_TREE `d3bd974189faa24b176eb230c074573e926da7fe`. Delta chỉ tách test, không đổi production code.
- Candidate `/home/galaxy_os/.runtime/releases/chatgpt-plan-20261008-r1`, release `local-63652e4cc6d8`, build API/Web/Edge đạt. Đối soát toàn bộ tracked code với commit đạt; dirty snapshot chỉ gồm tài liệu chưa commit. Không dùng candidate cũ làm bản mới.
- Private env/staged units/manifest: `/home/galaxy_os/.runtime/chatgpt-plan-20261008/`. API chỉ đổi release marker và thêm `GALAXY_AI_EXECUTION_POLICY=CHATGPT_PLAN_ONLY`; Web chỉ đổi marker. Secret giữ nguyên, env0600 ngoài artifact.
- Template lấy từ artifact; `systemd-analyze --user verify` đạt trong XDG_RUNTIME_DIR tạm đã xóa. PID470/inode/mtime socket manager thực không đổi. Candidate fingerprint và schema86 đạt; không migration.
- Lint/typecheck/format, Python runtime64, focused API18/Web17, Chrome2 trên exact candidate đạt. Full regression API1386/Web568/Edge5/document1 PASS. Test baseline timeout đã tách7pha giữ nguyên assertion/timeout, được review; không còn là blocker regression.
- Chưa cài unit, đổi manifest active, sửa/restart bus/user manager hoặc cutover.

## Thao tác cần phê duyệt riêng

Đề xuất **một lần** `sudo systemctl restart user@1000.service` thông qua system manager của WSL Ubuntu-22.04. Không chạy trước khi người dùng chấp thuận rõ thao tác này. Không tạo D-Bus riêng, thay socket, cặp unit tạm hoặc tự thử lại cách phục hồi cũ.

Mục đích: systemd tạo lại manager và socket private qua cơ chế unit hiện hữu. Dấu hiệu đã xác minh là manager470 còn sống nhưng pathname socket private không nối được; `/run/user/1000/bus` và user `dbus.service/socket` không tồn tại. Không kết luận riêng việc thiếu D-Bus là nguyên nhân. Restart chưa được thử và chưa bảo đảm thành công.

Phạm vi: toàn bộ user manager UID1000. Inventory lúc kiểm thấy API643395/Web643396 và manager/sd-pam; các socket user mặc định như GPG/dirmngr/pk-debconf vẫn thuộc phạm vi có thể bị ảnh hưởng. Không chỉ hai app Galaxy. API/Web sẽ gián đoạn; unit manager hiện có TimeoutStopSec5s, nên phải kiểm không có request/job đang ghi trước maintenance. Edge thuộc system service ngoài manager, giữ nguyên. Không restart WSL, Windows, Codex, Docker/DB, sửa PAM hoặc linger.

## Trình tự sau khi được chấp thuận

1. Kiểm lại UID, distro, unit/PID/cgroup, listener, request/job đang chạy, marker localhost/LAN, inode socket; hủy maintenance nếu inventory thay đổi hoặc chưa xác nhận các write đã drain. Lưu hashes/backup mới của active manifest và đúng hai unit, không dùng backup cũ nếu có thay đổi mới hơn.
2. Giữ manifest/unit cũ trong lúc restart manager. Thực hiện đúng lệnh trên một lần; xác minh control plane kết nối lại được đúng UID và release cũ trở về READY. Nếu không phục hồi, dừng và báo lỗi; không tự tạo bus/socket hoặc chạy app thay main.
3. Chỉ khi manager khỏe: lock runtime hiện hữu, kiểm candidate fingerprint/schema/env delta/owner, kiểm active AI jobs0, dừng ingress Web rồi drain API trước khi dừng API. Cài đúng hai unit đã stage, atomic replace manifest bằng candidate; `systemctl --user daemon-reload`; khởi động đúng API/Web qua cơ chế runtime.
4. Readiness phải cùng marker `local-63652e4cc6d8`, database connected, exact PID/cgroup/command/artifact; kiểm localhost và LAN hiện tại. Chrome main cần session Galaxy có quyền để nghiệm thu UI; không lấy credential từ browser/Codex. Kiểm nguồn/file/task và policy không có model API-key khả dụng. Chưa gọi ChatGPT khi registration/grant chưa có.
5. Lưu receipt, identity/hash, kết quả, duy trì policy pause. Không gọi phát hành hoàn tất nếu bất kỳ acceptance bắt buộc chưa đạt.

## Rollback ứng dụng

Backup chuẩn bị: `/home/galaxy_os/.runtime/chatgpt-plan-20261008/rollback-prepared/` gồm `local-runtime.json`, `galaxy-os-api.service`, `galaxy-os-web.service`; artifact cũ và env vẫn nguyên vẹn. Trước khi ghi phải đối chiếu với backup mới tại thời điểm maintenance.

Nếu candidate lỗi sau cutover: xác minh owner/PID của candidate, dừng đúng Web/API của Galaxy; phục hồi hai unit và atomic replace manifest từ backup được xác nhận; daemon-reload/start đúng hai service; kiểm old release `local-a0429faf5733` localhost/LAN. Không rollback DB vì schema không đổi; không khôi phục provider JSON trước pause. Giữ credential/storage/Edge và receipt.

Restart manager không có rollback để khôi phục trạng thái process trong RAM. Nếu control plane vẫn hỏng thì rollback file không khởi động lại được app; phải dừng tại đó và xin phương án bảo trì tiếp theo, không chạy workaround. Đây là rủi ro riêng cần người dùng chấp thuận.

Automatic approval review ở phiên trước đã từ chối phục hồi D-Bus tạm vì tác động vượt hai service và cleanup chưa rõ; xem [handoff06/10](2026-10-06-five-pdfs-project-tools.md). Bản đề nghị này không phải quyền thực hiện và không xóa rejection đó.

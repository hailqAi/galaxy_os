# Phục hồi control plane — đề nghị phê duyệt riêng, chưa thực hiện

**Chỉ nhánh INSPECT_ONLY đã chạy.** Không tạo bus, gửi signal, reexec/restart manager hoặc đổi service/main. Phương án restart `user@1000.service` trước đó bị review bác vì thiếu barrier/drain; không thực hiện phương án đó. Đề nghị dưới đây quay lại đúng phạm vi phục hồi D-Bus tạm từng bị automatic approval review từ chối, chỉ được thực hiện sau chấp thuận rõ ràng của người dùng và approval môi trường. Không coi cách triển khai này là ngoại lệ hoặc đường vòng cho rejection.

**READONLY_REVIEW_PASSED / USER_APPROVAL_PENDING / MUTATION_NOT_RUN.** Reviewer không còn blocker để trình đúng đề nghị này; review không cấp quyền thực thi.

## Artifact và bằng chứng đã chuẩn bị

- CODE_SHA=TESTED_SHA `e9a15df26903e806fc14dd23fd291a146756a273`; TESTED_TREE `8e46baf0677838a1de02a65e460bfbd09b3a0afd`. Candidate mới gồm sửa Task atomic; không đổi script/config phục hồi đã review.
- Candidate `/home/galaxy_os/.runtime/releases/chatgpt-plan-20261008-r2`, marker `local-773c89f14d04`, clean-source. API/Web/Edge build, code comparison, schema86, staged units và isolated-XDG validator đạt; hashes sau Chrome giữ nguyên.
- Full regression API1387/Web568/Edge5/document1; lint/type/format/build PASS. Chrome exact candidate7test PASS_FIXTURE; không phải toàn bộ5PDF/main/live.64script cùng source runtime không đổi đã PASS.
- Private env `candidate-r2-env/`, units/manifest `staged-r2/`, rollback/receipt tại `/home/galaxy_os/.runtime/chatgpt-plan-20261008/`. API chỉ đổi release marker và thêm CHATGPT_PLAN_ONLY; Web chỉ đổi marker. Chưa cài unit hoặc đổi active manifest. Các artifact/evidence r1 vẫn giữ.
- INSPECT_ONLY mới xác minh UID1000, manager470, API643395/Web643396, Edge308598; executor ngoài user manager. Main vẫn `local-a0429faf5733`. `/run/user/1000/bus` không tồn tại, pathname private socket không nối được. Nguồn gốc socket hỏng chưa chứng minh.

## Thao tác đề nghị

Script có thể review: `/home/galaxy_os/.runtime/chatgpt-plan-20261008/recover-user-manager.py`; cấu hình `/home/galaxy_os/.runtime/chatgpt-plan-20261008/recovery-bus.conf`. Nhánh mặc định chỉ đọc. Lệnh sau **chưa được phép chạy**:

```sh
python3 /home/galaxy_os/.runtime/chatgpt-plan-20261008/recover-user-manager.py --execute-approved
```

`--execute-approved` chỉ là guard thao tác, không tự cấp quyền. Phạm vi là **toàn bộ manager của UID1000**, vượt hai service Galaxy; có rủi ro ảnh hưởng các client đang dùng manager. Không yêu cầu restart app/WSL/Windows/Codex, cài package, thay PAM/linger hoặc sửa unit hệ thống.

1. Kiểm lại owner/directory, manager PID/exe/cgroup, executor ngoài subtree, bus chưa tồn tại, exact process/health/fingerprint của API/Web và Edge. Giữ lock runtime hiện hữu; kiểm active manifest không đổi và app identities chưa đổi. Nếu khác baseline, dừng trước mutation.
2. Khởi động đúng một child `/usr/bin/dbus-daemon --nofork --nopidfile --nosyslog --config-file=<file đã review>` tại địa chỉ session bus hiện còn trống. Config chỉ EXTERNAL/UID1000, không service directories/autoactivation; socket0600. Không tạo hoặc thay bất kỳ unit/socket hiện hữu nào.
3. Dùng pidfd đã pin gửi đúng `SIGUSR1` tới manager đã xác minh để yêu cầu reconnect theo contract systemd249. Kiểm D-Bus name `org.freedesktop.systemd1` thuộc đúng manager PID rồi gọi đúng `Manager.Reexecute` một lần. Không gọi Stop/Restart/Exit hoặc dùng signal có nghĩa exit với user manager.
4. Kiểm pathname private socket bằng AF_UNIX + SO_PEERCRED đúng PID/UID; sau đó kiểm unit state. `systemctl --user` riêng lẻ có thể fallback qua session bus ở249 nên không được coi là đủ bằng chứng. API/Web/Edge phải giữ PID/startTicks/cwd/exe/cgroup và health.
5. Receipt0600 atomic được ghi trước mutation, sau khi có child PID/start identity và socket inode/UID, trước khi gửi signal tới manager. Policy có quyền trả lời method_return/error được yêu cầu, không nhập session config bên ngoài. SIGTERM/SIGHUP/SIGINT ở executor được chuyển thành exception để chạy cleanup; trong cleanup bỏ qua lặp lại các signal đó. Terminate/wait đúng child bus; nếu nó không thoát trong10s, kill chỉ child đó rồi wait5s. Chỉ unlink socket khi inode/UID còn khớp và không là symlink. Không xóa socket/process không thuộc operation; không có unit tạm. Lỗi operation và lỗi cleanup đều ghi receipt; chỉ finalize RECOVERY_READY sau kiểm cuối.
6. Sau cleanup phải chứng minh bus path không còn, private socket đúng peer và control plane READY khi bus tạm đã mất; main vẫn release/PID cũ. Nếu không đạt thì báo FAILED/cleanup chưa đủ, dừng; không tự restart manager/app, tạo bus khác hay cutover.

Mỗi lệnh con giới hạn10s (busctl5s); mỗi bước chờ15s cộng thời gian tối đa một probe. File log mở exclusive để không lặp operation vô tình; không tự retry reexec. Python/XML đã parse và nhánh INSPECT_ONLY đã chạy; **nhánh mutation chưa chạy và không có bằng chứng live recovery**.

Nguồn đối chiếu phiên bản249: [private socket và reexec FD lifecycle](https://raw.githubusercontent.com/systemd/systemd/v249/src/core/dbus.c), [systemctl user/private fallback](https://raw.githubusercontent.com/systemd/systemd/v249/src/shared/bus-util.c); man systemd249 trên máy xác nhận SIGUSR1 reconnect. Đây là căn cứ kỹ thuật cho đề nghị, không bảo đảm phục hồi thành công hay thay quyền người dùng.

## Giới hạn và rollback

Không thể rollback trạng thái RAM của manager nếu reexec thất bại. Script không đổi DB/storage/active manifest/units/provider config, không cố dừng app; cleanup chỉ tài nguyên bus tự tạo. Nếu manager vẫn không điều khiển được hoặc app identity/health đổi, lưu receipt và dừng để owner quyết định bước tiếp. Không che khả năng vẫn cần maintenance có downtime.

SIGKILL, executor/host crash hoặc filesystem không ghi được có thể ngăn cleanup/receipt cuối; không bảo đảm ngược lại. Nếu gặp trường hợp đó, không chạy lại recovery: đọc receipt gần nhất, so boot ID, child PID/startTicks/UID/exe/command và socket inode/UID với hiện trạng. Chỉ sau đối soát mới cleanup đúng daemon qua pidfd (SIGTERM, chờ10s; SIGKILL chỉ đúng daemon đó nếu cần), rồi unlink socket còn đúng inode/UID, và kiểm main/private control. Nếu thiếu identity vì chết giữa spawn và ghi receipt, boot ID đổi, hoặc bất cứ identity nào lệch: dừng và xin review riêng; không đoán PID hoặc xóa `/run/user/1000/bus`. Không có automatic re-entry; command mặc định vẫn chỉ inspect và execute từ chối khi đã có receipt cũ.

Sau khi recovery riêng đạt, **cutover là bước kế tiếp**, không nằm trong script này. Cần kiểm/drain qua control plane đã khỏe trước dừng đúng Web/API, kiểm candidate, install đúng2unit và atomic manifest swap; thất bại thì phục hồi app qua backup mới. Backup đã chuẩn bị `rollback-prepared/local-runtime.json`, `galaxy-os-api.service`, `galaxy-os-web.service`; phải đối chiếu/refresh nếu main thay đổi. Artifact/env cũ giữ nguyên, rollback không khôi phục provider JSON trước pause và không rollback DB schema.

Automatic approval review ở phiên trước đã từ chối phục hồi D-Bus tạm vì tác động vượt hai service và cleanup chưa rõ; [handoff06/10](2026-10-06-five-pdfs-project-tools.md). Cần chấp thuận riêng đúng thao tác/phạm vi trên; không dùng yêu cầu triển khai chung làm approval.

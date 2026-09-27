# M1 — Nền code và runtime

Quan sát bắt đầu 2026-09-28T04:20:57+07:00 (Asia/Bangkok). Phạm vi: khảo sát, kiểm tra chọn lọc và thiết kế; không sửa ứng dụng. Yêu cầu đang có hiệu lực là prompt M1 trong phiên này, không phải prompt M0 được lưu làm nguồn lịch sử.

## Kết luận để quyết định

- **M1_AUDIT_STATUS: COMPLETE** trong phạm vi khảo sát được giao, bao gồm việc xác định rõ các kiểm thử không đủ điều kiện chạy. Không có nghĩa code/runtime đã đạt.
- Baseline khảo sát là workspace chính `g00/build-test-isolation-20260914` tại `0cbf986300fafe687b3c83c328adf14eff6eb66b`. Có nền nghiệp vụ/file/IAM để dùng lại; không nên xây hệ thống khác.
- Đề nghị nền lập trình kế tiếp là **nền hiện hữu sau một gói tích hợp G01/G02 được giao riêng và kiểm chứng**, không bắt đầu chat khách trên G00 chưa có các sửa P0. G02 đã chứa G01, không cần áp hai lần. Chưa chọn/đổi nhánh lập trình hay hợp nhất trong M1.
- Bản [thiết kế M2](04-M2-DESIGN-DRAFT.md) đã đủ để duyệt phạm vi, nhưng **NEEDS_DECISION / IMPLEMENTATION_READINESS: BLOCKED** bởi các quyết định bắt buộc và nền bảo mật chưa tích hợp. Không dùng thiếu sudo để giải thích các blocker nghiệp vụ này.
- Runtime Web/API: **NOT_RUNNING_OBSERVED** trong phạm vi host/container đã xem. Edge đang chạy từ workspace chính nhưng **RUNTIME_VERSION_UNVERIFIED**: không có căn cứ gắn build/process với commit/tree. Không khởi động lại dịch vụ.

## Git — REPO_OBSERVED

| Thuộc tính                      | Giá trị                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Root/cwd                        | `/home/galaxy_os`                                                                                                         |
| Branch                          | `g00/build-test-isolation-20260914`                                                                                       |
| HEAD đầu M1 = M0 người dùng báo | `0cbf986300fafe687b3c83c328adf14eff6eb66b`                                                                                |
| Tree đầu M1 / cây kiểm thử mới  | `ff757f307d42091f519d44680253ada4b87ace51`                                                                                |
| Subtree API                     | `f01f788f752a4c9c59d734ccd548c1706b62d1d3`                                                                                |
| Subtree Web                     | `d6ff3cabed0d2972b1945d01d8460b93e4306321`                                                                                |
| Subtree Document AI             | `98f2409f2090e3bd50c91dd3b1aa1bb3ad4aa6d5`                                                                                |
| Đầu phiên                       | Sạch; không staged/unstaged/untracked                                                                                     |
| Git operation markers           | Không thấy MERGE_HEAD, CHERRY_PICK_HEAD, REVERT_HEAD, rebase-merge, rebase-apply, index.lock trong `.git` workspace chính |
| M0 ancestry                     | Commit có thật và chính là HEAD; không checkout/reset                                                                     |

| Worktree đã xác định                     | HEAD                                       | Trạng thái                                                                                                           |
| ---------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `/home/galaxy_os`                        | `0cbf986`                                  | Baseline khảo sát, sạch trước M1                                                                                     |
| `/tmp/galaxy-core-audit-20260914-120217` | `e42390c` detached                         | Đầu mối audit; không sửa                                                                                             |
| `/tmp/galaxy-os-g01-20260914-162913`     | `adf1cb59081e80d4c6a41a817233a79dae6efa3a` | Sạch, nhánh G01                                                                                                      |
| `/tmp/galaxy-os-g02-20260915-142744`     | `e4cc3adb555cec72c8c433eb65aa1fd8946aa4f0` | Nhánh G02; giữ nguyên `apps/web/next-env.d.ts` 1 thêm/1 bỏ, blob nội dung `9edff1c7cacb3bfac9a1eadcf6f51eaa99565e38` |

`git merge-base HEAD <G01/G02>` đều trả `73fe7e8f6c3e3c7b20257857a48f1f173f186144`. Kiểm ancestor G01/G02→HEAD trả exit 1; G01 tip→G02 tip trả exit 0. Diff thực tế vẫn có search/audit/contracts và IAM/task/lead/user/role khác nhau, không chỉ dựa vào tên nhánh. Từ `73fe7e8` tới HEAD chỉ có AGENTS/PROJECT_STATUS/docs: commit M0 không tích hợp các bản sửa ứng dụng.

Từ test HEAD G02 `15168f4b51549d7feccc9db3478c05345928ff65` tới tip `e4cc3ad` chỉ đổi năm file tài liệu; từ baseline close-out `adbe798d7ca5bd2fa4342846d38feade760bb72c` tới tip chỉ đổi ba file tài liệu. Điều này bảo toàn quan hệ source/test đã báo, **không** biến kết quả lịch sử thành lần test mới hay chứng minh runtime. Thay đổi chưa commit của G02 vẫn tách riêng.

## Source / test / baseline / runtime không gộp

| Hạng mục                                 | Có source                                               | Bằng chứng test                                                   | Trong baseline khảo sát                                 | Trong runtime                      | Nguồn                                                                                   |
| ---------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| G00                                      | Có                                                      | Lịch sử PARTIAL: 1085/1086, riêng Sprint1 18/18                   | Có                                                      | Web/API không quan sát đang chạy   | [Report G00](../../../project-system/G00_BUILD_AND_ISOLATED_TEST_HANDOFF_2026-09-14.md) |
| G01 search/audit/payment replay          | Có ở nhánh riêng                                        | Report 1097/1097 tại `9e4bd03`; không chạy lại                    | Không; diff thực còn khác                               | UNKNOWN                            | `adf1cb5:docs/project-system/G01_P0_SECURITY_AND_IDEMPOTENCY_HANDOFF_2026-09-14.md`     |
| G02 binding/target/delegation/last-admin | Có ở nhánh riêng                                        | Report targeted32/32; overall PARTIAL                             | Không                                                   | UNKNOWN                            | `e4cc3ad:docs/project-system/G02_R2_TECHNICAL_VERIFICATION_HANDOFF_2026-09-16.md`       |
| G02 close-out                            | Không phải gói app mới                                  | 1134/1134 lịch sử nhưng PASS_TESTS_REJECTED_ENTRY_CONTROL         | Chỉ đọc report riêng                                    | UNKNOWN                            | `e4cc3ad:docs/project-system/G02_CLOSEOUT_G03_ENTRY_HANDOFF_2026-09-16.md`              |
| File/Upload                              | Có                                                      | M1: 40 file tests + 4 upload tests + 2 Web tests đạt, phạm vi hẹp | Có                                                      | Không kiểm API/storage end-to-end  | [Verification](03-VERIFICATION.md), [reuse map](02-REUSE-MAP.md)                        |
| Auth / notification                      | Có                                                      | M1: 2 auth + 3 notification tests đạt; không bao phủ các gap mới  | Có                                                      | Không xác minh session thật        | Verification                                                                            |
| Guard môi trường test                    | Có                                                      | M1: 14/14 đạt                                                     | Có                                                      | Không chứng minh sandbox toàn diện | Verification                                                                            |
| Comments/Task/Project/Commercial         | Có                                                      | Test source tồn tại; không chạy lại trong M1                      | Có                                                      | UNKNOWN                            | Reuse map có đường dẫn                                                                  |
| Chat room/message theo brief             | Chưa tìm thấy trong API/Web/schema được khảo sát        | M2 NOT_RUN                                                        | Chưa có model/flow tương ứng được quan sát              | UNKNOWN                            | Reuse map E                                                                             |
| Document AI / memory khách hàng          | Chỉ health/ready placeholder                            | Không chạy test AI trong M1                                       | Placeholder có; không có runtime memory được chứng minh | UNKNOWN                            | [main.py](../../../../services/document-ai/app/main.py)                                 |
| G03–G09                                  | G03 inventory có trong close-out; không audit rộng thêm | UNKNOWN                                                           | UNKNOWN                                                 | UNKNOWN                            | Không tìm được báo cáo không chứng minh chưa từng code                                  |

Các report ở nhánh khác đọc bằng `git show SHA:path`, không tạo đường link giả tới file không nằm trong branch hiện tại. Nhãn REPO_OBSERVED áp dụng việc đọc report; TEST_VERIFIED mới chỉ áp dụng 65 test cụ thể của M1.

## Runtime và môi trường — quan sát có giới hạn

- Ubuntu 22.04/WSL2; kernel `6.6.114.1-microsoft-standard-WSL2`, user thường. Executor mặc định có namespace riêng chỉ thấy Codex; đã dùng yêu cầu phê duyệt chính thức cho thao tác **chỉ đọc** host. Không tắt sandbox/guard.
- Node PID 12622/12634 có cwd `/home/galaxy_os`, chuỗi lệnh đã lọc `edge:start` → `--filter @galaxy/edge start`. PID12646 cwd `/home/galaxy_os/apps/edge`, chạy `dist/main.js`, nghe 8080/8443. Recipe tại [Edge package](../../../../apps/edge/package.json). Không đọc `.env.edge`, không chứng minh build SHA chỉ bằng cwd.
- Không thấy tiến trình Nest/Next hoặc listener 3000/3001. `systemctl --user show` cho `galaxy-os.target`, `galaxy-os-api.service`, `galaxy-os-web.service`, `galaxy-edge.service`: not-found/inactive. Các [recipe systemd](../../../../infra/systemd/galaxy-os-api.service.example) chỉ là mẫu; không coi đã được cài. Không suy ra toàn bộ máy/dịch vụ ở nơi khác chắc chắn không chạy.
- Container Galaxy PostgreSQL17 và Redis7 có persistent volumes, loopback5432/6379; Mailpit chạy local. Label Compose chỉ về workspace và `docker-compose.yml`. Đây là **stack dùng chung**, không đủ căn cứ coi DB/storage là dữ liệu giả lập. Không query dữ liệu, không mở connection string.
- Không có container của namespace G00 `galaxy_os_g00_20260914g00`. Không dựng test stack mới để ép integration chạy. Storage source dùng LOCAL; đường storage cấu hình của Web/API không xác minh vì app không chạy và không đọc secrets. Không xem nội dung tài liệu khách trong `.runtime`.
- `bwrap` vẫn không nằm trên PATH. Không cài package, không lặp sudo đã biết cần mật khẩu; trạng thái cài đặt kế thừa **NEEDS_OS_AUTHORIZATION**. Executor đọc và 65 test đã chạy được, nhưng không khẳng định mọi khả năng sandbox đã được kiểm chứng. Không có test nào trong M1 được xác định bị chặn trực tiếp bởi thiếu bwrap; integration bị chặn do thiếu môi trường cô lập đã xác minh.

## Điều kiện nối sang công việc tiếp theo

1. Duyệt phạm vi M2 đầu tiên và các lựa chọn B1–B5 trong thiết kế, đặc biệt khách/history và hồ sơ chưa có Project.
2. Giao riêng việc tích hợp G02 chứa G01 vào nền chính, bảo toàn docs M0/M1 và dirty file worktree G02; review diff/migration, không áp hai lần, kiểm lại P0 và reliability trong môi trường riêng. M1 chưa cấp quyền thao tác này.
3. Chốt kế hoạch theo workflow repository; chỉ sau đó mới triển khai. Test xanh chọn lọc không đóng `/me` hoặc timeout upload lịch sử, không là quyền mời khách thật.

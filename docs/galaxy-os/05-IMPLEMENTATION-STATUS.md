# Trạng thái triển khai và điểm tiếp tục

Quan sát M0: 2026-09-28T03:41:48+07:00 (Asia/Bangkok), tức 2026-09-27T20:41:48Z. Bản này được lập ngày thực 2026-09-28, không ghi lùi ngày các test lịch sử.

- Việc được giao: **M0 — tài liệu, kiến thức và điểm tiếp tục**.
- M0: COMPLETE_DOCS_VERIFIED; kiểm tài liệu lúc 2026-09-28T03:57:17+07:00 đạt, kết quả/lệnh tại [handoff M0 mới nhất](handoffs/2026-09-28-035232-M0.md). Đây không phải nghiệm thu ứng dụng.
- Canonical yêu cầu: [READ-FIRST](00-READ-FIRST.md), [OWNER_BRIEF](sources/OWNER_BRIEF_2026-09-28.md). Raw v0.2: SOURCE_RAW_NOT_FOUND trong phạm vi đã đọc.
- M1–M7: PLANNED; mức hoàn tất theo brief mới UNKNOWN. Phiên này chưa thực hiện các mốc đó.
- Bước đề nghị: M1 có scope được giao; không tự sửa app/merge/deploy.
- Push: NOT_REQUESTED. Không kiểm remote visibility hiện tại, không truy cập dịch vụ ngoài.
- Commit docs: đã đủ điều kiện review/check để commit local; kết quả và SHA của commit chứa handoff được trả ở phản hồi cuối, không tự ghi vào nội dung commit.

## Nhãn và giới hạn bằng chứng

OWNER_REQUIREMENT là yêu cầu; USER_REPORTED là kết quả người dùng chuyển; ASSISTANT_REFERENCE là đầu mối trợ lý; REPO_OBSERVED là thực đọc repo/Git/report; TEST_VERIFIED cần lệnh, SHA/tree, môi trường và kết quả phù hợp; UNKNOWN là chưa đủ.

M0 không chạy test ứng dụng, DB hoặc browser. Các số test dưới đây là **nội dung báo cáo lịch sử đã đọc**, không phải test chạy lại trong phiên này. Chỉ kiểm tài liệu M0 được ghi TEST_VERIFIED sau khi thực chạy. Không coi PARTIAL là VERIFIED, test worktree khác là tích hợp/deploy, hoặc không tìm thấy report là chưa từng code.

## Git hiện tại — REPO_OBSERVED

| Phạm vi              | Giá trị quan sát                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace            | /home/galaxy_os                                                                                                                                                             |
| Branch               | g00/build-test-isolation-20260914                                                                                                                                           |
| HEAD trước M0        | 73fe7e8f6c3e3c7b20257857a48f1f173f186144                                                                                                                                    |
| Tree trước M0        | 276b0e168989042789517dc374713815f6224b71                                                                                                                                    |
| Trạng thái đầu phiên | Sạch; không staged/unstaged/untracked                                                                                                                                       |
| Worktree audit       | /tmp/galaxy-core-audit-20260914-120217; detached e42390ce2e10ff310708a2be5e1e321854aaff3b                                                                                   |
| Worktree G01         | /tmp/galaxy-os-g01-20260914-162913; g01/p0-security-idempotency-20260914; adf1cb59081e80d4c6a41a817233a79dae6efa3a; sạch                                                    |
| Worktree G02         | /tmp/galaxy-os-g02-20260915-142744; g02/iam-scope-target-final-admin-20260915; e4cc3adb555cec72c8c433eb65aa1fd8946aa4f0; có thay đổi apps/web/next-env.d.ts được giữ nguyên |
| Tích hợp             | merge-base HEAD với cả G01/G02 bằng HEAD trước M0; Git diff cho thấy các sửa search/audit/contracts/IAM trên nhánh riêng khác baseline hiện tại                             |
| Hooks/hướng dẫn      | Root AGENTS được đọc; không tìm AGENTS con; core.hooksPath không cấu hình, thư mục hooks chỉ có sample; không bypass/sửa guard                                              |

Không checkout/reset/stash/merge nhánh. Các quan hệ Git chứng minh code G01/G02 chưa nằm trong baseline đang sửa tài liệu; không suy ra app thực đang chạy nhánh nào.

## Nguồn lịch sử đối chiếu

### Audit 14/09 — USER_REPORTED → REPO_OBSERVED

Người dùng cung cấp branch audit/galaxy-core-20260914-120217, checkpoint e42390ce2e10ff310708a2be5e1e321854aaff3b và docs 6a8d45c2de5a34912e00c36f46bab51b6e2daf86. Git xác nhận các object tồn tại. [Checkpoint](../audits/20260914-120217-galaxy-core/00-checkpoint.md), [executive audit](../audits/20260914-120217-galaxy-core/01-executive-audit.md), [findings](../audits/20260914-120217-galaxy-core/04-findings.md) ghi audit PARTIAL và push bị chặn do visibility quan sát khi đó. Không xác nhận visibility hiện nay.

### G00 — REPO_OBSERVED, test lịch sử

[Báo cáo G00](../project-system/G00_BUILD_AND_ISOLATED_TEST_HANDOFF_2026-09-14.md) ở HEAD hiện tại ghi implementation IMPLEMENTED, verification PARTIAL; code a20332227da47f162ab65684ead973460f9fc647, tested tree d771e6814e8a5c2a941367ecfca024de6b7ed51a. Môi trường G00 cô lập; smoke 3/3, full API 1085/1086 với một /me timeout, riêng Sprint1 18/18. Browser/worker/export E2E chưa kiểm. G01_MINIMUM_ENV=READY chỉ là nền kỹ thuật.

### G01 — từ ASSISTANT_REFERENCE tới report gốc trong Git

Đã đọc object `adf1cb59081e80d4c6a41a817233a79dae6efa3a:docs/project-system/G01_P0_SECURITY_AND_IDEMPOTENCY_HANDOFF_2026-09-14.md`. Report có thể đọc lại bằng `git show <SHA>:<path>`; không tạo link tương đối giả tới file chưa có ở branch này.

Report chốt lúc 2026-09-14 17:29 +07:00: IMPLEMENTED/VERIFIED trên code/test 9e4bd0390d289cc8d575a27c6b75a8533149fd72, tree 9ea9c7ef62a360db49dcccc79cb281cde790035d. Ba P0 search scope, audit projection và payment/appendix replay; targeted 10/10, full API 1097/1097, 74 migration trên test DB cô lập được báo PASS. Report vẫn giữ G00 /me OPEN, browser/export/worker chưa chạy. Không biến thành acceptance runtime hiện nay.

### G02 và close-out mới hơn — REPO_OBSERVED về nội dung report

Nguồn trong commit `e4cc3adb555cec72c8c433eb65aa1fd8946aa4f0` (đọc bằng git show SHA:path):

- `docs/project-system/G02_IAM_SCOPE_TARGET_FINAL_ADMIN_HANDOFF_2026-09-15.md`: code tồn tại trên nhánh riêng; overall PARTIAL.
- `docs/project-system/G02_R2_TECHNICAL_VERIFICATION_HANDOFF_2026-09-16.md`: final code/test 15168f4b51549d7feccc9db3478c05345928ff65, tree ac5d5aa223fd9fd4b96280f369ea041e85d49cf9. G02_FUNCTIONS_EXISTING_POLICY=VERIFIED, targeted 32/32; R2_TECHNICAL_VERIFICATION và G02_OVERALL=PARTIAL. D01/D05/OD-11/OD-12 và browser còn mở.
- `docs/project-system/G02_CLOSEOUT_G03_ENTRY_HANDOFF_2026-09-16.md`: baseline tested adbe798d7ca5bd2fa4342846d38feade760bb72c, tree 18a001efe5899af86f6754eb48573cebb4fd6c30. Full API 1134/1134 exit 0 nhưng PASS_TESTS_REJECTED_ENTRY_CONTROL vì đồng hồ vẫn nhảy; lần controlled thứ hai NOT_RUN. G03_ENTRY=BLOCKED, G03_IMPLEMENTATION=NOT_STARTED trong phạm vi lần đó.

Close-out ghi cơ chế đồng hồ wall-time/mixed-clock trong worker có bằng chứng, nhưng không chứng minh callback cụ thể của lỗi /me lịch sử hoặc thành phần host gây nhảy giờ. Upload/G01 afterAll/reset-password vẫn OPEN_NOT_REPRODUCED; một lần pass không đóng nguyên nhân. Không sửa clock/runner hoặc chạy lại điều tra trong M0.

G03 có inventory đọc-only trong report này, không có kết luận toàn repository chưa từng có code G03+. G04–G09: UNKNOWN trong phạm vi M0; nguồn gốc GALAXY_OS_10_GOI_CODE chưa tìm thấy ở tài liệu đã kiểm tra.

## Bốn lớp trạng thái, không gộp

| Phần                          | Code                                                       | Test                                      | Tích hợp baseline M0    | Runtime/deploy hiện nay |
| ----------------------------- | ---------------------------------------------------------- | ----------------------------------------- | ----------------------- | ----------------------- |
| G00                           | Có commit/code trong HEAD                                  | Report PARTIAL lịch sử                    | Có                      | UNKNOWN                 |
| G01                           | Có object/nhánh; diff khác HEAD                            | Report VERIFIED tại 9e4bd03               | Chưa nằm trong baseline | UNKNOWN                 |
| G02                           | Có object/nhánh; diff khác HEAD                            | Report PARTIAL overall; một phần VERIFIED | Chưa nằm trong baseline | UNKNOWN                 |
| G03                           | Report nói chưa bắt đầu trong lượt close-out; có inventory | Chưa có bằng chứng phù hợp M0             | UNKNOWN                 | UNKNOWN                 |
| G04–G09                       | UNKNOWN                                                    | UNKNOWN                                   | UNKNOWN                 | UNKNOWN                 |
| Chat/AI/bộ nhớ theo brief mới | Yêu cầu đã lưu; chưa audit đầy đủ                          | AC-01–24 NOT_RUN                          | UNKNOWN                 | UNKNOWN                 |

## Source hiện có đã quan sát có giới hạn

- [AppModule](../../apps/api/src/app.module.ts) đăng ký IAM/auth/audit/Project/Task/files/uploads/notifications/comments, commercial/contracts/procurement/production/logistics/inventory/installation/after-sales. Tên module không chứng minh domain hoàn tất hoặc Comments là chat yêu cầu mới.
- [Schema](../../apps/api/prisma/schema.prisma) có Customer, Lead, Opportunity, Project, Task, FileAsset và quan hệ; [Lead convert](../../apps/api/src/leads/leads.service.ts), [createProject](../../apps/api/src/opportunities/opportunities.service.ts) giữ các liên kết và Activity. Đề xuất bảo toàn ở [SCOPE](02-SCOPE-AND-DECISIONS.md), không gộp bảng.
- [Document AI main](../../services/document-ai/app/main.py) hiện chỉ FastAPI /health và /ready; [boundary](../architecture/document-ai-boundary.md) là kế hoạch, chưa là bộ nhớ dự án.
- MarketingModule có điều kiện FEATURE_MARKETING trong AppModule; không đọc biến vận hành và không bật/publish. Không suy runtime disabled.
- Source/runtime/config/test/schema/migration không thuộc tập sửa M0.

Đây là kiểm tra đủ để ghi nguồn, **chưa phải bản đồ KEEP/ADAPT/ADD/RETIRE_CANDIDATE của M1**.

## Việc còn mở và bước tiếp

M0 kiểm tài liệu/handoff/commit local; trạng thái kiểm mới ở handoff. D01–D08 đều OPEN; các OD lịch sử giữ ở [sổ quyết định](02-SCOPE-AND-DECISIONS.md). Thiếu raw v0.2 không chặn M0.

Đề nghị M1: xác định runtime đang dùng branch/commit nào; đối chiếu baseline và reports G00/G01/G02/close-out; tách code/test/tích hợp/runtime; lập bản đồ tái sử dụng có source/API/test; khoanh P0 và reliability còn mở; trình thiết kế và kế hoạch phần tiếp theo để duyệt. Giữ thay đổi có trước của worktree G02. Không tự merge hoặc bắt đầu sửa app, không tự chạy audit/test production.

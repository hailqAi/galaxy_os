# Trạng thái triển khai và điểm tiếp tục

## Hiện tại — M2-A triển khai một phần, 2026-09-28

- OWNER_REQUIREMENT mới chốt B1–B5 và thực thi INLINE; [DECISIONS](milestones/M2/DECISIONS.md). DESIGN owner-directed đúng M2-A; PLAN technical reviewed theo ủy quyền, không PLAN_APPROVED_BY_OWNER.
- M2_ENTRY_GATE: READY cho code test; **M2_A_STATUS: PARTIAL; M2_OVERALL_STATUS: PARTIAL**. Đã code chat nội bộ/khách trên Project hiện hữu, IAM/file/history/expiry/publication PROPOSAL/UI. Không AI/memory runtime hoặc M3–M7.
- Điểm tiếp tục **worktree** `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`; START_SHA `7faeb58eea534dbb6c11238906ede6df84ce0302`. Không quay main/reset về M1.
- Handoff mới nhất: [M2/HANDOFF](milestones/M2/HANDOFF.md), có CODE_SHA/TESTED_SHA/TREE cuối; [VERIFICATION](milestones/M2/VERIFICATION.md) giữ pass/fail/not-run, [PLAN](milestones/M2/PLAN.md) có actual paths và giới hạn. Kết quả targeted không xóa full-run failure hoặc thay browser.
- Test stack VERIFIED riêng (G00 smoke3/3, DB/storage/session giả,7 migration additive); main runtime **RUNTIME_VERSION_UNVERIFIED / MAIN_RUNTIME_CHANGED:NO**. Không merge/push/deploy, không G01/G02 wholesale integration.
- Blocker/thiếu: các adapter B5 ngoài PROPOSAL; source approved binary/version cho một số domain cần prerequisite có review; 404/timeout chập chờn và các ca race/mobile chưa đủ; Back/Forward nháp. B1–B5 không còn là lý do chặn. Lead-only/lifecycle giữ DEFERRED_BY_EXPLICIT_SLICE_SCOPE, không xóa ca nghiệm thu.
- Bwrap thiếu và sudo authorization cũ chưa thay đổi, không cài/lặp sudo; không tác vụ đã chạy nào bị chứng minh block vì thiếu binary. Không tuyên bố đã kiểm toàn sandbox.
- Bước tiếp: đóng lỗi/test còn thiếu và source mapping theo HANDOFF trước nghiệm thu M2-A; không tự chuyển phần M2 còn lại/M3. Các mục phía dưới chỉ là lịch sử.

## Lịch sử — M2 trước gate, 2026-09-28

- M2_STATUS: AWAITING_OWNER_DECISIONS; **IMPLEMENTATION_GATE: BLOCKED_APPROVAL**.
  Đã đọc/đối chiếu B1–B5 và cập nhật spec; chưa code, chưa dựng test stack trước gate.
- Handoff mới nhất: [M2/HANDOFF](milestones/M2/HANDOFF.md).
  [DECISIONS](milestones/M2/DECISIONS.md), [DESIGN](milestones/M2/DESIGN.md),
  [VERIFICATION](milestones/M2/VERIFICATION.md) là điểm review/tiếp tục.
- B1 TECHNICAL_PROPOSAL theo chỉ đạo mới: prerequisite tối thiểu được review,
  không merge/cherry-pick G01/G02. B2–B5 có phần NEEDS_OWNER_DECISION;
  các rào an toàn đã rõ được đánh RESOLVED_BY_EXISTING_DECISION riêng, không hỏi lại.
- DESIGN_APPROVAL_STATUS: NOT_APPROVED; PLAN_APPROVAL_STATUS: NOT_CREATED_AWAITING_DESIGN_APPROVAL.
  Brainstorming/repository gate yêu cầu written spec rồi plan được review/chọn cách thực thi.
- START_SHA `0fea6cc53db41c6520fda942c3bf412c35ab3dbb`, tree `a7648137465aa44b711d62e89fb46403ae6ea9cd`;
  không commit mới sau M1 ở đầu lượt; source subtrees và dirty G02 được giữ.
- M2-AC01–24, unit/integration/browser ứng dụng: NOT_RUN trong lượt này.
  Test stack NOT_CREATED_AWAITING_APPROVAL; bwrap vẫn thiếu, không lặp sudo/cài mới.
  Không kiểm lại runtime; RUNTIME_VERSION_UNVERIFIED, MAIN_RUNTIME_CHANGED: NO.
- Bước tiếp: chủ dự án quyết định các điểm còn mở và review DESIGN; chưa tự sang lập trình/M3–M7.
  Chỉ tài liệu thay đổi; không push/merge/deploy. Trạng thái M1 bên dưới là lịch sử.

## Lịch sử — M1, 2026-09-28

- Việc được giao mới: M1 khảo sát baseline, tái sử dụng và draft M2; không chạy lại M0.
- **M1_AUDIT_STATUS: COMPLETE** trong phạm vi khảo sát; **M2_DESIGN_STATUS: NEEDS_DECISION**;
  **IMPLEMENTATION_READINESS: BLOCKED**. Kết quả khảo sát không cấp quyền triển khai.
- Handoff mới nhất: [M1](handoffs/2026-09-28-043124-M1.md).
- [Baseline](milestones/M1/01-BASELINE.md): branch `g00/build-test-isolation-20260914`,
  HEAD đầu M1 `0cbf986300fafe687b3c83c328adf14eff6eb66b`, tree `ff757f307d42091f519d44680253ada4b87ace51`.
  G01/G02 chưa tích hợp vào HEAD; G02 chứa G01. Dirty next-env ở worktree G02 được giữ.
- [Reuse map](milestones/M1/02-REUSE-MAP.md) có đường source/API/UI/test thực tế và rủi ro.
  [Verification](milestones/M1/03-VERIFICATION.md): 65 ca chọn lọc mới đạt, không full/E2E;
  `/me` và upload timeout lịch sử vẫn mở. Test SHA/tree là baseline trước docs M1.
- Runtime: chỉ Edge được quan sát chạy, commit build không xác định;
  Web/API NOT_RUNNING_OBSERVED, **RUNTIME_VERSION_UNVERIFIED**. DB/Redis chung không dùng để test.
- bwrap vẫn thiếu; không package mới, không lặp sudo. NEEDS_OS_AUTHORIZATION chỉ việc cài;
  executor vẫn đọc và chạy kiểm chọn lọc. Không tuyên bố sandbox toàn diện đã được kiểm chứng.
- [Draft M2](milestones/M1/04-M2-DESIGN-DRAFT.md) đề nghị Project đã có → room nội bộ/khách →
  tin/file bền vững theo quyền, polling trước, dùng lại domain. B1–B5 cần chủ dự án duyệt;
  Lead-only intake chưa được giải quyết bằng lát cắt này. Không triển khai M2–M7 trong lượt M1;
  mức hoàn tất ngoài phạm vi khảo sát vẫn UNKNOWN; 14 ca M2 NOT_RUN.
- Bước tiếp: duyệt B1–B5 và giao riêng integration/preflight/implementation plan; không tự merge/code.
  D01–D08 vẫn OPEN. Chỉ docs/handoff thay đổi; không push/merge/deploy.

## Lưu trữ trạng thái M0 — không phải công việc hiện tại

Quan sát M0: 2026-09-28T03:41:48+07:00 (Asia/Bangkok), tức 2026-09-27T20:41:48Z. Bản này được lập ngày thực 2026-09-28, không ghi lùi ngày các test lịch sử.

- Việc được giao: **M0 — tài liệu, kiến thức và điểm tiếp tục**.
- M0: COMPLETE_DOCS_VERIFIED; kiểm tài liệu lúc 2026-09-28T03:57:17+07:00 đạt, kết quả/lệnh tại [handoff M0 gốc](handoffs/2026-09-28-035232-M0.md). Đây không phải nghiệm thu ứng dụng.
- Canonical yêu cầu: [READ-FIRST](00-READ-FIRST.md), [OWNER_BRIEF](sources/OWNER_BRIEF_2026-09-28.md). Raw v0.2: SOURCE_RAW_NOT_FOUND trong phạm vi đã đọc.
- M1–M7: PLANNED; mức hoàn tất theo brief mới UNKNOWN. Phiên này chưa thực hiện các mốc đó.
- Bước đề nghị: M1 có scope được giao; không tự sửa app/merge/deploy.
- Push: NOT_REQUESTED. Không kiểm remote visibility hiện tại. M0 gốc không truy cập dịch vụ ngoài; lượt tiếp tục chỉ tra tài liệu công khai OpenAI, không gửi dữ liệu dự án.
- Commit M0 gốc: e8b3144c8993a7609ce5523db4b3753b57cb8cad, đã xác nhận trong lượt tiếp tục; không push.

## Tiếp tục M0 — 2026-09-28T04:06:55+07:00

Handoff M0 cuối: [M0-RESUME](handoffs/2026-09-28-040655-M0-RESUME.md). M0 đã hoàn tất trước lượt tiếp tục; kiểm lại cấu trúc/nội dung/link và định dạng trên commit e8b3144 đều PASS. Giữ nguyên bộ cốt lõi và handoff gốc bên trên, chỉ bổ sung bằng chứng môi trường.

Ubuntu 22.04/WSL2, Codex 0.157.1: executor hiện hoạt động; bwrap chưa cài. Ứng viên bubblewrap 0.6.1-1ubuntu0.3 từ kho Ubuntu chính thức, mô phỏng chỉ thêm một gói. Lệnh cài qua phê duyệt hợp lệ dừng tại sudo: a password is required (exit 1), không cài gói nào. ENVIRONMENT_REPAIR=NEEDS_OS_AUTHORIZATION; M0 không bị chặn. Không có nguyên văn cảnh báo bwrap trước khi người dùng dừng; không suy đoán đó là lỗi namespace/AppArmor. Không thay sandbox hay cấu hình bảo mật.

## Nhãn và giới hạn bằng chứng

OWNER_REQUIREMENT là yêu cầu; USER_REPORTED là kết quả người dùng chuyển; ASSISTANT_REFERENCE là đầu mối trợ lý; REPO_OBSERVED là thực đọc repo/Git/report; TEST_VERIFIED cần lệnh, SHA/tree, môi trường và kết quả phù hợp; UNKNOWN là chưa đủ.

M0 không chạy test ứng dụng, DB hoặc browser. Các số test dưới đây là **nội dung báo cáo lịch sử đã đọc**, không phải test chạy lại trong phiên này. Chỉ kiểm tài liệu M0 được ghi TEST_VERIFIED sau khi thực chạy. Không coi PARTIAL là VERIFIED, test worktree khác là tích hợp/deploy, hoặc không tìm thấy report là chưa từng code.

## Git quan sát trong M0 — REPO_OBSERVED lịch sử

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

## Việc còn mở và bước tiếp ghi tại M0 (lịch sử)

M0 kiểm tài liệu/handoff/commit local; trạng thái kiểm mới ở handoff. D01–D08 đều OPEN; các OD lịch sử giữ ở [sổ quyết định](02-SCOPE-AND-DECISIONS.md). Thiếu raw v0.2 không chặn M0.

Đề nghị M1: xác định runtime đang dùng branch/commit nào; đối chiếu baseline và reports G00/G01/G02/close-out; tách code/test/tích hợp/runtime; lập bản đồ tái sử dụng có source/API/test; khoanh P0 và reliability còn mở; trình thiết kế và kế hoạch phần tiếp theo để duyệt. Giữ thay đổi có trước của worktree G02. Không tự merge hoặc bắt đầu sửa app, không tự chạy audit/test production.

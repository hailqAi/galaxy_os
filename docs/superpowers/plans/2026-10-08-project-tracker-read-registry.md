# Tool đọc tracker và registry built-in

> Use superpowers:executing-plans; một source writer, review độc lập cuối.

Owner đã duyệt mốc đọc tracker/registry trong phiên08/10. Phạm vi: task_list/task_get/task_history qua TasksService; server gắn Project/actor, quyền theo assignment, không tài chính; registry phản ánh contract hiện có và trạng thái chưa live. Không schema mới, Task writes/CAS, mapping4nhóm/12giai đoạn hoặc connector ngoài. Không trì hoãn candidate UI đã đủ gate.

## Design đã duyệt

Tái dùng TasksService list/get và visibleWhere, actorsForPermission của linked-work caller. List có total/statusCounts/pagination/computedAt thật; get/history dùng Task version/activity hiện hữu. Projection không budget/customer hoặc dependency ở Project khác. Nguồn snapshot lưu taskIds để view/beforeAttempt/history chặn khi task access bị thu hồi. Model không nhận Project/actor/path. Side effect READ; status registry DISABLED vì ChatGPT chưa có grant. Service HTTP Task hiện hành giữ hành vi.

## Steps

1. RED integration toolVendor: >1page, Project khác không lẫn, missing task permission/mixed-role scope bị chặn, version/history thật, revoke assignment hides saved answer; schema rejects external Project/actor. RED registry system-only metadata.
2. Extend TasksService list/get with server-only trusted visibility parameter and consistent get/activity transaction; preserve callers/default behavior. Inject existing TasksService into ProjectAiService, reuse authoritative permission scopes and source lifecycle. No parallel Task domain.
3. Extend ai-tools schemas/definitions/policy and source taskIds; register exact three READ tools in existing UNIFIED loop. Limit rows/payloads and return missing fields truthfully. Persist task refs before next dispatch.
4. Expose built-in registry through existing admin metadata. Use existing schema/description/policy as source; no speculative plugin framework or registration switch. Frontend simple list of actual disabled capability metadata.
5. Focused real-Postgres + unit tests, full regression/lint/types/build/format, correctness/security/auth/Ponytail review. Build separate immutable candidate after primary UI release if manager is recovered; no untested copy into artifact main.
6. Update memory/handoff status: this mốc is read-only tools + built-in registry PARTIAL for whole master tracker/resume/plugin ecosystem. Vendor/main tool execution remains blocked by grant until actually verified.

## Evidence và giới hạn

Task list lưu đủ contributor IDs cho totals/statusCounts ở mọi page, cùng RepeatableRead; trần1000, exact1001 bị chặn trước outbound. ID witness chỉ lưu source nội bộ, không gửi model. History/get dùng transaction khi tool yêu cầu pagination; HTTP mặc định giữ read cũ. Hai finding review off-page/empty-page và1001 đã có RED→GREEN.9integration focused PASS, review cuối không còn Critical/Important. Tool registry từ contract hiện hữu, chưa vendor live. Ở checkpoint trước r2, full regression/candidate2/browser/release còn gate; kết quả đã hoàn tất ở mục phát hành bên dưới. UI r1 đã phục vụ main độc lập.

Full mới PASS API1400/Web573/Edge5/document1/Python64 với fixture pool3/Poppler/8CPU; lint/types/format PASS. Log lỗi pool/guard/PDF/timing giữ riêng. Browser admin registry có assertion3READ tool/PROJECT_AND_TASK/DISABLED; RED trên main r1 không có registry, GREEN lúc đó chờ candidate2; exact artifact và main r2 hiện đã đạt. Review cuối correctness/security/authorization/Ponytail không còn Critical/Important.

## Mốc được chấp nhận và đã phát hành

08/10: CODE_SHA=TESTED_SHA a5e82d80129cc698860c501683b844b404c7f33b/tree3e04b19306cece71605018e419ee87caab221922; full/build/exact artifact Chrome8/8 PASS. DEPLOYED_LOCAL_RELEASE local-a3eb571a7fcc, API736608/Web736609 READY. Main owner SYSTEM200, registry12contract/3READ task tools đúng trạng thái DISABLED; localhost/LAN200 cùng release, pnpm dev exit0 giữ PID. Ảnh main/current receipts tại `.runtime/recovery-tracker-registry-20261008/main-browser/`; member main/tool inference live chưa chạy. Steps1–6 của mốc READ/built-in registry đã thực hiện, không coi toàn master tracker/CAS/resume/plugin ecosystem xong. Gate chờ candidate2 trong các ghi chú trên là lịch sử trước cutover.

# Kiểm toán điều hành Galaxy OS theo chuẩn cốt lõi v0.2

## Kết luận điều hành

Trạng thái audit là **PARTIAL**, không phải trạng thái hoàn thành ứng dụng. Source đã được đóng băng cục bộ ở `e42390c`; kiểm toán tĩnh bao phủ chuỗi nghiệp vụ, IAM, UI quản lý, lịch sử, 49 controller/477 HTTP actions ở mức inventory và các đường rủi ro chính. Lint, unit và schema validate có bằng chứng mới; integration/browser bị chặn vì fixture mặc định có thể ghi database `galaxy_os` cục bộ và không có môi trường dữ liệu tách biệt đã xác minh. Build sạch phát hiện dependency type thiếu; format check cũng fail. Remote public làm push bị chặn.

Galaxy OS hiện là modular monolith quản trị tổ chức và vận hành dự án, với Project chung nối CRM, khảo sát/yêu cầu, lựa chọn sản phẩm, dự toán/báo giá, hợp đồng, mua hàng, sản xuất, logistics, kho, lắp đặt, nghiệm thu, bàn giao và bảo hành. Đây không chỉ là CRM. Cũng chưa có bằng chứng để kết luận toàn hệ thống đã lệch thành PMS đầu tư công: các enum/API nguồn vốn ODA/PPP còn tồn tại, nhưng UI hiện không render selector tương ứng và tài liệu thiết kế mới hơn yêu cầu không đưa nội dung construction/legal vào domain Galaxy.

Hệ thống **đúng hướng về cấu trúc**, nhưng **chưa khép kín về cam kết, tiền và quyền**. Điểm gãy quan trọng nhất là thiếu liên kết bất biến ở cấp dòng/version từ lựa chọn đã duyệt tới estimate/quotation/contract/PR/PO và giao–lắp–nghiệm thu. Đồng thời có các đường lộ hoặc vượt phạm vi qua search, audit log, custom fields, IAM scope composition và nested marketing relation; các lỗi idempotency, currency, số âm và concurrency có thể làm sai dữ liệu tài chính/vận hành.

## Nguồn chuẩn và nguồn lịch sử

- CORE: phụ lục Galaxy OS v0.2 trong chỉ đạo kiểm toán hiện tại. Không tìm thấy bản nguyên gốc chứa đúng 12 giai đoạn, 12 phân hệ và 28 nhóm dữ liệu trong repository: `SOURCE_NOT_IN_REPO`. Vì vậy báo cáo dùng phụ lục hiện tại làm chuẩn, không tạo tài liệu lịch sử giả.
- CURRENT_INSTRUCTION: yêu cầu checkpoint, audit toàn hệ thống và dừng trước sửa ứng dụng.
- POLICY_DOC: `docs/architecture/security-and-permissions.md:3` ghi công thức `permission AND scope AND target-policy AND delegation-policy AND active-status`, đồng thời khẳng định department membership không tự cấp quyền quản trị.
- HISTORICAL_CONTEXT: `docs/sprints/sprint-1-enterprise-gap-analysis.md:16-21` đã chỉ ra shared aggregate scope là sai, capability phải gắn scoped assignment, delegation cần ceiling và phải bảo vệ final System Admin.
- DOMAIN_REUSE: `PMS_PARITY_RUN.md:7` và `OLD_TO_NEW_PROJECT_MAPPING.md:76` yêu cầu tái sử dụng Project/Product/Estimate/Quotation/Contract/Task/FileAsset/Approval/IAM.
- PMS_REFERENCE: `PMS_LIVE_REFERENCE_AUDIT.md:14,48,67` chỉ cho phép dùng tham chiếu presentation/workflow; không biến dữ liệu pháp lý/tài chính mẫu thành business authority.
- Marketing/autopublishing: code có feature flag và fake provider; không tìm thấy nguyên văn quyết định chủ dự án rằng scope đã phê duyệt hoặc đã hủy. Phân loại là `NEEDS_OWNER_DECISION`, không tự bật/xóa.

## Phần đúng hướng và nên giữ

1. **Một Project và các domain dùng chung.** Project Workspace điều hướng tới contract/RFQ/PO/production/logistics/inventory/installation/after-sales thật; không tạo Contract/PO/Task/File/IAM thứ hai.
2. **CRM chuyển đổi có liên kết.** Lead chuyển Opportunity trong transaction; Opportunity tạo Project, member và department trên nguồn Project chung.
3. **Một số snapshot/version và maker-checker đã có.** ProjectProduct revision bất biến sau duyệt và chặn self-approval; quotation có revision; PI và supplier quotation có vòng review/approve.
4. **Tiền dùng Decimal ở các vùng quan trọng.** Estimate phân biệt nguồn giá `CONFIRMED/MISSING/PROVISIONAL`; project financial calculations phân bổ cent có quy tắc; inventory giữ cost/currency snapshot.
5. **Inventory posting tập trung.** Có transaction Serializable, payload hash/idempotency, kiểm remaining và ledger thay vì sửa số dư trực tiếp.
6. **Files/uploads có phòng vệ sâu.** Server kiểm đúng Project và permission theo thao tác, khóa document/reference, bảo vệ evidence bắt buộc, che storage metadata và recheck quyền khi hoàn tất upload.
7. **IAM có nền tốt để sửa tại chỗ.** Session/user/organization/membership/assignment expiry được kiểm lại; project policy mới có khả năng tính permission source theo từng capability; không cần thêm policy engine.
8. **Chưa có live publishing provider.** Backend bị tắt theo cấu hình mặc định; publishing dùng fake provider và production sẽ báo `PROVIDER_NOT_CONFIGURED`. Trạng thái feature flag ở môi trường chạy thật là `NOT_VERIFIED`, nên không kết luận marketing đang tắt production.

## Phần lệch hoặc chưa đủ so với v0.2

### Nghiệp vụ và dữ liệu

- Không có ID/version lineage xuyên dòng từ ProjectProduct revision → EstimateLine → QuotationLine → Contract scope → PR/PO line. Người quản lý không thể chứng minh chắc một cam kết sản phẩm đã duyệt được mua, nhận, giao, lắp và bảo hành đúng version.
- Hợp đồng tạo từ quotation bỏ terms và snapshot quá mỏng. Estimate bị reject chưa có đường revise giữ lineage.
- Payment schedules không thêm được đợt thứ hai qua UI hiện tại; customer payment cho phép số/rate không dương và không đối chiếu currency. Replay payment/appendix tra idempotency toàn cục, có thể trả record tenant khác.
- Apply appendix và thêm shipment item thiếu khóa/claim đồng thời; handover chỉ cần bất kỳ acceptance nào của Project, không chứng minh coverage các item bàn giao.
- Survey approved vẫn có thể bị mutation qua command `complete`; task dependencies được lưu/đọc nhưng không chặn đổi trạng thái/complete.
- Cashflow forecast 30/60/90, price/exchange-rate master, design package/version độc lập, SiteDelivery commands và reconciliation toàn chuỗi chưa được tìm thấy.

### Phân quyền và dữ liệu nhạy cảm

- Search project ghi đè `OR` scope bằng `OR` từ khóa, làm actor SELF có thể enumerate project cùng organization.
- User/CRM/task policies dùng scope tổng hợp từ mọi binding, nên permission của binding hẹp có thể mượn scope rộng của binding không liên quan. Điều này xung đột trực tiếp với policy lịch sử.
- Role metadata update không bảo vệ target protected/equal-higher tier; department update/archive không áp managed-department scope.
- Audit API chỉ cần `audit.read` và trả snapshot estimate chứa cost/margin; generic Task budget chỉ kiểm `estimate.read` toàn cục; custom field values không áp visibility projection trên các response.
- Notification list che dữ liệu target mất quyền, nhưng mutation read/unread/archive trả raw body. Marketing cho phép cross-tenant campaignId và sửa variant sau approve/schedule.
- Không có delegation chain/redelegation/cycle model được tìm thấy. `assignedByUserId` mới là provenance, không chứng minh ceiling/cascade/redelegation policy đầy đủ.

### Quản lý và UX

- `/projects/actions` và `/projects/alerts` chỉ lọc Stage 1 của 20 Project ở trang hiện tại. Queue có thể báo trống dù trang khác còn việc.
- Backend red flag có owner, due date, route và remediation, nhưng UI bỏ owner/hạn/evidence/route cụ thể. Người quản lý chưa nhận được câu trả lời đầy đủ: vướng gì, ai chịu trách nhiệm, căn cứ ở đâu, thao tác tiếp theo là gì.
- Home dashboard chỉ có lead/pipeline/project/overdue và tám task. Project dashboard có số tiền theo currency và scope, nhưng không drill về chứng từ/dòng, chưa ghép money–goods–progress–risk và chưa công bố công thức/nguồn thiếu.
- Không có polling/WebSocket/SSE nghiệp vụ ở frontend; `cache: no-store` chỉ tránh cache từng request, không phải realtime.
- Role seed `department_manager/deputy_manager/team_lead` tập trung quản trị nhân sự, không có Project/Task/approval nghiệp vụ. `project_manager` có quyền nghiệp vụ trong SELF/Project membership. Vì vậy quản lý phòng không mặc định có hàng đợi/điều phối nghiệp vụ phòng ban.

## Người quản lý thực sự kiểm soát được gì tại checkpoint

Năng lực dưới đây là **capability của code/seed**, không phải xác nhận ai đang được gán role trong database production (audit không đọc dữ liệu thật):

- System Administrator: catalogue seed có mọi permission, scope SYSTEM; có guard trạng thái/session và last-admin ở một số mutation. Role metadata target vẫn có lỗ hổng AUTH-02.
- Organization Administrator: mọi permission trừ `system.*`, scope ORGANIZATION; có thể quản trị tổ chức và nghiệp vụ nếu binding active. Đây là quyền rất rộng, không thay cho separation of duties.
- Director: seed có các permission `.read` không phải system và một số user/department/role-assignment mutation. Có thể nhìn nhiều danh sách và dashboard; không mặc định approve/thực hiện payment, PO, stock hoặc handover.
- Department Manager/Deputy/Team Lead: seed có user/member/role administration trong DEPARTMENT, nhưng không có project/task/business approvals. Do lỗi scope composition, một số action IAM có thể vượt đúng department khi đi cùng binding rộng khác.
- Project Manager: có Project/Task/Survey/Requirement và installation/inspection/acceptance/handover/warranty/service-ticket theo SELF/Project membership, trừ các override nhạy cảm. Project membership không tự tạo capability tài chính.
- Employee: có nhiều Project/Task/Survey/Requirement capability theo SELF, nhưng UI/target vẫn phải dựa membership/assignee. Seed rộng ở mức action; không nên dùng tên role để suy quyền.
- Procurement, warehouse, installer, warranty và marketing có permission theo chức năng riêng. Ví dụ warehouse employee không có supplier payment approve; installer không có stock adjustment; marketing không có finance. Chưa có integration persona test đủ ba trường hợp tách nhiệm vụ.

## Ưu tiên xử lý tối thiểu sau khi chủ dự án duyệt

1. **P0/P1 bảo mật và integrity:** khóa search scope; project-scope/redact audit/task/custom fields/notification; tenant-check marketing nested IDs; target guard role/department; sửa scoped permission composition.
2. **P1 tiền và concurrency:** tenant-scoped idempotency; positivity/currency; append schedule; lock/CAS appendix và shipment item; acceptance coverage cho handover.
3. **P1 traceability MVP:** chọn một item đi xuyên selection revision → estimate/quotation/contract → PR/PO → receipt/install/acceptance/warranty bằng ID bất biến; không tạo domain song song.
4. **P1/P2 quản lý:** backend queue trên toàn scope, hiển thị owner/hạn/căn cứ/next action; dashboard drilldown và công thức/currency rõ ràng.
5. **P1 reproducibility:** khai báo type dependency còn thiếu; xử lý sáu file format ở P3; không nâng stack/dependency ngoài yêu cầu.
6. **DEFER:** live publishing provider, Document AI, payroll/full accounting/multi-warehouse advanced/portal/mobile cho tới khi core MVP và policy được chốt.

Chi tiết đối chiếu nằm ở `02-core-traceability.csv`; hành động/quyền thực có ở `03-authorization-matrix.csv`; finding và đường gọi ở `04-findings.md`.

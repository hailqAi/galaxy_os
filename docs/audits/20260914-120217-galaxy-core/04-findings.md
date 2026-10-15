# Findings tại `e42390ce2e10ff310708a2be5e1e321854aaff3b`

Quy ước bằng chứng: `RUNTIME_VERIFIED` ở đây chỉ áp dụng khi code thật đã được chạy với persistence mock/in-memory; nó không thay cho DB/browser acceptance. `STATIC_ONLY` là đường gọi đã đọc đầy đủ nhưng chưa thực thi trên DB. Không finding nào dưới đây đã được sửa trong phiên audit.

## SEC-01 — Search Project làm mất scope actor

- Nguồn: CURRENT_INSTRUCTION §5.3; CORE v0.2 §2.1; policy `docs/architecture/security-and-permissions.md:3`.
- Kỳ vọng: `search.read AND project.read AND scope/target`; actor SELF chỉ thấy Project mình sở hữu/quản lý/tham gia.
- Quan sát: `apps/api/src/search/search.controller.ts:218-231` spread `projectWhere(actor)` rồi khai báo lại `OR` cho name/code. `OR` owner/manager/member từ `apps/api/src/access-control/business-entity.policy.ts:115-116` bị ghi đè.
- Đường gọi: `GET /search` → global guard `search.read` → kiểm flat `project.read` → `addScopedGroups` → Prisma Project query.
- Bằng chứng: `RUNTIME_VERIFIED` memory-only bằng service/controller thật và mocked Prisma; query cuối giữ organization/deleted/name-code nhưng không còn actor identity. Unit `search.test.ts` hiện chỉ có một case và không bắt lỗi này.
- Tác động: enumerate ID/code/name Project cùng tenant ngoài membership; là lộ dữ liệu phân quyền có bằng chứng.
- Chắc chắn: cao. Ưu tiên: **P0**. Loại: lỗi đã tái hiện.
- Đề xuất tối thiểu: dùng `AND: [projectWhere(actor, 'project.read'), searchPredicate]`; thêm deny/allow test SELF trên hai Project cùng org.

## SEC-02 — Audit API lộ giá vốn/margin ngoài project financial scope

- Nguồn: CURRENT_INSTRUCTION §5.2–5.3; `docs/financial-permission-model.md:3`.
- Kỳ vọng: cost, purchase price và margin chỉ trả khi actor có `financial_margin.read` trên đúng Project.
- Quan sát: `apps/api/src/commercial/commercial.service.ts:275-308` ghi estimate kèm `versions.lines` đầy đủ vào `afterData`. `apps/api/src/audit/audit.service.ts:52-78` chỉ lọc organization rồi trả raw before/after data. `apps/api/src/audit/audit.controller.ts:46-49` chỉ đòi `audit.read`; `security-redaction.ts:3` không che trường tài chính.
- Đường gọi: create estimate → internal audit snapshot → `GET /audit-logs` bằng custom audit reader không có finance/project permission.
- Bằng chứng: `STATIC_ONLY`, call path và projection hoàn chỉnh; chưa chạy DB để tránh dữ liệu thật.
- Tác động: lộ `netPurchasePrice`, `baseCostVnd`, cost, margin và markup của Project khác trong cùng organization.
- Chắc chắn: cao. Ưu tiên: **P0**. Loại: lỗi tĩnh có đường lộ trực tiếp.
- Đề xuất tối thiểu: giữ immutable audit snapshot nội bộ; authorize theo target Project và redact projection response. Không xóa audit history.

## FIN-01 — Idempotency customer payment/appendix không giới hạn tenant/target

- Nguồn: CORE v0.2 §2.1, giai đoạn 6–7; CURRENT_INSTRUCTION §4 về retry và ghi nhận kép.
- Kỳ vọng: replay chỉ trả record của cùng organization + Project/Contract và cùng payload.
- Quan sát: `apps/api/src/contracts/contracts.service.ts:345-348` tìm CustomerPayment theo `idempotencyKey` toàn cục rồi return trước khi kiểm schedules; `:221-228` fallback ContractAppendix tương tự. Schema có unique key toàn cục tại `apps/api/prisma/schema.prisma:1749,1898`.
- Đường gọi: request hợp lệ trên Project A → key trùng record Project B/tenant B → service trả record B.
- Bằng chứng: `STATIC_ONLY`; counter-evidence là request Project vẫn được kiểm ở `contracts.service.ts:335/204`, nhưng record replay không được kiểm. Supplier payment đã có mẫu đúng `(organizationId,idempotencyKey)` tại `procurement.service.ts:2033`.
- Tác động: có thể lộ amount/bankReference/appendix khác tenant và chấp nhận retry sai payload.
- Chắc chắn: cao. Ưu tiên: **P0**. Loại: lỗi phân vùng và integrity.
- Đề xuất tối thiểu: uniqueness theo tenant + target; replay so organization, Contract/Project và payload hash trước return; migration chỉ additive sau phê duyệt.

## AUTH-01 — Permission hẹp mượn scope rộng từ binding không liên quan

- Nguồn: policy `docs/architecture/security-and-permissions.md:3`; `docs/sprints/sprint-1-enterprise-gap-analysis.md:16-20`.
- Kỳ vọng: permission, scope và target phải đến từ binding phù hợp cùng capability; không ghép binding A với scope binding B.
- Quan sát: `development-auth.guard.ts:159-167,236-245` union permission và tính một `administrationScope` tối đa. `user-management.policy.ts:130-137,186-206`, `leads.service.ts:27-39`, `opportunities.service.ts:36-49`, `tasks.service.ts:16-37` dùng aggregate scope. `business-entity.policy.ts:471-524` có cùng pattern cho Lead/Opportunity/Task.
- Đường gọi ví dụ: `user.update@DEPARTMENT(A)` + permission không liên quan `@ORGANIZATION` → `PATCH /users/:id` → target policy thấy ORGANIZATION → target cấp thấp ngoài A có thể lọt.
- Bằng chứng: `STATIC_ONLY` với call path và historical policy rõ; project policy có pattern phản chứng đúng khi truyền required permission tại `business-entity.policy.ts:120-164`.
- Tác động: horizontal privilege escalation trên user, role assignment/delegation, CRM và task.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: sai yêu cầu phân quyền hệ thống.
- Đề xuất tối thiểu: resolve scope từ `permissionSources` khớp action; truyền required permission vào shared target predicate; reuse project pattern, không thêm policy engine.

## AUTH-02 — Role metadata update/archive không bảo vệ target protected/tier

- Nguồn: CURRENT_INSTRUCTION §5.1–5.2; security policy về protected target/tier.
- Kỳ vọng: actor thấp hơn không sửa/archive role protected hoặc equal/higher tier.
- Quan sát: `apps/api/src/roles/roles.service.ts:97-109` chỉ kiểm tier mới trong DTO, aggregate scope và system code rename; không kiểm `before.isProtected`/tier/nondelegable. Archive `:227-239` chỉ chặn `isSystem` hoặc code `system_admin`, không chặn custom protected/equal tier. `setPermissions :132-155` có guard đúng và nên giữ.
- Đường gọi: `PATCH /roles/:id` với `role.update` → hạ tier/maximumScope role protected → các bước sau có thể vượt target policy.
- Bằng chứng: `RUNTIME_VERIFIED` memory-only; actor tier 80 đã đổi metadata role `system_admin` tier 100 thành tier 1/SELF qua service thật + mock.
- Tác động: phá invariant IAM và mở đường thay permission/binding; chưa khẳng định riêng mutation này lập tức cấp system permission.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: lỗi đã tái hiện.
- Đề xuất tối thiểu: dùng cùng target guard của setPermissions cho update/archive; bất biến hóa metadata `system_admin`.

## AUTH-03 — Department mutation bỏ managed scope; GET có thể trả sai path ID

- Nguồn: CURRENT_INSTRUCTION §5.1–5.3; gap analysis `:18`.
- Kỳ vọng: `department.update/archive` chỉ áp đúng managed department; route `:id` không được thay bằng ID khác.
- Quan sát: `departments.service.ts:104-106,144-146` chỉ lọc id + organization khi update/archive. `get :49-56` spread điều kiện khiến `id` có thể bị ghi đè bởi `{in:managedDepartmentIds}`.
- Đường gọi: custom department-scoped permission → controller flat permission → service tenant-only query.
- Bằng chứng: `STATIC_ONLY`; hierarchy/cycle/active-child/member checks hiện hữu là counter-evidence nhưng không thay scope actor.
- Tác động: sửa/archive phòng khác trong org hoặc trả record khác với URL.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: lỗi phân quyền.
- Đề xuất tối thiểu: `AND` path ID với action-specific scoped predicate cho get/update/archive.

## AUTH-04 — Custom-field visibility không áp lên value responses

- Nguồn: CURRENT_INSTRUCTION §5.2 về field nhạy cảm; `docs/architecture/security-and-permissions.md` phần custom fields.
- Kỳ vọng: definition có `visibilityPermission` thì mọi read/mutation response của value phải lọc tương ứng.
- Quan sát: definitions list lọc visibility tại `custom-fields.service.ts:23-38`; `UsersService.accessPreview` trả toàn bộ `target.customData` tại `users.service.ts:470-477`. `setValues` merge và trả raw target tại `custom-fields.service.ts:137-165,257-285`.
- Đường gọi: actor được edit một field → update target → response kèm fields khác bị hạn chế; hoặc access-preview trả raw customData.
- Bằng chứng: `STATIC_ONLY`; chưa biết dữ liệu thực có trường nhạy cảm nào.
- Tác động: bypass field-level visibility; mức dữ liệu cụ thể phụ thuộc cấu hình production không được đọc.
- Chắc chắn: cao cho code path. Ưu tiên: **P1**. Loại: thiếu enforcement.
- Đề xuất tối thiểu: một projection dùng definitions hiện có cho mọi read/mutation return; không chỉ ẩn UI.

## AUTH-05 — Generic Task budget chỉ kiểm permission toàn cục

- Nguồn: CORE v0.2 §2.2, dashboard tài chính; CURRENT_INSTRUCTION §5.3.
- Kỳ vọng: budget Project B chỉ hiện khi `estimate.read` áp dụng cho đúng B.
- Quan sát: `apps/api/src/tasks/tasks.service.ts:58-63` chỉ dùng `actor.permissions.includes('estimate.read')`; list/get dùng omit này tại `:105-128`. Task visibility lại dùng aggregate scope `:16-37`.
- Đường gọi: `task.read@ORGANIZATION` + `estimate.read@DEPARTMENT(A)` → task Project B vẫn trả `allocatedBudget`.
- Bằng chứng: `STATIC_ONLY`; `tasks.test.ts:19` chỉ test actor hoàn toàn thiếu permission, không test permission thuộc Project khác.
- Tác động: side-channel budget ngoài financial/project scope.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: lỗi field-level scope.
- Đề xuất tối thiểu: project-scope finance permission cho từng Task; omit nếu không thỏa.

## AUTH-06 — Notification mutation trả lại nội dung target đã mất quyền

- Nguồn: CURRENT_INSTRUCTION §5.3 về notifications và quyền thay đổi sau tạo.
- Kỳ vọng: target không còn accessible thì mọi response đều không trả title/body/entity/href.
- Quan sát: list dùng `canOpen` và redact tại `notifications.service.ts:42-55`; `updateOwned :99-113` dùng cho read/unread/archive trả raw updated row, không target recheck.
- Đường gọi: giữ notification ID cũ → target mất quyền → POST read/unread/archive → response raw.
- Bằng chứng: `RUNTIME_VERIFIED` memory-only bằng service thật + mock từ chối target.
- Tác động: lộ nội dung lịch sử sau revoke.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: lỗi đã tái hiện.
- Đề xuất tối thiểu: mutation chỉ trả `{id,readAt,archivedAt}` hoặc reuse list projection.

## IAM-01 — Chính sách delegation/last-admin chưa khép kín

- Nguồn: CURRENT_INSTRUCTION §5.2; historical gap `docs/sprints/sprint-1-enterprise-gap-analysis.md:20-21`.
- Kỳ vọng: ceiling, duration, revoke, redelegation/cycle, real actor log và final admin policy rõ.
- Quan sát: UserRole có status/expiresAt/assignedBy; guard lọc active/unexpired role assignment. Không tìm thấy grant chain, parent delegation, redelegation flag/cycle hoặc cascade revoke. `UserManagementPolicy.assertRoles :199-205` kiểm role delegable + permission held nhưng không kiểm từng `permission.isDelegable`. Ngoài phần policy cần owner chốt, có một invariant code cụ thể: `users.service.ts:1155-1160` chỉ đặt `removingFinal` khi bỏ role code `system_admin`; giữ code đó nhưng đổi assignment khỏi scope `SYSTEM` hoặc đặt expiry vẫn đi qua ghi mới ở `:1177-1181`. Logic đếm tại `:1385-1416` cũng theo organization/rows, khác historical “final System Admin global”.
- Đường gọi: actor SYSTEM khác target gọi PUT role assignments; target là last active admin, request vẫn giữ role code `system_admin` nhưng đổi scope/expiry. Chưa tái hiện trên tenant/DB thật.
- Bằng chứng: `STATIC_ONLY`; unit có assignment expiry và disable last-admin, không có regression đổi scope/expiry của final admin hay cycle/redelegation.
- Tác động: audit không thể xác nhận delegation policy đầy đủ; tự đặt rule có thể khóa nhầm hoặc mở quá mức.
- Chắc chắn: cao về thiếu mô hình/source. Ưu tiên: **P1**. Loại: `NEEDS_OWNER_DECISION` + coverage gap.
- Đề xuất tối thiểu: chủ dự án chốt semantics trước; nếu không cho redelegation thì thêm guard nhỏ trên assignment hiện có, chưa xây engine mới.

## MKT-01 — Content có thể tham chiếu Campaign khác tenant

- Nguồn: CURRENT_INSTRUCTION §5.3 external IDs/tenant; historical marketing scope.
- Kỳ vọng: campaignId phải thuộc organization actor.
- Quan sát: `marketing.dto.ts:28` chỉ IsUUID; `marketing.service.ts:68-75,92-98` spread DTO không tenant check. Schema `ContentItem.campaignId` là FK đơn tại `schema.prisma:3584-3599`; list/get include full campaign `marketing.service.ts:49-52,77-87`.
- Đường gọi: tenant A gửi UUID campaign tenant B → content A nối campaign B → GET content trả campaign B.
- Bằng chứng: `STATIC_ONLY`; cần biết UUID target. Module disabled mặc định là counter-evidence cho tác động runtime hiện tại.
- Tác động: cross-tenant association và disclosure khi feature bật.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: lỗi tenant binding.
- Đề xuất tối thiểu: verify campaign organization trong transaction; sau phê duyệt mới cân nhắc composite FK additive.

## MKT-02 — Channel variant sửa được sau approve/schedule

- Nguồn: CORE v0.2 §2.3; CURRENT_INSTRUCTION §5.2 approval/publishing.
- Kỳ vọng: publisher dùng đúng nội dung đã duyệt; thay đổi sau duyệt phải quay lại review/version.
- Quan sát: `marketing.service.ts:92-98` khóa content gốc ngoài DRAFT/REJECTED, nhưng `variant :100-108` upsert ở mọi status. `publishing.service.ts:130-146` đọc live variant khi publish.
- Đường gọi: approve → schedule → actor có `marketing.content.update` đổi variant → process due đọc body mới.
- Bằng chứng: `RUNTIME_VERIFIED` memory-only. Fake provider `publishing.service.ts:24-33` chặn production nên chưa có bằng chứng đăng công khai thật.
- Tác động: phá integrity approval; production blocker nếu nối provider.
- Chắc chắn: cao. Ưu tiên: **P2 hiện tại / P0 trước khi bật provider thật**. Loại: lỗi đã tái hiện.
- Đề xuất tối thiểu: reuse DRAFT/REJECTED guard cho variant; sửa sau duyệt đưa content về review.

## FIN-02 — Customer payment chấp nhận số/rate không dương và trừ khác currency

- Nguồn: CORE v0.2 giai đoạn 7; CURRENT_INSTRUCTION §4 về precision/currency.
- Kỳ vọng: amount/allocation/rate dương; allocation cùng currency hoặc có conversion snapshot được phê duyệt.
- Quan sát: `contracts.dto.ts:75-108` chỉ IsNumberString/Length. `contracts.service.ts:336-343` chỉ so tổng allocations với amount; `:365` chỉ chống lớn hơn outstanding; `:377-403` lưu currency/rate nhưng trừ nominal allocation khỏi schedule.
- Đường gọi: payment `-10` + allocation `-10` → check equality và over-limit đều qua → paid giảm/outstanding tăng; hoặc 100 USD trừ 100 vào schedule VND.
- Bằng chứng: `RUNTIME_VERIFIED` memory-only bằng DTO/service thật + mocked persistence: DTO nhận `amount=-10`, `exchangeRate=-1`, currency USD trên schedule VND; service ghi paid `-10` và outstanding `110`. Migrations không có CHECK dương tương ứng. Unit hiện tại chỉ kiểm 99 ≠ 100 tại `contracts.test.ts:40-54`.
- Tác động: sai công nợ và báo cáo tài chính.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: lỗi financial input/invariant.
- Đề xuất tối thiểu: validate Decimal > 0/precision; tạm chặn currency khác và rate <= 0; chỉ thêm conversion sau owner decision.

## FIN-03 — Không append được đợt thanh toán thứ hai từ UI

- Nguồn: CORE v0.2 §2.1, giai đoạn 6–7.
- Kỳ vọng: một Contract có nhiều milestones/schedules và bổ sung được theo phụ lục.
- Quan sát: UI `apps/web/app/projects/[projectId]/contracts/[contractId]/page.tsx:84-100` gửi một item/lần; service `contracts.service.ts:302-328` luôn sequence `index+1`; schema unique `(contractId,sequence)` tại `schema.prisma:1880`.
- Đường gọi: lần đầu tạo sequence 1; lần hai lại sequence 1 → P2002, không handler business-friendly.
- Bằng chứng: `STATIC_ONLY`; API một request chứa nhiều items vẫn tạo được nhiều schedule.
- Tác động: workflow nhiều đợt cốt lõi bị chặn ở UI/command.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: thiếu nghiệp vụ/bug.
- Đề xuất tối thiểu: append từ max sequence trong transaction; validate tổng existing + new; không tạo Schedule domain mới.

## FIN-04 — Apply appendix không exactly-once/concurrency-safe

- Nguồn: CORE v0.2 §2.3, giai đoạn 6; CURRENT_INSTRUCTION §4 concurrency/retry.
- Kỳ vọng: mỗi appendix hiệu lực một lần; nhiều appendix đồng thời giữ đúng currentValue/history.
- Quan sát: `contracts.service.ts:239-251` đọc appendix trước transaction; `:252-294` đọc currentValue rồi gán tổng, không row lock/CAS/Serializable. `ContractValueHistory.appendixId` không unique tại `schema.prisma:1770`.
- Đường gọi: hai transition EFFECTIVE đồng thời thấy cùng base; lost update hoặc cùng appendix áp hai lần tùy interleaving.
- Bằng chứng: `STATIC_ONLY`; chưa chạy concurrency DB.
- Tác động: sai contract value và audit history.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: thiếu kiểm soát đồng thời.
- Đề xuất tối thiểu: lock contract, reread/claim appendix trong transaction, conditional status và unique event application.

## FIN-05 — Appendix cộng trực tiếp giá trị khác currency

- Nguồn: CORE v0.2 giai đoạn 6–7; CURRENT_INSTRUCTION §4 currency.
- Kỳ vọng: valueChange cùng contract currency hoặc conversion snapshot có policy.
- Quan sát: `contracts.service.ts:204-217` nhận currency appendix; `:267` cộng Decimal trực tiếp vào `contract.currentValue` không so currency. Retention không được tính lại khi currentValue đổi.
- Đường gọi: appendix USD EFFECTIVE trên contract VND.
- Bằng chứng: `STATIC_ONLY`.
- Tác động: sai giá trị hợp đồng, retention và downstream dashboard.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: lỗi financial semantics + `NEEDS_OWNER_DECISION` cho retention.
- Đề xuất tối thiểu: trước mắt reject currency khác; chủ dự án chốt retention theo baseline hay current value.

## OPS-01 — Add shipment item có race vượt PO remaining

- Nguồn: CORE v0.2 giai đoạn 8–10; CURRENT_INSTRUCTION §4 concurrency/multi-shipment.
- Kỳ vọng: tổng quantity qua mọi shipment không vượt PO line dưới concurrent calls.
- Quan sát: `logistics.service.ts:422-464` load shipment, aggregate existing items, check remaining rồi create ngoài transaction. Endpoint `logistics.controller.ts:106-107` cho add item.
- Đường gọi: hai request vào hai shipment PLANNING cùng PO line đọc cùng remaining rồi đều create.
- Bằng chứng: `STATIC_ONLY`; create shipment batch `:158-294` đã dùng Serializable và là pattern nên reuse.
- Tác động: đặt vận chuyển vượt lượng PO, sai nhận/kho.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: lỗi concurrency.
- Đề xuất tối thiểu: lock/check lại PO line và shipment status trong transaction như create path.

## OPS-02 — Acceptance lô A mở gate handover lô B

- Nguồn: CORE v0.2 giai đoạn 12; nguyên tắc stage gate.
- Kỳ vọng: item của mỗi handover phải được nghiệm thu tương ứng.
- Quan sát: `after-sales.service.ts:398-403` chỉ count một AcceptanceRecord ACCEPTED bất kỳ theo Project. Handover DTO/model không link acceptance; checks checklist/doc/critical punch vẫn có tại `:393-423`.
- Đường gọi: Project có acceptance cho batch A → complete handover chứa batch B chưa được acceptance.
- Bằng chứng: `STATIC_ONLY`.
- Tác động: bàn giao hàng chưa nghiệm thu; mất traceability responsibility/evidence.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: điều kiện kiểm soát sai phạm vi.
- Đề xuất tối thiểu: kiểm coverage installationItemId qua InspectionItem/Acceptance và lưu evidence link; không bỏ các gate đang có.

## CORE-01 — Đứt lineage ở cấp dòng/version xuyên chuỗi

- Nguồn: CORE v0.2 §2.1–2.3 và giai đoạn 4–12.
- Kỳ vọng: requirement/approved selection revision → estimate line → quotation line → contract scope → PR/PO line → receipt/install/acceptance/warranty bằng ID/version bất biến.
- Quan sát: EstimateLineItem chỉ có productId/supplierId scalar, không projectProductRevisionId (`schema.prisma:1435-1470`); quotation mapping `commercial.service.ts:432-442` bỏ source estimate line/revision; PR source chỉ scalar `PurchaseRequest.sourceId` (`schema.prisma:1923-1924`) và `procurement.service.ts:236-268` chỉ kiểm approved header, không kiểm approved quantities/lines.
- Đường gọi: ProjectProduct approval → estimate/quotation copy mô tả/số → PR/PO nhận lines tùy ý → downstream có PO IDs nhưng không quay được về revision cam kết.
- Bằng chứng: `STATIC_ONLY`; Project/domain header links tồn tại là counter-evidence, nên không kết luận toàn chuỗi mất.
- Tác động: không trả lời chắc “đúng sản phẩm/version khách duyệt đã mua/giao/lắp chưa”; P1 cốt lõi.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: thiếu nghiệp vụ traceability.
- Đề xuất tối thiểu: chọn một happy path MVP, thêm source line/revision IDs ở các điểm copy; không tạo ProjectProduct/Contract/PO song song.

## CORE-02 — Contract conversion bỏ accepted terms/version

- Nguồn: CORE v0.2 giai đoạn 5–6; §2.3.
- Kỳ vọng: Contract giữ quotation version và điều khoản khách chấp nhận.
- Quan sát: `contracts.service.ts:64-71` load header; `:101-104` đặt payment/delivery/installation/warranty terms null; `:108-115` snapshot chỉ quotationId/value. Quotation version có terms tại `commercial.service.ts:473-489`.
- Đường gọi: accepted quotation → create Contract → provenance không đủ tái dựng terms.
- Bằng chứng: `STATIC_ONLY`.
- Tác động: tranh chấp/audit không xác định chính xác cam kết nguồn.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: thiếu snapshot.
- Đề xuất tối thiểu: copy accepted current version ID và terms vào snapshot/contract hiện có.

## CORE-03 — Approved Survey vẫn mutation qua complete

- Nguồn: CORE v0.2 §2.3, giai đoạn 2.
- Kỳ vọng: approved survey bất biến hoặc tạo version mới.
- Quan sát: `discovery.service.ts:108-111` updateSurvey chặn approved; `completeSurvey :127-157` không dùng guard và đổi surveyedAt/version sau approval.
- Đường gọi: approve survey → complete survey.
- Bằng chứng: `STATIC_ONLY`; chưa có regression hiện tại.
- Tác động: approved evidence không reproducible.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: lỗi immutability.
- Đề xuất tối thiểu: dùng chung mutation guard cho mọi command; regression complete-after-approve.

## CORE-04 — Estimate reject không có revise lineage

- Nguồn: CORE v0.2 giai đoạn 5; §2.3.
- Kỳ vọng: sửa/resubmit draft/rejected hoặc tạo version kế tiếp của cùng estimate.
- Quan sát: `commercial.controller.ts:32-105` chỉ create/get/submit/approve/reject; service create version 1 `commercial.service.ts:283-289`; state DRAFT→PENDING→APPROVED/REJECTED `:343-347`, không revise estimate.
- Đường gọi: reject estimate → không có command sửa/version tiếp; tạo estimate mới mất lineage.
- Bằng chứng: `STATIC_ONLY`; Quotation/ProjectProduct đã có revise pattern.
- Tác động: so sánh version và audit báo giá đầu nguồn không hoàn chỉnh.
- Chắc chắn: cao. Ưu tiên: **P2**. Loại: thiếu nghiệp vụ.
- Đề xuất tối thiểu: một revise/copy command trên model hiện có; approved immutable.

## CORE-05 — Task dependency chỉ hiển thị dữ liệu, không chặn complete

- Nguồn: CORE v0.2 §2.2/2.4; CURRENT_INSTRUCTION tình huống A vướng/B sẵn sàng.
- Kỳ vọng: dependency policy quyết định task nào bị chặn; lý do phải thấy được.
- Quan sát: `tasks.service.ts:51-55` include requiredTask; `changeStatus :286-317` cập nhật trực tiếp không đọc dependencies. UI detail khai type nhưng không render dependency trong `apps/web/app/tasks/[taskId]/page.tsx:87-182`.
- Đường gọi: task có requiredTask chưa DONE → changeStatus DONE.
- Bằng chứng: `STATIC_ONLY`; source không nêu mọi dependency là hard gate, nên rule chính xác là `NEEDS_OWNER_DECISION`.
- Tác động: thứ tự công việc không được kiểm soát hoặc UI không giải thích blocker.
- Chắc chắn: cao về thiếu enforcement; trung bình về rule mong muốn. Ưu tiên: **P2**.
- Đề xuất tối thiểu: owner chốt hard/soft dependency; nếu hard, một guard tại changeStatus/complete và render dữ liệu đã có.

## DASH-01 — Dashboard global cộng tiền đa tiền tệ

- Nguồn: CORE v0.2 dashboard kinh doanh/tài chính; CURRENT_INSTRUCTION §4.
- Kỳ vọng: tổng theo currency hoặc base conversion có snapshot/công thức công bố.
- Quan sát: `dashboard.controller.ts:38-43,55-60,88,95` aggregate estimatedValue và group stage không group currency.
- Đường gọi: 100 USD + 1.000.000 VND → KPI số 1.000.100 không có currency.
- Bằng chứng: `STATIC_ONLY`; Project dashboard mới có per-currency grouping và nên giữ.
- Tác động: KPI pipeline sai nghĩa.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: lỗi quản trị tài chính.
- Đề xuất tối thiểu: group/return per currency; chưa cần FX service khi policy chưa chốt.

## UX-01 — Actions/alerts chỉ lọc 20 Project của trang hiện tại

- Nguồn: CORE v0.2 mục tiêu quản lý; CURRENT_INSTRUCTION §5.4.
- Kỳ vọng: queue toàn phạm vi có pagination/filter server-side đúng nghĩa.
- Quan sát: `apps/web/app/projects/page.tsx:94-102,119-148` tải pageSize 20 rồi batch summaries các ID đó; `stage-one-projects.ts:37-55` filter local.
- Đường gọi: `/projects/actions` hoặc `/alerts` → page 1 Project → lọc Stage1 local.
- Bằng chứng: `STATIC_ONLY`; có batch API và phân biệt load error, không N+1.
- Tác động: báo “không có mục” dù trang sau còn việc; quản lý bỏ sót.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: UX/queue semantics.
- Đề xuất tối thiểu: endpoint queue server-side hoặc pagination qua mọi matching summaries; reuse Task/Stage summaries.

## UX-02 — Queue bỏ owner, hạn, evidence và route xử lý

- Nguồn: CORE v0.2 §2.2; CURRENT_INSTRUCTION §5.4.
- Kỳ vọng: vướng gì, vì sao, ai chịu trách nhiệm, căn cứ, quyết định và next action.
- Quan sát: backend rules `apps/api/src/projects/project-stage-one.rules.ts:393-396,698-712` sinh owner/dueDate/route/remediation; frontend read-model `project-pms.tsx:73-82` giữ các trường này, nhưng mapper `stage-one-projects.ts:3` bỏ owner/hạn; tables `projects/page.tsx:693-758` chỉ title/readiness/remediation và link root Stage1 thay vì `flag.route`.
- Đường gọi: stage summary → local mapper → table.
- Bằng chứng: `STATIC_ONLY`, phản chứng cho thấy backend có dữ liệu một phần.
- Tác động: quản lý thấy cảnh báo nhưng không điều phối được ngay.
- Chắc chắn: cao. Ưu tiên: **P2**. Loại: UI chưa thể hiện nghiệp vụ đã có.
- Đề xuất tối thiểu: render fields/route hiện có trước khi tạo dashboard mới.

## UX-03 — Dashboard chưa drill progress–money–goods–risk và không realtime

- Nguồn: CORE v0.2 mục 1/5/9; CURRENT_INSTRUCTION §5.4.
- Kỳ vọng: KPI truy được về source, chỉ rõ thiếu dữ liệu/công thức và cơ chế cập nhật.
- Quan sát: home `apps/web/app/page.tsx:7-40` chỉ lead/pipeline/project/overdue + tám task; Project KPI cards `projects/page.tsx:348-410` không drill. `app/lib/api.ts:24-34` fetch no-store; không polling/SSE/WebSocket nghiệp vụ.
- Đường gọi: load-on-mount/refresh → aggregate cards.
- Bằng chứng: `STATIC_ONLY`; project backend có per-currency/scope tests nên không gọi dashboard là giả.
- Tác động: BGĐ không truy nguồn money/goods/risk và dữ liệu không tự cập nhật.
- Chắc chắn: cao. Ưu tiên: **P2**. Loại: thiếu UX/observability.
- Đề xuất tối thiểu: drill links + source/missing markers; mô tả refresh thủ công. Chỉ thêm realtime khi có nhu cầu SLA đã chốt.

## ARCH-01 — Nguồn vốn đầu tư công còn trong API/schema nhưng không đủ kết luận lệch toàn hệ thống

- Nguồn: CORE v0.2; historical domain separation design.
- Kỳ vọng: Galaxy core không bị bắt buộc bởi taxonomy đầu tư công nếu project type không cần.
- Quan sát: enum `PUBLIC_INVESTMENT_2026/ODA_CONCESSIONAL_LOAN/PPP/MIXED_OTHER` tại `schema.prisma:224-228`; DTO còn nhận tại `project-stage-one.dto.ts:77-90`; service persist tại `project-stage-one.service.ts:2651-2762`. Counter-evidence: `docs/superpowers/specs/2026-08-24-project-ui-stage-one-domain-separation-design.md:7` cấm kế thừa construction/legal; rules `project-stage-one.rules.ts:129-150` map thuật ngữ legacy; không thấy selector funding source đang render.
- Đường gọi: API updateSimple có thể lưu optional fundingSource; core business paths không phụ thuộc bắt buộc theo bằng chứng đã đọc.
- Bằng chứng: `STATIC_ONLY`.
- Tác động: compatibility surface gây nhiễu định hướng; tự xóa có nguy cơ mất dữ liệu/lịch sử.
- Chắc chắn: cao về tồn tại, thấp về quyết định retire. Ưu tiên: **P2**. Loại: `NEEDS_OWNER_DECISION`.
- Đề xuất tối thiểu: chốt KEEP optional/hidden hay deprecate; không sửa applied migrations, không xóa dữ liệu trong audit.

## BUILD-01 — Clean install không typecheck/build API

- Nguồn: repository Definition of Done; setup `pnpm install --frozen-lockfile` + `pnpm db:generate`.
- Kỳ vọng: clone/install sạch theo lockfile typecheck và build được.
- Quan sát: sau `pnpm install --offline --frozen-lockfile` và `pnpm db:generate` trong worktree tách biệt, `pnpm typecheck` exit 2 và root build exit 1. API báo 16 references `Cannot find namespace 'Express'` trong typecheck và 7 source references trong build. `apps/api/package.json` không khai báo `@types/multer`; lockfile cũng không có importer entry. node_modules cũ tại cây chính có symlink orphan `apps/api/node_modules/@types/multer`, nên lần kiểm tra trước clean install đã pass và không đáng dùng làm kết luận sạch.
- Đường gọi: clean frozen install → generated Prisma client → `tsc --noEmit`/`nest build`.
- Bằng chứng: `RUNTIME_VERIFIED`, xem `05-verification.md`.
- Tác động: CI/clone mới có thể fail dù máy dev cũ xanh.
- Chắc chắn: cao. Ưu tiên: **P1**. Loại: lỗi reproducibility.
- Đề xuất tối thiểu: khai báo đúng type dependency hiện đang được code dùng; không nâng version khác.

## QUALITY-01 — Format check fail sáu file có trước audit

- Nguồn: repository Definition of Done.
- Kỳ vọng: `pnpm format:check` exit 0.
- Quan sát: exit 1 trên đúng sáu path có trước audit; không chạy `--write`: `apps/api/src/me.service.ts`, `apps/api/src/me.service.test.ts`, `apps/web/app/settings/users/[userId]/user-detail.tsx`, `docs/superpowers/plans/2026-08-11-stage-one-governance-required-documents-rebuild.md`, `docs/superpowers/plans/2026-08-12-simplified-stage-one-multifile.md`, `docs/superpowers/plans/2026-08-14-optional-documents-stage2-plan.md`.
- Đường gọi: Prettier check toàn repo.
- Bằng chứng: `RUNTIME_VERIFIED`.
- Tác động: full regression chưa xanh; không phải lỗi nghiệp vụ.
- Chắc chắn: cao. Ưu tiên: **P3**. Loại: quality gate.
- Đề xuất tối thiểu: format đúng sáu file trong phiên sửa được duyệt; không dùng format cả repo để kéo diff ngoài scope.

## Các thiếu hụt không nâng thành finding lỗi đã xác nhận

- Exact 12-module/28-data-group source file: `SOURCE_NOT_IN_REPO`; dùng phụ lục prompt làm CORE.
- DesignPackage/DesignVersion độc lập, cashflow forecast 30/60/90, exchange-rate master, SiteDelivery commands và settlement engine: `MISSING/PARTIAL` theo traceability, nhưng chưa được phép thiết kế mới.
- Handover khi còn defect, biên bản giao nhận trước/sau giao, parallel stage gates, project code cho master/lead, limit/approver/exception/profit/progress formula: `NEEDS_OWNER_DECISION` trong `07-owner-decisions.md`.
- Marketing chưa có live provider theo source và Document AI mới là health placeholder: `DEFERRED_BY_SCOPE`; trạng thái enablement/runtime production là `NOT_VERIFIED`.

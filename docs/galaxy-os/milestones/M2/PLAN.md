# Galaxy OS M2-A Implementation Plan

## LOCAL3000 — chỉ đạo mới 2026-09-29

Chủ dự án cho phép thay Web/runtime local tại `http://localhost:3000`, không cho phép tự di trú database đang dùng. Giữ INLINE, B1–B5 và M3 có điều kiện; không ghi rằng chủ dự án đã đọc PLAN này. Source đầu lượt `43c1195`; main cũ `7faeb58`. Không dùng log dự án khác.

Thiết kế kỹ thuật đã review: **Web mới → API cũ tương thích, M2 tắt**. API mới không thể nối schema69 vì thiếu `OrganizationMembership.kind`; bật M2 còn chịu guard G00. Không nối chat sang DB thử và không sửa guard. Chỉ đưa UI cũ còn tương thích của Web mới lên3000; chưa đạt LOCAL_3000_READY đầy đủ.

- L3000-1: đối chiếu process/cwd, schema/read-only, auth/cookie/origin và recipe quay lại. Không thay account/role/schema/storage.
- L3000-2 (đã code): `apps/web/app/installations/work-orders/[id]/page.tsx` làm server wrapper; client hiện hữu chuyển sang `work-order-client.tsx`. `deliveryEnabled` chỉ true khi server flag đúng `true`; chặn shared loadOptions/createDelivery và UI khi false. Không đổi payload lệnh lắp đặt cũ. `compatibility.test.tsx` kiểm flag true/false/absent, key theo id và endpoint mount thực thi; bỏ guard phải RED. Giữ `page.test.ts` precision/retry. Lệnh `pnpm --filter @galaxy/web test`, typecheck/lint/format/build.
- L3000-3 (đã thực hiện): build rồi stop graceful đúng Web launcher, chạy Next development từ worktree tại3000; `/api/v1` duy nhất tới3001, cookie `galaxy_session`, chat=false. Root API107475 không restart. Chrome hiện có kiểm `/me`, Project đọc-only; không reset login hoặc dùng persona fixture. Rollback đã được thực hiện và kiểm `/me200` trong lượt.
- L3000-4 (BLOCKED): 13 migration đang thiếu trên main cần xác nhận riêng trước write; hai checksum lịch sử khác Git cần đối soát nguồn, không sửa ledger. Read-only Prisma diff với baseline69 chỉ báo sáu tên index khác; không chứng minh toàn bộ custom SQL lịch sử. Chỉ sau clock/gate và rollout review phù hợp mới đề nghị áp main, không tự đổi G00 guard.
- L3000-5: observer hiện hữu chặn targeted hai setup case vì CLOCK_CONTAMINATED_BASELINE; repeat10/fullAPI/fullbrowser vẫn chưa nghiệm thu. Không sửa expected, backdate grant hoặc mock giờ để đạt gate. M3 vẫn NOT_STARTED.

Review: Sol/medium là source writer; Astra/high đọc-only compatibility/correctness/security/UX, parent rà diff Ponytail. Requested/dispatch được chấp nhận; runtime không cung cấp actual model ID/effort → VERIFIED_MODEL: UNVERIFIED. Không tạo router hoặc đổi model ứng dụng.

## Điểm thực thi cuối sau Luna — 2026-09-28

C0–C6 đã có các commit backend/UI/test được nêu trong VERIFICATION; giữ thiết kế đã review, không làm lại. C7 prerequisite phát hiện trên Chrome: `/installations/work-orders/:id` bị proxy lấy fallback dashboard.read dù API/link Project dùng installation.read. Thêm đúng một mapping trong `apps/web/app/portal-navigation.ts`, regression matcher trong `.test.ts`; fixture `apps/api/test/m2-browser.fixture.ts` cấp project.read SELF riêng cho sender owner/publisher member. Không thêm sidebar, quyền dashboard hoặc quyền Project toàn tổ chức. RED2→GREEN10, fullWeb522, independent correctness/security/Ponytail review đóng; commit a13c2ec, Chrome symptom đã hết sau rebuild.

UI691e391 đã xử lý C4 form/retry/late-options, C5 purpose/file và Chrome headed config. Tiếp tục phần chưa nghiệm thu: sau host clock ổn, chạy targeted còn setupfailed, repeat10,2fullAPI,fullbrowser21case không retry, mọi biến thể publication/race/upload/mobile/navigation. C3 handover và C4 post-I/O chưa được gọi PASS; giữ IDs24+30. Không code M3 trước gate. Nếu chưa đủ executable Chrome cho native suite, dùng Windows Chrome đã xác minh theo harness phù hợp; không gọi MCP demo là native full suite.

### C6 — Cấu hình nghiệm thu browser theo chỉ đạo Chrome

Playwright1.51.1 local types hỗ trợ channel/headless. Đổi default `apps/web/playwright.m2.config.ts` sang Google Chrome headed; giữ cấu hình legacy Chromium dưới entrypoint riêng, chỉ evidence bổ sung khi gọi tường minh. Không đổi tab/profile người dùng hoặc tắt sandbox/TLS. Windows Chrome154 đã nối được bằng MCP; chưa được coi suite Playwright native đã chạy chỉ từ kết nối đó. Kiểm config/discovery bằng `--list`, rồi chạy nghiệm thu khi clock và executable thực tế đủ điều kiện. Không cài browser thứ hai theo phản xạ trong lúc gate clock vẫn chặn.

Review UI C4 bổ sung: giữ key/payload chỉ với network/5xx chưa rõ kết quả;400/409/422 mở lại sửa yêu cầu,401/403/404 xóa phần không còn quyền. Lỗi tải options tạm thời có nút thử lại, khác feature-off/denied. Auth đổi hoặc WorkOrder đổi phải xóa RAM và bỏ response cũ. Browser calls dùng proxy cùng origin HTTPS; publication cases chia sẻ một fixture riêng append-only để không tự vượt login limiter, các persona vẫn context tách biệt. Fixture thêm đúng publisher ProjectMember cho quyền xem Project của domain kho (RED404 có record, GREEN qua writer), không đổi policy production.

### C5 — Bản lưu hợp đồng theo trạng thái đã ký

Review B5 không đòi chữ ký mật mã hoặc workflow duyệt mới. Giữ CONTRACT_FILE, thêm purpose hữu hạn RECORDED_SIGNED_COPY cạnh CUSTOMER_REVIEW_FILE mặc định; server kiểm trạng thái/ngày ký Contract hoặc Appendix thực tế, pin purpose và các trường nguồn trong fingerprint. Không tự suy người ký Appendix từ createdBy; chỉ audit người đăng ký/preparer/publisher. Nhãn “Bản lưu theo hồ sơ đã ký (trạng thái do người có quyền ghi nhận)”, không gọi đó là xác minh chữ ký hoặc approval cho binary.

Tái dùng exact paths `contract-file-source.ts`, `project-chat.{dto,controller,service}.ts`, UI chat-controls và test/fixture hiện hữu; không migration/model Approval mới. Quyền chuẩn bị đúng tác vụ nguồn: contract.update hoặc appendix.approve, luôn scoped/read/file/room đúng policy; publisher khác actor chỉ cần source/file read và PUBLISH. Mỗi purpose có eligibility riêng, không để thiếu quyền default review làm mất signed option hợp lệ. Query/body/retry hash gồm purpose; checkedRelease lấy purpose persisted server, missing legacy chỉ fallback CUSTOMER_REVIEW_FILE. Không thay fingerprint cũ không cần thiết. Same key khác purpose409; nguồn status/date/version hoặc file thay trước publish phải stale.

Test trạng thái/ngày ký thiếu, Appendix APPROVED chưa SIGNED, quyền appendix-only và scope sai, hai purpose không collision, replay409, stale/revoke, exact bytes, không đổi source status/approval/tiền. Gate trạng thái nhận đúng transition nguồn đã đọc (Contract SIGNED/ACTIVE/SUSPENDED/COMPLETED có signedDate, giữ deny CANCELLED/TERMINATED của source hiện hữu; Appendix SIGNED/EFFECTIVE có signedDate); không tự tạo APPROVED cho Contract. Astra review trước code, Sol UI sau backend, giữ clock/test limitations.

### C4 — Ghi nhận giao tại công trường và file chứng cứ có nguồn

Khoảng trống A/B/C đã được rà bằng source: `SiteDelivery` tồn tại nhưng chưa có writer, pin version/checksum hoặc đường dùng. Bổ sung tối thiểu trong `apps/api/src/installation/installation.{controller,dto,service}.ts`, schema/migration additive và module publication hiện hữu; UI tại `apps/web/app/installations/work-orders/[id]/page.tsx` và chat-controls. Không gọi installItem, không tạo stock movement, nghiệm thu hoặc đổi trạng thái WorkOrder để có nguồn phát hành.

`POST /installation/work-orders/:id/deliveries` ghi nhận do nhân viên cung cấp, cùng tenant/Project, nguồn StockIssueLine thuộc issue ISSUED; server lấy mã hàng/đơn vị/lot/serial, kiểm lượng dương đúng precision không vượt dòng nguồn. Ngày/người nhận và evidenceFileId/version được validate. SiteDelivery tạo liên kết với WorkOrder; không giả StockIssueLine đã có FK WorkOrder trước đó. Không thêm sổ phân bổ hoặc quy tắc cộng dồn giao hàng. Quyền fresh installation.execute/read và file.read/download, append-only/idempotency theo actor/WorkOrder/key; key khác payload conflict. Options/UI dùng nguồn thật, không nhập UUID hoặc seed để demo.

Pin evidenceFileVersion/checksum và typed FK; legacy thiếu bằng chứng vẫn fail-closed, không backfill approval giả. Source SITE_DELIVERY/ChatDocumentRelease FK dùng cùng prepare/review/publish/download, source fingerprint và người phát hành khác người chuẩn bị. Nhãn “Nhân viên ghi nhận giao tại công trường”, không chứng minh khách ký hoặc nghiệm thu. I/O hash ngoài transaction, khóa/reauth cuối cùng theo Project→FileAsset; reviewer kiểm lock tương tác helper ownership hiện có trước áp migration. SQL additive được review, chỉ deploy DB test đã xác minh, không reset/db push.

Test đường HTTP nghiệp vụ → publication → guest exact bytes, sai tenant/Project/customer/source/quantity/version, key khác payload, stale/revoke/race, số inventory transaction/installation item/acceptance không đổi. Dùng integration hiện hữu nếu fixture phù hợp; UI/unit/browser cùng đường thật. Astra-high rà nguồn/quyền/migration; Sol nối UI sau khi backend ổn định. Đây là thiết kế kỹ thuật trong chỉ đạo A/B/C, không ghi chủ dự án đã đọc PLAN. Clock-contaminated chỉ chẩn đoán, không nghiệm thu đầy đủ.

### C0 — Timeout monotonic trong runner; không sửa clock nghiệp vụ

`@vitest/runner@3.2.6` dùng Date.now cho elapsed timeout nhưng performance.now cho duration. Native pnpm patch một dòng `dist/chunk-hooks.js` sang performance.now đã capture, giữ Date fallback và unixNow báo cáo. T3 đã rà toàn consumers của `_currentTaskStartTime/_currentTaskTimeout`: không có đường đọc dùng epoch khác. Exact files: `patches/@vitest__runner@3.2.6.patch`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `scripts/m2-vitest-clock.test.mjs`. Probe subprocess riêng chỉ import Vitest, không app/DB; clock forward183s với test ngắn phải PASS; clock backward183s với busywait80ms hoặc async80ms phải timeout40ms. RED2FAIL/1PASS, GREEN3PASS; frozen offline install đạt. Không tăng timeout, không đổi auth/expiry/DBDate, không dùng patch để gỡ CLOCK_CONTAMINATED.

### C3 — Bằng chứng biên bản/bàn giao có nguồn hiện hữu

Tái dùng `HANDOVER` từ `AfterSalesService.addHandoverDocument/signHandoverDocument`, các loại HANDOVER_MINUTES và AS_BUILT_DRAWING đã được adapter nhận; không adapter/domain song song. UI nhãn mục đích và handoverStatus đúng nguồn; không gọi NOT_REQUIRED là đã ký hoặc signed manually là chữ ký đã xác minh. Integration bổ sung hai loại qua writer thật, pin binary/version, scope/permission/superseded deny và so trước/sau không thêm inventory transaction/installation item/acceptance/warranty. Existing WARRANTY_DOCUMENT assertions giữ nguyên. Exact paths: `apps/api/test/m2-project-chat.integration.test.ts`, `apps/web/features/project-chat/chat-controls.tsx`, unit/browser hiện hữu khi fixture dùng được. SiteDelivery trước lắp chưa có writer/linkage version; giữ khoảng trống A/B/C riêng, không lấy HANDOVER sau lắp để giả đã giao trước lắp.

### C2 — Chứng từ của khoản thu hiện hữu (review kỹ thuật, triển khai INLINE)

Không coi snapshot khoản thu là biên lai. Tái dùng `ChatDocumentRelease.customerPaymentId/fileAssetId` và source snapshot server để đăng ký mục đích hữu hạn `CUSTOMER_PAYMENT_FILE`, file do nhân viên cung cấp cho đúng khách. Không thêm sổ thanh toán hoặc gọi writer ghi tiền lúc prepare/publish. Preparer cần fresh `receivable.payment.record`, `receivable.read`, file read/download và room UPLOAD; publisher khác actor có quyền đọc nguồn và Project PUBLISH. Pin file version/checksum, payment/customer/project/fingerprint, kiểm lại sau I/O, lưu key/payload, chặn file thuộc hợp đồng/khoản thu khác/26 nguồn nội bộ. Không tự khẳng định đối soát hoặc lọc bí mật bên trong bytes; người phát hành phải xem đúng bản dành cho khách.

Exact paths: helper hữu hạn hiện có `apps/api/src/project-chat/contract-file-source.ts`, DTO/controller/service cùng module; integration test hiện có; UI selector/review ở `apps/web/features/project-chat/chat-controls.tsx`, unit/browser và fixture hiện hữu. Không cần migration vì typed FK và CHECK hiện có đủ cho nguồn khoản thu. Ca kiểm: upload/domain thật → chọn file → preparer khác publisher → guest exact bytes; currency/customer mismatch; fresh quyền/revoke; stale source/binary; same-key/different payload; ownership hai chiều; không tăng payment/allocation; race cuối giao dịch. Reviewer Astra-high đã rà thiết kế kỹ thuật, không ghi chủ dự án đã đọc PLAN.

## Tiếp tục sau Luna — baseline c7b74d1, 2026-09-28

Giữ code đã commit; chỉ đạo chủ dự án cho phép cập nhật kỹ thuật và thực thi INLINE. M3 chỉ thực thi khi M2-A qua gate. Astra-high review phát hiện khoản thu khác tiền tệ với nghĩa vụ vẫn được đưa ra publication; sửa tại adapter, không thay quy tắc ghi tiền. TDD trong `apps/api/test/m2-project-chat.integration.test.ts`, tách fixture độc lập để không kéo dài ca cũ sát timeout. Lệnh dùng trực tiếp Vitest và recipe `scripts/m2-a-isolated.env.example`, không thêm dấu `--` qua wrapper pnpm.

Task kế tiếp `CONTRACT_FILE` tái dùng `ContractDocument`/`FileAsset` và luồng release hiện hữu. Mục đích hữu hạn `CUSTOMER_REVIEW_FILE`: file hợp đồng/phụ lục gửi khách xem xét, không chứng minh ký hoặc duyệt nghiệp vụ. `ChatReleaseDto`/`prepareRelease` nhận contract ID, appendix ID nếu có, file ID/version, dấu nguồn server đã cấp và clientKey. Service kiểm contract.read/update đúng scope, file.read/download, room UPLOAD, nội bộ cùng tenant/Project/customer; file có attachment thuộc Project khác bị từ chối. Chốt checksum từ storage, snapshot/fingerprint nguồn hiện tại, phiên bản ContractDocument và actor dưới khóa Project/file đúng thứ tự; kiểm lại quyền/nguồn khi chốt và phát hành. Không giữ transaction dài để render/upload. Không dùng ContractVersion khởi tạo như thể đó là version cập nhật của mọi thay đổi; lưu nguồn canonical và updatedAt, không tự tạo approval.

Exact paths: `apps/api/src/project-chat/project-chat.dto.ts`, `project-chat.controller.ts`, `project-chat.service.ts`; integration test hiện hữu. UI nối trong `apps/web/features/project-chat/chat-controls.tsx` với source key bao gồm sourceType để CONTRACT và CONTRACT_FILE không trùng lựa chọn; chọn đúng file/version từ danh sách được phép. Không thêm migration nếu các typed FK hiện hữu đủ. Test positive đi qua upload/domain/prepare/review/publish/download binary thật; negative sai Project/customer/version, thiếu quyền, stale source, cùng key khác payload, self-publish, file mutation. Source list/preview/download phải giữ lịch sử và quyền hiện tại. Unit UI và browser dùng fixture/session riêng, không điều khiển tab3000 của người dùng để mutation.

Clock observer mới `f6ce2d78-53b9-4f17-b3c8-e0c5b4525c87` vẫn contaminated; targeted diagnostic tiếp tục, full API/repeat10 chỉ chạy sau baseline sạch. Một worker viết source, một reviewer đọc; main3000 chỉ đọc. Phân model native mới dùng medium/high, không giữ Luna-low trong cấu hình hiện hành.

Review độc lập tìm thấy các nguồn nội bộ dùng scalar file ID/storage key mà không đổi attachment Project. Đăng ký file hợp đồng phải từ chối cả các nguồn đó. Điểm chốt sau I/O cần thứ tự nguyên tử với writer legacy: khóa SHARE NOWAIT trên danh sách hữu hạn bảng scalar nguồn, kiểm lại ownership rồi commit; xung đột 55P03 trả 409, không retry tự động. Không khóa bảng ContractDocument/ChatDocumentRelease do chính transaction ghi, không giữ khóa bảng qua I/O, không sửa các workflow nghiệp vụ khác. Đây là giới hạn contention toàn bảng được công bố, cần test barrier và review placement trước commit, không coi thêm count guards là đã xử lý race.

## Bổ sung kết quả tiếp tục 945d1ca

Đã hoàn tất một phần source publication payment bằng model `CustomerPayment` và `PaymentAllocation` hiện hữu. `CUSTOMER_PAYMENT_RECORD` tạo customer-facing snapshot typed/version-pinned qua luồng prepare/review/publish/download; không xuất private bank/receipt/note/exchange data và không thực hiện tác động sổ nghiệp vụ. Exact files: schema + hai additive migration, `customer-publication-source.ts`, DTO/service, `chat-controls.tsx`, integration test `m2-project-chat.integration.test.ts`. Ca test dùng writer nghiệp vụ thật, người phát hành khác người chuẩn bị, tải binary thật và kiểm tra không lộ sentinel/không nhân giao dịch. Không có source approval/reconciliation ở domain nên snapshot chỉ thông tin khoản thu đã ghi, không khẳng định đã đối soát.

Đóng code này chưa đóng M2-A. Contract artifact/signature, delivery/install evidence, full API repeat gate, full browser acceptance và clock host diagnosis vẫn là blockers. Xem kết quả mới nhất trong [VERIFICATION](VERIFICATION.md); không bắt đầu M3 trước khi gate đạt.

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`; chủ dự án chọn INLINE. Theo chỉ đạo M2-A, tác giả lập và rà soát kỹ thuật kế hoạch để thực thi, không PLAN_APPROVED_BY_OWNER.

**Goal:** Project đã có → chat nội bộ/khách, lịch sử/file bền vững, quyền hiện tại và publication hai actor trên test stack riêng.

**Architecture:** Reuse Project, User/Session/IAM, FilesService/FileAsset/storage. Thêm room/message/grant/history/release theo target hiện hữu, HTTP polling; không parallel domain, không AI hoặc sửa nghiệp vụ tiền.

**Tech Stack:** Nest11/Prisma6/PostgreSQL17, Next16/React19, TypeScript strict, Vitest3/Playwright1.51; giữ lockfile.

**Spec:** [DESIGN](DESIGN.md), phần M2-A hiện hành, và [DECISIONS](DECISIONS.md). PLAN_STATUS: TECHNICAL_REVIEWED_WITH_DEPENDENT_GATES. Phương thức ủy quyền: “Chủ dự án chốt phạm vi/chính sách bằng chỉ đạo hiện tại, ủy quyền lập và rà soát kỹ thuật kế hoạch để thực thi inline.”

Review độc lập (chỉ đọc) đã thực hiện: năm điểm important. Những điều chỉnh dưới đây là technical rulings, không đổi B1–B5. Task1 không phụ thuộc source-publication mapping; Task4 phải chốt mapping trước code phát hành, không claim toàn PLAN vô điều kiện sẵn sàng. Chưa review SQL/chưa test runtime bằng việc review PLAN.

- File: chỉ `/project-chat/rooms/:roomId/files/:fileId/download` và `/project-chat/releases/:id/download` cho khách; generic `/files` vẫn deny. Shared upload có nhánh ChatRoom kiểm room grant, không synthesize project-level file.upload.
- Authority: `GET /project-chat/projects/:id/candidates`, `POST /project-chat/projects/:id/authorities` với `{userId,actions,roomCeiling,expiresAt?}`, `POST /project-chat/projects/:id/authorities/:grantId/revoke`. IAM role.assign cùng source scope/tier và target-policy, kiểm từng action delegation; grant tường minh chứ không suy role. Room `POST .../grants/:id/renew {expiresAt}`; đang hiệu lực giữ epoch, effectiveAt gia hạn do server và <=30ngày mới; sau hết hạn tạo grant/epoch mới, không copy old history. History DTO thêm `actions: ('READ'|'DOWNLOAD')[]`, chỉ cấp quyền trong ceiling/nguồn của người cấp.
- Poll: query `after` tăng dần, `nextAfter` bằng sequence tin cuối **thực trả**, `hasMore` chỉ cho tập visible; drain pages trước poll tiếp. Không trả room-global latest/count cho scope hẹp. Query `before` giảm dần, UI đảo trình bày; test burst150 visible+hidden với limit100 không mất50tin.
- Source actor: guard bổ sung `assignmentId`, `administrationTier` vào từng permission source từ UserRole/Role thật, không lấy merged tier; projection chỉ permissions của chính assignment. Sau lock phải reload active assignment/role/member/session rồi kiểm lại. Hai bindings cùng role vẫn phân biệt ID/expiry.
- Publication: Task4 còn technical gate ánh xạ từng source có approval flow/asset/version/quyền cụ thể. Không dùng filename, client approval hoặc mặc định APPROVED. Nguồn chưa ánh xạ failclosed, không báo publication complete; giữ ca positive qua service approval thật và source-race/financialdeny.

## Tiếp tục M2-A — phạm vi đã được giao

### Lượt Chrome hiển thị / baseline 5d6690b6 — INLINE

Trạng thái chốt: sửa binary immutability/session fixture/navigation + tooling đã code ở `0a216eb`. Không triển khai thêm adapter tài liệu thật trong lượt này; phần bên dưới là công việc còn lại, không phải đã hoàn thành.

**CONTRACT_FILE — TECHNICAL_PROPOSAL_REVIEWED / NOT_IMPLEMENTED (A/C và linkage B nhỏ):** tái dùng `ContractDocument`, format hữu hạn `CUSTOMER_REVIEW_FILE`, file gửi khách xem xét, không suy chữ ký hoặc approval. File dự kiến: `project-chat.dto.ts/controller.ts/service.ts`, `customer-publication-source.ts`, `chat-controls.tsx`, integration/browser hiện hữu. API đăng ký contract/appendix + FileAsset/version phải kiểm contract.update đúng Project, contract.read/file.read+download, room UPLOAD, source fingerprint đã chọn, fresh IAM trước/sau I/O; server hash/version/audit, Project lock, không ghi tác động ký/tiền. `checkedRelease` phân nhánh format trước đường tái sinh TXT. UI chọn nguồn và file có quyền; snapshot thông tin giữ riêng. Test: exact bytes qua preview/publish/download; sai customer/version/approval, nguồn đổi, quyền bị thu hồi, generic delete, hai publisher/retry. Reviewer T3 đã rà thiết kế; chưa có code hay test positive cho nhánh này.

PAYMENT artifact còn A/B/C: CustomerPaymentSchedule.requiredDocuments chỉ JSON, CustomerPayment chưa FK/version artifact; không dùng receiptNumber làm chứng cứ binary. DELIVERY artifact còn A/B/C: SiteDelivery.evidenceFileId scalar, chưa FK/version/checksum/writer/API. Cần liên kết và đường chuẩn bị trên domain hiện hữu; không tự gọi là D hoặc exempt. Chỉ việc xác nhận chữ ký/tiền đối soát/thực giao-nghiệm thu ngoài quy trình mới là D. Toàn B5 tiếp tục PARTIAL.

- T0 công cụ hiện hữu; T1 Luna/low, T2 Sol/medium, T3 Astra/high qua native custom agents (chỉ cấu hình phiên sau, không khẳng định đổi model turn này). Một writer, một reviewer read-only; reviewer không chạy DB/browser.
- Chrome Windows profile Galaxy riêng, MCP1.10.1 qua stdio Windows/loopback33004, chỉ origin được giao; không cookie/account cá nhân. Regression dùng context fixture khác.
- `apps/web/tests/browser/m2-project-chat.spec.ts`: sửa fixture login lặp gây vượt limiter bằng session fixture đã đăng nhập thật; giữ ca login UI riêng và cross-tab logout/login thật. Kiểm binary/retry/quyền như cũ. `apps/api/test/m2-browser.fixture.ts`: chỉ nếu cần metadata session, không nới limiter.
- Cùng browser spec: ghi navigation thật, browser version/reasons; kiểm restore hoặc full reload phù hợp OWNER_DIRECTION, revalidate/revoke/draft/polling. Không gọi synthetic pageshow là BFCache.
- Publication: reviewer T3 chỉ đọc domain/linkage; bổ sung đúng khoảng trống có source contract thật, không đổi ý nghĩa snapshot sang tài liệu ký/biên lai/biên bản.
- `scripts/m2-clock-monitor.mjs` giữ observer hiện hữu; đối chiếu Windows UTC/Stopwatch và WSL wall/monotonic ở log riêng. Full/repeat gate giữ nguyên; contaminated chỉ chẩn đoán, không nghiệm thu. Build/root lint/Web/format theo recipe; local source/docs commits riêng sau review.

RESUME_START_SHA: `b2c8fe440c0e4b5ca53940d9c8ded34ed00ab5b8`. INLINE; giữ B1–B5, không xin lại approval. Hai reviewer chỉ đọc: publication/provenance và regression/navigation. Không chạy DB/browser/build đồng thời.

1. **Hồi quy:** khôi phục log gốc 13 lỗi; tái hiện `test/m2-project-chat.integration.test.ts`, `test/project-required-document-upload.integration.test.ts`, `test/admin-reset-password.integration.test.ts`; điều tra cả lỗi mới từ full suite. Giữ timeout/assertion, ghi thao tác đang chờ và phép đo clock/DB. Sửa source hoặc fixture đúng nguyên nhân, targeted → nhóm → full; lặp có giới hạn 10 lần nhóm từng lỗi sau sửa. Log trong `.superpowers/sdd/PLAN/` (ignored).
2. **Publication:** `apps/api/src/project-chat/{project-chat.service,project-chat.dto,project-chat.controller}.ts`, schema/migration additive nếu cần, domain adapter thực sự có nguồn. Test approval khác binary/version, thay bytes sau preview/publish, recipient/permission đổi, publish đồng thời; tải bytes thật qua khách. Map từng nguồn B5, loại thiếu source contract fail-closed và vẫn là blocker. Không generic fallback.
3. **Nháp/navigation:** `apps/web/features/project-chat/project-chat.tsx`, browser `apps/web/tests/browser/m2-project-chat.spec.ts`. Dùng API tương thích Next đang cài, không sửa history.state hoặc thêm history entries giả. RED browser Back/Forward thật → sửa → xác nhận ở lại giữ RAM, rời bỏ nháp, reload không lưu, bfcache reauthorize; không prompt sau revoke.
4. **Race/reconnect/mobile:** bổ sung barrier có kiểm soát vào integration M2 và browser hiện có; send/lock/revoke, stale response, offline/reconnect, một polling loop, mobile tiếng Việt/file/publication. Assertion riêng cho hành vi còn thiếu, giữ IDs 24+30.
5. **Chốt:** targeted/API, Web, browser mở rộng, build/typecheck/lint/format/schema và full API hai lần liên tiếp cùng source/config; không retry tự động. Review correctness/security/authorization/UX/Ponytail, commit source local rồi docs riêng. M2-A chỉ VERIFIED khi không còn ca bắt buộc thiếu.

Lệnh giữ recipe trong VERIFICATION; không thay DB/stack. Expected: các assertion deny/persistence/binary/navigation đạt, exit 0; mọi failure hoặc nguồn chưa đủ ghi PARTIAL, không miễn nghiệm thu.

### Bổ sung kỹ thuật publication đã review trong continuation

- `project-chat.dto.ts/service.ts`, `prisma/schema.prisma` và migration additive: sourceType PROPOSAL/QUOTATION/TECHNICAL/SAMPLE/HANDOVER, FK cụ thể + snapshot trạng thái nguồn; không generic approval. File/binary luôn digest server và pinned.
- `production/production.service.ts`: khóa Project trước đọc lại revise/decide; adapter chỉ nhận SHOP_DRAWING/SAMPLE đã APPROVED, decider khác submitter của revision; SampleApproval pin ID và phiên bản binary.
- `after-sales/after-sales.service.ts/module.ts`: add/sign/complete dùng cùng Project lock; tạo version mới đối chiếu checksum bytes server. Adapter allowlist HANDOVER*MINUTES/PRODUCT_LIST/WARRANTY_DOCUMENT/AS_BUILT_DRAWING, chỉ NOT_REQUIRED hoặc SIGNED*\* có thời điểm; snapshot/UI mô tả trạng thái nguồn, không tạo tác động ký/nghiệm thu.
- Test `m2-project-chat.integration.test.ts`: nguồn chưa duyệt, approval/file khác, Project khác, checksum client giả, stale sau revise/sign, bytes khách đúng bản cũ, quota không cộng đôi quote export; unit production/after-sales hồi quy writers. Lệnh trong apps/api: `E node_modules/vitest/vitest.mjs run test/m2-project-chat.integration.test.ts src/production/production.test.ts src/after-sales/after-sales.test.ts --no-file-parallelism --poolOptions.forks.singleFork`.
- Reviewer `/root/publication_review` đã rà điều kiện/phạm vi khóa và XOR; đây là review kỹ thuật, không bằng chứng chạy test. Contract/phụ lục/payment/kế hoạch giao-lắp vẫn MISSING_SOURCE_CONTRACT, không xây domain mới.

## Global Constraints

### Đối chiếu thực thi inline ngày 2026-09-28

Các checklist bên dưới là kế hoạch gốc, không tự là PASS. Trạng thái thực tế:

| Task | Thực hiện                                                                                          | Giới hạn                                                                |
| ---- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1    | Stack G00 riêng smoke 3/3; provenance RED→GREEN; commit `b5a0859d45b6711e71cc8bad11f750b8ee498944` | Không cài bwrap; executor/DB/browser vẫn hoạt động bằng approval hợp lệ |
| 2–3  | Schema/grant/history/external identity/tin/cursor/retry/poll API thật                              | Chưa nghiệm thu mọi tổ hợp race trong 24+30 ca                          |
| 4    | Upload/FileAsset thật và PROPOSAL publication hai actor                                            | Chưa đủ adapter cho toàn danh mục B5; không coi publication hoàn tất    |
| 5    | UI nội bộ/khách/mobile/quản trị/publication và Task/ProductLine thật                               | Back/Forward chưa có cảnh báo nháp; bằng chứng browser xem VERIFICATION |
| 6    | Targeted/full checks, reviewer độc lập, báo cáo/commit                                             | Giữ các lỗi full run và ca NOT_RUN, không gom thành VERIFIED            |

Không tạo các file giả định `project-chat-files.service.ts`, `message-contract.ts`, `project-chat.test.ts`, `m2-project-chat.fixture.ts`, `m2-project-chat-files.integration.test.ts`: orchestration đủ dùng trong service hiện hữu của module, integration chung và fixture browser. Không sửa UploadsService/business-entity.policy/user-management.policy chỉ vì từng có trong danh sách dự kiến. Các đường thật:

- `apps/api/src/project-chat/{project-chat.module.ts,project-chat.controller.ts,project-chat.service.ts,project-chat.dto.ts}`; `apps/api/src/access-control/project-chat.policy.ts`; integration `apps/api/test/m2-project-chat.integration.test.ts` (26 ca); `apps/api/test/m2-browser.fixture.ts`.
- Reuse pipeline tại `apps/api/src/files/files.service.ts`, chặn generic bypass trong `files/project-file.ts`, `search/search.controller.ts`, `audit/audit.service.ts`; export `TasksService.visibleWhere` từ TasksModule để dùng đúng predicate cũ.
- `apps/web/features/project-chat/{project-chat.tsx,chat-controls.tsx,project-chat.test.tsx}`, routes `/work`, `/projects/[projectId]/work`; browser `apps/web/tests/browser/m2-project-chat.spec.ts` (8 ca), config `playwright.m2.config.ts` và launcher `scripts/m2-a-serve.mjs`.
- Bảy migration additive: `20260927225352_m2_project_chat`, `20260927225945_m2_chat_history`, `20260927230350_m2_external_identity`, `20260927231222_m2_chat_files_history_provenance`, `20260927234447_m2_chat_publication`, `20260927235059_m2_release_recipient_review`, `20260928001623_m2_chat_domain_links`. Tất cả dưới `apps/api/prisma/migrations/`, chỉ áp DB test, không sửa migration đã áp.
- Contract API thực tế xem controller/DTO: `GET .../link-options`, room create nhận optional `taskId/productLineId`; GET messages trả `viewerId/grantId/scopeToken/locked/links` cùng cursor. `scopeToken` là digest quyền/lịch sử, không token cấp quyền. `X-Chat-Actor` là precondition chống tab khác account, không thay session auth.
- Prepare nhận `{sourceId,fileId,version}`; `GET /project-chat/releases/:id/review`, `/preview`, `POST /publish {confirmed:true,recipientHash}`, `/revoke`, `GET /download`. Không generic `sourceType` do mới có một adapter thật. UI nói rõ loại hỗ trợ.

Review: tác giả kiểm callers/SQL/contract; reviewer độc lập `/root/m2a_plan_review` và `/root/m2a_foundation_review` chỉ đọc (không delegate implementation), phát hiện quyền/history/file/cache và UX đã được ghi/sửa theo regression. Review cuối không chứng minh runtime/tests toàn bộ hoặc owner đã đọc PLAN. Giữ finding Back/Forward và mapping B5 mở, không ghi REVIEW_PASSED toàn gói. Ponytail: không dependency mới/AI/WebSocket/helper-service song song.

Lệnh/test/exit và phần chưa đạt là [VERIFICATION](VERIFICATION.md). Khi tiếp tục phải dùng worktree này, không bắt đầu M0/M1 hoặc merge nhánh cũ.

- Worktree `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`; không merge/cherry-pick/push/deploy. Gốc chỉ thêm ignore worktree theo skill, không source/runtime.
- Guest expiry bắt buộc, tối đa30 ngày từ effectiveAt, không auto-renew; sau gap là grant mới. Server time, không client time cho joinedAt.
- Grant/admin/publisher không suy role-name/creator; action/scope cùng source. ADMIN không READ, không delegate ADMIN/PUBLISH.
- History default lần cấp hiện tại; khoảng cũ explicit/audit, áp message/file/preview/count. Không edit/delete/retention job.
- Nháp RAM tab, không localStorage/sessionStorage/backend; clear logout/account/revoke. File/publication không public URL.
- Test2 tenant và actors độc lập chuẩn bị/phát hành; không dữ liệu/tài khoản/adapter thật. Lead-only DEFERRED_BY_EXPLICIT_SLICE_SCOPE, M2 tổng thể PARTIAL.

## Review Focus

1. Role binding khác cấp scope/tier rộng hơn: authority route không được ghép — regression task1/2.
2. Revoke trong lúc request chờ lock và replay key cũ — task2/3 race, current auth trước response.
3. Re-add/expiry vẫn lộ filename/reply hoặc bytes qua generic URL — task2/4 deny history mọi đường.
4. Pending upload/finalize race/cleanup tạo lost reference — task4 DB+disk consistency, không success giả.
5. Poll response trễ sau đổi room/logout phục hồi cache hoặc nháp — task5 deferred fetch test + browser.

## Task 1: Môi trường và prerequisite quyền

**Files:** tạo `scripts/m2-a-isolated.env.example`; dùng `scripts/g00-isolated-test.mjs`, `docker-compose.g00.yml`, `apps/api/scripts/g00-isolated-environment.mjs`, `apps/api/test/g00-isolated-smoke.integration.test.ts`. Nếu regression chứng minh cần sửa: `apps/api/src/access-control/current-actor.ts`, `development-auth.guard.ts`, `user-management.policy.ts`, `access-control.test.ts`; không toàn bộ IAM/final-admin.

**Interfaces:** consumes `assertG00Isolation(env)`/G00 check/up/prepare/smoke; produces DB test xác minh danh tính, cookie/storage riêng, permission-source projection cho authority route. `actorsForPermission(actor: CurrentActor, permission: string): CurrentActor[]` giữ đúng permission/scope/tier của từng assignment đã xác minh; nguồn thiếu assignment/tier bị loại, không mượn merged tier hoặc scope.

- [ ] Tạo env test không fallback `.env.local`; namespace/port/storage như DESIGN. Đọc recipe trước; kiểm Docker default unix socket, labels không trùng, port trống, owned root.
- [ ] `node --env-file=scripts/m2-a-isolated.env.example scripts/g00-isolated-test.mjs check`, `up`, `prepare`, `smoke`; Expected check0, identity đúng, smoke3/3 thực DB/auth. Nếu lỗi quyền dùng approval cụ thể, không disable guard.
- [ ] Test RED nhiều source role.assign SELF + action khác ORGANIZATION không cho authority ngoài scope/tier. Nếu code đã deny thì giữ regression, không tạo patch vô cớ.
- [ ] Sửa tối thiểu source projection nếu lỗi tái hiện; targeted `pnpm --filter @galaxy/api exec vitest run src/access-control/access-control.test.ts --no-file-parallelism --poolOptions.forks.singleFork`; Expected PASS.
- [ ] Review diff/guard/isolation và commit riêng file đã kiểm. READY chỉ khi stack smoke và prerequisite có bằng chứng.

## Task 2: Quyền room và mô hình bổ sung

**Files:** sửa `apps/api/prisma/schema.prisma`, tạo migration dưới `apps/api/prisma/migrations/` bằng script prisma:migrate; tạo `apps/api/src/access-control/project-chat.policy.ts`, `apps/api/src/project-chat/project-chat.dto.ts`, `project-chat.service.ts`, `project-chat.controller.ts`, `project-chat.module.ts`, `project-chat.test.ts`; sửa `access.decorators.ts`, `development-auth.guard.ts`, `current-actor.ts`, `access-control.module.ts`, `auth/auth.controller.ts`, `me.controller.ts`, `me.service.ts`, `app.module.ts`. Integration mới `apps/api/test/m2-project-chat.integration.test.ts`; fixture `apps/api/test/m2-project-chat.fixture.ts`.

**Interfaces:** `ProjectChatPolicy.assertRoom(actor, roomId, action, tx)` trả server-resolved room+current grant/history. `ProjectChatService.projects(actor)`, `rooms(actor,projectId)`, `createRoom(actor,projectId,dto)`, `grant(actor,roomId,dto)`, `revoke(actor,roomId,grantId)`, `grantHistory(actor,roomId,grantId,{from,to})`, `lock(actor,roomId,locked)`. Actions READ/SEND/UPLOAD/DOWNLOAD/CREATE/LOCK/HISTORY/ACCESS_ADMIN/PUBLISH tách. Route `/project-chat/projects`, `/project-chat/projects/:id/rooms`, `/project-chat/rooms/:id/{grants,history,lock}`. Authority Project grant endpoint cần IAM role.assign cùng source/target/tier, ceiling không vượt actor; quyền PUBLISH độc lập. Không nhận actor/org từ body.

- [ ] RED integration auth cookie thật: fixture O1 P1/P2 và O2 P3, manager/sender/viewer/outsider/guest/otherGuest/publisher. Assert viewer403send, O2/outsider404, creator không grant, admin không READ/PUBLISH, ceiling reject, guest expiry>30ngày reject.
- [ ] Additive schema: ChatProjectGrant, ChatRoom, ChatRoomGrant, ChatHistoryGrant, ChatMessage, DocumentRelease; organization/member/project/room source FKs, append-only grant events, server sequence và unique key. OrganizationMembership.kind default INTERNAL. Foreign relationships không trộn tenant; Project/Task/ProductLine references validate trước write.
- [ ] `prisma:migrate -- --name m2_project_chat --create-only` chỉ env/test DB + shadow riêng đã xác minh; nếu đề nghị reset: dừng, không đồng ý. Review SQL không drop/update domain cũ rồi `prisma:deploy`/generate. Expected0; root DB untouched.
- [ ] Implement service/DTO/global external deny + minimal `/me`, allow auth/logout/passwordchange only. Recheck live user/session/org/grant under lock. Candidate UI phải từ query scoped, không toàn users. Khóa project trước room; grant revoke/history/write theo cùng lock order.
- [ ] GREEN integration lịch sử mặc định, explicit interval, revoke/re-add không mở gap/cũ, guest grant30ngày/renew-before/renew-after, inactive member, quyền nhiều binding. Expected DB/API deny và events giữ nguyên. Review+commit.

## Task 3: Tin bền vững, cursor, retry

**Files:** service/controller/dto/tests task2; mới `apps/api/src/project-chat/message-contract.ts` chỉ nếu helper được cả test/service dùng.

**Interfaces:** `messages(actor,roomId,{before?,after?,limit?}) -> {items,nextBefore,nextAfter,hasMore}`; `send(actor,roomId,{clientKey,body,attachmentIds?}) -> MessageView`. GET/POST `/project-chat/rooms/:id/messages`. Limit1–100, body1–8000 hoặc attachment, keyUUID. Sequence server dưới room lock; fingerprint payload chuẩn hóa ổn định. Không latestSequence global; cursor chỉ từ tin trả về.

- [ ] RED assertions database: send/reload/login, duplicate/concurrent samekey chỉ1row, payload khác409, samekey khác actor/room/tenant không replay chéo; pagination concurrent không mất/trùng; locked send/replay deny khi grant mất.
- [ ] Implement transaction lock+reauth+unique+hash, DTO trả tối thiểu; cursor theo sequence, history predicate áp trước limit/count. Không reply/search/unread nếu không xây đủ quyền; không generic notification body.
- [ ] GREEN targeted integration; review đối chiếu 24ca01–13/18/21/24 + prompt30ca1–14/22/23/25/26/30; commit đúng files.

## Task 4: Attachment và publication

**Files:** sửa `apps/api/src/files/files.service.ts`, `files.dto.ts`, `files.test.ts`, `apps/api/src/access-control/business-entity.policy.ts`, `apps/api/src/uploads/uploads.service.ts` chỉ references cần thiết; tạo `apps/api/src/project-chat/project-chat-files.service.ts` chỉ orchestration domain gọi FilesService/storage, không upload implementation thứ hai; `apps/api/test/m2-project-chat-files.integration.test.ts`; task2schema/routes.

**Interfaces:** `FilesService.upload` mở target room đã kiểm và idempotency input, giữ pipeline hiện có; `/project-chat/rooms/:id/files` multipart, `/project-chat/rooms/:roomId/files/:fileId/download` cần history+DOWNLOAD, `/project-chat/releases/:id/download` thêm release state/recipient. `prepareRelease(actor,roomId,{sourceType,sourceId,version,fileId}) -> ReleasePreview`, `publishRelease(actor,releaseId)` và `revokeRelease`; `/project-chat/rooms/:id/releases`, `/project-chat/releases/:id/{publish,revoke}`. Không cho generic file attachment bỏ qua publication.

- [ ] RED upload→FileAsset/link→storage bytes→download; source room/tenant khác deny, old filename/preview deny, failure/retry/finalize race đúng, cleanup giữ referenced; file khách pending safety không đọc sớm.
- [ ] Reuse MIME/size/signature/quota/reservation/storage. Generic search/file chỉ trả context có quyền, không projectId mở room-file; room source nguyên bản INTERNAL/EXTERNAL_SOURCE không suy theo filename. Không xóa shared file khi retry lỗi.
- [ ] RED prepare/publish cùng actor hai session deny; publisher thiếusource/share deny; nguồn/version đổi conflict; bản phát hành immutable, recipient download không mở source; restricted category/financial fields failclosed. Mapping sourceType tới domain thật và đủ business status, không boolean client; loại thiếu mapping báo dependency, không giả approved.
- [ ] Implement release version/snapshot/checksum/actors/recipient/revoke + proxy tải reauth. Sửa reference checks trước cleanup. GREEN DB/storage/API cases; review quyền/migration; commit.

## Task 5: UI và polling

**Files:** tạo `apps/web/app/projects/[projectId]/work/page.tsx`, `apps/web/features/project-chat/project-chat.tsx`, `project-chat.test.tsx`, `apps/web/app/work/page.tsx`; sửa `apps/web/app/portal-shell.tsx`, `apps/web/app/lib/api.ts` Actor external projection; reuse existing project/products/tasks/files links; mới `apps/web/playwright.m2.config.ts`, `apps/web/tests/browser/m2-project-chat.spec.ts`.

**Interfaces:** consume task2–4 DTO/API; `ProjectChat({projectId})`, API AbortSignal theo requestInit hiện hữu; polling generation theo actor/room, chỉ1inflight, exponential backoff giới hạn30s, pause hidden/offline. Testserver Web33002/API33001 cookie riêng.

- [ ] RED unit UI: view-only composer reason, loading/error giữ draft, response cũ sau room switch/revoke không restore, pending/send/retry cùng key, beforeunload khi draft, không persist nháp. Render filename/text như text, không HTML.
- [ ] Implement shell4tabs/4groups, mobile1panel, history anchor/no unsolicited scroll, chat identity; management/candidate/expiry/history UI theo server permissions, publication exact preview+recipient+confirmation. Other tabs link thật theo quyền; guest nav không generic finance/projects payload.
- [ ] GREEN unit và browser cookie login sender/viewer/guest/outsider: reload history, file byte, explicitdeny, mobile, expiry/revoke, AI absent. Không mock thay integration. Review UX/security/lean; commit.

## Task 6: Hồi quy, nghiệm thu và handoff

**Files:** tests task2–5, `VERIFICATION.md`, `HANDOFF.md`, `PROJECT_STATUS.md`, `docs/galaxy-os/05-IMPLEMENTATION-STATUS.md`.

**Interfaces:** consume task1identity/task2policy/task3messages/task4file/task5UI; produce evidence SHA/tree/commands/exit+24ca và30ca. Lịch sử chưa test vẫn NOT_RUN; ca22 Lead-only DEFERRED_BY_EXPLICIT_SLICE_SCOPE, Project hiện hữu vẫn phải giữ links/obligations.

- [ ] Hồi quy `/me` (`test/sprint1.integration.test.ts`), `test/project-required-document-upload.integration.test.ts`, IAM/file/upload unit + các integration M2. Chạy env riêng, full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check`; không sửa timeout/expectation/guard cho xanh. Python placeholder nếu thiếu venv chỉ tạo theo requirements hiện hữu hoặc báo exactblocker.
- [ ] Fresh whole-branch reviewer đọc spec/plan/diff/evidence, Ponytail/correctness/security/authorization/UX. Fix important bằng RED→GREEN; ghi mọi blocker/giới hạn.
- [ ] Commit source/test theo scope sau checks. Ghi CODE_SHA/TESTED_SHA/TESTED_TREE, nếu đổi source rerun. Docs commit riêng sau đó, không selfhash.
- [ ] Handoff worktree/ports/start-stop nếu app thật chạy; giữ stack hoặc dừng đúng owned namespace sau lưu evidence. Không gỡ worktree, không merge/deploy. M2-A VERIFIED chỉ khi đủ internal+guest+file+browser; M2 overall PARTIAL.

### Chốt continuation đã thực thi

- A: sửa env leak và barrier cleanup; inventory13 đúng log, full bình thường1120PASS rồi1117PASS/3FAIL. Repeat3file dừng lần1 với55PASS/1FAIL; còn clock/runtime stability, không miễn hồi quy.
- B: thêm QUOTATION/TECHNICAL/SAMPLE/HANDOVER vào publication service hiện hữu, FK/snapshot/checksum server, hai migration bổ sung đã review/test-only. Sửa writer revision/handover lock tối thiểu và quota không đếm lại binary. Contract/payment/install vẫn MISSING_SOURCE_CONTRACT.
- C: custom dialog bỏ nháp RAM, cancelable Navigation API cho Back/Forward, hash không đổi ngữ cảnh, native beforeunload; không state/history hack.
- D: barrier source-revision/send-lock/revoke và browser lost response/delayed poll/offline revoke/mobile; các biến thể BFCache/keyboard/file lỗi còn PARTIAL.
- E: code commit `e4b3570e63367a84cef41f1823c9ad1d530ee10d`; review độc lập quyền/provenance và navigation/isolation, INLINE thực thi. Ma trận, lệnh và từng failure cuối ở VERIFICATION; không nghiệm thu VERIFIED. Bước tiếp: ổn định clock, tái chạy ngưỡng đã giao, đóng biến thể và xác định source contract còn thiếu; không cần duyệt lại B1–B5.

## CLOSEOUT — tiếp tục từ0369b32 theo lệnh chủ dự án

T1: `scripts/m2-clock-monitor.mjs`, `scripts/m2-clock.test.mjs`, launcher test và observer các lớp: chỉ đo UTC+monotonic; đánh dấu contaminated, không override Date hay sửa host. Venv riêng đúng README, `pnpm lint` entrypoint gốc.
T2: các request lỗi trong integration M2/upload và browser management; phân biệt setupfail/policy/time, giữ response công khai404. Clockhost chặn acceptance chứ không chặn code độc lập.
T3: service publication/DTO/UI hiện hữu + schema additive, reuse ContractDocument; source CONTRACT/phụ lục, CustomerPaymentSchedule, InstallationPlan+WorkOrder. Source snapshot allowlist server, fingerprint canonical bắt buộc, text/plain tiếngViệt; bản thông tin không giả chữ ký/biênlai/thựcgiao. TypedFK, binary pin và idempotentprepare. Hai phase: chụp dướiProjectlock+reservequota → render/writepending ngoàiProjectlock → reauth/sourcehash + finalize/release nguyên tử. Domainwriters liên quan dùng cùngkhóa; không đổi quy tắc tiền/trạngthái. Reviewer publication đã review thiết kế với lưuý versioncounter/Decimal/sourcehash/cleanup/retry. Test domainwriters thật→prepare/preview/publish2actor/downloadbytes; stale/revoke giữa2phase, retrykey, saiCustomer/appendix, no sideeffect.
T4: `playwright.m2.config.ts` bỏ riêng defaultargument tắtBFCache; browser spec thêm pageshow.persisted thật với lýdo cachemiss, reconnectmax1, uploadlostresponse/filename/mobilepublication. Khôngbỏcacheheaders/sandbox.
T5: monitor mọi acceptance; 10repeat+2full chỉ tính nếuclockclean; Web/browser/build/typecheck/schema/rootlint/format, hai reviewerreadonly, local source/docscommits riêng. M3 chỉgate, khôngcodeAI. Các lệnh nền giữ VERIFICATION; exactresults bổsung sau test, khôngghiPASStrước.

### Kết quả task closeout

- T1: chẩn đoán clock đa lớp và gate theo PID hoàn thành; host repair ngoài quyền, acceptance blocked. Venv riêng và root lint đạt.
- T2: targeted105 đạt theo lớp, log denial phân biệt observations; source scope rỗng và filename multipart là lỗi code đã sửa. Không đóng stability/timeout chỉ bằng targeted.
- T3: cả3source snapshot có code/UI/API, migration79review/test, domainwriter thật→binary; stale/revoke rollback/concurrent prepare kiểm được. Bản ký/biên lai/thực giao không bị giả tạo; browser từng source còn thiếu.
- T4: upload mất response/filename và polling bounded đạt ca browser; proposal mobile/BackForward có bằng chứng. BFCache persisted thật chưa đạt, giữ no-store; mọi biến thể chưa đủ.
- T5: source commit caa6c32, docs riêng; build/typecheck/schema/rootlint/format đạt. Full2/repeat10 bị clock gate; browser fullfail giữ nguyên. M3-ENTRY chỉ BLOCKED trong HANDOFF, không triển khai AI.

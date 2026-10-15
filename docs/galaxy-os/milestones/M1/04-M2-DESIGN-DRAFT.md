# M2 — Thiết kế gói Project–Chat–File đầu tiên

**DRAFT / CHƯA ĐƯỢC CHỦ DỰ ÁN DUYỆT.** Lập trong M1 ngày 2026-09-28. M2_DESIGN_STATUS: NEEDS_DECISION. IMPLEMENTATION_READINESS: BLOCKED. Đây là thiết kế để duyệt, không phải kế hoạch đã chốt hay lệnh triển khai.

Nguồn: [charter](../../01-CORE-CHARTER.md), [trải nghiệm/quyền](../../03-EXPERIENCE-AND-ACCESS.md), [D01–D08](../../02-SCOPE-AND-DECISIONS.md), [24 ca canonical](../../07-ACCEPTANCE.md), [baseline M1](01-BASELINE.md), [source map](02-REUSE-MAP.md). Mapping M2→G00/G02/G07 là mapping chủ dự án, không đổi scope Gxx hoặc làm lại gói đã đạt.

## 1. Quyết định kiến trúc đề nghị

Giữ Next/Nest/Prisma, Project/User/Session/IAM, FileAsset/storage/upload/quota, Task/ProductLine, approval/audit/domain services. Thêm một đường conversation bền vững và kiểm quyền tại backend, không thêm AI, workflow engine, policy engine hay upload service khác.

| Phương án                                                                | Đánh giá                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Mở rộng Comment thành chat                                            | Ít tên bảng mới nhưng phải thay tất cả caller generic comment để có room/send/history/retry. Edit/delete cũ không lưu nội dung trước; scope entity không đủ chia sẻ khách. Rủi ro tương thích lớn. Không chọn. |
| B. Conversation + Message + membership có phạm vi, dùng lại nền hiện hữu | **Đề nghị**. Room là ranh giới công bố thật; thêm đúng dữ liệu còn thiếu, giữ comment cũ và link gốc. Polling HTTP/cursor trước.                                                                               |
| C. Chat/provider store độc lập hoặc WebSocket stack mới ngay             | Không cần cho gói đầu; tạo nguồn chính thứ hai hoặc thêm bề mặt kiểm quyền khi chưa cần. Chỉ xem lại realtime khi số đo/UX cho thấy polling không đủ.                                                          |

Nền dự kiến phải có G01/G02 sau tích hợp được giao riêng và kiểm chứng; không code trên giả định chúng đã có tại HEAD khảo sát. Quyết định B1 bên dưới chặn việc chọn baseline lập trình cuối cùng.

## 2. Phạm vi gói đầu và giới hạn trung thực

Luồng: đăng nhập → mở Project được cấp quyền → chọn nhóm/mục và room → xem hoặc gửi → dùng upload/FileAsset hiện hữu → reload thấy tin và file → khách chỉ thấy phòng/bản được phát hành cho mình. Dùng dữ liệu giả lập trước, không mời khách thật trong lần demo kỹ thuật.

Gói đầu đề nghị **M2.1 trên Project đã tồn tại**. Có room nội bộ và phòng khách thử nghiệm tách biệt, read-only/send, file, lock, revoke, lịch sử, liên kết task/product line có thật. Đây là một lát cắt M2, **không nghiệm thu toàn bộ M2 hay vòng đời từ Lead-only**. B3 phải được duyệt cho giới hạn này; không âm thầm bỏ yêu cầu hồ sơ xuyên suốt.

Không xây đồng thời AI, sửa hợp đồng/thanh toán/PO, nghiệp vụ mới hoặc dashboard quản trị. Không tạo lời AI giả, nút gửi chưa nối API hoặc dữ liệu demo lẫn dữ liệu công ty. Không thêm email/Zalo/WhatsApp, notification chat, search semantic, presence/typing/read receipts trong gói đầu.

| Màn hình          | Dữ liệu/hành động thật trong M2.1                                        | Chưa làm / cách hiển thị                                                                                            |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Tổng quan         | Project shell an toàn, room/task được phép; nhân viên deep-link panel cũ | Không suy tiến độ từ tin/file, không tự tính lợi nhuận mới; guest chỉ DTO tên/mô tả đã phát hành, không raw Project |
| Làm việc          | Danh sách room, lịch sử có cursor, gửi/upload/retry/lock theo quyền      | Không nút AI hoạt động; nhãn “AI chưa triển khai”, không spinner giả                                                |
| Hạng mục          | ProjectProductLine/Revision được phép; link tới panel thật               | Khách chỉ xem bản phát hành, không response giá vốn/supplier nội bộ; chưa có bản thì ghi chưa phát hành             |
| Hồ sơ & kiến thức | Tài liệu/file thật theo quyền; trạng thái upload/storage thật            | Chưa extraction/index/Q&A thì ghi “Đã lưu, chưa xử lý AI”, không “AI đã hiểu”                                       |
| Việc của tôi      | Link danh sách Task thật sau kiểm scope thống nhất                       | Không tạo sổ task riêng hoặc tự gán assignee thành owner duy nhất                                                   |

Trong Làm việc, groupKey là nhãn/filter: Tư vấn & báo giá 02–05; Hợp đồng & tài chính 06–07; Cung ứng & giao hàng 08–10; Thi công & hậu mãi 11–12. Stage01 là chăm sóc. Bốn nhóm không là bốn cơ sở dữ liệu/bộ nhớ, không khóa nhóm nối tiếp. Giữ 12 giai đoạn trong nghiệp vụ; không đổi enum năm stage cũ thành 12 một cách máy móc. Panel cũ giữ route và service; chuyển UI từng phần, không xóa.

## 3. Định danh hồ sơ và chăm sóc — giới hạn phải duyệt

- Project UUID hiện có là root của chat/task/file trong M2.1, bất kể cách lọc “tiềm năng/đã ký”. Customer có nhiều Project, không gom theo customerId.
- Đề nghị thêm metadata chăm sóc riêng trên Project đã có, nullable với dữ liệu cũ chưa phân loại; thao tác này không gọi markWon/convert, không tạo Customer/Project/doanh số và không sửa contract/payment/PO/status thực hiện. Mọi đổi chăm sóc có audit/version. Cam kết vẫn đọc theo phạm vi hợp đồng hiện hữu, không một boolean “đã ký” áp cho tất cả hạng mục. Phần thiếu căn cứ phải hiện “chưa xác định”.
- Giữ unique Opportunity→Project và Lead→Opportunity; lịch sử cũ hiện bằng link nguồn **sau kiểm quyền từng nguồn**, không copy message/file sang bốn nhóm. M2.1 không tự backfill dữ liệu CRM.
- Lead-only chưa có Project là gap thật: POST Project hiện yêu cầu Customer và admission đầu tư. Phần tiếp theo phải duyệt intake rút gọn trên **Project hiện hữu**, tạo root một lần, giữ link Lead/Opportunity, quy tắc customer chưa rõ và đối soát legacy. Không thêm bảng dossier nghiệp vụ song song, không tạo khách giả hoặc số tiền 0 để vượt gate. Chưa chọn đổi customerId nullable hay yêu cầu nhận diện khách ở đây.
- Nếu chủ dự án yêu cầu toàn bộ Lead-only ngay gói đầu, B3 chuyển thành BLOCKED thiết kế admission chi tiết trước code; không coi draft này đủ cho phạm vi đó.

## 4. Dữ liệu đề nghị thêm — tên dưới đây là thiết kế, chưa tồn tại

| Record/điều chỉnh           | Nội dung tối thiểu và ràng buộc                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Conversation                | UUID, organizationId/projectId FK, groupKey, optional productLineId/taskId, loại INTERNAL hoặc CUSTOMER, title, lockedAt/by, createdBy/time. Không đổi loại nội bộ sang khách để công khai lịch sử.                                                                      |
| ConversationParticipant     | User/membership hiện hữu; target chính xác org/project/group/item/room, action grants riêng, nguồn cấp quyền, historyFrom, joined/revoked/expiry, grant version. Unique participant/room; sửa grant có audit. Grant không vượt source binding/delegation của người cấp.  |
| Message                     | UUID, roomId, actor, body, createdAt, clientMessageId, payloadHash, optional replyTo cùng room; unique(roomId,actorId,clientMessageId). Plain text có giới hạn/escape, không HTML tùy ý. Đề nghị chưa cho edit/delete trong gói đầu (B2), không mượn delete của Comment. |
| EntityAttachment hiện hữu   | Thêm target Message được backend kiểm; assetId giữ nguồn bytes, không upload lại. Không tin projectId/entityType client tự gửi; server resolve từ room/message. Unique hiện có chống link trùng.                                                                         |
| DocumentRelease             | UUID, room/người nhận, source FileAsset ID + checksum và document version cụ thể khi có, người kiểm tra/phát hành, thời điểm, thu hồi/hết hạn, idempotency key. Không `currentFile` động; không sửa quyền file nội bộ gốc.                                               |
| UploadSession hiện hữu      | Mở thêm target conversation thay vì requiredDocument/stageOneDocument; exclusive target constraint, room permission thay document.manage. Giữ recovery/lease/quota/checksum/cleanup.                                                                                     |
| Project/membership hiện hữu | Metadata chăm sóc tách trạng thái thực hiện; dấu phân biệt external membership nếu B4 được duyệt. Không đổi quyền các membership cũ.                                                                                                                                     |

Không coi FileAsset.version là lịch sử nội dung chung: mỗi bản nội dung phát hành phải được ghim asset/checksum bất biến; version chứng từ dùng model domain thực có. Chat lưu DB Galaxy; M3 dùng message/asset/release IDs làm nguồn. Chưa có provider session hoặc summary thay dữ liệu chính.

Task/hạng mục: link tới Task, ProjectProductLine/Revision thực; không nhân bản. Gói đầu cho **liên kết task đã có** sau kiểm quyền target và same-project. “Tạo task từ tin” chưa trong gói đầu, không hiển thị nút giả; khi được giao sẽ gọi TasksService với idempotency, không tạo bảng Task AI.

## 5. Quyền: một nền IAM, action gắn đúng target

Đề nghị action codes mới: conversation.read/send/attach/download/share/manage; AI là action riêng ở M3, **không cấp hoặc giả nút AI trong M2**. File read/download/upload tiếp tục có kiểm tra tương ứng trong policy hiện hữu, không suy từ send. UX “Chỉ xem/Trao đổi” là preset hiển thị, không role tài chính.

Một request đi qua session active → tenant/membership/assignment hợp lệ → source binding có đúng action và scope → Project/target policy → room/item grant hạn chế → kiểm object/version → recheck trước commit hoặc delivery. Không ghép action của nguồn A với scope/tier nguồn B. Đối với khách, scope chính xác của grant phòng là nguồn quyền giới hạn, không biến ProjectMember thành lối vào Project rộng.

Thực hiện bằng mở rộng `CurrentActor`/`BusinessEntityPolicy` và guard hiện hữu sau G02, không service policy tổng quát thứ hai. ConversationParticipant là dữ liệu hạn chế tài nguyên, không tự vượt delegation/role nguồn. Quyền project của nhân viên là cần nhưng chưa đủ; mọi room hạn chế cần grant riêng. group/item không có quyền tổng mặc định: danh sách nhóm, badge và count chỉ từ các room/item được phép.

| Persona/hành động     | Cho phép có điều kiện                                             | Từ chối                                                                                                  |
| --------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Người đọc             | GET room/history theo historyFrom; file chỉ nếu download được cấp | POST message/upload/share, kể cả gọi URL/API trực tiếp                                                   |
| Người gửi             | Gửi room được cấp và chưa lock                                    | Không tự share/mời/duyệt; không thấy mục B từ quyền mục A                                                |
| Người quản lý phòng   | Mời/thu hồi trong trần quyền đã duyệt                             | Không tự grant tài chính/admin hoặc vượt quyền của mình                                                  |
| Khách                 | Login và DTO shell/room/release được cấp chính xác                | Generic CRM/org/search/audit/task/files endpoints nếu không có quyền độc lập; không nội bộ/supplier khác |
| Không quyền / revoked | Không có dữ liệu hay count                                        | Deny trước bytes/body; đáp ứng không tiết lộ sự tồn tại ngoài phạm vi                                    |

B4 đề nghị dùng User/Session hiện hữu với external membership và grant tối thiểu; không tạo identity provider khác. Cần guard deny-by-default cho external actor với tập route được duyệt (login/logout, me DTO tối thiểu, customer shell, room/message, upload target khách, release download), không chỉ trông chờ mọi controller cũ có decorator. `/me` hiện trả organization/roles, phải projection tối thiểu cho khách. Test tất cả đường API cũ ngoài allowlist; không cấp generic project.read hoặc ProjectMember để UI hoạt động.

Không gửi thông báo chat mới ở gói đầu. Các endpoint notification cũ không mở cho khách; projection/markRead/count hiện còn gap, nếu được tái dùng phải sửa ở service chung và test. Tương tự Task GET và audit: không đưa raw response vào phòng khách. Search nội bộ cũ chỉ tiếp tục với quyền đúng sau G01; khách không được gọi search toàn cục.

## 6. Lịch sử, thành viên và thu hồi (B2/D07, B4/D05 chờ duyệt)

Đề nghị bảo thủ: không edit/delete tin ở M2.1; sửa bằng tin đính chính có link. Người nội bộ được thêm vào phòng hạn chế mặc định đọc từ joinedAt; công bố lịch sử cũ cần người có quyền chọn phạm vi và preview riêng. Khách chỉ vào **room khách mới/tách biệt**, mặc định từ lúc tham gia và các bản phát hành đã chọn; tuyệt đối không biến lịch sử phòng nội bộ thành public.

Thay người phụ trách không đổi chủ sở hữu dữ liệu hay tự cấp quyền. Re-add sau revoke mặc định không mở khoảng thời gian bị thu hồi. Khóa room cấm SEND/ATTACH mới nhưng giữ GET theo grant đọc; unlock cần manage và audit, không xóa lịch sử.

Mỗi polling/request nạp lại grant active. Send/submit kiểm lại sau chờ transaction lock; download/release kiểm ngay trước stream; revoke không được bị cache cũ bỏ qua. Hủy polling/xóa cache hiển thị và nháp nhạy cảm khi nhận 401/403 hoặc đổi actor; response private/no-store. Không hứa thu hồi bytes đã phát hợp lệ. Nếu sau này có realtime, phải thêm kiểm subscribe/broadcast/delivery; chưa cài socket trong M2.1.

## 7. API/persistence/error đề nghị

Các route sau **chưa tồn tại**: `/projects/:id/conversations`, `/conversations/:id/messages`, `/conversations/:id/participants`, `/conversations/:id/lock`, `/conversations/:id/releases`, `/releases/:id/download`; tên cuối cùng chốt khi lập implementation plan. Next proxy allowlist hiện hữu phải admit đúng route với cookie/CSRF/streaming, không tạo proxy song song.

- GET history dùng cursor (createdAt,id), giới hạn page server; polling khi room đang mở, pause hidden/offline, backoff lỗi. Không offset-only bỏ/mất tin khi có tin mới. Không đòi websocket; không có websocket write endpoint để lách quyền.
- POST: client tạo key ổn định cho một ý định, giữ qua retry; transaction kiểm room/grant/lock, insert message + link attachments. Unique DB chặn đồng thời; cùng key/hash trả cùng ID, key khác payload trả conflict. Timeout không đổi key rồi tạo tin mới; đối soát theo key sau reconnect.
- Trạng thái UI: nháp → đang gửi → đã lưu server; lỗi còn nháp và retry. Chỉ hiện thành công khi server commit và trả ID. Refresh lỗi sau commit báo “đã lưu, chưa làm mới được”, không tạo lại ý định.
- Nháp lưu theo actor/org/room trong sessionStorage, không lưu secret, không dùng nháp actor cũ sau logout. Chính sách retention cần B2; fallback in-memory khi storage không khả dụng, không mất nội dung chỉ vì HTTP lỗi.
- File mới dùng UploadSession target room, trạng thái server; hoàn tất bytes chưa tự là message. Gửi message và claim/link asset atomically; replay trả kết quả cũ. File tạm chưa gửi vẫn chịu quota/expiry/cleanup; file đã linked/released phải được reference guard giữ lại. Quyền attach hết hạn giữa transfer thì không publish/link.
- File đã có: chọn bằng endpoint đã lọc quyền, preview exact asset, tạo link chứ không copy bytes. Internal attachment phải còn quyền nguồn và đích; gắn link không mở nguồn cho người khác. Nếu muốn công bố cho khách phải đi luồng release sau đây, không dùng direct internal file ID như bearer token.

## 8. Phát hành tài liệu cho khách

Nhân viên có quyền đọc nguồn + share/release trong scope đã duyệt → chọn asset/version → preview **nội dung và người nhận** → người có thẩm quyền kiểm tra/phát hành → tạo DocumentRelease → post link release trong room khách. Ai kiểm tra/phát hành, có cần tách người hay không là B5/D01, không tự gán cho role manager.

Release endpoint chỉ trả metadata an toàn và bytes đúng bản, kiểm room/grant/expiry/revoke. Không trả storageKey, nội dung audit, các attachment khác hay đường xem nguồn nội bộ. Các internal `/files/:id` vẫn theo ACL gốc, không trở nên được phép nhờ release. Phiên bản mới không tự cập nhật release cũ; thu hồi release chặn lần đọc sau, không xóa tài liệu nguồn.

Nếu bản gốc chứa dữ liệu không được công bố, phải tạo bản biên tập riêng trong FileAsset, nhãn derivative + link nguồn và người kiểm; không “che UI” trên file tải về. Không tự dùng AI redaction trong gói này. Khách upload mới là nguồn của phòng khách, không tự thành chứng từ đã duyệt hoặc replace current document.

## 9. File code dự kiến liên quan, chưa sửa trong M1

- Giữ/mở rộng: `apps/api/prisma/schema.prisma`, migration additive mới khi được phép; `access-control/{current-actor,development-auth.guard,business-entity.policy}.ts`; `files/{files.service,files.dto}.ts`; `uploads/{uploads.service,uploads.dto}.ts`; `me.service.ts`; Project/Task service chỉ phần scope/link/care đã được duyệt. Không sửa số tiền/hợp đồng/PO.
- Thêm module conversation mỏng trong API (tên file sẽ chốt ở plan), đăng ký AppModule; gọi Prisma/policy/FileAsset có sẵn, không generic event/workflow engine. Test ở cùng pattern hiện có.
- UI dùng `apps/web/app/projects/[projectId]`, api helper, existing file queue và route proxy; shell bốn tab và room panel mới. Không bắt nhân viên dùng bảng rộng trên mobile; list→room→file dạng một cột, nút back, focus/keyboard/accessibility và lỗi đọc được.
- Giữ product/quotation/contract/PO pages hiện hữu; internal deep-link có guard, guest chỉ release projection. Không render control domain chưa được cấp quyền, nhưng backend vẫn kiểm trực tiếp.

## 10. Migration, đối soát và quay lại

Chưa tạo/chạy migration. Sau B1–B5 và design approval mới viết plan:

1. Additive tables/nullable metadata, FK org/project/user, unique keys/idempotency, indexes room+cursor. Exclusive UploadSession target constraint giữ nguyên hai target cũ. Legacy membership mặc định INTERNAL, không mở quyền mới; tài khoản khách mới không nhận role mặc định rộng.
2. Không gộp/xóa Lead/Opportunity, không rewrite migration applied, không backfill customer/history tự động. Phần nguồn chưa liên kết giữ nhãn; preview mapping và báo conflicts trước migration dữ liệu về sau.
3. Đối soát trước/sau trên bản sao cô lập: Project/customer/task/assets/version/attachments/contracts/payment/PO IDs và counts, checksum file, grants cũ không mở rộng; migration lặp/deploy đúng phiên bản; kiểm khóa/unique rollback khi race.
4. Bật UI/route mới có kiểm soát sau test. Quay lại route UI cũ và ngừng tạo dữ liệu chat mới nếu có lỗi; **giữ bảng, messages, links và lịch sử đã tạo**, không down-migration xóa dữ liệu hoặc dual-write. Upload cleanup phiên bản cũ chưa biết reference chat có thể xóa nhầm: rollback phải giữ bản backend hiểu các reference mới hoặc tạm dừng riêng cleanup đó bằng quy trình được duyệt, không chạy binary cũ mù quáng. Việc vận hành rollback chỉ làm khi được giao, không M1.
5. Snapshot/restore có đối soát trước chạy dữ liệu thật; không seed/reset shared DB. Kiểm stage/document/financial gates cũ không bị nới bởi room attachment.

## 11. Nghiệm thu M2.1 — tất cả NOT_RUN

Fixture riêng: hai Project P1/P2 của cùng một Customer giả; hai mục A/B với phạm vi khác nhau; room nội bộ/khách; U-send, U-read, U-customer, U-outsider. Grant read/send/attach/download/share được cấu hình tách biệt. App/DB/storage/Redis riêng; email/publishing/AI off, không reuse shared5432/6379. Browser desktop/mobile và API âm bắt buộc.

| M2-AC | Hành vi / bằng chứng cần có                                                                                        | Canonical                  | Trạng thái |
| ----- | ------------------------------------------------------------------------------------------------------------------ | -------------------------- | ---------- |
| 01    | Gửi và reload: đối chiếu message ID/DB/body, lịch sử cursor không mất tin                                          | AC-03 phần nguồn           | NOT_RUN    |
| 02    | Mất response/retry/concurrency cùng key chỉ một message/link; khác payload conflict                                | AC-13                      | NOT_RUN    |
| 03    | Upload/complete/submit/refresh lỗi giữ nháp; không success giả, storage và record đối soát                         | AC-05/13                   | NOT_RUN    |
| 04    | File metadata/preview/download đúng scope, deny URL trực tiếp và checksum bytes đúng                               | AC-07/14                   | NOT_RUN    |
| 05    | Read-only gửi qua UI/API bị cấm; socket write không tồn tại, probe không có đường bypass                           | AC-06                      | NOT_RUN    |
| 06    | Quyền P1 không mở mục B; đa binding không ghép action/scope                                                        | AC-08/09                   | NOT_RUN    |
| 07    | U-outsider/P2 không thấy P1 qua list/search/count/cursor/file/error detail                                         | AC-07                      | NOT_RUN    |
| 08    | Khách chỉ thấy customer room và release đúng phiên bản; direct internal asset bị deny                              | AC-12/14                   | NOT_RUN    |
| 09    | Thêm khách/re-add không công khai lịch sử nội bộ; historyFrom và release được đối soát                             | AC-12                      | NOT_RUN    |
| 10    | Revoke khi send/upload/poll/download đang chờ chặn commit/delivery tiếp theo; lock giữ history                     | AC-11 phần quyền, không AI | NOT_RUN    |
| 11    | Một task/line/file dùng cùng ID qua các nhóm, linking không cấp quyền nguồn                                        | AC-14                      | NOT_RUN    |
| 12    | Với Project đã có: care→signed view→care→execution giữ ID/chat/file/nghĩa vụ; P2 không đổi; Lead-only chưa là PASS | AC-01/02 phần M2.1         | NOT_RUN    |
| 13    | Mobile login/list/read/send/retry/open file; draft/focus/lỗi dùng được, không buộc bảng rộng                       | G trải nghiệm              | NOT_RUN    |
| 14    | Không có AI provider vẫn chat/file người–người bình thường                                                         | AC-23                      | NOT_RUN    |

Thêm regression mandatory: guest deny mọi endpoint cũ ngoài allowlist, multi-binding, reply/attachment khác room, release thu hồi/expiry, source immutability, cleanup không xóa referenced assets, không lộ finance qua audit/notification/task, migration/rollback/reference preservation. Ca AI/full backup/model thuộc M3/M7 vẫn NOT_RUN. Demo phải đi luồng đầy đủ bằng tài khoản giả, không chỉ unit test xanh.

## 12. Các lựa chọn cần chủ dự án duyệt trước code

| ID       | Đề nghị cụ thể                                                                                                                                | Chờ quyết định / tác động                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| B1       | Tích hợp có kiểm soát G02 đã chứa G01 vào nền chính, bảo toàn M0/M1, rồi xác minh SHA mới                                                     | Cần giao quyền integration riêng và phương án test/migration; M1 không tự merge/cherry-pick                             |
| B2 / D07 | M2.1 chưa edit/delete; đính chính bằng tin mới; lịch sử mặc định từ joinedAt, mở lịch sử cũ có preview/authority riêng                        | Chốt ai quản trị room, retention nháp/tin, chính sách re-add; không mặc định đã duyệt                                   |
| B3       | M2.1 dùng Project đã có; care riêng không động nghĩa vụ; Lead-only admission/link-backfill là phần kế tiếp cần thiết kế riêng                 | Duyệt ranh giới lát cắt hoặc yêu cầu mở rộng trước code. Chưa đạt toàn bộ một hồ sơ từ tiếp nhận                        |
| B4 / D05 | Guest dùng User/Session + external membership tối thiểu, room-scoped grants, deny-by-default routes; không ProjectMember/generic project.read | Chốt người được mời, người có quyền cấp/thu hồi, thời hạn và trần delegation. Không giải quyết admin cuối bằng suy đoán |
| B5 / D01 | Phát hành exact asset/version qua DocumentRelease có preview, quyền share/release riêng                                                       | Chốt ai kiểm tra/phát hành, tách người nếu cần, nguồn nào được công bố và guest có attach/download không                |

D02/D04/D06/D08 và gate D03 vẫn OPEN, nhưng không tự chặn chat người–người nếu không tác động phần phụ thuộc. Không đóng D01/D05 toàn bộ chỉ bằng quyết định room cục bộ.

**Bước sau khi duyệt:** chốt baseline tích hợp, lập implementation plan theo repository, xác định red tests và environment recipe được phép, rồi mới xin/thực hiện phạm vi M2 đã giao. Không coi việc nộp draft là approval.

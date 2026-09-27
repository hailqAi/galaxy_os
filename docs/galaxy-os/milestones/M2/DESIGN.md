# M2 — Thiết kế cập nhật để duyệt

DESIGN_APPROVAL_STATUS: NOT_APPROVED. PLAN_APPROVAL_STATUS: NOT_CREATED_AWAITING_DESIGN_APPROVAL. IMPLEMENTATION_GATE: BLOCKED_APPROVAL. Ngày 2026-09-28; chỉ docs trước gate, không source/config/migration/test stack.

Đây là bản cập nhật có mục tiêu cho [M1 design](../M1/04-M2-DESIGN-DRAFT.md), không viết lại bộ cốt lõi. Đọc cùng [DECISIONS](DECISIONS.md): nếu khác đề nghị cũ về B1, phạm vi idempotency, fixture/acceptance hoặc nháp thì bản này và chỉ đạo M2 mới ưu tiên. M1 được giữ làm lịch sử, không chỉnh thành “đã duyệt”. PLAN chỉ tạo sau written-spec approval.

## 1. Kết quả và cấu trúc giữ nguyên

Đích: đăng nhập qua nền hiện hữu, mở hồ sơ đúng quyền, nhóm/room, lưu và đọc lại tin/file thật, tách nội bộ/khách, read-only và revoke do backend thực thi. Bốn tab Tổng quan/Làm việc/Hạng mục/Hồ sơ & kiến thức, bốn nhóm 02–05/06–07/08–10/11–12; cùng Project và domain, không bốn kho dữ liệu. Chat không phụ thuộc AI; không nút/demo giả, không tạo task cho từng tin.

Giữ phương án Conversation/Message + grant room trên IAM hiện hữu, FileAsset/EntityAttachment/UploadSession/storage, Task/ProductLine, domain panels; không kéo Comment generic thành ranh giới khách, không hệ thống thứ hai. Model/route mới trong M1 vẫn là tên đề nghị, chưa tồn tại hoặc được duyệt. Source hiện tại không đổi từ M1; [reuse map](../M1/02-REUSE-MAP.md) tiếp tục làm căn cứ.

Polling HTTP có cursor được đề nghị: dùng API/auth hiện hữu, recheck mỗi lần lấy, pause hidden/offline/backoff, không thêm dependency. SSE giảm polling nhưng thêm kết nối dài/revoke/reconnect; WebSocket thêm subscribe/broadcast/write ACL, chưa cần cho gói đầu. Cả ba không cho broadcast dữ liệu rồi để client lọc. Chưa triển khai transport nào.

Chờ B3 để chốt lát cắt Project đã có; không giả admission Lead-only đã hoạt động. Chờ B2/B4/B5 để chốt history/guest/release. Các nguyên tắc không clone hồ sơ, không mở nội bộ cho khách, tách read/send/file/AI/share đã xác lập, không hỏi lại.

## 2. Cập nhật cần thiết so với M1

- B1: không đưa toàn G02 vào main. Prerequisite M2 có review trên worktree riêng, mỗi thay đổi có caller/test. Dữ liệu tiền/contract/payment/PO của G01 không tự vào scope. Nếu dependency kéo rộng thì trình gói riêng, không copy hàng loạt.
- Message idempotency có phạm vi logic **organization/room/actor/action/client key**; tenant và actor do server resolve, action cố định ở endpoint. Cùng tuple/hash trả cùng message; payload khác conflict; key ở room/actor/tenant khác không trả nhầm nội dung. Không bắt buộc thêm cột dư: unique `(room, actor, client key)` có thể đủ nếu room cố định organization và bảng/endpoint chỉ có action gửi tin; PLAN phải chứng minh điều kiện này bằng constraint và test, không bỏ kiểm tenant. DB constraint/index cụ thể sẽ chốt trong plan sau duyệt, không chỉ kiểm frontend. Thứ tự cursor cần kiểm concurrent commit và ranh giới trang, không dùng timestamp client.
- Source attachment luôn kiểm quyền người gửi, nguồn và phạm vi người nhận. Không đính file mà room nhận chưa được phép xem; nếu ACL người nhận không đủ, từ chối kèm hướng xử lý không lộ chi tiết nguồn hoặc dùng release đã được duyệt. Không cấp quyền gốc bằng EntityAttachment.
- Không tự fetch URL trong tin để preview. Plain text/Markdown an toàn, filename escape, không thực thi HTML/script. Author/org/project từ body không cấp quyền; cross-room reply/attachment/task/item phải bị chặn ở service.
- B2 có đề nghị thay sessionStorage nháp M1 bằng nháp trong tab, không sống qua reload; đây là **lựa chọn chưa duyệt**, không hạ yêu cầu chat đã gửi phải persist. Lỗi HTTP giữ nháp khi còn phiên; logout/revoke/account switch xóa cache hiển thị và hủy retry cũ. Không hứa xóa bản tải/chụp hợp lệ.
- Room khóa: cấm SEND/ATTACH mới tại service, vẫn đọc theo grant; không sửa/xóa lịch sử. B2 chưa chốt không triển khai edit/delete hoặc auto-delete retention. Không biến room nội bộ thành room khách.
- Guest User/Session đề nghị giữ auth hiện hữu nhưng bổ sung external boundary, DTO `/me`/Project shell tối thiểu, deny legacy routes ngoài allowlist. Không cấp role nhân viên hoặc ProjectMember để qua gate. File release exact asset/checksum/domain version; preview người nhận+nội dung, quyền kiểm/phát hành độc lập, không public URL.
- Notification/chat unread mới chưa trong lát cắt đề nghị; endpoint cũ vẫn phải deny/projection đúng quyền, không chỉ giấu UI. Audit không lưu/phát body/file nội bộ vào payload người ngoài scope. Task chỉ link sau same-project/target policy, không tạo sổ task mới.
- Desktop list/room/panel mở theo yêu cầu; mobile một vùng chính, có quay lại. Người chỉ xem có lý do tại composer; loading/retry/lỗi thật. Load older giữ vị trí đọc; tin mới không tự kéo xuống khi đang đọc cũ, optimistic item được reconcile bằng ID/key để không lặp.
- Chức năng M2 chỉ bật ở test stack riêng bằng cơ chế enablement được review sau gate. Môi trường main không nhận route/UI mới từ việc sửa worktree; không deploy/sửa cấu hình main.

Các chi tiết migration additive, source immutability, cleanup reference, rollback không xóa tin/link và không chạy cleanup binary cũ thiếu reference trong M1 mục10 vẫn giữ. Không tạo migration trước approval, không áp lên shared DB.

## 3. Prerequisite có căn cứ, chưa phải patch được duyệt

| Đường M2 phụ thuộc                   | Nền/source thực                                                                                                                                                                                                                                                            | Sửa cần review và chứng minh                                                                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actor action/scope, room admin/grant | [CurrentActor](../../../../apps/api/src/access-control/current-actor.ts), [BusinessEntityPolicy](../../../../apps/api/src/access-control/business-entity.policy.ts), [UserManagementPolicy](../../../../apps/api/src/access-control/user-management.policy.ts), auth guard | G02 có permissionSourcesFor/permissionScopeFor và cùng nguồn tier/target; chọn đúng helper/caller cần M2, không đem toàn users/roles changes. Test G02 A1/A2/A3/A4, target-scope-tier và revoke làm căn cứ; phải test mới trên SHA M2 |
| Task link, hidden project            | [TasksService](../../../../apps/api/src/tasks/tasks.service.ts) và BusinessEntityPolicy                                                                                                                                                                                    | Đồng nhất scope/target khi M2 dùng task, không assignment→grant. Không sửa budget/status nghiệp vụ để làm chat                                                                                                                        |
| Search/audit rò nội bộ               | [SearchController](../../../../apps/api/src/search/search.controller.ts), [AuditService](../../../../apps/api/src/audit/audit.service.ts)                                                                                                                                  | G01 có sửa; chỉ đưa phần đường M2 dùng vào prerequisite. Guest deny legacy endpoints cần test trực tiếp. Không coi bỏ UI là sửa API hoặc coi thiếu audit.projectId đã được chữa bằng một helper                                       |
| Notification/file/upload boundary    | [NotificationsService](../../../../apps/api/src/notifications/notifications.service.ts), [UploadsService](../../../../apps/api/src/uploads/uploads.service.ts), [FilesService](../../../../apps/api/src/files/files.service.ts)                                            | Notification mutation/count và room release còn thiếu ngay ở G02; mở target upload hiện hữu, reference cleanup và không success giả. Không nói G02 sửa hết upload                                                                     |

Đã đối chiếu diff sáu file liên quan với `e4cc3adb555cec72c8c433eb65aa1fd8946aa4f0`: vẫn khác baseline; test G02 có thật ở worktree riêng. Không chạy lại audit/full suite và không copy patch. Exact functions/files/tests áp dụng cuối cùng phải được chốt trong PLAN sau B1/design; còn dependency ngoài scope thì dừng phần đó.

## 4. Môi trường thử đề nghị, chưa tạo

Recipe đọc được: [docker-compose.g00.yml](../../../../docker-compose.g00.yml), [g00-isolated-test.mjs](../../../../scripts/g00-isolated-test.mjs), [guard](../../../../apps/api/scripts/g00-isolated-environment.mjs). Giữ kiểm local Docker context/socket, loopback, tenant/storage độc lập, không `.env.local` fallback. Đây là thiết kế môi trường để review, không plan đã duyệt hoặc lệnh đã chạy.

| Tài nguyên             | Phương án kỹ thuật sau gate                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worktree/branch        | Tạo bằng workflow repository sau approval, từ HEAD lúc đó có M0/M1 và docs M2 hợp lệ; ghi START_SHA mới, không reset về SHA cũ. Worktree không là thư mục main đang phục vụ Edge                                                                                                                                                                                                                                                                                                          |
| Namespace DB/Compose   | Run ID duy nhất, ví dụ `20260928m2a`; project/database `galaxy_os_g00_20260928m2a` theo guard hiện có; user fixture `galaxy_g00_test`, credential chỉ test. Trước dùng kiểm không có tài nguyên có trước cùng tên, nếu trùng chọn ID mới                                                                                                                                                                                                                                                  |
| PostgreSQL/storage     | PG container riêng bind127.0.0.1:55433; tmpfs theo recipe; root `/tmp/galaxy-os-g00-20260928m2a/{files,uploads,avatars}`. Không production credentials/data, không shared5432 hoặc `.runtime`                                                                                                                                                                                                                                                                                             |
| Redis                  | HTTP polling chat không đòi queue mới. Harness G00 hiện kiểm bắt buộc Redis; nếu dùng nguyên harness thì Redis riêng127.0.0.1:56380 chỉ cho recipe/regression, không gọi đó là dependency chat. Không nới guard để dùng shared6379                                                                                                                                                                                                                                                        |
| Web/API                | Đề nghị Web127.0.0.1:33002, API127.0.0.1:33001, same-origin proxy đúng URL; kiểm port trống trước chạy. Recipe Web/API còn phải review để không load env chính hoặc tự spawn server LAN                                                                                                                                                                                                                                                                                                   |
| Session/fixture        | Cookie tên riêng qua SESSION_COOKIE_NAME hiện có; browser profile/context riêng vì cookie không cô lập theo port. Tenant O1 có Project P1/P2 và mục A/B khác quyền; tenant O2 có Project P3, room R3, FileAsset F3 và actor U3 có grant hợp lệ riêng. Mỗi Project có room/file đối chứng; O1 có manager/sender/viewer/outsider/customer/other-partner giả. Kiểm truy cập chéo O1↔O2, tráo room/file/actor và dùng cùng client key. Không x-galaxy-dev-auth để thay nghiệm thu login thực |
| External effects       | ALLOW_DEV_AUTH=false, FEATURE_MARKETING=false; không provider key, SMTP credentials, email invite hoặc adapter thanh toán/publishing thật. Route/fixture không gọi các tác động đó; cô lập network được review để không chỉ dựa NODE_ENV=test                                                                                                                                                                                                                                             |
| Cleanup/giữ bằng chứng | Trước stop/down xác minh đúng namespace, labels và owned root; chỉ xóa tài nguyên test của lượt sau khi đã lưu kết quả. Không prune/stop shared stack. `down` của recipe có xóa root/volumes nên không chạy ngoài exact scope                                                                                                                                                                                                                                                             |

Các entrypoint **có thật**: `node --env-file=<file-test-riêng-đã-review> scripts/g00-isolated-test.mjs check`, rồi các subcommand `up`, `prepare`, `smoke`, `down`. `check` chỉ validate cấu hình; `up` tạo container/root; `prepare` có generate/migrate/seed; `run` tự gọi cleanup. Chưa tạo file env, chưa chạy entrypoint nào. PLAN sau duyệt sẽ cố định exact worktree/env path/commands/fixture và lệnh start/stop; không dùng placeholder này để thực thi.

Không cần dựng stack chỉ để xin quyết định. Sau gate hợp lệ phải thực sự dựng/xác minh, không giữ “chưa có stack” làm blocker vô thời hạn. Nếu lúc đó executor/quyền chặn thao tác cụ thể, ghi đúng lệnh/exit và xin quyền hợp lệ; không lặp sudo bwrap khi chưa có auth mới.

## 5. Ma trận M2 cập nhật theo 24 ca mới — chưa chạy

Mã dưới đây thuộc prompt M2 mới, không thay AC-01–24 canonical M0. Dùng fixture hai tenant ở trên, test cả DB/API/transport/browser; mock chỉ là unit. Mỗi PASS sau này phải có CODE_SHA/TESTED_SHA/tree, command/exit, fixture, assertion persisted và bằng chứng UI khi cần.

| M2-AC | Kết quả bắt buộc                                                     | Lớp bằng chứng               | Trạng thái |
| ----- | -------------------------------------------------------------------- | ---------------------------- | ---------- |
| 01    | Gửi/reload/login lại giữ đúng history                                | DB/API/browser               | NOT_RUN    |
| 02    | Retry cùng yêu cầu chỉ một tin                                       | DB/concurrency               | NOT_RUN    |
| 03    | Cùng key khác room/actor/tenant không trả nhầm                       | DB/API                       | NOT_RUN    |
| 04    | Gửi đồng thời giữ đủ tin/thứ tự server ổn định                       | DB/API                       | NOT_RUN    |
| 05    | Cursor ở ranh giới trang không lặp/mất tin                           | DB/API/browser               | NOT_RUN    |
| 06    | Viewer không gửi qua UI/API/transport đã chọn                        | API/browser                  | NOT_RUN    |
| 07    | Outsider không thấy title/snippet/count/file                         | API/search/log/transport     | NOT_RUN    |
| 08    | Có mục A không mở mục B                                              | API/browser                  | NOT_RUN    |
| 09    | Không ghép action/scope khác binding                                 | IAM integration              | NOT_RUN    |
| 10    | Giả author/tenant/projectId không cấp quyền                          | API validation               | NOT_RUN    |
| 11    | Room lock từ chối tin mới, giữ lịch sử                               | DB/API/browser               | NOT_RUN    |
| 12    | Revoke chặn lấy/phát tiếp theo và hủy cache/retry                    | Race/API/browser             | NOT_RUN    |
| 13    | Reconnect không khôi phục quyền cũ                                   | Transport/browser            | NOT_RUN    |
| 14    | Đúng FileAsset/version, mở/tải lại bytes khớp                        | DB/storage/browser           | NOT_RUN    |
| 15    | File khác project/org bị từ chối                                     | API/storage deny             | NOT_RUN    |
| 16    | Upload lỗi không success giả, retry nhất quán                        | DB/storage/API/browser       | NOT_RUN    |
| 17    | Link room khách không mở quyền nguồn nội bộ                          | Release/direct URL/API       | NOT_RUN    |
| 18    | Khách không thấy nội bộ/đối tác khác                                 | API/browser                  | NOT_RUN    |
| 19    | Thêm/thay/re-add thành viên đúng lịch sử đã duyệt                    | DB/API/browser, cần B2/B4    | NOT_RUN    |
| 20    | Tin/Markdown/filename độc hại không chạy script hoặc fetch URL tùy ý | UI/API security              | NOT_RUN    |
| 21    | Notification/log không lộ nội dung ngoài quyền                       | API/mutation/count/audit     | NOT_RUN    |
| 22    | Đổi góc tiềm năng/đã ký không clone chat/file hoặc đổi nghĩa vụ      | DB/API/browser, ranh giới B3 | NOT_RUN    |
| 23    | Mobile đọc/gửi/attach dùng được đúng quyền                           | Browser mobile nhiều persona | NOT_RUN    |
| 24    | Không AI vẫn chat người–người bình thường                            | Integration/browser          | NOT_RUN    |

Hồi quy `/me`, upload, IAM và domain tái sử dụng bắt buộc sau code. Không tăng timeout để chữa `/me`, không gọi mọi lỗi là flaky. M1 unit65 PASS là lịch sử trên SHA khác, không PASS cho bảng này. Phòng khách hoặc ca bắt buộc thiếu thì báo PARTIAL/EXTERNAL_CHAT_BLOCKED, không loại khỏi nghiệm thu.

## 6. Trình tự phê duyệt còn thiếu

Đã đọc nguồn/đối chiếu các B, cập nhật design và review tài liệu. Chưa có written design approval; chưa invoke writing-plans, chưa PLAN, chưa chọn phương thức thực thi, chưa tạo worktree code/test stack. Sau quyết định sẽ cập nhật spec cụ thể rồi trình duyệt đúng phiên bản; sau written approval mới viết plan exact paths/interfaces/test/lệnh theo TASK1–5, review plan và chọn cách thực thi trước TDD. Không lấy commit tài liệu làm bằng chứng qua gate.

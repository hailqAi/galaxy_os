# Bàn giao UI PDF và kích hoạt AI — 04/10/2026

UI đã phát hành local; AI chưa nghiệm thu live vì cả ba provider chưa có credential.
Đã tạo store còn thiếu bằng writer hiện hữu, mode0600/owner hailq_glx, providers rỗng.
Không tạo khóa giả, không nhận khóa qua hội thoại và không gọi vendor trong lượt này.

## Kết quả sử dụng

1. Tổng quan dùng **S01\_ Tổng quan Galaxy OS - Desktop.pdf** làm chính, Mobile/States cho responsive và trạng thái; Refined chỉ tham khảo publication.
2. P01 danh sách, P03 tổng quan, P04 chat/AI, P05 hạng mục và P06 hồ sơ đã có component thật, nối domain/API hiện hữu. P02 giữ form tạo thật; sau tạo vào Bước1 khởi tạo, các lần mở từ danh sách vào overview mới.
3. Bộ chọn model nằm trong panel **Hỏi AI** bên phải trang Làm việc và trang **Galaxy AI toàn dự án**. Quản trị kết nối có đường kiểm thử tổng hợp, không yêu cầu đã live-verified trước lần thử đầu.
4. Gemini/Mistral/Kira chưa gọi thật. UNIT/INTEGRATION/CHROME dùng fixture riêng có nhãn; không dùng PDF thiết kế hoặc dữ liệu chín Project chính làm bằng chứng RAG.
5. Còn nhập khóa thay thế dưới owner service, bật từng provider bằng CLI, kiểm model/account và thực hiện live text; Gemini ảnh/PDF kiểm riêng. [ACTIVATION](ACTIVATION.md) ghi đúng lệnh và đường quản trị.
6. Đổi model giữ cùng conversation/source; retry giữ provider/model/revision đã chốt. Đã kiểm qua integration và Chrome provider mô phỏng; chưa dùng điều này làm bằng chứng vendor live.
7. Designer cần bổ sung asset con lửng gốc, font/token có tên, P02 đầy đủ, trạng thái owner/cam kết hạng mục chưa có contract, mobile AI/nguồn nhiều. Không cần export lại để sử dụng bản local hiện tại.

## Nguồn, contract và sai khác

- [Manifest nguồn](design-sources.json): tên file thật/page/checksum/kích thước, chính/variant/tham khảo. Đọc chữ và render16 PDF trong23 file local; không OCR, không Figma MCP/Auto Layout/variables.
- [Map UI/API/quyền và sai khác](DESIGN.md): A/B/C đã thực hiện; không mở quyền/tiền/approval theo nội dung minh họa trong PDF. Font hệ thống, desktop1440/mobile375 là lựa chọn triển khai, không cam kết pixel-perfect.
- KPI S01 aggregate toàn scope, snapshot/asOf, tiền tách currency và loại nghiệp vụ. Actor thiếu quyền tài chính không nhận payload tiền; filter tài chính cũng kiểm quyền trước truy vấn. Activity giao scope project.read và activity.read.
- P01 lọc/tìm/sort/page phía API, URL giữ trạng thái. P03/P04/P05/P06 và AI dùng cùng Project/source IDs. Giữ chức năng publication, quản trị quyền, báo giá và đường quy trình12giai đoạn.
- P04 giữ send/retry/attachment/lock/revoke/readonly, nhiệm vụ ghim và bốn nhóm. URL lưu room/group; Back/Forward có xác nhận bỏ nháp. Mobile dùng nút Danh sách phòng. AI riêng tư; soạn trả lời chỉ tạo nháp.
- P06 preview/version/download đúng FileAsset và quyền. Native PDF mở viewer Chrome; MIME/signature không phải chứng nhận đã làm sạch nội dung PDF. MISSING_BINARY không bị thay bằng file trắng; hai record thiếu binary baseline không sửa/xóa.
- FileAsset chỉ upload vào Project chưa tự thành nguồn AI: dùng ChatFile/publication và ACL của nền M3, UI nêu giới hạn. Không thêm OCR/vector/index song song, không tự tạo room để lập chỉ mục.

## Kiểm chứng source

| Loại                      | Kết quả và bằng chứng                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| UNIT/INTEGRATION toàn bộ  | API1272, Web556, Edge5, document-service1 PASS trong `full-test-final.log`; sau sửa breadcrumb Web557 PASS trong `web-header-final.log`              |
| Runtime/secret CLI        | Python37 PASS, `python-tests-r2.log`                                                                                                                 |
| Static/build              | lint/typecheck/format/diff-check PASS; build API/Web/Edge và build artifact sạch PASS                                                                |
| CHROME production fixture | 28 hành trình đạt theo nhóm cùng build: M2 21, M3 3, PDF4; gồm P02 POST201 → khởi tạo → overview cùng ID                                             |
| Native/PDF                | Preview text UTF-8, Chrome PDF plugin tải xong, version đổi thu hồi blob, missing binary, mobile375 PASS                                             |
| LIVE_PROVIDER             | NOT_RUN, cả ba BLOCKED_BY_CREDENTIALS; không model access/text/image/PDF/RAG live                                                                    |
| Review                    | Astra/high requested, read-only correctness/security/auth/egress/UX + Ponytail: không còn P0/P1/P2 được phát hiện; runtime model metadata UNVERIFIED |

Logs nằm trong `.runtime/ui-figma-evidence/` của worktree, ignored. Chrome tổng hợp:

- `chrome-m2-m3-acceptance.log`:12 ca đầu đạt; thất bại sau đó do test cũ vẫn click room đang được URL tự khôi phục trên mobile.
- `chrome-navigation-ai-final.log`:7 ca navigation/offline tiếp theo đạt; test mobile rời room được cập nhật dùng control Danh sách phòng đang hiển thị.
- `chrome-final-batch.log`:2 ca M2 cuối và3 ca PDF đạt; P02 fixture thiếu estimate.create đã bị API từ chối403 đúng.
- `chrome-p02-ai-final.log`:P01/P02/P03 và3 ca M3 đạt sau cấp đúng quyền ghi trong fixture; không thêm estimate.read, không sửa authorization production.
- Ảnh so sánh: `chrome-final-batch-screens/`, `chrome-p02-ai-screens/`, `chrome-pdf-production-screens/`. Không đưa ảnh/profile/binary khách vào Git.

Không xóa hoặc chuyển các log thất bại thành PASS. Hồi quy đầy đủ chạy với
`scripts/m3-isolated.env.example`, guard xác minh DB/port riêng. Giới hạn affinity hai CPU
chỉ cho test runner để tránh pool Prisma vượt max_connections của fixture; không đổi
DB URL hoặc bỏ isolation guard. Lỗi contracts command permission do lần chỉnh read scope
đã sửa ở đúng lớp, targeted89 và fullAPI1272 đều đạt. Admin crash lease có RED→GREEN.

## Phát hành và vận hành

```text
BASELINE_RELEASE: local-b5045512d8b0
WORKTREE: /home/galaxy_os/.worktrees/m2-a-20260928
BRANCH: m2/project-chat-20260928
CODE_SHA: de274d3e1c38dfb0136fee25334f031b95eb328b
TESTED_SHA: de274d3e1c38dfb0136fee25334f031b95eb328b
TESTED_TREE: 030849c361c7c34f64ee6373c4fe715ac7473b57
DEPLOYED_LOCAL_RELEASE: local-49bd3faf2e63
WEB_BUILD_ID: NvG_M-0f5VT5zYHKmg3WB
DESIGN_SOURCE: LOCAL_PDF
FIGMA_MCP_USAGE: NOT_USED
PUBLIC_DOMAIN: REMAINS_CLOSED
GIT_PUSH_MERGE: NOT_PERFORMED
```

Docs commit là commit chứa bản bàn giao này, được báo SHA riêng sau commit; không
amend source hoặc tự tham chiếu SHA chưa tồn tại. Artifact build từ code commit sạch:
`/home/galaxy_os/.runtime/releases/ui-pdf-20261004`; cấu hình/evidence vận hành riêng:
`/home/galaxy_os/.runtime/ui-pdf-20261004`. Schema83/0pending giữ nguyên, không migration.

Pipeline `prepare-local-release.py build` → `units` → recipe cutover user systemd.
Rollback đã stage code/config cũ; không restore DB. Web/API cùng release; Edge PID308598
và Windows keeper giữ vòng đời. Kiểm sau phát hành phát hiện Web env cũ thiếu
FEATURE_PROJECT_AI dù API đã bật: bổ sung riêng cờ Web và khởi động lại Web qua
service manager, giữ nguyên API/session/signing/storage/public gate.

Hậu kiểm cuối PASS: Chrome chính /me200, cùng actor hash/tập9Project/300permission,
0room, settings200, reload200; overview/work/products/files/ai mở trên bản mới.
Registry của API phục vụ trả configLoaded=true cho cả3, credentialConfigured=false,
revision=null, reason=MISSING_CREDENTIAL, sourcePolicy=DENIED; không còn nhầm
“file cấu hình chưa nạp” với “chưa có khóa”.

Windows localhost và LAN192.168.1.80:3000 health/login200 đúng release mới;
LAN3001 bị từ chối. Canonical HTTPS qua LAN --resolve trả503 với TLS verification bật;
không coi đây là kiểm DNS/WAN. Keeper Running/Limited/Admin, linger=yes; Edge308598
không restart. `local:logs` nhận journal, dừng follower không dừng service; root
`local:status`, `prod:health`, `prod:verify-artifacts` PASS sau đó.
Evidence: `main-browser-final.log`, `network-final.log`, `health-final.log`,
`artifacts-final.log`, `root-status-final.log`, `local-logs-final.log`; receipt ở
private runtime directory, không đưa env/session/backup vào Git.

| Trường trạng thái          | Kết quả                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| S01_STATUS                 | LOCAL_RELEASED; Desktop chính, Mobile/States, snapshot có quyền              |
| P01_P02_STATUS             | LOCAL_RELEASED; list thật và form tạo hiện hữu; Lead-only deferred           |
| P03_STATUS                 | LOCAL_RELEASED; read projection, cam kết tách thực hiện                      |
| P04_CHAT_AI_STATUS         | LOCAL_RELEASED; human chat PASS, AI live blocked                             |
| P05_STATUS                 | LOCAL_RELEASED; hạng mục/detail/context thật, không tạo enum cam kết mới     |
| P06_STATUS                 | LOCAL_RELEASED; upload/preview/version/quyền thật, missing binary giữ nguyên |
| AI_PROJECT_WIDE_STATUS     | LOCAL_RELEASED; dùng chung conversation/source; live blocked                 |
| MODEL_SWITCH_HISTORY       | PASS integration/Chrome fixture; LIVE_NOT_RUN                                |
| CITATION_PERMISSION_STATUS | PASS regression/Chrome fixture; live chưa kiểm                               |
| VISUAL_COMPARISON          | Desktop1440/mobile375; không pixel-perfect, không thiết bị mobile vật lý     |
| FUNCTIONAL_REGRESSION      | API1272/Web557/Edge5/document1/Python37; Chrome28 theo nhóm                  |
| LOCALHOST_LAN_RUNTIME      | READY; session và IDs giữ nguyên, Edge/keeper giữ chạy                       |
| REMAINING_BLOCKERS         | Credential/account access và live smoke từng provider                        |

| Provider | CREDENTIAL_LOADED | MODEL_ACCESS | TEXT_LIVE | IMAGE_PDF_LIVE           | PROJECT_SOURCE_POLICY                           |
| -------- | ----------------- | ------------ | --------- | ------------------------ | ----------------------------------------------- |
| GEMINI   | NO                | NOT_VERIFIED | NOT_RUN   | NOT_RUN; disabled        | SYNTHETIC_PUBLIC_APPROVED; real projects denied |
| MISTRAL  | NO                | NOT_VERIFIED | NOT_RUN   | NOT_SUPPORTED_BY_ADAPTER | SYNTHETIC_PUBLIC_APPROVED; real projects denied |
| KIRA     | NO                | NOT_VERIFIED | NOT_RUN   | NOT_SUPPORTED_BY_ADAPTER | SYNTHETIC_PUBLIC_APPROVED; real projects denied |

## Phần còn thiếu

- Ba credential thay thế và quyền/quota tài khoản để live test; tên candidate giữ nguyên gemini-3.8-flash, mistral-medium-3-5, kira-3.5-pro. Không tự đổi model/provider/mua credit.
- SYNTHETIC_PUBLIC_APPROVED giữ nguyên. Model đã nối không có nghĩa được gửi nguồn Project thật. Chưa duyệt chín Project doanh nghiệp ra provider.
- Gemini image/PDF live chưa đạt nên vẫn tắt; Mistral/Kira text-only. Không raw reasoning, không tự gửi câu trả lời vào room khách.
- Lead-only/lifecycle deferred; không editor tính báo giá mới, gọi thoại/video, tạo ảnh, workflow engine hoặc public portal mới.
- BFCache bị Chrome từ chối do no-store: kiểm reload/revalidation thật, không ghi BFCache-restored PASS. Đóng Codex/reboot/logoff và LAN từ thiết bị khác trong lượt này NOT_RUN; phép thử cross-device cũ là USER_VERIFIED, không nhận thành kết quả mới.

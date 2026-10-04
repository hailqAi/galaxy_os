# Bàn giao UI PDF và kích hoạt AI — 04/10/2026

## Quyết định chủ dự án — OWNER_APPROVED_CURRENT_PROMPT

Chủ dự án đã duyệt rõ trong prompt tiếp tục: popup Project560px/max viewport−32px,
thu nhỏ/mở rộng tối đa1100px/đóng; giữ panel P04; chat16/26, composer16px cao100–120px
tự giãn có giới hạn; nháp RAM; không sao chép conversation; giữ model/source/quyền.
Chủ dự án chọn thực thi INLINE từng task và cho phép tự hoàn thiện chi tiết kỹ thuật
trong kiến trúc/phạm vi này. Không cần xác nhận lại phương án hoặc phương thức thực thi.
Đây không phải phê duyệt một thiết kế/plan khác. Kế hoạch kỹ thuật dẫn xuất ở
[plan popup](../../../../superpowers/plans/2026-10-04-ai-floating-chat.md).

Trạng thái hiện hành: **UI_IMPLEMENTING**. Các dòng AWAITING_DESIGN_APPROVAL bên dưới
là receipt lịch sử đã được quyết định này thay thế, không còn là blocker hiện tại.
Kiểm đầu lượt: cả3provider CREDENTIAL_STORED/API chưa kiểm lại, enabled=false,
textLiveVerified=false; không yêu cầu nhập lại. Nơi nhập cũ giữ
PREVIOUS_INPUT_LOCATION_UNKNOWN, không chặn UI hoặc kích hoạt mới.

Checkpoint T2: popup đã code; header/launcher dùng cùng owner ở PortalShell, mỗi
actor/Project/scope/context giữ một controller. React portal chuyển nơi hiển thị,
không nhân conversation/request. API list trả context ghim từ metadata request
hiện hữu; không migration. Unit22/22, context API1/1, Chrome10/10 (fixture) PASS,
gồm dock→floating→expanded→page khi request chờ, model pin, revoke/actor, nháp RAM.
T3 font/composer chưa triển khai ở checkpoint này; chưa gọi vendor thật.


## Đối soát credential — kết quả mới nhất04/10

**T1 sửa chẩn đoán đã phát hành local; nguyên nhân khóa người dùng chưa đến backend
chưa chứng minh. T2–T4 popup/typography chưa triển khai vì đang chờ duyệt thiết kế.**
Không coi release chẩn đoán này là hoàn tất toàn bộ yêu cầu mới.

1. Nơi người dùng nhập key chưa rõ. CLI canonical, API release cũ/mới và env release
   trước đều trỏ cùng store `/home/galaxy_os/.runtime/ai-providers.json`; root env và
   các env liên quan không có key. Store0600 hợp lệ nhưng không provider entry.
2. Sửa lỗi có bằng chứng ở CLI resolver/diagnostics, phân loại lỗi registry và refresh
   metadata quản trị. Không đổi adapter, auth, egress hoặc giả readiness. Những lỗi
   này chưa chứng minh tại sao khóa người dùng không tồn tại trong store.
3. Gemini/Mistral/Kira chưa có model nào gọi thật; `PROVIDER_TEXT_LIVE_RESULTS=NOT_RUN`.
   Đường admin synthetic vẫn cho phép test model chưa verified, giữ auth/lease/quota.
4. Header Hỏi AI vẫn mở route cũ; chưa có floating popup mới. Panel ngữ cảnh P04 còn
   nguyên. Đã giữ phần UI độc lập với blocker credential bằng việc đọc PDF, đo style,
   truy vết controller và trình bày thiết kế; chưa vượt bước duyệt bắt buộc.
5. Chữ/khung chưa đổi: browser thật1920×945 đo panel12px/18px rộng340px; composer14px/20px
   cao78px; selector11px; page title24px/32px; P04 cột205/1024/340. Chưa đạt yêu cầu16/26.
6. History/source/model switching đã qua Chrome fixture hiện hữu; chưa có bằng chứng
   vòng đời floating/expanded mới. Không nhận fixture/mock thành vendor live.

[Đối soát chi tiết và thao tác cấu hình](ACTIVATION.md),
[bằng chứng mới](../VERIFICATION.md). Chỉ cần người dùng cho biết tên lệnh/màn hình
đã nhập, cwd/user nếu nhớ; không gửi key trong chat. Chưa yêu cầu nhập lại.

## AI floating chat + typography — thiết kế đã trình bày, chờ duyệt

Nguồn thật `/home/galaxy_os/figma`: `AI Panel - Active State.pdf`,
`P04 Workspace - Contextual AI.pdf`, `Galaxy AI - Project Wide Search.pdf`,
`Galaxy OS_ M2-A UI States & Edge Cases.pdf`, `P06 Documents & AI Source View.pdf`,
`Galaxy OS Foundations.pdf`. Tên local không có `(1)`. Cả sáu đã trích text và render
trong `/tmp/galaxy-ai-floating-pdf`; không OCR/MCP/quota retry. File tools/render
không đưa Git, không gửi vendor. Nguồn PDF cho navy/trắng, source chips, thông báo
riêng tư, ba vùng P04 và kiểu đọc rộng; không dùng số liệu/trả lời mẫu làm dữ liệu.

Phần điều chỉnh mới đề xuất theo yêu cầu người dùng, chưa phải UI đã phát hành:

- Một owner AI toàn Project tồn tại ở PortalShell; header và launcher cùng mở một
  presentation. Mặc định non-modal560px, max viewport−32px, cao tối đa760px và phần
  viewport an toàn, right/bottom24px, radius20px. Expanded tối đa1100px, nội dung760px.
  Mobile dùng sheet chiều cao động/safe area. Không voice/video/Live API/widget ngoài.
- Đóng/thu nhỏ chỉ ẩn presentation; cùng component giữ conversationId/model/nháp RAM
  và request. Dừng là hành động riêng. Actor/Project đổi thì không retarget response
  cũ sang Project mới; không thêm draft storage. Không hai consumer gửi/poll cùng thread.
- P04 giữ session theo group/room khác session ALL/null toàn Project. Backend list
  có thể trả context từ request/answer metadata hiện hữu để lọc đúng history, không
  migration/domain mới. P05/P06 mở đúng source/version; reuse viewer P06.
- P04 dùng vùng nội dung để chọn ba cột220–240 / tối thiểu520 / 380–420. Khi thiếu
  chiều rộng, thu danh sách trước, rồi overlay/tab AI; không giảm chữ để ép ba cột.
- Token có scope: chat16/26, composer16/24–26 cao100–120→200px, metadata13/18,
  button/tab14–15/20–22, title18/26, page28/36. Giữ font UI hỗ trợ tiếng Việt đang có;
  không CDN font, zoom/scale toàn app hoặc wildcard toàn bộ trang.

Phải tiếp tục sau duyệt: writing-plans, TDD controller/context/IME/focus/scroll/source,
kiểm popup tại1366×768,1440×900/1024,1920×1080,390×844 và zoom200%, bàn phím mobile;
full regression/review, rồi release riêng. Các mục này hiện `NOT_IMPLEMENTED/NOT_RUN`.
Thiếu key không chặn triển khai UI sau khi thiết kế được duyệt.

## Receipt bản sửa T1

| Trường                       | Kết quả                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| CREDENTIAL_ROOT_CAUSE        | NOT_PROVEN; user entrypoint UNKNOWN; actual store EMPTY_STORE                         |
| CLI_RUNTIME_STORE_MATCH      | PASS; absolute canonical path, root/worktree cùng resolver                            |
| STORE_NON_DESTRUCTIVE_UPDATE | PASS fixture atomic/concurrent/CAS; store thật không ghi                              |
| CONFIG_RELOAD_VERIFIED       | PASS API process mới đọc cùng store rỗng; revision refresh PASS fixture               |
| PROVIDER_TEXT_LIVE_RESULTS   | Gemini/Mistral/Kira NOT_RUN — không eligible credential                               |
| IMAGE_PDF_CAPABILITIES       | Gemini live chưa kiểm nên tắt; Mistral/Kira text-only                                 |
| EGRESS_POLICY_STATUS         | SYNTHETIC_PUBLIC_APPROVED; Project thật DENIED                                        |
| FLOATING_AI_STATUS           | AWAITING_DESIGN_APPROVAL; chưa triển khai                                             |
| CONTEXTUAL_PANEL_STATUS      | Giữ panel P04 hiện hữu; regression PASS                                               |
| EXPAND_MINIMIZE_HISTORY      | Vòng đời popup mới NOT_RUN; panel cũ/history fixture PASS                             |
| PROJECT_SWITCH_ISOLATION     | Popup mới NOT_RUN; actor/revoke fixture PASS                                          |
| TYPOGRAPHY_COMPUTED_STYLES   | Baseline12/18 panel,14/20 composer78px, selector11px; chưa đổi                        |
| RESPONSIVE_KEYBOARD_RESULTS  | UI mới/zoom200/IME/mobile keyboard NOT_RUN                                            |
| CODE_SHA / TESTED_SHA        | `e7ad61d8c739fbcb053ad0bc8b9e5bafc4d917a3`                                            |
| TESTED_TREE                  | `ee4f0204a9fc04357da4f2f4692d2f0b7d9cecdd`                                            |
| DOCS_COMMIT_SHA              | Commit docs chứa báo cáo này; SHA chính xác trong phản hồi cuối, không self-reference |
| DEPLOYED_LOCAL_RELEASE       | `local-79e2ba59dd6d`, BUILD_ID `EoYwh9ru-aBUpRSIJ5ji4`                                |
| RUNTIME_CONFIG_PERSISTENCE   | Store metadata/mtime/path giữ nguyên qua cutover; key persistence chưa thể kiểm       |
| REMAINING_BLOCKERS           | Nơi nhập credential chưa rõ; chưa có key đủ điều kiện live; chờ duyệt thiết kế UI     |
| DESIGN_HANDOFF_PATH          | `docs/galaxy-os/milestones/M3/ui-figma/HANDOFF.md`                                    |
| PUBLIC_DOMAIN                | REMAINS_CLOSED                                                                        |
| GIT_PUSH_MERGE               | NOT_PERFORMED                                                                         |

Artifact `/home/galaxy_os/.runtime/releases/ai-config-20261004` được build từ snapshot
sạch, private env ngoài artifact chỉ đổi release marker; store không đổi. Rollback
code/config tại `/home/galaxy_os/.runtime/ai-config-20261004/rollback`, không restore DB.
Recipe cũ được sửa nhánh partial stop/rollback và kiểm bốn tình huống fake runtime;
preflight/baseline/backup dưới cùng lifecycle lock. Cutover thật không cần rollback.
Main Chrome cùng actor/9Project/300permission/0room; Windows localhost/LAN200,
LAN_API3001 không truy cập, public HTTPS503 qua LAN resolve/TLSverified. Edge308598
và keeper Running/Limited giữ nguyên; không nhận thành kiểm WAN/reboot/logoff.
Metadata model thực thi agent: UNVERIFIED; không dùng tên yêu cầu routing làm bằng chứng.

## Lịch sử lượt UI PDF trước bản sửa T1

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

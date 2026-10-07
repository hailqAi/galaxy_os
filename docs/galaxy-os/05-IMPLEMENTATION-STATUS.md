# Trạng thái triển khai và điểm tiếp tục

## 08/10 — ChatGPT plan only đang triển khai, main chưa cutover

Handoff hiện hành: [08/10 ChatGPT plan only](handoffs/2026-10-08-chatgpt-plan-only.md), kế hoạch hợp nhất [master + addendum](../superpowers/plans/2026-10-08-chatgpt-plan-only.md). Đã pause4provider API key bằng config live; không có job QUEUED/RUNNING tại lúc kiểm. Main localhost/LAN vẫn `local-a0429faf5733`, APP_SERVING nhưng CONTROL_PLANE_UNAVAILABLE. Chưa phục hồi D-Bus hoặc vượt rejection cũ.

Code checkpoint sửa controller/template, yêu cầu policy khi tạo candidate, chặn fetch API key, contract SIWC và UI eligibility chưa xác nhận, count/pagination Task từ domain thật. SIWC **ELIGIBILITY_UNCONFIRMED**, chưa callback/connection/model/tool live; lifecycle/work tools/tracker đầy đủ vẫn còn việc. CODE_SHA9a02b4c, TESTED_SHA232c4f7/tree d3bd974189faa24b176eb230c074573e926da7fe. Regression mới PASS API1386/Web568/Edge5/document1, runtime64, lint/types/format/build. Candidate local-63652e4cc6d8 đã kiểm exact artifact Chrome2test/5widths và template trong runtime validator cô lập. Main vẫn cũ; restart draft bị review bác; đề nghị recovery bằng bus tạm + Manager.Reexecute có receipt/cleanup đã qua review để trình phê duyệt riêng, USER_APPROVAL_PENDING/MUTATION_NOT_RUN. Không dùng kết quả các mục lịch sử bên dưới làm evidence của bản08/10.

## Năm PDF mới + công cụ Project-only — code đạt, phát hành đang bị chặn

Code T0–T6 đã commit local, CODE_SHA=TESTED_SHA `0738358ed153195a8b68927945875e703eb3ae41`, TESTED_TREE `f51d35d735efd236ce751f18fdb332f5d7e76892`. Full regression mới đạt API1370/Web567/Edge5/document1; lint/typecheck/format/build và59test scripts đạt. Chrome artifact r2 đạt các hành trình file/artifact, private/revoke/late response và popup viewport; có đối chiếu đủ năm PDF. Không gọi pixel-perfect hoặc keyboard thiết bị thật PASS.

**Chưa phát hành bản mới lên main.** Candidate `local-a9b073642935` đã build và đối soát production source; main vẫn `local-a0429faf5733`, localhost/LAN `.80:3000` health tốt. Cutover đầu lỗi template unit từ checkout cũ, rollback thành công. Sau lượt `systemd-analyze --user verify`249, socket private đổi inode; nghi liên quan dựa trên timestamp/inode, chưa tái hiện cô lập; user manager còn chạy nhưng không kết nối điều khiển được. Automatic approval review đã từ chối phục hồi D-Bus tạm vì phạm vi user manager vượt hai service app; đang chờ phê duyệt riêng, chưa thực hiện phục hồi. Không bypass, restart manager hay mở app tạm.

DOCX/PNG/XLSX/scan và xuất DOCX/PDF/XLSX đạt code/local/Chrome fixture; vendor/main mới NOT_RUN do cutover chưa xong. Tavily chưa cấu hình/ngân sách; OpenAI image/audio/Responses chỉ wire codec disabled, lifecycle paid chưa nối. Business tool giới hạn kế hoạch Stage2 và quyền trường, không đọc toàn ERP. Giữ env, schema86, storage/session/Edge và public đóng.

[Handoff và evidence](handoffs/2026-10-06-five-pdfs-project-tools.md). Các mục dưới là lịch sử.

## Chat AI thống nhất theo Project — phát hành local 06/10

Luồng câu hỏi/file không mode hoặc approve/synthetic đã chạy thật trên Chrome LAN `192.168.1.80:3000`, Project hiện hành/COMMERCIAL không có room. OpenRouter PROJECT_AUTHORIZED chỉ tenant Galaxy, giữ IAM/source revoke/private/financial/FREE_ONLY/privacy. PDF binary723byte/link/version/downloadSHA đạt; answer đúng nội dung và citation trang1; câu nối tiếp không upload lại. PNG capability qua API main/vendor thật PASS; chưa upload ảnh main thứ hai. Popup560/1100, chữ16/26 và chuyển panel/trang/reload giữ history,0POST trùng.

Release **local-a0429faf5733**, schema86, API/Web READY; credential/Edge/keeper/public-domain-closed giữ. HEAD nền32d62a2, source/docs chưa commit; TESTED_SNAPSHOT `a0429faf5733b54f13d125da20c7990a9c965ffa48f9c2f81674d4a2cf8ec5eb`. Không báo hoàn tất toàn yêu cầu: aggregate nghiệp vụ đầy đủ chưa nối; DOCX/PDFscan chưa hỗ trợ; XLSX extractor đạt nhưng chưa live vendor. Hồi quy cuối PASS API1314/Web564/Edge5/document1, CLI26 đạt; test M2 từng timeout5000ms, lượt cuối đạt4839ms, không đổi timeout chuẩn. Lint/types/build/format/review và Chrome fixture1+7 đạt.

[Handoff hiện hành](handoffs/2026-10-06-unified-project-ai.md) ghi request/model/dispatch/version, chính sách mới, backup/migration, kiểm main và giới hạn. Các mục bên dưới là lịch sử.

## OpenRouter GENERAL — hai lượt thật đạt, phát hành 06/10

**API_CHAT_MAIN: DÙNG ĐƯỢC.** Chrome popup/session thật,2lượt trong cùng hội thoại GENERAL, sourceCount0, vendor200×2/dispatch1mỗi lượt/0retry, usage.cost0mỗi lượt; reload sau release giữ2answer/0POSTtrùng. Requested `openrouter/free`; returned `inclusionai/ling-3.0-flash-sante:free` và `cohere/north-mini-code:free`.
Canonical env đủ5khóa, old3 giữ nguyên, API5LOADED; JSON_METADATA_ONLY. Gemini/Mistral paused, Kira quota giữ; LlamaCloud DOCUMENT_KNOWLEDGE/configured, không gọi dịch vụ. CLI25/API32/build/Astra/Ponytail PASS;3212artifactfile không credential. Release `local-d3fd75b21ffe`, CODE_SHA=TESTED_SHA `6ffd63614cdec64af11b1958588888db28aeb861`, API/Web READY, DB/schema/session/Edge giữ. Không cần nhập lại khóa; [handoff và evidence](handoffs/2026-10-05-openrouter-general.md). Các mục bên dưới là lịch sử trước kích hoạt.

## OpenRouter GENERAL — đã phát hành, live chờ credential 05/10

Release `local-fd0f306f0c40`, CODE_SHA=TESTED_SHA `dae8e081810490f53c13ad5010495a280ad9e4f9`; API/Web READY. OpenRouter native adapter FREE_ONLY chỉ `openrouter/free`, GENERAL0source, không paid fallback; IAM/policy giữ nguyên. Credential OpenRouter/LlamaCloud chưa có: **hai lượt OpenRouter UI chưa đạt**, không có returned model/cost live.
Gemini/Mistral paused đúng backend/UI; Kira giữ quota, không gọi lại ba provider cũ. LlamaCloud metadata DOCUMENT_KNOWLEDGE đã đăng ký, CREDENTIAL_PENDING/CONNECTIVITY_NOT_VERIFIED, không xử lý/index/RAG cloud.
Focused API62/Web13/CLI15, types/lint/build/format và Astra/Ponytail review PASS; Chrome giữ session/lịch sử GENERAL cũ, đúng release,0POST khi reload. Schema/storage/Edge/keeper giữ, không migration hoặc phần ngoài phạm vi.
[Handoff hiện hành](handoffs/2026-10-05-openrouter-general.md) ghi lệnh nhập key ẩn đã kiểm, evidence và bước nghiệm thu hai lượt còn chờ. Các phần bên dưới là lịch sử, không phải release/provider-state hiện hành.

## Chat API main — nghiệm thu GENERAL 05/10, chưa đạt đủ hai lượt

Release giữ `local-a33d8a12318c`; API/Web cùng artifact/code `3a00f4e`, READY.
Không sửa product code/key/schema hoặc phát hành mới. Chrome phiên hiện có:
Kira402/insufficient_quota; Gemini câu1 live200 đã lưu, câu2503×3/68s;
Mistral429/code1300 không Retry-After, RATE_LIMITED_UNKNOWN. GENERAL0source,
Project source DENIED; chỉ INPUT đúng câu mẫu được duyệt bằng UI theo owner.
Mở lại/reload giữ answer/lịch sử, không POST trùng;46test mock mục tiêuPASS.
**API_CHAT_MAIN: CHƯA DÙNG ĐƯỢC theo nghiệm thu hai lượt thành công**;
không dùng PASS vendor lịch sử bên dưới thay kết quả mới.
[Handoff hiện hành](handoffs/2026-10-05-api-chat-main.md) ghi request/model/status/
answer/evidence và owner action quota Kira, Limits/Usage Mistral,503 Gemini.
Không tiếp tục RAG/PDF/Figma hoặc các phần khác.

## AI env/chat/RAG — phát hành local 05/10/2026, có giới hạn vendor

Release `local-a33d8a12318c`, CODE_SHA=TESTED_SHA `3a00f4ed9274fa5d7fb9c47dc3ea2ef3e4eb43c7`;
TESTED_TREE `255c32426efbb33fd3e6d66b1d58e08bec2cd6c6`. INLINE theo thiết kế owner đã chốt.
Ba khóa đã chuyển nguyên vẹn sang `/home/galaxy_os/.runtime/ai-providers.env`0600;
active JSON metadata-only, API3LOADED/source env sau restart, không key vào Web/build.
Kira GENERAL main và RAG/citation fixture live PASS; Gemini text và Kira→Gemini RAG
fixture PASS, có bằng chứng503 retry3lần hữu hạn. Mistral429/code1300 vẫn
RATE_LIMITED_UNKNOWN/BLOCKED; ảnh/PDF chưa live verified.

DB fixture riêng `galaxy_os_g00_20260930m3`:55435,storage/session/queue riêng; lexical
index, hai mã vật liệu được nguồn hỗ trợ, Chrome mở citation/file đúng version200.
Không còn chờ chọn fixture.9Project thật×3provider vẫn DENIED; chỉ câu số học public
được duyệt để smoke GENERAL. Workflow ACCESS_ADMIN duyệt/thu hồi Project/source/version/
provider và input có audit đã dùng trên fixture; mở dữ liệu thật còn cần scope/tier phù hợp.

FullAPI1285+1PDFskip/Web561/Edge5/document1/Python10,lint/types/format/build PASS;
review không còn Critical/Important. CHECK migration84 cho GENERAL0citation, RAG vẫn
bắt buộc citation; không reset/restore dữ liệu. Popup560/1100,font16/26,composer112,
P04/session/9Project và localhost/LAN giữ; Edge/keeper không restart,public vẫn đóng.
Không push/merge. Không ghi toàn bộ AI hoàn tất.

[Handoff hiện hành](milestones/M3/ui-figma/HANDOFF.md) và [vận hành env/model/source](milestones/M3/ui-figma/ACTIVATION.md)
ghi file/dòng, lệnh, request ID, capability và blocker còn lại.

---

## Lịch sử trước bản env/chat/RAG ngày 05/10

Các nhận định dưới đây thuộc các lần bàn giao cũ; trạng thái hiện hành là phần trên.

## AI floating chat + typography — đã phát hành local 05/10/2026

DESIGN_APPROVAL_STATUS: **OWNER_APPROVED_CURRENT_PROMPT**. Chủ dự án đã duyệt
popup560px, expanded1100px, giữ P04, nháp RAM, chat16/26 và chọn thực thi INLINE.
Không có điều kiện chờ duyệt lại thiết kế này.

Release `local-df7ba5a5c974` từ CODE_SHA=TESTED_SHA `11af11543196b80dc6f35abbfba9b1b329768390`;
TESTED_TREE `3d1386054b8494db092efca10393e21efc2a39fc`. [Bàn giao hiện hành](milestones/M3/ui-figma/HANDOFF.md).
Popup và typography đã nghiệm thu Chrome và phát hành; chưa gọi toàn gói AI hoàn tất.
Kira text live PASS3câu; Gemini câu đầu đạt rồi503; Mistral429. Cả3credential đã có
ở canonical store và API nạp đúng revision, không yêu cầu nhập lại. Nơi nhập cũ vẫn
UNKNOWN; không chặn UI. Chưa live citation/đổi model theo nguồn Project; ngoại lệ
fixture namespace riêng trong DB local đang chờ lựa chọn owner. Không gửi9Project thật.
Gemini image/PDF chưa live nên disabled; SYNTHETIC_PUBLIC_APPROVED giữ nguyên.
Localhost/LAN200, session/9Project và config qua restart giữ nguyên; Edge/keeper
không restart, public vẫn đóng. Không migration/push/merge. Các mục04/10 dưới đây
là lịch sử, không phải trạng thái hiện hành.

## Đối soát API key — 2026-10-04 — T1_DIAGNOSTICS_LOCAL_RELEASED / UI_AWAITING_DESIGN_APPROVAL

Đã phát hành riêng bản sửa chẩn đoán cấu hình `local-79e2ba59dd6d`, Web BUILD_ID
`EoYwh9ru-aBUpRSIJ5ji4`. CODE_SHA=TESTED_SHA `e7ad61d8c739fbcb053ad0bc8b9e5bafc4d917a3`;
TESTED_TREE `ee4f0204a9fc04357da4f2f4692d2f0b7d9cecdd`. Đây chưa phải hoàn tất yêu cầu
popup/typography hoặc kích hoạt provider live.

CLI canonical và API thực tế cùng đọc `/home/galaxy_os/.runtime/ai-providers.json`.
Store0600 đúng owner, schema hợp lệ, nhưng providers rỗng; metadata/mtime không đổi
qua cutover. Đã đối chiếu root/worktree, env hiện hành, process systemd và env release
trước; không thấy credential tại các nguồn này. **Chưa biết lệnh/màn hình người dùng
đã nhập**, nên nguyên nhân khóa không có trong store vẫn chưa chứng minh. Không yêu
cầu nhập lại mù quáng, không tạo store khác hoặc tìm key trong hội thoại/history.

Đã sửa CLI nhận override tuyệt đối, phân loại trạng thái đọc/store/entry/key; API/UI
hiện đúng nguyên nhân; cấu hình quản trị mở theo revision mới. Kiểm thử writer giữ
provider khác, concurrent updates, evidence không đủ không tạo live flags, không
xuất key và không truncate khi JSON lỗi. Không bỏ auth/egress/disabled guard.

API1274+1skip/Web558/Edge5/document1/Python41 đạt; Chrome8 hành trình fixture đạt;
lint/typecheck/format/build/artifact đạt. Chrome main đúng release, cùng actor và
9Project/300permission/0room; localhost/LAN200, public HTTPS503 qua LAN resolve,
Edge308598 và keeper giữ chạy. Không migration/restore DB, vendor call hoặc egress
nguồn doanh nghiệp. Cả3provider EMPTY_STORE, text live NOT_RUN; Gemini ảnh/PDF tắt.

Thiết kế popup/controller đã trình bày và chờ duyệt rõ theo AGENTS; chưa viết phần
popup/typography. PDF thật ở `/home/galaxy_os/figma` đã đọc text và render. Chữ panel
hiện đo12/18, composer14/20 cao78px, selector11px: **chưa đạt mục tiêu mới**.
[Bàn giao hiện hành](milestones/M3/ui-figma/HANDOFF.md) có đối soát, phạm vi đã phát hành và thiết kế chờ duyệt.
Các mục bên dưới là lịch sử. Không push/merge/public.

## UI từ PDF và kích hoạt AI — 2026-10-04 — UI_LOCAL_RELEASED / AI_LIVE_BLOCKED

S01 theo Desktop/Mobile/States; P01/P02/P03/P04/P05/P06 và AI toàn dự án đã lên
`http://localhost:3000/`, dùng domain/API/chat/source hiện hữu. Nguồn LOCAL_PDF;
không Figma MCP, không OCR hoặc hệ thống song song. PDF/function map và sai khác
ở [bàn giao thiết kế](milestones/M3/ui-figma/HANDOFF.md).

CODE_SHA=TESTED_SHA `de274d3e1c38dfb0136fee25334f031b95eb328b`; TESTED_TREE
`030849c361c7c34f64ee6373c4fe715ac7473b57`. Release `local-49bd3faf2e63`,
BUILD_ID `NvG_M-0f5VT5zYHKmg3WB`, từ snapshot sạch; docs commit riêng sau code.
Web/API user systemd READY; schema83/0pending không đổi, không restore DB.
Web bổ sung FEATURE_PROJECT_AI=true theo API để mở route AI01; giữ session,
storage/signing và public gate. Edge308598/Windows keeper giữ chạy.

API1272/Web557/Edge5/document1, Python37, Chrome28 theo nhóm cùng build PASS;
lint/typecheck/format/build/artifact/schema đạt. Reviewer read-only correctness/
auth/egress/UX và Ponytail không còn P0/P1/P2 được phát hiện. Runtime reviewer
chỉ ra race/rollback của script Web flag; đã sửa trước thực thi.
Chrome main cùng actor/9Project/300permission/0room, reload/settings200; Windows
localhost/LAN200 đúng release; public HTTPS503 qua LAN resolve/TLS bật. Log follower
độc lập; root local:status/prod:health/artifact PASS. Không kiểm WAN/reboot/logoff.

Store AI còn thiếu đã tạo0600 nhưng chưa có credential; API configLoaded=true,
MISSING_CREDENTIAL/revision=null cả3. Admin test tổng hợp, phân loại lỗi, config/
lease/revoke và capability evidence đã code/test; **chưa có model access/generation
live**. Gemini ảnh/PDF vẫn gated; Mistral/Kira text-only. SYNTHETIC_PUBLIC_APPROVED
không đổi; không duyệt9Project thật. Hai binary thiếu baseline giữ nguyên.
Chỉ commit local; không push/merge/public. Những mục dưới là lịch sử.

## AI đa nhà cung cấp — 2026-10-03 — LOCAL_DEPLOYED / LIVE_BLOCKED

Code/tested `d8ce57d0bb5c1faeabfe7f9f1fab5698af8a732b`, tree
`ccf923f8a10260d6cc6e0f5dc61b2e17e68c2519`; release local `local-b5045512d8b0`,
Web BUILD_ID `k57b305NIZtnpq1v4bAsA`. Web/API cùng snapshot sạch, user systemd
READY; API367712/Web367713; Edge308598 và Windows keeper giữ nguyên.
Schema83/DB/storage/account giữ nguyên; public HTTPS503, không DNS/WAN mới.

Project → Làm việc → Hỏi AI tại localhost3000 có Gemini3.8Flash, MistralMedium3.5,
Kira3.5Pro. Registry/adapter/request pin/policy/usage/native Gemini đã code.
Đổi model giữ conversation/index, không copy bộ nhớ; history/dependency/egress
kiểm lại trước gửi/nhận/mở lịch sử. Secret nhập terminal local ẩn, file0600 ngoài
Git; API systemd đã nhận path thật. User chọn không giới hạn lượt/ngày; vẫn có
concurrency/input/output kỹ thuật và không tự bật billing.

Cả3provider **BLOCKED_BY_CREDENTIALS**, chưa model access/text/RAG live; Gemini
ảnh/PDF có contract/mock/local-parser test nhưng còn tắt. Mistral/Kira text-only;
không OCR/tạo ảnh/video. Pilot synthetic/public-approved, chưa duyệt dữ liệu
nghiệp vụ của9Project; không index/upload/tạo room demo trên main.

Hồi quy: API1246/Edge5/document-service1; Web547 chạy lại sau sửa UI; runtime/secret36;
Chrome production M2/M3 24; lint/typecheck/format/build/artifact/schema PASS.
Chrome main154 với session người dùng tự đăng nhập lại:9Project/300permission/
0room, dropdown disabled đúng thiếu key, settings200 và reload PASS. LAN health200.
Review correctness/security/auth/UX/Ponytail không còn Important/Critical; metadata
model thực thi UNVERIFIED. Chỉ local commits; không push/merge/remote deploy.

[Handoff hiện hành và Figma](milestones/M3/HANDOFF.md), [bằng chứng](milestones/M3/VERIFICATION.md).
Đóng Codex thật/reboot/logoff vẫn deferred. Những mục dưới là lịch sử trước release này.

## Runtime/LAN — 2026-09-30 — INTERNAL_RUNTIME_DEPLOYED

App code/tested `264a19546098d9822f6e9805468c030d0bcb3c2f`, release
`local-f93ef7df2fbc`, Web BUILD_ID `F6amuzt22vwAHV-bQHkvj`.
Web production + API compiled local-main chạy dưới user systemd; Edge cùng
artifact, public giữ đóng theo yêu cầu. Windows localhost/LAN app200; fresh
Chrome cùng actor/9Project/300permissions, entry đến /work.9Project main chưa
có ChatRoom (COUNT READ ONLY0); không tạo/copy phòng test hoặc grant tự động.
API1224, Web543, Edge5, runtime/release25, browser HTTPS3+HTTP1 đạt; lifecycle,
concurrent up, log Ctrl+C, API offline và stop/up đã kiểm thực.
Tooling follow-up: health/status không READY trả lỗi; verifier kiểm artifact
được chọn. CLI8, runtime30 + release3 đạt; hai lệnh chạy thực từ root/canonical
đều đạt, không restart hay rebuild app. Tooling code/tested SHA
`92df5d3b3b1b988da3b57862f3a333d1c2ce63ac`; root adapters `1a59665854c99a1298f47a71c6852917eb2c8e7c`.
Cross-device LAN/login → Làm việc: USER_VERIFIED. Đóng Codex thật: DEFERRED_BY_USER (người dùng sẽ thử sau). Keeper Windows
đã chạy, linger=yes; reboot/logoff NOT_RUN. Provider thật chưa cấu hình, hai
binary thiếu baseline giữ nguyên; không đổi lịch sử M2-A VERIFIED.
[Handoff hiện hành](handoffs/2026-09-30-runtime-repair.md) ghi evidence,
commands, rollback và nền Figma. Các mục dưới là lịch sử theo source/phạm vi.

## Local 2026-09-30 — M2 đã bật, nền M3 đã triển khai

- Runtime chuẩn `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`.
- CODE_SHA=TESTED_SHA `fde08f8f1cf16443049d96a5601609a7cdac8db3`; TESTED_TREE `0209392f76536a609b409e6c3c8457a065be56f2`. Commit sau chỉ cập nhật docs.
- Lệnh chính: `pnpm --dir /home/galaxy_os/.worktrees/m2-a-20260928 local:up`; `local:status`/`local:stop` cùng prefix. Root `pnpm dev` dùng cùng launcher.
- PORT_CONFLICT_RESOLVED / SINGLE_RUNTIME_STARTUP_VERIFIED: hai up đồng thời và root dev trả ALREADY_RUNNING_VERIFIED, giữ PID. Lỗi cũ do khởi động Web lần hai trên cổng3000 đã có đúng runtime.
- Web3000 PID255359, API3001 PID255277, owner `hailq_glx`, đều managed và sourcefde08f8. Web Next16.2.10 dev webpack; API artifact riêng `api-fde08f8`; `galaxy_os/public` tại localhost5432,83migration successful/0pending. M2/M3 bật đồng bộ.
- AUTH_MAIN_VERIFIED: Chrome154 hiện có `/me`/Project/file/download200; không thay phiên/cookie/password. Tài khoản hiện tại SYSTEM100,300permissions và quyền quản lý/INVOKE trên9Project; sharedrole289permissions/5người không đổi.
- M2_A_VERIFIED / DB_M2_READY / M2_ENABLED_AT_3000. Lead-only/lifecycle vẫn deferred theo phạm vi đã chốt.
- M3_IMPLEMENTED: nguồn theo quyền, index tăng dần, lexical retrieval, provider adapter, history/dependency/citation/idempotency/quota/cancel và panel riêng Hỏi AI ở Project → Làm việc. UI main đã thấy chat mới/phạm vi/lịch sử và thông báo chưa cấu hình; không link33003.
- LIVE_PROVIDER NOT_RUN / M3_LIVE_VERIFIED NOT_VERIFIED: chưa cấu hình key/model/allowlist/hạn mức; outbound main tắt. Không gửi dữ liệu main/backup/clone ra provider. Semantic/embeddings và OCR/PDF chưa được triển khai; tổng toàn bộ cần domain report, không giả từ top-k.
- Nghiệm thu source cuối: targeted30, Web529, Chrome24, launcher13, repeat10 nhóm6ca, hai fullAPI1222/1222 liên tiếp đều PASS; các run quan sát CLEAN. Build/rootlint/typecheck/schemaPrisma6.19/format/edge4/Python1 PASS.
- CLOCK_STABLE trong toàn gate cuối. W32Time đã sửa bằng cơ chế OS; probe sudo của người dùng450mẫu/0vượt100ms, timesyncd khôi phục. Tác nhân lệch112ms ở run cũ UNKNOWN; run nhiễu không tính PASS.
- Checksum hai migration lịch sử khớp SQL gốc/ledger; không sửa ledger. Backup/restore/upgrade M2 đã đạt; backup M3 mới226bảng và binary đã restore/đối soát, fresh canonical83 đạt trước khi áp đúng1migrationM3. Giữ mọi hàng/ID/quan hệ/tổng tiền/binary cũ. Hai binary thiếu từ baseline vẫn được ghi nhận, chưa phục hồi.
- Test riêng: API33001/Web33002/TLS33003,DB55435/Redis56382/cookie/storage/browser context riêng. Clone rehearsal55436/56383 riêng; không phải DB người dùng. Nguyên nhân lỗi đăng nhập33003 người dùng báo trước UNKNOWN; auth fixture riêng PASS.
- Review correctness/quyền/race/security và Ponytail đã đạt. Requested Sol medium/high triển khai, Astra high review đã dispatch; actual runtime model UNVERIFIED. Luna không cần thêm task.
- LOCAL_WEB_API_DB_CHANGED YES; REMOTE_DEPLOY/GIT_PUSH_MERGE NOT_PERFORMED. [Checkpoint](milestones/M2/HANDOFF.md) và [bằng chứng](milestones/M2/VERIFICATION.md) là canonical; các mục bên dưới chỉ là lịch sử.

## LOCAL3000 — 2026-09-29 (hiện hành)

- Theo chỉ đạo mới, **Web9235def đã chạy tại http://localhost:3000 từ worktree M2**, API3001/data `galaxy_os` schema69 giữ nguyên; FEATURE_PROJECT_CHAT=false. Phiên Chrome người dùng/me200, danh sách/chi tiết Project200. Không đổi account/password/role hoặc dùng testDB thay dữ liệu cũ. LOCAL_3000_READY: PARTIAL_WEB_AND_EXISTING_AUTH_PROJECT; chưa có chat M2/Hỏi AI tại3000.
- Fix nhỏ: lệnh lắp đặt không gọi delivery-options hoặc mở ghi mới khi M2 tắt. Code/tested SHA `9235deffa07d4fb5d1ec2b253d70bdeede568363`, tree `1f97af9dd2b3e3a46e1b3cd2691af28c299d5efc`; fullWeb527/527, focused7/7, build/rootlint/typecheck/format đạt. Sol medium + Astra high review; actual runtime model metadata UNVERIFIED.
- Clock baseline45s vẫn nhảy183s, chặn hai targeted setup; repeat10/fullAPI2/fullbrowser chưa nghiệm thu. Main thiếu13migration M2, hai checksum applied lịch sử cần đối soát. Không áp migration đang dùng hoặc bỏ guard. Rollback Web cũ đã thực hiện/kiểm thành công trước lần chuyển cuối. MCP wait sau reload có timeout, không gọi full browser PASS.
- **M2_A_STATUS: PARTIAL; M2_OVERALL_STATUS: PARTIAL_LEAD_LIFECYCLE_DEFERRED; M3_ENTRY_GATE: BLOCKED; M3_IMPLEMENTATION_STATUS: NOT_STARTED.** LOCAL_3000_RUNTIME_CHANGED:YES (Web); REMOTE_PRODUCTION_DEPLOYED:NO; GIT_PUSH_MERGE:NOT_PERFORMED. PLAN/VERIFICATION/HANDOFF M2 ghi metadata, recipe và bước tiếp. Các mục dưới là lịch sử, không thay trạng thái này.

## Sau Luna — 2026-09-28 (hiện hành)

- Giữ code Luna và worktree/branch hiện có; START_SHA `c7b74d190aca3340ba85027db523f10a10d656fc`. CODE_SHA/TESTED_SHA (phạm vi checks được ghi, không full nghiệm thu): `a13c2ec151688de2f59c832026a37fb568b6b9e7`; TESTED_TREE `1af600b273518ddb91c15ea324259610123f2f07`. Không có M3 source/UI.
- Đã bổ sung file hợp đồng/phụ lục gửi xem xét hoặc bản lưu theo hồ sơ đã ký, chứng từ khoản thu do nhân viên cung cấp, ghi nhận giao công trường với source/version/binary/customer và hai actor. Sửa source currency/ownership/race, retry UI, timeout runner và quyền route giao/lắp; không tạo ký/đối soát/nghiệm thu giả.
- Chrome Stable154.0.8037.57 Windows headed đã attach đúng tab `http://localhost:3000/projects`. Main vẫn sạch tại7faeb58; `/me`200 đầu lượt,401 ở kiểm cuối, không đổi phiên người dùng. Test mới riêng `https://localhost:33003`, Web build `yx5SwbWAHvHa2vBwgFpx-`, API build727697a. Demo ba loại file mới bằng UI/context riêng; guest nhận đúng88/112/94bytes/checksum. Viewport390×844 là emulation không touch, không thiết bị vật lý.
- Web522/522 và API unit phạm vi86/86 PASS; root lint/typecheck, API/Web build, Prisma validate/82migrations và Python health đạt. Root format cuối PASS; hai lượt fail do JSON evidence chưa format được giữ riêng trong VERIFICATION. Full API2/repeat10/fullbrowser chưa nghiệm thu. Clock cuối600mẫu/~60giây vẫn4jumps ±183giây; patch runner không sửa host.
- Native aliases requested/configured/dispatched: Astra=gpt-6-astra/high, Sol=gpt-6-sol/medium, Luna=gpt-6-luna/medium; task thực đã chạy. Công cụ không trả actual model metadata: VERIFIED_MODEL=UNVERIFIED. Không low, không đổi model ứng dụng.
- **M2_A_STATUS: PARTIAL; M2_OVERALL_STATUS: PARTIAL_LEAD_LIFECYCLE_DEFERRED; M3_ENTRY_GATE: BLOCKED; M3_IMPLEMENTATION_STATUS: NOT_STARTED.** Main runtime/source không đổi lượt này; không push/merge/deploy. Bằng chứng và bước tiếp ở M2 VERIFICATION/HANDOFF; không dùng demo/reviewer thay full gate.

[VERIFICATION](milestones/M2/VERIFICATION.md) · [HANDOFF](milestones/M2/HANDOFF.md). Các mục sau là lịch sử.

## Lượt tiếp tục — 2026-09-28

- M2-A giữ PARTIAL, M3 gate BLOCKED. Thêm publication thông tin khoản thu khách hàng từ `CustomerPayment` thật, liên kết typed/version fingerprint, migraton additive chỉ áp test DB; không phải biên lai hoặc đối soát. Code commit `06712258eb9f8b1f3a3349111634990769cda6cb`.
- Test: integration publication 1/1, Web 508/508, lint/typecheck/format/schema/migration status đạt. Clock baseline contaminated khoảng ±183 giây; full regression/repeat10/browser acceptance chưa đạt. Chrome 154 hiển thị đúng build test ở localhost:33003 nhưng trang đang là login; không dùng fixture hoặc main account.
- Xem [M2 Verification](milestones/M2/VERIFICATION.md) và [Handoff](milestones/M2/HANDOFF.md). M3 chưa code; không push/merge/deploy; main runtime không đổi lượt này.

## Lịch sử — Chrome hiển thị và M2-A, 2026-09-28

- M2_A_STATUS: **PARTIAL**; M2_OVERALL_STATUS: PARTIAL_LEAD_LIFECYCLE_DEFERRED; M3_ENTRY_GATE: BLOCKED; M3 NOT_STARTED.
- Code `338b7b18581387bf2b1d6412c3b921670de70395`; app tested `0a216ebab2109e6c6a2c444071fd4e6a671c22d5` (commit sau chỉ cwd MCP), tree `7f5b3d462b2f3bd031cbcd772b597630e6467185`. Sửa binary đã phát hành bị mutation file thông thường; session fixture riêng khi logout; test navigation theo OWNER_DIRECTION mới. INLINE + một reviewer T3 chỉ đọc, không reviewer giả.
- File unit52PASS, targeted technical1PASS với binary thật, Web508PASS; root lint/typecheck/build/schema/format đạt. Browser targeted cuối3PASS/1FAIL (reconnect setup grant nằm tương lai), CLOCK_CONTAMINATED. FullAPI1/2, repeat10, fullbrowser chưa nghiệm thu; giữ clock blocker OS authentication. B5 actual contract/payment/delivery documents còn A/B/C, không đánh đồng snapshot với chứng cứ ký/thu/giao.
- Chrome Windows154 hiển thị profile Galaxy riêng, MCP1.10.1 nối thực qua Windows stdio/loopback33004; người dùng tự đăng nhập bản3000, /projects và /me200 đã kiểm đọc-only. Native Codex routing T1Luna/low,T2Sol/medium,T3Astra/high cấu hình project cho phiên sau; actual runtime model UNVERIFIED, không AI M3.
- **MAIN_RUNTIME_CHANGED:YES — chỉ khởi động lại bản cũ3000/3001 theo xác nhận mới của chủ dự án. MAIN_SOURCE_CHANGED:NO.** Main Git sạch; test33003 vẫn riêng. Không push/merge/deploy.
- [VERIFICATION](milestones/M2/VERIFICATION.md), [HANDOFF](milestones/M2/HANDOFF.md), [DECISIONS](milestones/M2/DECISIONS.md). Các mục dưới là lịch sử, không thay trạng thái hiện tại.

## Lịch sử — M2-A closeout, 2026-09-28

- **M2_A_STATUS: PARTIAL; M2_OVERALL_STATUS: PARTIAL_LEAD_LIFECYCLE_DEFERRED; M3_ENTRY_GATE: BLOCKED.** Code local `caa6c32c5e21c5a5b0f33ef30eca4309c6bcd749`, tested tree `15f49c27074a1de8ccbd4d9bf75ed861cbde0ac6`. Giữ B1–B5, INLINE và hai reviewer độc lập chỉ đọc.
- Đã thêm publication CONTRACT/phụ lục thông tin, PAYMENT lịch nghĩa vụ, DELIVERY_INSTALL kế hoạch từ domain thật; typed source/snapshot/binary, hai người và revoke/stale/idempotency. Không giả chữ ký/biên lai/thực giao. Sửa scope rỗng, multipart UTF8/BOM, nhãn DRAFT và prepare retry key; không hệ thống thứ hai.
- Native clock chẩn đoán host/WSL nhảy ~182–183giây; chưa biết tác nhân chỉnh. Gate cuối CLOCK_CONTAMINATED_BASELINE,2fullAPI và repeat10NOT_RUN. Targeted105PASS nhưng contaminated; affectedfile49PASS, Web508PASS; browser16:8PASS/3FAIL/5NOT_RUN, corrections2PASS/1FAILBFCache. Không dùng các kết quả này để gọi VERIFIED.
- Root lint/venv riêng, build/typecheck/schema/format PASS; BFCache thực NOT_VERIFIED do no-store/browser policy. Browser từng snapshot mới/race/mobile còn PARTIAL. Bản thử TLS localhost33003, main không đổi.
- [HANDOFF](milestones/M2/HANDOFF.md); [VERIFICATION](milestones/M2/VERIFICATION.md) ghi log, SHA/build, failure và bước tiếp. Lead-only/lifecycle deferred; M3–M7 NOT_STARTED. Không push/merge/deploy. Các mục phía dưới là lịch sử.

## Lịch sử — M2-A continuation, 2026-09-28

- **M2_A_STATUS: PARTIAL; M2_OVERALL_STATUS: PARTIAL.** B1–B5 giữ nguyên; thực thi INLINE, hai reviewer độc lập chỉ đọc, local commit được giao. Không làm lại M0/M1.
- Code `e4b3570e63367a84cef41f1823c9ad1d530ee10d`, tree `c7e416c60dd3559fc7737f0e6e09196621cb89c7` tại worktree `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`. Bổ sung publication QUOTATION/TECHNICAL/SAMPLE/HANDOVER, trusted binary/recipient, source writer race/quota, draft Back/Forward và reconnect; không domain thứ hai.
- Full API1120PASS rồi1117PASS/3FAIL; repeat55PASS/1FAIL dừng lần1; Web507PASS; browser12PASS/1FAIL. Build/typecheck/schema/format PASS. TS lint PASS; Python ruff dùng venv hiện có vì root script thiếu venv tại worktree. Không lấy targeted/review thay full.
- Test isolation đạt; **ENVIRONMENT_CLOCK_UNSTABLE** có probe ngoài Vitest và browser timestamp lùi. Contract/payment/delivery-install source contract còn thiếu; BFCache/một số race/mobile còn thiếu bằng chứng. Chưa đạt ngưỡng nghiệm thu.
- Bản thử loopback33002 đang chạy đúng worktree sau build; PID/identity, cách chạy/dừng, SHA và toàn bộ lỗi cuối trong [HANDOFF](milestones/M2/HANDOFF.md), [VERIFICATION](milestones/M2/VERIFICATION.md). Không copy code về main.
- Lead-only/lifecycle DEFERRED_BY_EXPLICIT_SLICE_SCOPE; M3–M7 NOT_STARTED. MAIN_RUNTIME_CHANGED:NO; PUSH_MERGE_DEPLOY:NOT_PERFORMED. Các phần bên dưới là lịch sử.

## Lịch sử trước continuation — M2-A triển khai một phần, 2026-09-28

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

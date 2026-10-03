# Project status

## AI đa nhà cung cấp — 2026-10-03 — LOCAL_DEPLOYED / LIVE_BLOCKED

Code/tested `f8a51aacc7dd9ca9ad353842ca1f1f20f321d947`, tree
`682ae67171ad42c61a56d716ea14d0632073808b`; release local `local-665429741c6f`,
Web BUILD_ID `WElPBvqSwo1rB4-KZF68S`. Web/API cùng snapshot sạch, user systemd
READY; API361132/Web361133; Edge308598 và Windows keeper giữ nguyên.
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

Fresh checks: fullAPI1246/Web547/Edge5/document-service1; runtime/secret36;
Chrome production M2/M3 24; lint/typecheck/format/build/artifact/schema PASS.
Chrome main154 với session người dùng tự đăng nhập lại:9Project/300permission/
0room, dropdown disabled đúng thiếu key, settings200 và reload PASS. LAN health200.
Review correctness/security/auth/UX/Ponytail không còn Important/Critical; metadata
model thực thi UNVERIFIED. Chỉ local commits; không push/merge/remote deploy.

[Handoff hiện hành và Figma](docs/galaxy-os/milestones/M3/HANDOFF.md), [bằng chứng](docs/galaxy-os/milestones/M3/VERIFICATION.md).
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
[Handoff hiện hành](docs/galaxy-os/handoffs/2026-09-30-runtime-repair.md) ghi evidence,
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
- LOCAL_WEB_API_DB_CHANGED YES; REMOTE_DEPLOY/GIT_PUSH_MERGE NOT_PERFORMED. [Checkpoint](docs/galaxy-os/milestones/M2/HANDOFF.md) và [bằng chứng](docs/galaxy-os/milestones/M2/VERIFICATION.md) là canonical; các mục bên dưới chỉ là lịch sử.

## LOCAL3000 — 2026-09-29 (hiện hành)

- Theo chỉ đạo mới, **Web9235def đã chạy tại http://localhost:3000 từ worktree M2**, API3001/data `galaxy_os` schema69 giữ nguyên; FEATURE_PROJECT_CHAT=false. Phiên Chrome người dùng/me200, danh sách/chi tiết Project200. Không đổi account/password/role hoặc dùng testDB thay dữ liệu cũ. LOCAL_3000_READY: PARTIAL_WEB_AND_EXISTING_AUTH_PROJECT; chưa có chat M2/Hỏi AI tại3000.
- Fix nhỏ: lệnh lắp đặt không gọi delivery-options hoặc mở ghi mới khi M2 tắt. Code/tested SHA `9235deffa07d4fb5d1ec2b253d70bdeede568363`, tree `1f97af9dd2b3e3a46e1b3cd2691af28c299d5efc`; fullWeb527/527, focused7/7, build/rootlint/typecheck/format đạt. Sol medium + Astra high review; actual runtime model metadata UNVERIFIED.
- Clock baseline45s vẫn nhảy183s, chặn hai targeted setup; repeat10/fullAPI2/fullbrowser chưa nghiệm thu. Main thiếu13migration M2, hai checksum applied lịch sử cần đối soát. Không áp migration đang dùng hoặc bỏ guard. Rollback Web cũ đã thực hiện/kiểm thành công trước lần chuyển cuối. MCP wait sau reload có timeout, không gọi full browser PASS.
- **M2_A_STATUS: PARTIAL; M2_OVERALL_STATUS: PARTIAL_LEAD_LIFECYCLE_DEFERRED; M3_ENTRY_GATE: BLOCKED; M3_IMPLEMENTATION_STATUS: NOT_STARTED.** LOCAL_3000_RUNTIME_CHANGED:YES (Web); REMOTE_PRODUCTION_DEPLOYED:NO; GIT_PUSH_MERGE:NOT_PERFORMED. PLAN/VERIFICATION/HANDOFF M2 ghi metadata, recipe và bước tiếp. Các mục dưới là lịch sử, không thay trạng thái này.

## Tiếp tục sau Luna — 2026-09-28 (hiện hành)

- Giữ code Luna và worktree/branch hiện có; START_SHA `c7b74d190aca3340ba85027db523f10a10d656fc`. CODE_SHA/TESTED_SHA (phạm vi checks được ghi, không full nghiệm thu): `a13c2ec151688de2f59c832026a37fb568b6b9e7`; TESTED_TREE `1af600b273518ddb91c15ea324259610123f2f07`. Không có M3 source/UI.
- Đã bổ sung file hợp đồng/phụ lục gửi xem xét hoặc bản lưu theo hồ sơ đã ký, chứng từ khoản thu do nhân viên cung cấp, ghi nhận giao công trường với source/version/binary/customer và hai actor. Sửa source currency/ownership/race, retry UI, timeout runner và quyền route giao/lắp; không tạo ký/đối soát/nghiệm thu giả.
- Chrome Stable154.0.8037.57 Windows headed đã attach đúng tab `http://localhost:3000/projects`. Main vẫn sạch tại7faeb58; `/me`200 đầu lượt,401 ở kiểm cuối, không đổi phiên người dùng. Test mới riêng `https://localhost:33003`, Web build `yx5SwbWAHvHa2vBwgFpx-`, API build727697a. Demo ba loại file mới bằng UI/context riêng; guest nhận đúng88/112/94bytes/checksum. Viewport390×844 là emulation không touch, không thiết bị vật lý.
- Web522/522 và API unit phạm vi86/86 PASS; root lint/typecheck, API/Web build, Prisma validate/82migrations và Python health đạt. Root format cuối PASS; hai lượt fail do JSON evidence chưa format được giữ riêng trong VERIFICATION. Full API2/repeat10/fullbrowser chưa nghiệm thu. Clock cuối600mẫu/~60giây vẫn4jumps ±183giây; patch runner không sửa host.
- Native aliases requested/configured/dispatched: Astra=gpt-6-astra/high, Sol=gpt-6-sol/medium, Luna=gpt-6-luna/medium; task thực đã chạy. Công cụ không trả actual model metadata: VERIFIED_MODEL=UNVERIFIED. Không low, không đổi model ứng dụng.
- **M2_A_STATUS: PARTIAL; M2_OVERALL_STATUS: PARTIAL_LEAD_LIFECYCLE_DEFERRED; M3_ENTRY_GATE: BLOCKED; M3_IMPLEMENTATION_STATUS: NOT_STARTED.** Main runtime/source không đổi lượt này; không push/merge/deploy. Bằng chứng và bước tiếp ở M2 VERIFICATION/HANDOFF; không dùng demo/reviewer thay full gate.

[VERIFICATION](docs/galaxy-os/milestones/M2/VERIFICATION.md) · [HANDOFF](docs/galaxy-os/milestones/M2/HANDOFF.md). Các mục sau là lịch sử.

## Lượt kiểm tra Chrome và tiếp tục M2-A — 2026-09-28

- Hiện trạng Git tại đầu lượt: worktree `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`, HEAD `945d1caaf972881b298c10141a0d2eef64783496`; code mới commit `06712258eb9f8b1f3a3349111634990769cda6cb`, tree `bddaa700e51c157fb1d70bdfb446f59066b4f05d`. Docs còn được cập nhật riêng.
- Thêm typed publication `CUSTOMER_PAYMENT_RECORD` từ `CustomerPayment` hiện hữu. Chỉ xuất ngày/số tiền/tiền tệ/phương thức/phân bổ; loại trừ bank reference/receipt/internal notes và ghi rõ đây không phải biên lai/đối soát. Không tạo giao dịch hoặc side effect. Integration test qua domain writer thật và tải đúng binary: 1 PASS; Web 508/508; lint, typecheck, format, Prisma validate và 81 migrations trên DB test riêng PASS. Build API/Web thành công.
- Chrome Stable 154.0.8037.57, profile Galaxy Dev riêng, MCP chính thức 1.10.1. Tab hiện ở `https://localhost:33003/login?returnTo=%2Fwork`, đúng test build mới (Next BUILD_ID `hjuXlNAZezryAP37nkERM`; API health 200). `/work` redirect login; không dùng phiên người dùng làm fixture. 33003 chưa có phiên đăng nhập M2 test, nên chưa demo chat/UI authenticated.
- Clock run `a9d9a9cd-6d01-4b14-bd27-e93af8c6804d` bị `CLOCK_CONTAMINATED_BASELINE`: wall clock lùi/tăng khoảng 182.7–183.5s so với monotonic delta ~100ms. Full API/repeat10/browser nghiệm thu chưa chạy sạch. Một lệnh nhắm test truyền sai làm Vitest chạy suite rộng khi thiếu env và bị EPERM bind; không tính là regression ứng dụng.
- **M2_A_STATUS: PARTIAL; M2_OVERALL_STATUS: PARTIAL_LEAD_LIFECYCLE_DEFERRED; M3_ENTRY_GATE: BLOCKED; M3: NOT_STARTED.** CONTRACT vẫn chỉ snapshot thông tin; PAYMENT lịch nghĩa vụ và khoản thu ghi nhận, không phải receipt/đối soát; DELIVERY_INSTALL kế hoạch, không phải bằng chứng giao/lắp. Chưa đủ ngữ nghĩa/B5 và regression để mở M3.
- Bản thử riêng: `https://localhost:33003/work`; main source/runtime không thay đổi trong lượt này. Không push/merge/deploy. Chi tiết ở [VERIFICATION](docs/galaxy-os/milestones/M2/VERIFICATION.md) và [HANDOFF](docs/galaxy-os/milestones/M2/HANDOFF.md).

## Lịch sử — Chrome hiển thị và M2-A, 2026-09-28

- M2_A_STATUS: **PARTIAL**; M2_OVERALL_STATUS: PARTIAL_LEAD_LIFECYCLE_DEFERRED; M3_ENTRY_GATE: BLOCKED; M3 NOT_STARTED.
- Code `338b7b18581387bf2b1d6412c3b921670de70395`; app tested `0a216ebab2109e6c6a2c444071fd4e6a671c22d5` (commit sau chỉ cwd MCP), tree `7f5b3d462b2f3bd031cbcd772b597630e6467185`. Sửa binary đã phát hành bị mutation file thông thường; session fixture riêng khi logout; test navigation theo OWNER_DIRECTION mới. INLINE + một reviewer T3 chỉ đọc, không reviewer giả.
- File unit52PASS, targeted technical1PASS với binary thật, Web508PASS; root lint/typecheck/build/schema/format đạt. Browser targeted cuối3PASS/1FAIL (reconnect setup grant nằm tương lai), CLOCK_CONTAMINATED. FullAPI1/2, repeat10, fullbrowser chưa nghiệm thu; giữ clock blocker OS authentication. B5 actual contract/payment/delivery documents còn A/B/C, không đánh đồng snapshot với chứng cứ ký/thu/giao.
- Chrome Windows154 hiển thị profile Galaxy riêng, MCP1.10.1 nối thực qua Windows stdio/loopback33004; người dùng tự đăng nhập bản3000, /projects và /me200 đã kiểm đọc-only. Native Codex routing T1Luna/low,T2Sol/medium,T3Astra/high cấu hình project cho phiên sau; actual runtime model UNVERIFIED, không AI M3.
- **MAIN_RUNTIME_CHANGED:YES — chỉ khởi động lại bản cũ3000/3001 theo xác nhận mới của chủ dự án. MAIN_SOURCE_CHANGED:NO.** Main Git sạch; test33003 vẫn riêng. Không push/merge/deploy.
- [VERIFICATION](docs/galaxy-os/milestones/M2/VERIFICATION.md), [HANDOFF](docs/galaxy-os/milestones/M2/HANDOFF.md), [DECISIONS](docs/galaxy-os/milestones/M2/DECISIONS.md). Các mục dưới là lịch sử, không thay trạng thái hiện tại.

## Lịch sử — M2-A closeout, 2026-09-28

- **M2_A_STATUS: PARTIAL; M2_OVERALL_STATUS: PARTIAL_LEAD_LIFECYCLE_DEFERRED; M3_ENTRY_GATE: BLOCKED.** Code local `caa6c32c5e21c5a5b0f33ef30eca4309c6bcd749`, tested tree `15f49c27074a1de8ccbd4d9bf75ed861cbde0ac6`. Giữ B1–B5, INLINE và hai reviewer độc lập chỉ đọc.
- Đã thêm publication CONTRACT/phụ lục thông tin, PAYMENT lịch nghĩa vụ, DELIVERY_INSTALL kế hoạch từ domain thật; typed source/snapshot/binary, hai người và revoke/stale/idempotency. Không giả chữ ký/biên lai/thực giao. Sửa scope rỗng, multipart UTF8/BOM, nhãn DRAFT và prepare retry key; không hệ thống thứ hai.
- Native clock chẩn đoán host/WSL nhảy ~182–183giây; chưa biết tác nhân chỉnh. Gate cuối CLOCK_CONTAMINATED_BASELINE,2fullAPI và repeat10NOT_RUN. Targeted105PASS nhưng contaminated; affectedfile49PASS, Web508PASS; browser16:8PASS/3FAIL/5NOT_RUN, corrections2PASS/1FAILBFCache. Không dùng các kết quả này để gọi VERIFIED.
- Root lint/venv riêng, build/typecheck/schema/format PASS; BFCache thực NOT_VERIFIED do no-store/browser policy. Browser từng snapshot mới/race/mobile còn PARTIAL. Bản thử TLS localhost33003, main không đổi.
- [HANDOFF](docs/galaxy-os/milestones/M2/HANDOFF.md); [VERIFICATION](docs/galaxy-os/milestones/M2/VERIFICATION.md) ghi log, SHA/build, failure và bước tiếp. Lead-only/lifecycle deferred; M3–M7 NOT_STARTED. Không push/merge/deploy. Các mục phía dưới là lịch sử.

## Lịch sử — Continuation code và nghiệm thu — 2026-09-28

- **M2_A_STATUS: PARTIAL; M2_OVERALL_STATUS: PARTIAL.** B1–B5 giữ nguyên; thực thi INLINE, hai reviewer độc lập chỉ đọc, local commit được giao. Không làm lại M0/M1.
- Code `e4b3570e63367a84cef41f1823c9ad1d530ee10d`, tree `c7e416c60dd3559fc7737f0e6e09196621cb89c7` tại worktree `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`. Bổ sung publication QUOTATION/TECHNICAL/SAMPLE/HANDOVER, trusted binary/recipient, source writer race/quota, draft Back/Forward và reconnect; không domain thứ hai.
- Full API1120PASS rồi1117PASS/3FAIL; repeat55PASS/1FAIL dừng lần1; Web507PASS; browser12PASS/1FAIL. Build/typecheck/schema/format PASS. TS lint PASS; Python ruff dùng venv hiện có vì root script thiếu venv tại worktree. Không lấy targeted/review thay full.
- Test isolation đạt; **ENVIRONMENT_CLOCK_UNSTABLE** có probe ngoài Vitest và browser timestamp lùi. Contract/payment/delivery-install source contract còn thiếu; BFCache/một số race/mobile còn thiếu bằng chứng. Chưa đạt ngưỡng nghiệm thu.
- Bản thử loopback33002 đang chạy đúng worktree sau build; PID/identity, cách chạy/dừng, SHA và toàn bộ lỗi cuối trong [HANDOFF](docs/galaxy-os/milestones/M2/HANDOFF.md), [VERIFICATION](docs/galaxy-os/milestones/M2/VERIFICATION.md). Không copy code về main.
- Lead-only/lifecycle DEFERRED_BY_EXPLICIT_SLICE_SCOPE; M3–M7 NOT_STARTED. MAIN_RUNTIME_CHANGED:NO; PUSH_MERGE_DEPLOY:NOT_PERFORMED. Các phần bên dưới là lịch sử.

## M2-A — Code thử nghiệm trên worktree riêng — 2026-09-28

- B1–B5 đã được chủ dự án chốt; thực thi INLINE theo ủy quyền lập/review kỹ thuật PLAN, không claim owner đã đọc PLAN.
- M2_ENTRY_GATE: READY (stack riêng smoke thật). M2_A_STATUS: **PARTIAL**, M2_OVERALL_STATUS: **PARTIAL**. Có chat nội bộ/khách, file/history/expiry/quyền, UI và publication PROPOSAL; chưa đủ các nguồn B5 hoặc mọi ca kiểm chứng.
- Worktree `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`; SHA/tree và test cuối ở [HANDOFF](docs/galaxy-os/milestones/M2/HANDOFF.md), [VERIFICATION](docs/galaxy-os/milestones/M2/VERIFICATION.md).
- G00 namespace riêng, API33001/Web33002 loopback, DB/storage/tài khoản giả; không ghi main DB, không API AI/email/payment thật. Bwrap chưa cài nhưng executor/DB/browser hoạt động qua quyền hợp lệ.
- Full regression còn lỗi dù targeted pass; không tuyên bố VERIFIED. Lead-only/lifecycle DEFERRED_BY_EXPLICIT_SLICE_SCOPE; M3–M7 chưa làm. MAIN_RUNTIME_CHANGED:NO; không merge/cherry-pick/push/deploy.
- Tiếp tục đúng worktree; không chạy lại M0/M1. Các mục dưới là lịch sử trước chỉ đạo M2-A.

## M2 — Điều kiện vào và quyết định thiết kế — 2026-09-28

- M2_STATUS: AWAITING_OWNER_DECISIONS; IMPLEMENTATION_GATE: BLOCKED_APPROVAL.
  Không diễn giải “tiếp tục M2” thành duyệt toàn bộ B1–B5.
- [Đối chiếu B1–B5](docs/galaxy-os/milestones/M2/DECISIONS.md) giữ nguyên văn M1;
  [thiết kế cập nhật](docs/galaxy-os/milestones/M2/DESIGN.md) chưa duyệt, PLAN chưa lập.
- Chỉ đạo mới không cho merge/cherry-pick; đề nghị prerequisite tối thiểu có review
  thay cho hợp nhất G02 vào main. B2–B5 vẫn còn lựa chọn lịch sử/phạm vi/khách/phát hành.
- HEAD đầu lượt `0fea6cc53db41c6520fda942c3bf412c35ab3dbb`, workspace sạch;
  source giữ nguyên M1. Test stack/worktree code chưa tạo trước gate, 24 ca M2 NOT_RUN.
- Chỉ docs cập nhật; không app/main-runtime/DB/AI thật, không push/merge/deploy.
  [Handoff hiện tại](docs/galaxy-os/milestones/M2/HANDOFF.md).

## M1 — Khảo sát nền và thiết kế M2 — 2026-09-28

- M1_AUDIT_STATUS: COMPLETE (khảo sát), M2_DESIGN_STATUS: NEEDS_DECISION,
  IMPLEMENTATION_READINESS: BLOCKED; chưa được phép code M2.
- Baseline `g00/build-test-isolation-20260914` tại `0cbf986300fafe687b3c83c328adf14eff6eb66b`;
  G01/G02 chưa tích hợp; G02 đã chứa G01. Đề nghị tích hợp có kiểm chứng khi được giao riêng.
- [Bản đồ tái sử dụng](docs/galaxy-os/milestones/M1/02-REUSE-MAP.md) và
  [thiết kế M2 để duyệt](docs/galaxy-os/milestones/M1/04-M2-DESIGN-DRAFT.md)
  giữ Project/IAM/FileAsset/Task/domain hiện hữu, thêm room/message/quyền phòng.
- 65 test chọn lọc mới PASS, không full regression/E2E; `/me` và upload timeout lịch sử chưa đóng.
  Web/API NOT_RUNNING_OBSERVED; Edge có chạy nhưng RUNTIME_VERSION_UNVERIFIED.
  Stack DB/Redis chung không dùng cho test; bwrap vẫn thiếu, không cài/lặp sudo.
- Chỉ docs thay đổi. [STATUS](docs/galaxy-os/05-IMPLEMENTATION-STATUS.md),
  [handoff M1](docs/galaxy-os/handoffs/2026-09-28-043124-M1.md) dẫn lệnh/bằng chứng/bước tiếp.
  Không merge, push, deploy hoặc sửa ứng dụng; giữ các báo cáo lịch sử bên dưới.

## M0 — Cốt lõi và điểm tiếp tục — 2026-09-28

- Phạm vi: tài liệu phát triển Galaxy OS, không thay đổi ứng dụng hoặc xây bộ nhớ
  vận hành khách hàng. Điểm đọc canonical: [READ-FIRST](docs/galaxy-os/00-READ-FIRST.md).
- Trạng thái/bằng chứng và handoff mới nhất:
  [STATUS M0](docs/galaxy-os/05-IMPLEMENTATION-STATUS.md).
- Lượt tiếp tục xác nhận M0 đã commit tại `e8b3144` và kiểm lại đạt;
  [handoff môi trường](docs/galaxy-os/handoffs/2026-09-28-040655-M0-RESUME.md)
  ghi executor hoạt động, cài bubblewrap còn cần xác thực sudo của hệ điều hành.
- Baseline trước M0: `g00/build-test-isolation-20260914`,
  `73fe7e8f6c3e3c7b20257857a48f1f173f186144`; G01/G02 có báo cáo trên nhánh riêng,
  chưa nằm trong baseline này. Runtime hiện nay chưa xác minh.
- M1–M7 là kế hoạch, không được thực hiện trong M0. Bước đề nghị: M1 có scope
  được giao; không tự merge/sửa ứng dụng. Giữ nguyên các báo cáo lịch sử bên dưới.

## G00 build/typecheck and isolated verification foundation — 2026-09-14

- Implementation is `IMPLEMENTED`; verification remains `PARTIAL` because the
  full API run passed 1,085/1,086 tests but one `/me` test timed out. The exact
  Sprint 1 suite passed 18/18 when rerun alone; no timeout was loosened.
- Clean frozen install plus Prisma generate now passes root typecheck and build
  after adding exact dev type dependency `@types/multer@2.2.0`. Root format
  passes in a detached clean worktree; the six audit-listed files were the only
  files formatted.
- The fail-closed G00 harness uses local Docker, loopback-only PostgreSQL/Redis,
  tmpfs data, synthetic tenants/Projects and real Nest auth/guards with Prisma.
  Smoke passes 3/3 for allowed SELF scope, denied same-tenant/other-tenant scope,
  and financial field visibility. The harness reapplies 69 existing migrations,
  seeds only the test DB, and removes its exact project/root afterward.
- `G01_MINIMUM_ENV=READY`, but SEC-01, SEC-02 and FIN-01 remain G01 findings and
  were not fixed. Browser/worker/export E2E remain unverified.
- Local code commit: `a20332227da47f162ab65684ead973460f9fc647`;
  `PUSH_STATUS=PUSH_BLOCKED`. Detailed evidence:
  `docs/project-system/G00_BUILD_AND_ISOLATED_TEST_HANDOFF_2026-09-14.md`.

## Project Dashboard, shared workspace, context separation, and Upload P0 — 2026-08-24

- Overall status is **PARTIAL**, not COMPLETE. The production implementation and
  fresh unit/static checks are green, but this restricted runner cannot bind a
  loopback/LAN socket or reach PostgreSQL, so the required real localhost/LAN
  upload, database migration, Playwright, production Web build, and final visual
  recapture are not claimed.
- Git safety: work continued on `feature/project-business-operations` in the
  existing dirty worktree. No reset, restore, commit, tag, push, PR, database
  reset, schema drop, applied-migration rewrite, FileAsset/history deletion, or
  unrelated repository format pass was performed.
- Upload root cause: Nest exposes `POST /api/v1/uploads/initiate`, while the
  Next same-origin catch-all did not admit the `uploads` root and buffered
  request bodies. The proxy now explicitly admits live Project-domain roots,
  forwards the request stream with method/cookie/CSRF/range headers intact, and
  keeps browser URLs relative to `/api/v1/...`. Proxy regressions pass **40/40**.
- The existing UploadSession/FileAsset flow now implements automatic resumable
  Phase A and explicit idempotent `NỘP HỒ SƠ` Phase B. CurrentActor remains the
  security principal; the submitting officer is validated metadata. Terminal
  unsubmitted assets are tombstoned only after Project→UploadSession→FileAsset
  locking and full business-reference checks; final bytes are removed only
  after that decision. Failed cleanup remains charged, cleanup batches back off
  without starvation, retained soft-deleted files remain in byte quota, and all
  retained UploadSession/FileAsset rows remain in metadata quota. Focused
  upload/quota verification passes **150 tests with 1 socket-only test skipped**.
- Stage 1 Matrix and five-Step Workflow are sibling contexts over the same
  FileAsset truth. Matrix queries/linkage use `STAGE_MATRIX_DOCUMENT`; Workflow
  queries/linkage use `STAGE_WORKFLOW_STEP_DOCUMENT`. The new additive migration
  `20260824010000_repair_stage_one_document_contexts` repairs exact legacy
  Matrix classification without losing a normalized-name collision and inserts
  each missing neutral Workflow default without deleting history.
- `/projects` is the real permission-filtered Project Dashboard, Project detail
  compatibility enters Stage 1, and one shared stage header/switcher/selector is
  used by GĐ1–GĐ5. Stage 2–5 remain directly reachable and use connected Galaxy
  domains. Stage 4 production reads are Project-filtered, raw status codes are
  localized, and the legacy raw-ID create form is hidden in Project context and
  permission-gated globally.
- Fresh verification after the final review fixes: Web **28 files, 485/485**;
  API `src` unit **45 files, 937 passed / 3 socket-boundary skipped**; exact
  requested compatibility/production command **2 files, 31/31**; upload/quota
  **150 passed / 1 skipped**. Root lint and typecheck pass; API and Edge builds
  pass; Prisma format/validate and `git diff --check` pass.
- The unfiltered API run reports **43 files passed / 11 failed; 939 tests passed
  / 4 failed / 75 skipped**: all failed
  suites require unavailable PostgreSQL and all four failed tests require a
  prohibited local socket. Repository-wide `format:check` remains red on
  exactly **58** preserved `.superpowers` snapshots/older plan documents; every
  source/test/doc file changed for this handoff passes scoped Prettier.
- Environment blockers: Prisma migrate deploy and status both return `P1001` for
  `localhost:5432`; Playwright stops before test discovery because its fixture
  cannot bind `127.0.0.1:3101` (`EPERM`); Next production build reaches
  Turbopack and fails when its CSS worker tries to bind a port (`EPERM`). Thus
  localhost/LAN browser flow, migration deploy/status, screenshot acceptance,
  and production Web build remain **NOT VERIFIED** on this runner.
- Reference evidence remains ignored and credential-free. The current
  `project-workspace` inventory contains five PNG states and one PDF proof; it
  is insufficient for the full requested fresh 17-state/multi-viewport visual
  acceptance.
- Independent correctness/security/authorization/upload/performance/UX review
  found proxy-root omissions, an expiry cleanup gap, retained-byte/metadata
  quota undercounting, collision-prone Matrix repair, and unscoped Production
  creation. Each finding received a focused RED regression and the smallest
  production fix; final re-review found **0 Critical and 0 Important** remaining
  and the Ponytail verdict found no release-blocking complexity.
- Exact next task: on a host that permits local sockets and can reach the
  configured PostgreSQL instance, run `prisma migrate deploy`, validate/status,
  then the Project Playwright localhost and `192.168.1.80` flows, Web production
  build, and all requested responsive screenshots. Do not claim COMPLETE until
  those checks are green.

## Optional documents and Stage 2 Task 9 acceptance — 2026-08-14

- The approved optional-document/Stage 2 slice is implemented in the shared
  dirty worktree and remains unstaged. No commit, tag, push, PR, reset, seed,
  drop, truncate, dependency addition, applied-migration rewrite, or
  non-fixture business-data mutation was performed.
- Fixture-backed Playwright Flows A–I cover the Stage 1 five-row matrix,
  zero-file completion, matrix and selected-Step multi-file uploads, partial
  failure/retry without duplication, independently open Stage 2–5 routes, the
  Stage 2 baseline/template/XLSX preview-confirm import, Stage 2 optional
  documents, and non-member route/file/template/import denial. The definitive
  full configured run passed **20/20 in 2.1 minutes**.
- Visual evidence contains all 15 approved states at 1536×864 plus responsive
  Stage 1 captures at 1440×900, 1280×800, and 390×844. All **18/18** images
  were opened at original detail. No image has page-level overflow, clipped
  primary controls, duplicate upload surfaces, missing-document gates,
  inherited-data warnings, or a loading-only forbidden state. Independent
  review did find an arbitrary shared Department label in state 10; its source
  is fixed but that image is superseded pending the blocked recapture. State 12
  intentionally records the Stage 2 pre-submit upload queue; the seven-column
  actual-file list is separately asserted after reload.
- Production now owns the exact idempotent Stage 2 four-definition initializer;
  retry never duplicates and renamed/hidden/custom state is never reseeded.
  Stage 1 and Stage 2 document definitions, upload targets, completion, route
  access, and server rules remain optional. Stage 3–5 were not expanded beyond
  removing inherited/gating behavior.
- The final independent correctness/security/authorization/UX/Ponytail review
  found **0 Critical and 2 Important** gaps. Both received focused regressions
  and the smallest code/spec fix: the browser fixtures now create and safely
  clean exact Customer, Department, and manager-role rows instead of borrowing
  unordered shared data; and Flow G now contains real click/reload assertions
  for all `?step=1..3` routes. Fixture safety moved from **2 failed / 4 passed**
  to **6/6 passed**. The Stage 2 UI regression moved from **2 failed / 23
  passed** to **25/25 passed** after replacing incomplete ARIA tab roles with
  ordinary links/`aria-current` and separating document-name/order metadata.
  The newly added browser assertions were discovered as four tests but remain
  unexecuted because of the approval blocker below.
- Fresh serialized repository evidence from this acceptance turn is API
  **48 files, 685/685**, Web **25 files, 343/343**, and Edge **4/4**. Root lint,
  API/Web/Edge typechecks, API/Web/Edge production builds, Prisma format and
  validate, and `git diff --check` pass. The final Web build generated
  **77/77** pages. Prisma status reports **55 migrations found** and the local
  PostgreSQL schema up to date.
- Repository-wide `pnpm format:check` remains red on exactly **50** preserved
  historical plan/snapshot files; all current Task 9 files pass the scoped
  Prettier check. Those evidence files were not rewritten. The inactive
  document-service historical test hang remains outside this slice.
- One post-review focused browser rerun/recapture is blocked before process
  creation: this agent and root each made two attempts, and every automatic
  local-socket permission review timed out. This is not recorded as a product
  test result; the new Step 2/3 assertions and affected states 9–12 are
  explicitly unverified after the final review fixes.
- Final strict handoff audit also leaves two interaction details PARTIAL: the
  selected-Step upload card still uses shortened heading/field copy, and the
  Stage 2 actual-file menu implements download/new-version but not yet
  history, rename, or retire commands. These are not completion gates and are
  not represented as working actions.

## Project Phase 0 localization and Step 1 completion checkpoint — 2026-08-10

- Branch/Git: `feature/project-business-operations`; the pre-existing dirty
  worktree and all user changes were preserved. No commit, tag, push, PR,
  staging, reset, applied-migration rewrite, dependency addition, business
  record deletion, or obsolete-UI deletion was performed.
- Superpowers/Ponytail: invoked using-superpowers, systematic debugging,
  brainstorming against the user-approved design, writing-plans, TDD,
  subagent-driven development, requesting-code-review, receiving-code-review,
  verification-before-completion, and Ponytail full/diff review. The approved
  design and implementation plan now contain Phase 0 Tasks 4F and 4G. Task 4F
  completed one independent review/fix/re-review cycle; the final review found
  no Critical or Important issue and the Ponytail verdict was `Lean already`.
- Git/database/runtime: PostgreSQL, Redis, and Mailpit were healthy. Prisma
  format check, validate, and migrate status passed with all 49 migrations
  current. Task 4F made no schema or migration change. API, Web, Document
  Service, and workers were not left running after verification.
- Reference audit: the existing authenticated read-only audit and ignored
  captures remain the authoritative detailed record in
  `docs/project-system/PMS_LIVE_REFERENCE_AUDIT.md`. A fresh read-only reachability
  check returned HTTP 200. This session had no reference browser connector, so
  it did not repeat the authenticated live navigation. No reference credential
  was stored, printed, or added to the repository.
- Raw-code localization: added the single typed Project presentation dictionary
  `apps/web/features/projects/project-domain-labels.ts`. It contains the exact
  approved Vietnamese Project type, workstream, Stage 1 step, Required Document,
  workflow status, readiness, risk, role, stage, and context-aware boolean
  labels. Unknown snake-case values are humanized without exposing the raw code
  and warn only in development. Visible Project shell and Stage 1 values use the
  dictionary; canonical enum values remain only in non-visible `data-*`
  attributes for stable browser contracts.
- Step-completion repair: the Assignment command returns one structured full
  checklist derived from its authoritative completion predicates. The
  `RESPONSIBILITY_NOTES_MISSING` condition now returns the approved Vietnamese
  title/remediation plus field, section, route, and action metadata. Stage 1
  displays the checklist and missing count, suppresses the raw/generic server
  error, scrolls/focuses `responsibilityNotes`, preserves form state, disables
  duplicate submission, refreshes after save, and hides the completion action
  before initialization and after `DONE`.
- Stage navigation/entry/finance/upload: the previously verified always-open
  Stage 1–5 routes, explained entry stage, finance normalization, command-key
  semantics, resumable FileAsset upload, authorization, version preservation,
  and Required Document readiness refresh remain intact. Task 4F did not alter
  their persistence or authorization paths.
- Stage-status semantics and cross-stage links: **PARTIAL**. The localized shell
  no longer shows known raw statuses, but Task 4G has not yet replaced blanket
  upstream inheritance with record-level related-data warnings or completed the
  ordinary-incompleteness versus hard-blocker semantics. Phase 0 is therefore
  not complete.
- Required Documents: the real resumable upload/version/review slice remains
  operational, but the matrix and detail routes still contain raw-code display
  paths and the 1440-wide matrix still needs horizontal scrolling. This is
  **PARTIAL**, not a localized Phase 0 completion claim.
- Stage 1 UX: Task 4F makes Assignment completion understandable and actionable
  in Vietnamese. The broader Stage 1 contract remains **PARTIAL**: Project
  Director/contact/milestone data, proposal detail, full matrix localization,
  and the English `Sales owner` label visible in the captured header remain.
- PMS shell: **PARTIAL**. The connected header, five open routes, compact stage
  switcher, localized routing panel, readiness, red flags, and Stage 1 workspace
  exist; semantic status/related-data work, Project Context Bar/work package,
  and final cutover remain unfinished.
- Stage 2–5: route shells/reusable domain foundations exist. Operational Stage 2
  planning/Product/BOQ/review, Stage 3 commercial/supplier/PO/PI, Stage 4
  production/logistics/inventory/installation/payment/log, and Stage 5
  acceptance/handover/settlement/archive/warranty are **NOT_STARTED** under the
  approved completion definition. Broad downstream work was correctly not
  started before Phase 0 verification.
- Routes/deletion: Stage 1–5 route compatibility remains available. No file was
  deleted in Task 4F; obsolete Project UI cleanup remains **NOT_STARTED** until
  verified cutover.
- Fresh focused verification: Web Project localization/shell/Stage 1 **134/134**;
  API Stage 1 **164/164**; Web and API TypeScript checks pass; Web/API lint pass
  with 0 errors and two unrelated pre-existing Web warnings; all Task 4F files
  pass Prettier; `git diff --check` passes. The isolated Stage 1 Playwright Flow
  A passed **2/2** in 1.8 minutes without reset, migration, or shared-record
  deletion. Repository-wide `format:check` remains known red on pre-existing
  files outside this atomic slice.
- Visual acceptance: fresh 1536x864 and 1440x900 captures were opened. The five
  step cards and navy routing panel have no horizontal overflow and remain
  readable at both widths. The captures also prove why Phase 0 remains partial:
  `Sales owner` is still visible in English, the checklist pre-correction state
  was not captured, and the matrix localization/layout gaps remain.
- Atomic Task 4F files:
  `apps/web/features/projects/project-domain-labels.ts`,
  `apps/web/features/projects/project-domain-labels.test.ts`,
  `apps/web/app/project-pms.tsx`, `apps/web/app/project-pms.test.tsx`,
  `apps/web/app/projects/[projectId]/project-stage-one.tsx`,
  `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`,
  `apps/web/tests/browser/project-stage-one.spec.ts`,
  `apps/api/src/projects/project-stage-one.service.ts`, and
  `apps/api/src/projects/project-stage-one.test.ts`. Deleted files: none.
- COMPLETE: Task 4F centralized Project presentation and actionable Assignment
  checklist slice; earlier verified always-open routes, entry-stage behavior,
  finance command semantics, and resumable Required Document upload slice.
- REUSABLE_FOUNDATION: deterministic stage applicability, Project/IAM policy,
  Required Document/Approval/Activity/Notification adapters, canonical FileAsset
  upload/versioning, Project shell, stage routes, and existing authoritative
  downstream domains.
- PARTIAL: Phase 0 overall; Stage 1; PMS shell; Required Document localization;
  stage-status semantics; related-data/cross-stage links; complete route cutover;
  whole-module authorization and visual acceptance.
- NOT_STARTED: Task 4G semantic stage access/record-level related data;
  operational Stages 2–5; verified obsolete Project UI deletion/final cutover.
- Blockers: no blocker for Task 4F. Phase 0 completion is blocked by the known
  Task 4G and Required Document presentation gaps above, plus the missing
  checklist screenshot. Full repository format remains red on preserved files.
- Exact next task: write RED Web/API tests that localize the Required Document
  matrix/detail with the existing dictionary, then implement Task 4G's semantic
  stage readiness and replace whole-stage inheritance with compact record-level
  `DỮ LIỆU LIÊN QUAN` warnings, especially for Stage 4. Re-run open-stage Flow C
  and capture the missing checklist and Stage 4 related-data screenshots before
  claiming Phase 0 complete.

## Project Required Document resumable-upload checkpoint — 2026-08-08

- Branch/Git: `feature/project-business-operations`; the existing dirty Project
  worktree was preserved. No commit, tag, push, PR, database reset, applied
  migration rewrite, dependency addition, business-record deletion, or
  obsolete-UI deletion was performed.
- Superpowers/Ponytail: reused the approved PMS design and atomic execution
  plan; implemented with RED/GREEN tests and five review/fix rounds. Final
  independent correctness, security, authorization, UX, and Ponytail review
  found no Critical or Important issue; the solution reuses `UploadSession`,
  `FileStorage`, `FileAsset`, `EntityAttachment`, the canonical Required
  Document version command, and existing Project/IAM policy.
- Reference: the read-only live PMS audit remains complete in
  `docs/project-system/PMS_LIVE_REFERENCE_AUDIT.md`; ignored captures remain in
  `.artifacts/pms-reference/`. The temporary reference session was logged out
  and no credential was stored or reported.
- Database: additive migration
  `20260808120000_project_document_resumable_upload` deployed through
  `prisma migrate deploy`. It adds only nullable Project, Required Document,
  and finalized FileAsset links to `UploadSession`, with foreign keys/indexes.
  Prisma format/validate pass and migrate status reports all **49 migrations**
  current. No schema reset, `migrate dev`, `db push`, or record loss occurred.
- Required Documents/file upload: the Project Required Document detail route
  now uses the existing resumable lifecycle instead of the legacy 10 MB
  multipart path. It exposes the real permission-gated server size/extension
  contract, sequential checksummed parts, reload resume, retry, abort, progress,
  durable canonical storage, current-file replacement, preserved prior
  versions, and submit-review continuity. A same-origin `/uploads` proxy route
  is enabled; storage keys, provider identifiers, part paths, and physical
  paths remain absent from responses.
- Correctness/data loss: part retries use immutable pending paths and a locked
  metadata winner; completion and abort claims are concurrency safe;
  finalization is idempotent; lost commit acknowledgement preserves a published
  winner; cleanup cannot mask durable success. Full-file UTF-8 CSV validation
  and bounded DOCX/XLSX container validation were added using Node primitives.
- Authorization: every session command rechecks actor ownership, organization,
  active Project access, Required Document target binding, `file.upload`,
  `project.document.manage`, and the existing independent Stage 1 financial
  permission. Real PostgreSQL tests cover another actor, cross-Project targets,
  access revoked before get/part/complete/abort/refresh, and deterministic
  complete/abort races.
- Fresh verification: focused API **73/73**, focused Web **19/19**, real upload
  PostgreSQL integration **4/4**, full API **512/512**, full Web **158/158**,
  Edge **4/4**, and Document Service **1/1** pass. Repository lint, repository
  TypeScript checks, API/Edge/Web production builds, Prisma format/validate/
  status, targeted formatting, and `git diff --check` pass. Initial API/Edge/
  Web-build/Document attempts were restricted by sandbox socket/process access;
  the identical commands passed with local access. Repository-wide
  `pnpm format:check` remains red on **27 pre-existing snapshot/Stage 1 files**
  outside this atomic upload diff; every file changed in this slice is
  formatted.
- Browser/visual: the final real Stage 1 flow passed **2/2** in 1.9 minutes. It
  uploads/submits all 12 Required Documents, proves resume, progress, abort,
  current version, approval continuity, and outsider isolation. Fresh captures
  for the upload panel and resumed-progress state were opened at 1536×864 and
  1440×900 with no clipped upload controls. The broader matrix still needs
  horizontal scrolling at 1440 and displays some English domain codes, so this
  is not a whole-module reference-match claim.
- Atomic implementation files:
  `apps/api/prisma/schema.prisma`,
  `apps/api/prisma/migrations/20260808120000_project_document_resumable_upload/migration.sql`,
  `apps/api/src/files/file-storage.ts`,
  `apps/api/src/files/files.controller.ts`,
  `apps/api/src/files/files.service.ts`,
  `apps/api/src/files/files.test.ts`,
  `apps/api/src/projects/projects.module.ts`,
  `apps/api/src/projects/project-products.service.ts`,
  `apps/api/src/projects/project-products.test.ts`,
  `apps/api/src/uploads/uploads.controller.ts`,
  `apps/api/src/uploads/uploads.dto.ts`,
  `apps/api/src/uploads/uploads.module.ts`,
  `apps/api/src/uploads/uploads.service.ts`,
  `apps/api/src/uploads/uploads.test.ts`,
  `apps/api/test/project-required-document-upload.integration.test.ts`,
  `apps/web/app/api/v1/[...path]/route.ts`,
  `apps/web/app/api/v1/[...path]/route.test.ts`,
  `apps/web/app/projects/[projectId]/documents/document-upload.tsx`,
  `apps/web/app/projects/[projectId]/documents/document-upload.test.ts`,
  `apps/web/app/projects/[projectId]/documents/[requirementId]/page.tsx`, and
  `apps/web/tests/browser/project-stage-one.spec.ts`. Deleted files: none.
- COMPLETE: Project Required Document resumable upload/version/review slice;
  Executive Dashboard; shared PMS frame; entry-stage/generic stage access;
  always-open Stage routes; verified Stage 1 finance/command semantics.
- REUSABLE_FOUNDATION: deterministic stage applicability, canonical Required
  Documents/Approval/Activity/Notification, authorization-safe Project shell,
  resumable FileAsset adapter, and existing cross-domain Project adapters.
- PARTIAL: Stage 1 still lacks the full Project Director/contact/milestone/data
  contract and proposal detail required by the master specification. Work
  packages, cross-stage traceability, complete route cutover, downstream-domain
  Project authorization, matrix localization/layout, and whole-module visual
  acceptance remain incomplete.
- NOT_STARTED: operational Stage 2 planning/Product/BOQ/review; Stage 3
  commercial/supplier/contract/PO/PI; Stage 4 production/logistics/inventory/
  installation/payment/log; Stage 5 acceptance/handover/settlement/archive/
  warranty; verified obsolete Project UI deletion and final cutover.
- Blockers: no blocker for the completed upload slice. Full repository format
  remains red on the 27 preserved files above; whole-PMS completion remains
  blocked by the explicitly unfinished Stage 1 contract and Stages 2–5.
- Exact next task: resume master-plan Task 4 with failing API/Web tests for the
  canonical Project Director, Project contact, and approved design-complete/
  order/production-ready/delivery/installation/handover milestones. Reuse
  existing fields where lossless and add a migration only for proven missing
  values; do not begin Stage 2 or a work-package model first.

## Project PMS always-open stages and Stage 1 finance checkpoint — 2026-08-07

- Branch: `feature/project-business-operations`. The existing dirty Project
  worktree was preserved. No commit, tag, push, PR, database reset, applied
  migration edit, dependency addition, business-data deletion, or obsolete-UI
  deletion was performed at this checkpoint.
- Reference/design: reused the approved Project PMS design, live-reference
  audit, image inventory, old-to-new mapping, and cutover matrix. No reference
  credential was stored, printed, or added to the repository.
- Database: additive migrations
  `20260807150000_project_entry_stage_access` and
  `20260807160000_project_stage_bypass_permission` are deployed. Prisma format
  check and validation pass; migrate status reports 48 migrations and an
  up-to-date PostgreSQL schema. The bypass permission is registered but is not
  automatically granted by the migration.
- Always-open stages: every actor-scoped Project stage read is independent of
  `currentStage`. All five stage controls are real links. Stage access remains
  membership/permission/template-policy controlled; gate progress never hides
  a route. Project-root landing uses current stage, then entry stage, then
  Stage 1 without mutating Project state.
- Entry stage/state: `entryStage` persists with a `STAGE_ONE` default and is
  accepted at Project creation. A new Project receives five truthful stage
  states: the selected entry stage starts `IN_PROGRESS`; other stages remain
  `NOT_INITIALIZED`. Later-stage entry does not fabricate earlier completion.
  Generic initialize/NOT_APPLICABLE/bypass commands are idempotent,
  authorization checked, reason/audit backed, concurrency safe, and reuse the
  existing Stage 1 initializer.
- Stage 1 workspace: the root is one connected workspace with the approved six
  Vietnamese initiation groups, routing panel, readiness/red flags, Required
  Document Matrix, five steps, active-step commands, approval/history, and
  supporting activity. Deep links remain compatibility entry points into the
  same component rather than duplicate Stage 1 homes.
- Finance: Vietnamese formatted money round-trips as canonical Decimal strings;
  blank optional values are omitted, currency is a VND-defaulting uppercase
  select, raw regex messages are replaced by Vietnamese field messages, and
  the API derives monetary margin with `Prisma.Decimal` from revenue minus
  cost. The client never sends a currency symbol, empty string, or margin.
  Reads/writes/aggregates remain finance-permission protected.
- Commands: `LƯU NHÁP`, `KHỞI TẠO LUỒNG DỰ ÁN`,
  `GỬI PHÊ DUYỆT GĐ 1`, and `HOÀN TẤT BƯỚC` now have explicit Vietnamese
  semantics and helper text. Submit visibility comes from the server's
  permission-safe `allowedCommands.submitApproval`, calculated from the full
  initialized/applicable-step/required-document/approval state while finance
  details remain redacted from unauthorized responses.
- Stage 2–5 routes: real actor-scoped access/initialization/read-only roots now
  exist and are always navigable when authorized. These are access foundations,
  not completed operational stage workstreams; no placeholder business data or
  fake tabs were introduced.
- Fresh root verification after final review fixes: full API Vitest **463/463**
  across 43 files, full Web Vitest **147/147** across 20 files, API/Web
  typechecks, API/Web builds, Prisma format/validate/status, and
  `git diff --check` pass. API/Web lint report zero errors; Web retains two
  pre-existing warnings outside this slice.
- Browser/visual evidence: Stage-access Flow 0 passed **2/2** at 1536×864 and
  1440×900. The final real Stage 1 flow passed **2/2** in 1.8 minutes, covering
  initialization, all five steps, formatted 35B finance normalization, twelve
  required documents, approval/notification/decision/gate, active Stage 2
  navigation, and outsider/file denial. Regenerated initiation, workflow,
  finance, document, approval, and forbidden captures were opened at both
  viewports; the inspected Task 4D areas have no clipping or overlap. This is
  not a whole-module visual-match claim.
- Review: Task 4A, 4B, and 4C independent reviews approved. Task 4D required two
  review rounds to make submit eligibility authoritative for non-finance actors
  and remove remaining visible English approval/gate copy; final review reports
  no Critical, Important, or Minor finding. Ponytail full found no dependency,
  parallel model, speculative abstraction, or removable Task 4D complexity.
- Exact Task 4A–4D implementation files:
  `apps/api/prisma/schema.prisma`,
  `apps/api/prisma/seed.mjs`,
  `apps/api/prisma/migrations/20260807150000_project_entry_stage_access/migration.sql`,
  `apps/api/prisma/migrations/20260807160000_project_stage_bypass_permission/migration.sql`,
  `apps/api/src/projects/projects.controller.ts`,
  `apps/api/src/projects/projects.dto.ts`,
  `apps/api/src/projects/projects.service.ts`,
  `apps/api/src/projects/projects.test.ts`,
  `apps/api/src/projects/project-stage.ts`,
  `apps/api/src/projects/project-stage.test.ts`,
  `apps/api/src/projects/project-stage-one.dto.ts`,
  `apps/api/src/projects/project-stage-one.rules.ts`,
  `apps/api/src/projects/project-stage-one.rules.test.ts`,
  `apps/api/src/projects/project-stage-one.service.ts`,
  `apps/api/src/projects/project-stage-one.test.ts`,
  `apps/api/src/projects/project-stage-one-approval.test.ts`,
  `apps/api/test/project-stage-access.integration.test.ts`,
  `apps/api/scripts/stage-one-playwright-fixture.mjs`,
  `apps/web/app/project-pms.tsx`,
  `apps/web/app/project-pms.test.tsx`,
  `apps/web/app/projects/[projectId]/page.tsx`,
  `apps/web/app/projects/[projectId]/project-stage-access.tsx`,
  `apps/web/app/projects/[projectId]/project-stage-one.tsx`,
  `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`,
  `apps/web/app/projects/[projectId]/compatibility.test.tsx`,
  `apps/web/app/projects/[projectId]/stage-1/money.ts`,
  `apps/web/app/projects/[projectId]/stage-1/money.test.ts`,
  `apps/web/app/projects/[projectId]/stage-2/page.tsx`,
  `apps/web/app/projects/[projectId]/stage-3/page.tsx`,
  `apps/web/app/projects/[projectId]/stage-4/page.tsx`,
  `apps/web/app/projects/[projectId]/stage-5/page.tsx`,
  `apps/web/playwright.stage-one.config.ts`,
  `apps/web/tests/browser/project-pms-stage-access.spec.ts`, and
  `apps/web/tests/browser/project-stage-one.spec.ts`.
  Task reports/design/plan/ledger under `docs/` and `.superpowers/` were also
  updated. Deleted files: none.
- COMPLETE: Executive Project Dashboard Tasks 1–2; shared PMS frame Task 3;
  entry-stage persistence and generic stage API Tasks 4A–4B; always-open Web
  routes/Flow 0 Task 4C; Stage 1 Vietnamese money and command semantics Task 4D.
- REUSABLE_FOUNDATION: five-stage state/access commands, deterministic template
  applicability for existing types, Stage 1 Required Documents/Approval/
  Activity/Notification, permission-safe header/context/linkage, and canonical
  domain adapters already present in the Project workspace.
- PARTIAL: Stage 1 remains short of the strict whole-stage definition because
  Project Director/contact/detailed milestone/contract-backed fields and some
  proposal-detail presentation remain master-plan Task 4. Work-package context,
  cross-stage traceability, complete route cutover, Project authorization
  coverage across every downstream domain, and whole-module visual acceptance
  remain incomplete.
- NOT_STARTED: complete Stage 2 planning/Product/BOQ/review; Stage 3 commercial/
  supplier/contract/PO/PI; Stage 4 production/logistics/inventory/installation/
  payment/log; Stage 5 acceptance/handover/settlement/archive/warranty; verified
  obsolete Project UI deletion and final full-module cutover.
- Blockers: no Task 4A–4D product blocker. The principal remaining dependency is
  completing the Stage 1 data contract without duplicating authoritative
  Customer, Contract, Product, Estimate, Approval, or Project relations.
- Exact next task: master-plan Task 4 — first add failing API/Web tests for a
  canonical Project Director and the approved design-complete/order/
  production-ready/delivery/installation/handover dates, map existing fields
  where lossless, and create a new additive migration only for proven missing
  values. Do not start Stage 2 or a work-package migration until that atomic
  Stage 1 contract slice is verified.

## Project PMS shared-frame checkpoint — 2026-08-07

- Branch: `feature/project-business-operations`; all pre-existing dirty work
  was preserved. No commit, tag, push, PR, database reset, migration edit,
  dependency addition, or business-data deletion was made.
- Runtime prerequisite: the previously reported Stage 1
  `crypto.randomUUID()` crash remains fixed through the secure command-key
  helper. Fresh Web regression includes the SSR/render and retry-key tests.
- Reference/cutover: the completed read-only live-reference audit, cutover
  matrix, reconciled approved design, and dated master plan were reused rather
  than repeated. No reference credential was stored or printed.
- Shared frame: `ProjectPmsShell` now accepts the active stage/title, only
  completed route destinations, stage tabs/context, accent, and ordered
  summary/readiness/flags/main/documents/activity slots. Stage 1 is the only
  live caller; Stage 2–5 controls remain disabled and unlinked.
- Project header: the actor-scoped workspace response now supplies bounded
  Customer, location, Project type, Sales owner, PM, current derived stage,
  status, health, and planned handover fields. It selects every stage state
  for deterministic current-stage derivation and returns no financial field.
  Project Director remains absent because no canonical relation exists yet;
  Task 4 owns the schema audit instead of inferring a role.
- Authorization/UX: nullable Customer data no longer crashes the frame.
  Document navigation and remediation links are filtered by the exact
  existing permissions, so a `project.read`-only actor sees no dead or
  forbidden action. `/stage-1` activates `Tổng quan`; explicit initiation
  activates `Khởi tạo dự án`. The unused alternate shell loader was deleted.
- Compatibility: `/projects/:projectId` still drops legacy workspace queries
  and redirects to Stage 1, because no later-stage root is complete. No empty
  stage route, duplicate shell, second theme, or parallel Project home was
  added.
- Database/services: PostgreSQL, Redis, and Mailpit are healthy. Prisma schema
  validation passes; migration status reports 46 migrations and an up-to-date
  database. This slice changed no schema or migration.
- Fresh verification after the final review fix: Web Vitest **122/122**,
  focused Project API Vitest **25/25**, Web/API typechecks, and
  `git diff --check` pass. Stage 1 Playwright passed **2/2** in 1.8 minutes,
  including the real PM/approver flow and outsider Project-isolation flow.
  The production Web build passed with the documented non-secret production
  proxy/origin contract; the initial sandbox attempts were blocked by local
  database/port isolation, not product failures.
- Visual acceptance: final Stage 1 Project/header/switcher/context/tabs/form/
  navy-panel captures were opened at 1536×864 and 1440×900. They fit without
  horizontal clipping; Stage 2–5 remain visually unavailable rather than dead
  links. Broader Stage 1 localization/detail completion remains Task 4.
- Reviews: the first task review found nullable-Customer/current-stage/dead
  remediation/duplicate-loader issues. Root review then found incomplete
  stage-state derivation, permission-unsafe Project links, and incorrect
  overview-tab activation. Both fix rounds used failing regressions; the final
  scoped correctness/security/authorization/UX/Ponytail re-review approved all
  findings with no remaining Critical or Important issue.
- Current classification:
  - Project Dashboard: **COMPLETE** for master-plan Tasks 1–2.
  - Project PMS Shell: **COMPLETE** for the Task 3 shared-frame slice;
    **PARTIAL** for the five-stage module because only Stage 1 is live.
  - Project Header: **PARTIAL** pending a canonical Project Director relation.
  - Project Stage routes: **PARTIAL**; Stage 1 is live, Stages 2–5 are absent.
  - Project Context Bar: **PARTIAL**; real Stage 1 context is implemented.
  - Project Workstream navigation: **PARTIAL**; only completed Stage 1 tabs are
    exposed.
  - Stage 1: **PARTIAL** pending Task 4 contract completion/decomposition.
  - Stage 2, Stage 3, Stage 4, Stage 5: **NOT_STARTED** as Project-stage
    replacements; canonical business domains remain reusable.
  - Required Documents: **REUSABLE_FOUNDATION**; canonical Stage 1 workflow is
    live, cross-stage reuse is pending.
  - Stage gates, readiness, and red flags: **REUSABLE_FOUNDATION/PARTIAL**;
    Stage 1 is implemented, Stages 2–5 are not.
  - Project permission modal: **PARTIAL** pending Task 4 decomposition and full
    accepted member-permission UX.
  - Project route compatibility: **COMPLETE** for the current Stage 1 cutover;
    later-stage/default-stage routing remains pending.
  - Project browser tests: **COMPLETE** for Dashboard/Flow 0 current routes and
    Stage 1; Flows 2–5 are **NOT_STARTED**.
  - Project visual acceptance: **COMPLETE** for Dashboard/current Stage 1;
    Stages 2–5 are **NOT_STARTED**.
- Files changed by Task 3:
  `apps/api/src/projects/projects.service.ts`,
  `apps/api/src/projects/projects.test.ts`,
  `apps/web/app/project-pms.tsx`,
  `apps/web/app/project-pms.test.tsx`,
  `apps/web/app/projects/[projectId]/project-stage-one.tsx`, and
  `apps/web/app/projects/[projectId]/project-stage-one.test.tsx`, plus this
  status and the checked master-plan Task 3 checklist.
- COMPLETE: master-plan Task 3 shared Project PMS frame.
- REUSABLE_FOUNDATION: actor-scoped bounded Project header, deterministic
  stage-state projection, permission-safe frame links/slots, current Stage 1
  route/browser foundation.
- PARTIAL: Stage 1 strict definition, five-stage route system, cross-stage
  orchestration, and obsolete-UI deletion.
- NOT_STARTED: master-plan Tasks 4–12.
- Exact next task: Task 4, add failing API/Web contract tests for Project
  Director and approved Stage 1 milestone dates, map existing Project/plan
  fields first, and start an additive migration only if the schema audit proves
  the missing canonical values cannot be represented safely.

## Project PMS Executive Dashboard KPI checkpoint — 2026-08-07

- Branch: `feature/project-business-operations`; all existing dirty work was
  preserved. No commit, tag, push, PR, database reset, migration/schema edit,
  dependency addition, or shared seed-record mutation was made.
- Real portfolio KPIs: `/projects/dashboard` now returns actor-scoped Contract
  value, receipts, receivable, payable, on-track/late/off-track Project counts,
  actor-assigned Stage 1 approvals, due warranty assets, and due service
  tickets where the current schema and exact domain permissions support them.
- Financial correctness: monetary values remain per-currency Decimal strings.
  Contract value includes only `SIGNED`, `ACTIVE`, `SUSPENDED`, and `COMPLETED`
  contracts. Null currency sums are omitted; no cross-currency or fake zero
  total is manufactured.
- Authorization: every related-domain aggregate begins from the same
  actor-visible Project set and organization scope. The API omits whole KPI
  fields without `contract.read`, `receivable.read`, `supplier_payable.read`,
  `project.stage1.review`, `warranty.read`, or `service_ticket.read` as
  applicable. Pending approvals are additionally limited to `STAGE_ONE`,
  `PENDING`, and `reviewedBy = actor.userId`.
- Dashboard UX: the approved Vietnamese KPI labels are present. Warranty and
  service counts remain distinct inside one card. Planned-vs-actual remains an
  honest unavailable state because no authoritative time series exists; no
  fake chart or cross-stage critical-flag total was added.
- Browser data: the cleanup-safe fixture creates one SELF-scoped Project and
  real Contract, receipt, receivable schedule, service ticket, Supplier, and
  valid PR→RFQ→Supplier Quotation→Comparison→Selection→PO→PI→Supplier Payable
  chain. The PM sees exact real values; the outsider sees neither Project
  metadata nor financial cards and cannot open the direct Project route.
- Fresh verification: focused API Vitest **42/42**, focused Web Vitest **14/14**,
  API/Web typechecks, API lint, fixture syntax, Prettier, and
  `git diff --check` pass. Web lint has zero errors and two pre-existing
  warnings. The clean full dashboard + Stage 1 Playwright rerun passed **4/4**
  in 1.9 minutes; a final dashboard artifact run passed **2/2**.
- Visual acceptance: all six final dashboard, empty, and forbidden captures
  were inspected at 1536×864 and 1440×900. KPI cards, filters, state-focused
  empty message, and authorization-safe forbidden state fit without horizontal
  clipping. The sparse English forbidden panel remains a later shared-frame UX
  gap.
- Review: independent Ponytail, correctness, security, authorization, and
  UX/reference re-review approved Task 2 after lifecycle, stage-isolation, and
  browser-fixture fixes.
- COMPLETE: master-plan Task 2, authorized Executive Dashboard KPI expansion.
- REUSABLE_FOUNDATION: Tasks 1–2 five-stage portfolio projection, actor-scoped
  aggregate pattern, deterministic real-data dashboard fixture, and responsive
  executive composition.
- PARTIAL: the Project PMS replacement remains incomplete; the shared frame,
  Stage 1 decomposition/completion, Stages 2–5, and obsolete-UI deletion have
  not reached their master definitions of done.
- NOT_STARTED: master-plan Tasks 3–12.
- Exact next task: Task 3, generalize the shared `ProjectPmsShell` frame and
  real stage routes without duplicating stage pages or exposing unfinished
  tabs.

## Project PMS dashboard stage-orchestration checkpoint — 2026-08-07

- Branch: `feature/project-business-operations`; all pre-existing uncommitted
  work remains in place. No commit, tag, push, PR, database reset, migration
  edit, or dependency addition was made.
- Five-stage orchestration: added one typed projection from all 14 historical
  Project phases and backend stage states to `STAGE_1`–`STAGE_5`. Completed
  stages advance to the next stage; an active/review/blocked state takes
  precedence; invalid or absent states fall back to the historical phase.
  This is read-only presentation logic and does not rewrite business history.
- Portfolio query: `currentStage` is validated and applied inside the existing
  actor-scoped Prisma query. Rows and pagination totals use the same predicate;
  financial redaction and protected sort behavior are unchanged.
- Dashboard: `/projects` now presents the approved executive hierarchy, a
  five-stage selector and current-stage table column, and direct Project
  navigation without exposing the raw 14-phase workflow as the primary UI.
- Browser acceptance: the real Stage 1 fixture passed 2/2 Playwright tests.
  Dashboard, empty, and forbidden states were captured and inspected at
  1536×864 and 1440×900. No unexpected console, hydration, or page error was
  observed. The compact English forbidden state remains a shared-shell UX gap
  for a later frame task; Project metadata stays protected.
- Fresh verification: focused API Vitest 33/33 and Web Vitest 13/13 pass; API
  and Web typechecks pass; `git diff --check` passes. Independent re-review
  approved the corrected stage semantics, server-side filtering, and browser
  evidence.
- COMPLETE: master-plan Task 1, deterministic five-stage mapping and the
  current-stage Project dashboard slice.
- REUSABLE_FOUNDATION: actor-scoped Project list query, stage projection/filter,
  real-fixture dashboard browser flow, and responsive portfolio composition.
- PARTIAL: the Executive Dashboard still exposes only existing Project-local
  aggregates; cross-domain financial, approval, risk, and service KPIs have not
  yet been added. The shared shell and Stage 1 remain partial.
- NOT_STARTED: master-plan Tasks 2–12, including KPI expansion, shared-frame
  completion, Stage 1–5 completion, and obsolete-UI deletion.
- Exact next task: implement Task 2 one authorized KPI family at a time from
  existing canonical domains, with no schema, dependency, or reporting-service
  abstraction.

## Project PMS live-reference and cutover design checkpoint — 2026-08-07

- Branch: `feature/project-business-operations`; the existing dirty worktree
  and all authoritative business changes were preserved. No commit, tag, push,
  PR, database reset, migration edit, business-data mutation, or dependency
  change was made.
- Live reference: completed a user-authorized read-only Playwright inspection
  of login, Executive Dashboard, the Project permission modal, all five Stage
  1 steps, all three Stage 2 steps, all three Stage 3 modules, all four Stage 4
  tabs plus contract/appendix/package-payment detail, and all three Stage 5
  tabs at 1536×864 and 1440×900. Temporary captures remain outside tracked
  source under `/tmp`; the temporary automation scripts were removed. No
  reference credential is stored in the repository or screenshots.
- Audit record: added
  `docs/project-system/PMS_LIVE_REFERENCE_AUDIT.md`, separating the
  reference's visual/workflow evidence from Galaxy OS business data, IAM,
  financial rules, and deterministic gates.
- Cutover record: added
  `docs/project-system/PROJECT_UI_CUTOVER_AND_DELETION_MATRIX.md`. It keeps the
  existing shell/tokens and canonical Product, Required Document, Estimate,
  Quotation, Contract, Inspection, Handover, Warranty, FileAsset, Activity,
  Comment, Notification, and IAM domains; it marks the Stage 1 client monolith
  and duplicate Project form for replacement/deletion only after verified
  cutover.
- Reconciled design: added the approved full-replacement design at
  `docs/superpowers/specs/2026-08-07-galaxy-project-pms-full-replacement-design.md`.
  The earlier 2026-08-01 Slice 0/1 design remains historical; the new document
  resolves its stale Stage 2–5 exclusion, defines deterministic template
  applicability, one five-stage route system, domain ownership, gates,
  authorization, visual acceptance, and safe deletion order.
- Review: independent cutover review found four documentation issues. All were
  corrected: the current UI exposes three raw legacy phase options rather than
  a 14-item UI, the real shared symbol is `ProjectPmsShell`, the missing route
  is Project-scoped `/projects/:projectId/settings`, and speculative CSS/feature
  flag deletion targets were removed. The rechecked documents contain no
  reference credential.
- Verification: all three new documents pass Prettier; repository
  `git diff --check` passes.
- COMPLETE: Phase 1 live-reference audit, Project UI cutover/deletion matrix,
  and approved full-replacement design reconciliation/self-review.
- REUSABLE_FOUNDATION: current `PortalShell`, theme tokens, `ProjectPmsShell`,
  canonical Stage 1 routes/commands, authoritative domain routes/services, and
  IAM/financial filtering.
- PARTIAL: portfolio dashboard, shared PMS frame, and Stage 1 still require the
  approved replacement completion and browser acceptance.
- NOT_STARTED: Stage 2–5 Project orchestration routes and verified obsolete-UI
  deletion.
- Exact next task: use `superpowers:writing-plans` to create the dated
  stage-by-stage execution plan, beginning with a TDD Project dashboard/shared
  frame vertical slice and exposing no unfinished stage route.

## Stage 1 secure command-key runtime repair — 2026-08-07

- Branch: `feature/project-business-operations`; the existing dirty Project
  worktree was preserved. No commit, tag, push, PR, database reset, migration
  edit, or dependency change was made.
- Root cause: `project-stage-one.tsx` is a Client Component, but its render path
  is also evaluated during server/static rendering, and the affected browser
  exposes Web Crypto without `crypto.randomUUID`. Stage 1 generated a UUID in a
  `useState` render initializer and called `crypto.randomUUID` directly in two
  submit paths, causing the page-level runtime failure.
- Fix: `createCommandKey` feature-detects native `randomUUID`, otherwise uses
  `crypto.getRandomValues` to produce an RFC 4122 version 4 UUID, and fails
  explicitly when secure randomness is unavailable. Stage 1 now generates no
  command key during render. Each submit path keeps one key across a failed
  retry and clears it only after the submission API resolves successfully.
- Backend contract: Stage 1 accepts a trimmed non-empty idempotency key of 1–200
  characters, so the UUID v4 output is compatible. Existing server-side
  authorization and Project-scoped idempotent lookup remain unchanged.
- TDD/verification: the SSR regression first reproduced
  `TypeError: crypto.randomUUID is not a function`; helper tests first failed
  before implementation. Final focused Vitest is 21/21, full Web Vitest is
  115/115, Web typecheck passes, lint has zero errors and two existing warnings,
  touched-file format and `git diff --check` pass. Focused Chromium Playwright
  is 1/1 with `randomUUID` removed and proves safe render, same-key retry,
  post-success rotation, and no matching hydration/runtime console error.
- Review: independent correctness/security/authorization review found no
  defect. Ponytail reported `Lean already. Ship.`
- COMPLETE: Phase 0 Stage 1 `randomUUID` runtime repair and focused browser
  acceptance.
- PARTIAL: Project dashboard, PMS Shell, and Stage 1 remain partial against the
  approved full replacement specification.
- NOT_STARTED: this checkpoint did not implement Stages 2–5 or Project UI
  cutover/deletion.
- Exact next task: inspect the authorized live PMS reference, write
  `PMS_LIVE_REFERENCE_AUDIT.md`, and classify the current Project UI in
  `PROJECT_UI_CUTOVER_AND_DELETION_MATRIX.md` before reconciling the approved
  design and implementation plan.

## Project Actions/Alerts Stage 1 summary batch — 2026-08-06

- Continuation resumed on `feature/project-business-operations` from the
  approved PMS specification and Slice 0/1 plan. The dirty working tree was
  preserved. No commit, tag, push, PR, database reset, migration rewrite, data
  deletion, or `prisma db push` was used.
- Slice classification remains: portfolio dashboard **PARTIAL**, PMS Shell
  **PARTIAL**, Stage 1 **PARTIAL**, and Stages 2–5 **NOT_STARTED**. This run
  resumed the earliest bounded Stage 1/Shell gap and did not scaffold later
  stages.
- Added a bounded `GET /projects/stage-1-summaries?projectIds=...` collection
  read for the current Actions/Alerts page. It accepts 1–20 UUIDv4 Project IDs,
  applies the existing `BusinessEntityPolicy.projectWhere` authorization in
  the database query, makes one Project query, preserves caller order, omits
  inaccessible Projects, and returns only Project ID, Stage 1 readiness, and
  red flags. No Project metadata or financial value is exposed by the batch
  response.
- The existing single-Project and new batch paths now share the same Prisma
  selection and summary mapper. A Ponytail review found and removed the first
  implementation's duplicated selector wrapper instead of introducing another
  read model or dependency.
- `/projects/actions` and `/projects/alerts` now make one bounded Stage 1
  summary request per populated paginated Project page rather than one request
  per Project. Empty pages skip the request; inaccessible/missing summaries
  retain the truthful partial-results message. No new route or unfinished UI
  was exposed.
- TDD evidence: API tests first failed because the DTO, service, and route did
  not exist; the Web two-Project test first observed three requests instead of
  two. Green tests cover DTO bounds/UUIDs, one scoped query, minimal output,
  caller ordering, inaccessible Project omission, static-route precedence, one
  batch request, missing-summary handling, empty pages, and Alerts reuse. Test
  mutations that removed Project policy filtering, trusted database order, or
  moved the static endpoint below `:id` all failed before restoration.
- Reviews: per-task correctness reviews passed after strengthening the Project
  policy assertion. The final broad correctness/security/authorization/
  financial/UX/performance review found no critical or important issue. Its
  three minor test/duplication findings were fixed and the scoped re-review
  passed. The final Ponytail lean review has no remaining finding in this
  slice.
- Database/services: Compose PostgreSQL, Redis, and Mailpit are healthy. Prisma
  format, validate, and migrate status pass; 46 migrations are applied and the
  schema is up to date. No migration was created and no current checksum error
  was emitted; historical checksum drift remains recorded as repository
  history.
- Verification on the final behavior: focused Stage 1 API 157/157, focused Web
  Actions/Alerts 11/11, full Web 111/111, Edge 4/4, Document Service 1/1,
  Playwright baseline 13/13, Stage 1/Project-isolation Playwright 2/2,
  repository lint, typecheck, format check, production build, Prisma
  validation/status, and `git diff --check` pass. The full API suite is not
  recorded as clean: two fresh attempts passed
  all product assertions but each had a different isolated integration timeout
  (Stage 1 teardown once; administrator reset empty-password once); the focused
  files then passed 1/1 and 7/7 respectively. This non-reproducible regression
  runner instability remains an exact verification blocker, not a product-code
  failure or a reason to inflate unrelated timeouts.
- Visual acceptance: this data-loading slice did not change layout, so no new
  screenshot set was generated and no new reference-match claim is made. The
  previously inspected 18 Stage 1 screenshots remain the current visual
  evidence. Browser flows completed without a reported runtime-console failure.
- Files in this atomic slice: `project-stage-one.dto.ts`,
  `project-stage-one.service.ts`, `project-stage-one.test.ts`,
  `projects.controller.ts`, `apps/web/app/projects/page.tsx`, and
  `apps/web/app/projects/page.test.ts`, plus this status and the dated execution
  plan.
- COMPLETE: the bounded authorization-safe Stage 1 summary batch and its
  Actions/Alerts one-request integration.
- REUSABLE_FOUNDATION: existing Project policy, Stage 1 aggregate mapper,
  paginated Project listing, and portfolio filter/readiness helpers.
- PARTIAL: portfolio dashboard, strict PMS Shell, complete Stage 1 field/detail
  matrix, external participant/granular member permissions, and remaining
  reference-level localization/UX. Full API regression is not clean because of
  the non-reproducible integration timeouts above.
- NOT_STARTED: Stage 2, Stage 3, Stage 4, and Stage 5 replacement workflows.
- Exact next task: before any migration, add failing Stage 1 contract tests in
  `apps/api/src/projects/project-stage-one.test.ts` and Web behavior tests in
  `apps/web/app/projects/[projectId]/project-stage-one.test.tsx` for the missing
  approved initiation responsibility/date fields, then map the fields already
  represented by `Project` and `ProjectStageOnePlan` through
  `project-stage-one.dto.ts`, `project-stage-one.service.ts`, and
  `project-stage-one.tsx`. The first expected failure is that Project Director
  and the approved initiation milestone dates are absent from the Stage 1
  detail/form contract. Stop and plan an additive migration only if the schema
  audit proves a required value cannot be represented without loss.

## Authentication repair and New PMS Stage 1 continuation — 2026-08-06

- Continuation resumed on `feature/project-business-operations` with the dirty
  working tree preserved. No commit, tag, push, PR, database reset, applied
  migration edit, or `prisma db push` was used.
- Authentication symptom: the documented local development password could not
  log in, and PostgreSQL/API availability had conflicting historical reports.
  Root cause was twofold: the documented seed password was stale because the
  administrator credential had been securely changed on 2026-07-21 while the
  idempotent seed intentionally does not overwrite credentials, and the local
  services were initially stopped. The intended masked administrator was
  active, local-password backed, structurally valid, unlocked, and had an
  active SYSTEM membership.
- Authentication resolution: existing Compose PostgreSQL/Redis were restored;
  the existing targeted local administrator reset command used the shared
  PasswordService, revoked sessions/tokens, and set mandatory password change.
  The one-time password is not stored in Git and is reserved for the secure
  handoff. Live API/browser checks verified login, HttpOnly/SameSite=Lax/local
  non-Secure cookie, CurrentActor, forced-change redirect, logout, stale-session
  rejection, and clean re-login. Portal notifications are suppressed while a
  forced-password-change session is restricted, preventing the prior 403
  console error.
- Database: PostgreSQL, Redis, and Mailpit are healthy. The additive
  `20260801090000_project_stage_one` migration was reviewed and applied with
  `prisma migrate deploy`; Prisma reports 46 migrations and an up-to-date
  schema. No current checksum error was emitted; the historical checksum-drift
  warning remains preserved as history and no applied migration was rewritten.
- PMS continuation audit: the approved design and Slice 0/1 plan already
  existed and were reused. The prior run had reusable Product/Required Document
  foundations but no verified replacement shell, Stage 1 vertical slice, or
  authentication repair. The old Project root is no longer primary:
  `/projects/:projectId` redirects to the canonical Stage 1 PMS route, stale
  `?workspace=` return links were replaced, and valid domain/bookmark routes
  remain through direct routes or thin adapters.
- New PMS Shell implemented foundation: concise global Project navigation,
  real Project header data, five-stage visual switcher, canonical Stage 1
  routes, context breadcrumbs, workstream tabs, real summary/readiness/red
  flags, Required Document placement, Activity/comments/files/members routes,
  loading/error/forbidden behavior, Project isolation, financial query
  omission, and truthful disabled future-stage controls. It remains **PARTIAL**
  against the strict definition because Stage 2–5 do not yet have real routes,
  the header/context selector lacks all approved Director/current-stage and
  selector controls, and the complete workstream tab set is not implemented.
- Stage 1 implemented foundation: initiation draft/initialize/review separation,
  deterministic routing, five server-owned steps, assignment, survey plus real
  FileAsset evidence, proposal, permission-protected preliminary finance,
  twelve Required Documents with current version/history/review, resolver-based
  approval, direct notification, readiness/red flags, structured gate blockers,
  idempotent gate Activity/Notification, internal member management, and
  Project/file isolation. Canonical step state now drives the shared stage
  aggregate; empty Stages 2–5 report NOT_STARTED.
- Final correctness/security hardening keeps financial Required Documents and
  every current, historical, or direct Required Document file out of
  unauthorized list/detail/download paths; locks mutable document/file rows;
  prevents Required Document evidence mutation through generic FileAsset
  commands; makes document type immutable; revalidates gate prerequisites;
  serializes authentication lockout counters; and keys approval notifications
  to each distinct submission cycle so reject/resubmit retries do not suppress
  a legitimate later notification.
- Stage 1 remains **PARTIAL** against the full approved field/workflow matrix:
  initiation, survey, proposal, and finance screens use a narrower existing
  data contract; external customer/supplier/contractor participants,
  invitations, active-date/scope grants, and per-member workstream/financial
  grants lack an authoritative model/API and were not faked. Stage 2–5
  replacement is **NOT_STARTED**.
- Routes added or replaced include `/projects/mine`, `/projects/actions`,
  `/projects/alerts`, the canonical Stage 1 overview/initiation/survey/
  requirements/documents/approval routes, and Project members/files/activity.
  Notification links target the real Stage 1 approval route and are filtered
  through Project access policy.
- Fresh verification: `git diff --check`, Prisma format/validate/status,
  repository lint, API/Web/Edge typecheck, repository format check, API 383/383,
  Web 109/109, Edge 4/4, Document Service 1/1, Playwright baseline 13/13,
  real Stage 1/Project-isolation Playwright 2/2, and production Web build all
  pass. Authentication integration is 10/10; the Stage 1 PostgreSQL integration
  is 1/1. The production build used documented non-secret proxy/origin flags;
  the sandboxed Turbopack attempt was retried outside the sandbox because its
  internal local bind was denied.
- Visual acceptance: 18 ignored screenshots were generated and opened at
  1536×864 and 1440×900 for login, Project dashboard, initiation/routing,
  member modal, five-step workflow, survey/file upload, Required Document
  Matrix, approval, and forbidden state. The true navy-header modal, table
  loading, future-stage states, and viewport captures were corrected. Remaining
  differences are raw English/canonical keys, native English file-input text,
  UUID-oriented approval controls, an internal-only permission dialog, and a
  denser navy routing/document-matrix presentation than the approved reference;
  no pixel-match claim is made.
- COMPLETE: authentication repair and live session flow; additive migration and
  database integration; canonical Stage 1 command/gate core; real PM-to-
  approver browser flow; Project/file isolation; screenshot set.
- REUSABLE_FOUNDATION: Project/Product/Required Document/FileAsset/Approval/
  Activity/Comment/Notification/IAM domains; Stage 1 orchestration records,
  business-routing adapter, approver resolver, canonical routes, and PMS shell
  components.
- PARTIAL: strict New PMS Shell definition, full Stage 1 field/detail matrix,
  external participant/granular member permissions, Actions/Alerts summary
  batching, and final reference-level UX/localization polish.
- NOT_STARTED: Stage 2, Stage 3, Stage 4, and Stage 5 replacement workflows.
- Exact next task: close the documented Shell and Stage 1 PARTIAL gaps without
  starting Stage 2, beginning with authoritative external participant/member
  scope requirements, route-complete future-stage shell states, batched
  Actions/Alerts summaries, and the missing approved initiation/survey/finance
  fields.

## Required Document and Product browser acceptance — 2026-07-30

- Before this run the branch had 45 applied migrations, backend Required
  Document commands and Product CRUD/workflows, but no Required Document
  mutation UI or Product business Playwright coverage.
- Added the project Required Document matrix and detail workflow: filtered
  list, create/edit/owner/due date, FileAsset upload and version replacement,
  submit, approve/reject, not-applicable, supersede, current version/history,
  permission-aware actions, activity, and direct notification routes.
- Completed four real-server Product Playwright flows covering draft creation
  with file/activity, approval notification and immutable revision creation,
  direct-URL project isolation, and Required Document approval with readiness
  and red-flag refresh. Product type changes now persistently clear the
  superseded catalog/custom choice, and concurrent approval decisions
  atomically claim a pending record.
- Removed the duplicate Swagger DTO schema name that produced an API startup
  warning by giving the existing Inventory decision DTO a unique class name.
- Required-document list loading uses paginated/sort-whitelisted queries and
  bulk owner/current-file lookups. Stage 1–2 readiness and red flags now
  include missing, overdue, and rejected required documents with direct record
  routes.
- No migration was added. Prisma reports 45 migrations up to date; historical
  checksum drift remains and no reset, `migrate dev`, or `db push` was used.
- Verification: Prisma format/validate/status, lint, strict typecheck, API
  177/177, Web 55/55, Edge 4/4, Document Service 1/1, baseline Playwright 6/6,
  Product Playwright 4/4, production Web build, and diff check passed. API test
  files now run sequentially to stay within the local PostgreSQL connection
  limit.
- Product browser acceptance is complete for the four required flows.
  Required Document functionality is implemented end to end, but the requested
  per-transition Web/integration test matrix is still partial (two focused Web
  assertions and one comprehensive PostgreSQL workflow test). Commercial,
  procurement, production, logistics, and inventory expansion was not started.

## Project Product acceptance continuation — 2026-07-30

- Before this run the branch was dirty with the Product Register foundation,
  44 applied migrations, read-only required documents, and approval submit
  notifications without recipient resolution.
- Added append-only migration
  `20260730130000_required_document_workflow`; `migrate deploy` applied it and
  Prisma now reports 45 migrations up to date. It adds required-document
  version history, not-applicable audit fields, supersede audit fields, and
  the `project.document.review` permission. No historical migration changed.
- Required-document APIs now create/update requirements, validate an active
  project-member owner, link or replace an existing project-authorized
  FileAsset, submit, approve/reject, mark not applicable with reason/actor/time,
  supersede, retain prior file versions, and write Activity records.
- Product approval submission now resolves recipients from active users,
  active organization memberships, active/unexpired role assignments,
  permission grants, and either Project membership or organization/system
  scope. The creator is excluded; notifications use a direct Product route and
  an idempotency key.
- Added compatibility redirects for the requested
  `/projects/:projectId/design-products/products/...` routes while preserving
  the existing canonical Product routes.
- Verification so far: Prisma validate/format/generate/deploy/status passed,
  API and Web typecheck passed, and focused Product/resolver tests passed 9/9.
  A sandboxed full API invocation could not reach PostgreSQL or bind a socket;
  it is not an application failure and requires an escalated rerun.
- Status remains **Partial**. Required Document UI, Web behavior coverage,
  PostgreSQL Product integration matrix, Stage 1–2 gate completion, red-flag
  expansion, and four Product Playwright flows remain. Commercial linkage is
  **Not started** because Product acceptance has not passed.

## Project Product Register V1 and workspace operations — 2026-07-30

- Added append-only migrations `20260730120000_project_product_register` and
  `20260730123000_register_project_product_permissions`; both are applied and
  Prisma reports 44 migrations with the database up to date.
- Added project-scoped location hierarchy, product lines, immutable revisions,
  customer/technical/commercial approval history, and required-document
  records while retaining Product, Variant, Supplier, FileAsset, Activity,
  Comment, Notification, and IAM foundations.
- Added Product Register list/create/detail/edit/revision UI, real file upload,
  comments, permission-aware workflow actions, scoped APIs, Stage 2 aggregate
  cards, five-stage readiness, required-document display, and Product/Project
  red flags.
- Added 12 `project.product.*`, `project.location.manage`, and
  `project.document.manage` capabilities. System roles receive them through
  the permission migration; other role assignment remains explicit.
- Verification: Prisma format/validate/status, full typecheck, API 171/171,
  Web 53/53, Edge 4/4, document service 1/1, focused Project tests 12/12, and
  Playwright baseline 6/6 passed. The baseline failure was a stale fixture
  actor missing the now-required `dashboard.read`; post-login uses one native
  full navigation.
- Status: **Partial**. Required-document create/link/review actions, Product
  Register Web unit tests, real-database Product integration tests, four
  Product Playwright business flows, approval evidence policy, approver
  routing notifications, and downstream commercial/procurement links remain.
  Project Product Register V1 and Workspace Operational Foundation must not be
  called complete until those flows pass.

## App Shell and five-stage Project Workspace — 2026-07-30

- Centralized the permission-aware six-group navigation registry, removed
  Marketing from navigation, added active-route matching, and added the real
  project-membership-filtered `/projects/mine` view.
- Reworked the existing Project Workspace switcher into five Galaxy OS stages,
  retained links to existing project-filtered domain screens, removed dead
  actions, and kept the existing scoped operations summary, files, comments,
  and activity integrations.
- Project list/detail responses now omit estimate and contract values unless
  the actor has `estimate.read` and `contract.read`, respectively.
- Status: App Shell and Project Workspace foundation are **Partial**. The
  Project Product Register, stage readiness/document matrices, approval inbox,
  templates, dedicated red-flag aggregate, and requested business Playwright
  flows are not implemented and must not be treated as complete.
- Verified: Prisma validate, lint, API/Web typecheck, focused Project tests
  6/6, and navigation/middleware tests 11/11. Migration status and database
  integration/Playwright are blocked because PostgreSQL at `localhost:5432`
  is not running in this environment.

## Sprint 2 — Complete Business Operations — in progress

Branch `feature/sprint-2-complete-business-operations` contains the Marketing-off guard, project workspace, commercial/procurement operations, Production Tracking, partial Logistics/Customs/Landed Cost, Warehouse and Inventory operations, Installation, Inspection/Acceptance, Handover Documents, Warranty Assets, Service Visits, Claims and replacement tracking, plus a local streamed resumable-upload adapter. Migrations through `20260727230000_complete_handover_warranty_operations` (42 total) are applied locally.

| Module                              | Backend                                                                                                                                                   | Frontend                                                   | Authorization                                                                                | Tests                                                | Status   | Limitations                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| Supplier RFQ                        | CRUD, recipients, PR lines, lifecycle, clarification, history, activity, notification                                                                     | List, create, detail, project/sidebar links                | Tenant/project policy and seven RFQ permissions                                              | Focused procurement tests; API/web typecheck         | Complete | SMTP remains manual/simulated                                                                          |
| Supplier Quotation                  | Decimal totals, RFQ recipient/line validation, review lifecycle, immutable selection and revisions                                                        | List, create, detail                                       | Tenant/project policy and cost/review permissions                                            | Focused procurement tests and API/web typecheck      | Complete | Original document upload uses existing FileAsset integration                                           |
| Supplier Comparison                 | Currency snapshots, landed estimates, split-line idempotent selection and approval                                                                        | List, create, side-by-side detail                          | Selection and approval permissions; self-approval blocked                                    | Focused procurement tests and API/web typecheck      | Complete | Risk inputs are explicit assessments, not an opaque score                                              |
| Purchase Order                      | Approved-selection creation, backend totals, lifecycle, approval and confirmed quantity update                                                            | List, create, detail                                       | PO permissions; self-approval blocked                                                        | Focused procurement tests and API/web typecheck      | Complete | PDF/XLSX generation is not yet wired                                                                   |
| Proforma Invoice                    | PO reconciliation, Decimal totals, immutable revisions, checksum documents                                                                                | List, create, detail                                       | Project, bank-reference and approval permissions                                             | Focused unit tests; API/web typecheck                | Partial  | Project integration and direct authorization/E2E remain                                                |
| Supplier Payables                   | Milestone schedules, tenant-scoped payment idempotency, maker-checker approval, Serializable allocation                                                   | Payable/payment list and detail                            | Project, bank-reference and payment permissions                                              | Focused unit tests; API/web typecheck                | Partial  | Project views and authorization/concurrency E2E remain                                                 |
| Production                          | PO-confirmed idempotent creation, milestones, technical/sample decisions, quality, packing, payment unlock                                                | List and detail                                            | Project and production permissions                                                           | Focused unit tests; API/web typecheck                | Partial  | Full forms, project integration and authorization/E2E remain                                           |
| Logistics, Customs, Landed Cost     | Partial shipment, lifecycle, customs totals, allocation/finalize, FileAsset linkage                                                                       | List/detail/create and project-filtered shipment view      | Project scope and separate logistics/financial permissions                                   | Focused unit tests; API/web typecheck                | Partial  | Direct authorization/E2E and complete freight/customs document flows remain                            |
| Warehouse Master                    | Warehouse, zones and hierarchical locations linked to Project                                                                                             | List/detail/create and hierarchy forms                     | Organization/project scope; manager/employee permissions                                     | Focused unit tests; API/web typecheck                | Partial  | Direct URL/role E2E and inventory aggregates remain                                                    |
| Inventory and Receiving             | Immutable transactions, transaction-safe balances, lot/serial, Receipt/QC, reservation, transfer, issue, return, adjustment and cycle count               | Dashboard, item/transaction/receipt and operation screens  | Project/organization scope, cost redaction and command permissions                           | 15 focused tests; API/web typecheck                  | Partial  | Database concurrency/E2E, evidence upload, approved excess receipt and richer detail screens remain    |
| Installation                        | Plans, readiness-gated work orders, issued-stock installation, daily logs and punch verification                                                          | Project-filtered plan/work-order list and detail workflows | Project scope; separate execute, release, override and punch verification permissions        | Focused service tests; API/web typecheck             | Partial  | Team/site-delivery/site-issue management and browser authorization coverage remain                     |
| Inspection, Acceptance and Handover | Item decisions, acceptance blocking, handover checklist/readiness and idempotent warranty generation                                                      | Project inspection and handover list/detail/forms          | Project scope; separate inspection, acceptance, handover completion and override permissions | Focused service tests; API/web typecheck             | Partial  | Document package/version UI and full transition/E2E coverage remain                                    |
| Warranty and After-sales            | Policy snapshots, handover assets, scoped tickets, visit assignment, claim decisions, replacement tracking, resolution evidence and close guards          | Project warranty view and ticket list/create/detail        | Project/customer scope, service-cost redaction and separate permissions                      | Focused service tests; API/web typecheck             | Partial  | Replacement inventory orchestration, visit reschedule/no-access, claim evidence/history and E2E remain |
| Project operations summary          | Scoped backend aggregates for inventory movements, installation, punch, inspection, acceptance, handover, warranty, claims, replacements, tickets and SLA | Project header summary cards                               | Project visibility and organization scope; no financial fields returned                      | Focused project/after-sales tests; API/web typecheck | Partial  | Direct aggregate-isolation integration tests and business Playwright remain                            |

Sprint 2 — Complete Business Operations is not complete. Inventory is partial;
installation, handover, warranty/after-sales, the large import worker,
operational dashboards, authorization matrix, and business E2E remain. The
current completion audit is `docs/sprint-2-completion-audit.md`.

Verification on 2026-07-28: full API 162/162, web 52/52, Edge 4/4,
document service 1/1, Playwright baseline 6/6, lint (two existing `<img>`
warnings), API/Web/Edge typecheck, production build with validated safe
environment values, Prisma validate/status (42 migrations, database up to
date), and `git diff --check` passed. The ten required operational Playwright
flows and real-database Inventory concurrency matrix do not yet exist, so no
completion tag was created.

## Sprint 2 — CRM, Project Hub and Work Management — 2026-07-23

- Implemented functional Customer/Contact, Lead, Opportunity pipeline,
  Project Hub, Task board, Survey and Requirement vertical slices with scoped
  IAM authorization, activity records, notifications, idempotent conversion,
  seed data, and usable list/detail/form screens.
- Added shared file upload/download with local ignored storage and
  entity-scope authorization; comments, replies and mentions; business
  timelines; recipient-owned notifications and header badge; scoped dashboard
  aggregates and global search.
- Added staged Excel import for Customer, Contact, Lead and Project using
  `.xlsx` parsing, column mapping, validation, preview and idempotent
  confirmation. Added Marketing campaign/content review, approval, channel
  variants, calendar and a database-backed publishing queue with locking,
  bounded retry and a development/test fake provider. No external publishing
  credential or live provider is configured.
- Prisma reports 20 applied migrations and an up-to-date schema. Verification
  passed: diff check, format, lint, strict typecheck, API 98/98, web 50/50,
  Edge 4/4, document service 1/1, production build, Edge build/test, and
  targeted Sprint 2 tests 24/24.
- Browser Playwright acceptance remains blocked by the host's missing
  `libnss3`; no system package installation was attempted. Ignored `.env*` and
  `.runtime/` files remain local and are not part of the implementation.

## Internet deployment preparation — 2026-07-22

- Added production-only Next and Nest start commands bound to
  `127.0.0.1:3000` and `127.0.0.1:3001`, loopback health checks, browser-bundle
  leakage checks, and one systemd target with dependency ordering, restart on
  failure, secure environment loading, and clean stop behavior. The existing
  Docker Compose services remain private on loopback.
- Consolidated public URL handling on `APP_PUBLIC_ORIGIN`. Production rejects
  HTTP or path-bearing origins, `ALLOW_DEV_AUTH=true`, missing proxy trust,
  malformed/wildcard trusted hosts, and a browser API URL other than
  same-origin `/api/v1`. Reset mail uses only the validated public origin.
- Host/Origin enforcement now covers the closed same-origin API forwarder and
  protected routes. Forwarded host/protocol/client-IP values are ignored by
  default and accepted only for the documented loopback proxy deployment;
  ambiguous or non-HTTPS production proxy headers fail closed. Next Server
  Actions use the same exact host allowlist and a 100 KB body ceiling.
- Production cookies remain HttpOnly, Secure, SameSite=Lax, path `/`, and
  host-only. Login/logout/reset remain server-session operations, reset and
  password changes revoke sessions, credentials are redacted from errors and
  logs, and account-wide password lockout was removed to prevent trivial
  targeted denial of service while retaining per-client login throttling and
  audited failures.
- Added safe placeholder-only Cloudflare Tunnel and Caddy examples plus
  deployment guidance for DDNS, router rules, Windows firewall, WSL
  portproxy/IP changes, certificate prerequisites, HSTS timing, service
  health/restart, rollback, and the explicitly non-production public-IP
  diagnostic. No public IP, LAN/WSL address, domain, credential, or token was
  committed.
- Verification passed: `git diff --check`, lint, strict typecheck, format
  check, API 58/58, web 44/44, document service 1/1, controlled HTTPS
  production build, static client-artifact scan, and loopback production smoke
  tests for both health endpoints, the same-origin API path, trusted forwarded
  headers, and untrusted Host rejection. The production processes stopped
  cleanly. Internet reachability was not claimed or tested.
- Cloudflare/dashboard and router/firewall changes remain manual. The current
  DMZ and public TCP 3000 mapping must be removed before deployment. No Sprint
  2 work was started, and nothing was committed or pushed.

## Development Host allowlist and Login verification — 2026-07-22

- `DEV_ALLOWED_ORIGINS` is now the single development allowlist consumed by
  both Next's `allowedDevOrigins` and request Host validation. Entries support
  comma-separated HTTP(S) URLs, hostnames, IPv4 addresses, and optional ports;
  normalization trims, deduplicates, lowercases hostnames, and removes ports.
  Wildcards, malformed entries, malformed Host headers, and unconfigured Hosts
  fail closed. Development defaults remain only `localhost` and `127.0.0.1`;
  production accepts only the hostname from `APP_PUBLIC_ORIGIN`.
- Next now loads the ignored repository-root `.env.local`, matching the API's
  environment location. The current WSL Host and loopback returned HTTP 200;
  an unconfigured Host returned HTTP 400. Fake credentials reached NestJS
  through `/api/v1/auth/login` and returned the required generic HTTP 401.
- Browser API calls remain same-origin `/api/v1`; the internal API remains
  `http://127.0.0.1:3001/api/v1`. Proxy tests verify body, status, safe headers,
  `Set-Cookie`, and no-store behavior. API authentication/session integration
  passed with `ALLOW_DEV_AUTH=false`.
- Diff, lint, typecheck, focused tests, full tests (API 56/56, web 40/40,
  document service 1/1), production build, and formatting passed. The five
  Playwright Login checks could not launch because the host lacks `libnss3.so`;
  installing browser libraries requires unavailable sudo authorization. No
  credential was reset or disclosed, no Sprint 2 work was started, and nothing
  was committed or pushed.

## Emergency CSP, Login, same-origin API, and LAN repair — 2026-07-22

- Root cause: the sole web CSP in `apps/web/next.config.ts` used static
  `script-src 'self'`, blocking Next.js inline bootstrap, `self.__next_r`
  initialization, hydration, Login submission, and password-toggle handlers.
  The unhydrated form then posted natively to the browser-visible
  `localhost:3001`, which both violated `form-action 'self'` and could not work
  from another LAN device.
- Web CSP now has one owner in `proxy.ts`. Development permits the minimum
  Next runtime exceptions (`unsafe-inline`, `unsafe-eval`, and development
  WebSockets) without forced HTTPS. Production dynamically renders all pages,
  creates a cryptographically random per-request nonce, applies it before
  rendering and to the response CSP, uses `strict-dynamic`, and excludes
  `unsafe-eval`.
- Browser API calls now use relative `/api/v1`. A closed Next.js route handler
  forwards allowlisted Galaxy OS paths to server-only
  `http://127.0.0.1:3001/api/v1`, preserves method/body/status/safe headers and
  `Set-Cookie`, enforces no-store, and returns a generic 502 on connection
  failure. NestJS binds to `127.0.0.1:3001`; browser CORS was removed.
- Login remains a controlled POST form with a same-origin native fallback,
  field validation, exact generic invalid/server messages, an accessible live
  alert, repeat-submit prevention, safe redirects, and no credential URL or
  browser storage. Password visibility is local state with an explicit
  `type="button"`, accurate label, `aria-pressed`, keyboard support, and value
  preservation.
- Next development binds `0.0.0.0:3000`. Host acceptance and Next development
  origins use `APP_PUBLIC_ORIGIN` and `DEV_ALLOWED_ORIGINS`; only port 3000
  needs trusted-LAN exposure. Windows firewall and WSL NAT portproxy remain
  explicit operator configuration.
- Browser regression passed 5/5 in development. Production browser execution
  passed with no CSP, `self.__next_r`, or hydration errors; two HTTP requests
  had distinct nonces and rendered scripts carried the matching nonce. Focused
  web unit/proxy/CSP tests passed 25/25. Authentication passed 10/10 three
  consecutive times with `ALLOW_DEV_AUTH=false`; the full suite passed API
  56/56, web 25/25, and document service 1/1. Lint (two existing image
  advisories), typecheck, production build, format, diff, Prisma
  generate/validate/status, and local header/network checks passed.
- Ponytail review found no removable complexity. The external Codex review was
  blocked because it would disclose the private uncommitted diff to an
  untrusted service; local correctness/security review instead fixed
  production use of development hosts, stale Login messages, CurrentActor 401
  classification, nested secret-bearing return paths, and cross-origin BFF
  mutations. All checks were rerun afterward.
- The credential previously exposed in a URL remains compromised and must be
  rotated by the operator using the hidden-input reset workflow. No credential
  was copied into code, tests, logs, or documentation. No Sprint 2 work was
  started and nothing was committed or pushed.

## Critical Login credential exposure remediation — 2026-07-21

### Incident and root cause

- A plaintext password was exposed through a browser-native GET Login request
  and must be rotated. No credential or secret-bearing request is reproduced
  here.
- The Login form relied on its hydrated React submit handler but omitted an
  explicit HTML method. Before hydration or when client JavaScript failed, the
  browser defaulted to GET and serialized the named controls into the URL. That
  bypassed the API call, visible error handling, session creation, and redirect.
- A second confirmed redirect-loop cause scoped the session cookie to the API
  path, so Next middleware could not receive it on protected page requests.

### Remediation

- Login is now a controlled accessible form with an explicit POST fallback to
  the Login API. Hydrated submission prevents the native request and sends a
  JSON body with `credentials: include`; credentials are never copied into
  navigation state or browser storage. Repeated submission is disabled and a
  failed attempt clears the password field.
- `POST /api/v1/auth/login` remains the only authentication endpoint. It
  accepts a length-bounded validated body, normalizes email, rejects all query
  parameters, returns the same Vietnamese 401 response for unknown, inactive,
  locked, or invalid accounts, applies the existing IP/account protections,
  updates login state, creates an opaque hash-only server session, and writes
  secret-free success/failure audits. GET Login API requests do not
  authenticate.
- The session cookie is HttpOnly, SameSite=Lax, Secure in production, has an
  explicit expiry and root path, and has no Domain. API JSON contains no token.
  The root path lets same-host Next middleware receive the cookie; deployments
  must keep web and API on a shared cookie host or use a reviewed same-origin
  proxy.
- Login now distinguishes the required generic invalid-credential message from
  the required safe network/server message, exposes it through an alert, clears
  it on resubmission, and keeps it out of the URL. Required email, email format,
  and required password errors are field-associated and visible. Session-expired
  state is a safe query flag.
- Successful Login reloads the current actor, sends mandatory-password-change
  users to `/account/change-password`, validates relative permission-compatible
  `returnTo`, rejects external and secret-bearing return paths, otherwise enters
  the authorized portal, and refreshes protected routing.
- Login GET accepts only `returnTo`, `reason`, and `sessionExpired`; middleware
  removes other fields before rendering. Central API redaction now covers
  credential-equivalent object fields, URL values, error stacks, exception
  response paths, and audit serialization. Authentication request bodies are
  not logged.
- Logout remains POST-only, revokes the server session, clears the exact cookie,
  clears frontend actor state after confirmed revocation, refreshes no-store
  routes, and redirects to Login. Old cookies return 401 and protected routing
  prevents cached server data from being restored.

### Regression and verification

- Added/expanded web regression coverage for POST-only JSON submission, URL
  secrecy, native fallback safety, Enter-compatible form submission, password
  input behavior, generic visible errors, safe redirects, authenticated Login
  redirect, forced password change, and protected routing.
- Added/expanded API coverage for GET/query rejection, generic failures,
  session creation/current actor, HttpOnly/Secure/root-path cookie behavior,
  hash-only storage, audit secrecy, logout cookie clearing/revocation, old-cookie
  denial, and centralized application-log redaction.
- Authentication integration passed 12/12 three consecutive times. Focused web
  Login/middleware passed 11/11 three consecutive times. Full verification
  passed API 56/56, web 19/19, and document service
  1/1, plus diff check, format, Prisma generate/validate/status, and production
  build. Lint and typecheck passed; lint retains two unrelated non-failing Next
  image advisories.
- Ponytail review found no removable complexity. Codex review found one nested
  secret-bearing `returnTo` path; middleware now removes it before rendering.
  Local correctness/security review also verified complete Login-query
  rejection, error-stack redaction, and fail-closed frontend logout behavior.

### Rotation status and remaining risk

- Rotation is mandatory and pending operator execution of the approved hidden-
  input `pnpm admin:reset-password` command. Automating an undisclosed password
  would leave no operator able to use it. The command forces password change,
  revokes sessions/reset tokens, and clears failed-login state. The compromised
  password must not be used again.
- Browser-developer-tools verification with the operator-known replacement
  password remains pending. Automated integration verifies the same POST,
  cookie, current-actor, forced-change, logout, and old-session denial flow.
- Shared-host cookie deployment must be verified outside localhost. The existing
  process-local Login limiter remains development-only and must move to shared
  storage before multi-instance deployment. No Sprint 2 work was started and
  nothing was committed or pushed.

## Sprint 1 security audit — 2026-07-21

### Assessment and threat model

The audit traced password reset, login, recovery, cookie sessions, logout,
development auth, scoped authorization, final-administrator controls, audit
payloads, browser headers, Git contents, and dependencies against credential
disclosure, brute force, token theft/replay, CSRF, session theft/fixation,
cross-tenant access, privilege escalation, concurrent administrator removal,
and secret leakage. Initial rating: development-only; staging and production
blocked by one CRITICAL and multiple HIGH findings.

### Findings and remediation

- The local reset utility now refuses production, defaults the documented
  email, accepts only an existing active protected `system_admin` with SYSTEM
  scope, hides and confirms TTY input, requires target confirmation, removes
  `ADMIN_TEMP_PASSWORD` from `process.env`, never repairs/creates an admin,
  and atomically changes the bcrypt hash, forces change, clears lockout,
  revokes sessions/reset tokens, and writes a secret-free audit. Controlled
  noninteractive tests require matching `ADMIN_CONFIRM_EMAIL`.
- Password minimums were raised from 12 to 15 characters across API and web.
  Existing storage remains bcrypt with configurable 12 rounds (4 only in
  tests), unique library-generated salts, and a hard 72 UTF-8-byte limit.
  This is not the desired >=64-character passphrase support or Argon2id and
  remains a production blocker.
- Login now adds process-local IP throttling while preserving generic invalid
  credentials. Account lockout remains five failures for 15 minutes. Redis or
  another shared limiter is required before multi-instance staging/production.
- Sessions use 32 random bytes, store SHA-256 token hashes only, expire
  absolutely, revoke server-side, and now enforce a 60-minute configurable
  idle timeout with activity writes throttled to five minutes. The cookie is
  HttpOnly, SameSite=Lax, Secure in production, expires explicitly, and is
  scoped/cleared at `/api/v1` with matching attributes.
- Logout revokes the session, clears the exact cookie, clears frontend actor
  state, refreshes no-store routes, redirects to `/login`, and the old cookie
  receives 401. Development auth is production-rejected, explicitly selected,
  and now loopback-only; it remains unsuitable for staging.
- Recovery uses a 32-byte random single-use token, stores only SHA-256, expires
  in 30 minutes, serializably claims once, revokes other tokens and sessions,
  clears lockout, sends a password-change notice, uses configured
  `APP_BASE_URL`, and now scrubs the token from browser history. Request rate
  limiting remains process-local.
- Unsafe methods reject cross-origin browser requests, including public auth
  mutations. SameSite=Lax remains defense in depth. Missing Origin/Referer is
  still accepted for non-browser clients; a synchronizer token is required if
  deployment becomes cross-site.
- Production startup now requires HTTPS web/application URLs. API and Next
  responses add no-store, CSP/frame-ancestors, nosniff, no-referrer, and a
  restrictive Permissions-Policy; API HSTS is production-only.
- Scope/tier/delegation and protected-target tests pass, but final-admin checks
  are count-based Serializable transactions without a shared row/advisory lock
  across every viability-removal path. Recent-authentication/step-up for peer
  System Administrator reset is also absent. Both remain production blockers.
- `.env.local` and `.local/` are ignored. A reachable-history pattern scan
  found no private/cloud key signature; ignored environment values were not
  printed. No committed secret requiring rotation was identified.
- Dependency audit initially reported 17 advisories including two critical
  Vitest paths. Vitest was patched to 3.2.6 and direct PostCSS to 8.5.10. The
  final audit reports 14 transitive advisories: 5 high, 7 moderate, 2 low in
  Prisma tooling, Nest CLI, Swagger, Next's bundled PostCSS, and build tooling.
  No major upgrade was applied automatically.

### Verification evidence

- `git diff --check`, lint, typecheck, full tests, build, and format check pass.
  Full results: API 53/53, web 13/13, document placeholder 1/1. Lint has two
  non-failing existing Next image advisories.
- Compose config succeeds; PostgreSQL, Redis, and Mailpit are healthy. Prisma
  generate/validate/status/seed pass; all nine migrations are applied.
- With `ALLOW_DEV_AUTH=false`, auth plus Sprint 1 integration passed three
  consecutive runs, 27/27 each. Focused reset tests pass 7/7.
- Ponytail complete-diff review: `Lean already. Ship.` External
  `codex review --uncommitted` was rejected by tenant policy because it would
  transmit the private diff to an untrusted service; the local security review
  corrected production CSP origin, loopback dev-auth, reset-token history,
  cookie path, and session idle handling.

### Security control matrix

| Security control        | Implementation evidence                                                      | Test evidence                 | Status              | Production blocker |
| ----------------------- | ---------------------------------------------------------------------------- | ----------------------------- | ------------------- | ------------------ |
| Admin CLI reset         | Protected SYSTEM target, hidden input, confirmation, atomic revocation/audit | 7 reset integration tests     | PASS                | NO                 |
| Password hashing/policy | bcrypt 12, unique salt, 15 chars, 72-byte ceiling                            | auth/reset tests              | PARTIAL             | YES                |
| Login abuse resistance  | generic errors, account lock, process IP limit                               | auth integration              | PARTIAL             | YES                |
| Session/cookie/logout   | hash-only opaque token, idle/absolute expiry, exact cookie clear             | auth integration              | PASS                | NO                 |
| Forgot password         | hashed 256-bit token, expiry, serializable single use, revocation            | auth integration              | PARTIAL             | YES                |
| Development auth        | false default, production rejection, explicit loopback selector              | env/auth integration          | PASS for local only | YES                |
| CSRF/origin             | SameSite=Lax plus trusted Origin rejection                                   | cross-site auth test          | PARTIAL             | YES                |
| Authorization/scope     | global guards, target policy, tenant/department/tier ceilings                | Sprint 1 integration          | PASS                | NO                 |
| Final administrator     | protected sequential paths, Serializable transactions                        | integration tests             | PARTIAL             | YES                |
| Audit/log secrecy       | selective secret-free auth/reset audit payloads                              | reset output/audit assertions | PARTIAL             | YES                |
| Browser/TLS headers     | CSP, frame denial, nosniff, no-referrer, no-store, HTTPS validation          | build/env checks              | PARTIAL             | YES                |
| Secret/Git hygiene      | ignore rules and reachable-history signature scan                            | manual command evidence       | PASS                | NO                 |
| Dependency security     | Vitest/PostCSS patched; 14 transitive advisories remain                      | `pnpm audit`                  | PARTIAL             | YES                |

### Residual readiness

Local development is acceptable on a trusted workstation, preferably with
`ALLOW_DEV_AUTH=false` for real-login verification. Staging and production are
blocked until Argon2id/long-passphrase support, shared rate limiting,
recent-authentication or step-up for high-risk administrator resets,
transaction-safe final-admin locking, centralized audit/log redaction,
deployment-specific CSRF/TLS validation, and remaining HIGH dependency
advisories are resolved. Sprint 2 was not started; nothing was committed or
pushed.

## Current sprint

Sprint 1 — Organization, departments, users, roles, permissions, and audit logs on branch `feat/sprint-1-identity-access`.

## Completed work

- UUID PostgreSQL identity/access schema, reviewed migrations, partial unique primary-department constraint, and deterministic idempotent Galaxy Centre seed
- Galaxy Centre organization; 11 approved departments; 20 Sprint 1 permissions; 11 approved system roles; and a local administrator seeded from `DEV_AUTH_USER_EMAIL`
- NestJS `CurrentActor` development-auth boundary, explicit permission guards, organization-scoped queries, strict DTO validation, transaction-coupled append-only audits, and safe conflict responses
- Protected `/me`, organization, department, user, role, permission, and audit-log API endpoints with Swagger at `/docs`
- Last-active-administrator protection, system-role protections, cross-organization assignment checks, disabled user/membership denial, and no user/department/role/audit hard-delete API routes
- Vietnamese Settings pages for organization, departments, users, roles, and audit logs with permission-aware controls and accessible native forms
- Focused service, guard, API integration, and web behavior tests; CI now starts PostgreSQL, deploys migrations, and seeds before verification
- Required Sprint 1 documentation, local development-auth instructions, migration/seed procedure, and audit behavior documentation

## Work in progress

Sprint 1 enterprise completion is under final verification. The implementation now includes hierarchical organizational units, explicit scoped role assignments, protected system and organization settings, metadata custom fields, named per-user access profiles, access preview, expanded authority seed data, and direct representative-account tests. Git publication remains blocked until every required check and review finishes.

## Local System Administrator reset — 2026-07-21

- Verified that `admin@galaxy.local` exists as an active Galaxy Centre member with SYSTEM administration scope, an active protected SYSTEM-scoped `system_admin` assignment, all 52 current permissions, and an existing credential.
- Hardened `pnpm admin:reset-password` to accept only environment input, restore only the canonical seeded administrator through the idempotent seed when required, force password change, clear lockout state, revoke sessions/reset tokens, and write a secret-free audit record.
- Focused reset tests passed 7/7; full API 52/52, web 13/13, and document service 1/1 tests passed. Diff check, lint, typecheck, build, Prisma generate/validate/status, Ponytail review, and correctness review passed.
- The reset was not executed because `ADMIN_TEMP_PASSWORD` was not exported in the operator process. No password was invented, printed, or stored.

## Enterprise IAM extension — 2026-07-21

- Added forward-only migrations for assignment scopes, hierarchy metadata, role category/scope ceilings, safe JSON custom data, settings, custom-field definitions, and least-privilege SELF assignment defaults. Existing identities, memberships, departments, and roles were preserved.
- Added SYSTEM, ORGANIZATION, DEPARTMENT, and SELF assignment evaluation. Active role plus explicit managed-unit assignment is required for department management; optional child scope is expanded from the organization tree.
- Added system organization/settings/audit boundaries, organization settings, system-controlled permission metadata, organizational cycle/archive checks, custom-field validation and visibility/editability policy, named access-profile lifecycle, and access preview.
- Extended the UI with organizational tree/list controls, role metadata and permission search, system configuration and organization visibility, custom-field management, direct one-time temporary-password display, managed-scope/custom-field/access-preview tabs, and the access-profile checklist.
- Focused authentication plus Sprint 1 integration passed 26/26, and the expanded Sprint 1 file passed 18/18. One full repository run reproduced the documented Vitest five-second harness anomaly in two tests whose bodies completed in 45 ms and 243 ms; no timeout was increased. Final repeated and full verification remains pending.

## Users administration redesign — 2026-07-21

- Replaced the dense per-user editor cards with a concise responsive table whose default columns are Username, Name, Email, and Role. Optional department, status, last-login, membership, and created columns remain local UI state because no preference architecture exists.
- Added URL-preserved backend search, scoped filters, stable sorting, 25/50/100 pagination, scope context, loading/error/empty states, and pointer/keyboard row actions.
- Added separate create, read-only View, and section-specific Edit routes under the existing `/settings/users` route family.
- Split the API list from detail selection. The summary excludes credentials, capabilities, sessions, audit history, full membership records, and role-permission graphs. Capabilities, safe sessions, and target audit are separate lazy requests.
- Kept backend permission, organization/managed-department scope, target authority, delegation ceiling, and final-administrator policy as the source of truth. Capabilities remain role-sourced and read-only.
- Retention decision: no hard-delete API. Disable revokes sessions and retains identity, membership history, ownership, and audit attribution; permanent deletion is unsafe under the current Sprint 1 relationships.
- No database migration or dependency was added.
- Verification passed: `git diff --check`, lint (two pre-existing non-failing image advisories), typecheck, API 44/44, web 13/13, document placeholder 1/1, production build, format check, Prisma validate/generate/status, and idempotent seed. Three consecutive Sprint 1 integration runs passed 13/13 before the final local review, and the post-review full suite passed 13/13; additional repetition reproduced the repository's known five-second harness anomaly despite sub-two-second file runtimes, so no timeout was increased.
- Ponytail diff review removed the unused list avatar selection/response (`net: -3 lines possible`; no dependency or abstraction findings). Local correctness review removed role-permission graphs from general detail, constrained manager filter values, and fixed status URL state. `codex review --uncommitted` was requested but execution policy rejected transmitting the private diff to an untrusted external service; no workaround was attempted.
- Remaining limitations: no bulk-action API/UI, no hard delete because retained audit/ownership identity makes it unsafe, no administrator-specific per-session revocation, no audit actor/date filter UI, column choices are not persisted without an existing preference mechanism, and representative browser accounts were not manually exercised in this run.

## Local administrator recovery — 2026-07-20

- Added the root `pnpm admin:reset-password` command for non-production local recovery using `ADMIN_TEMP_PASSWORD`, the configured administrator email, existing bcrypt settings, and a single audited transaction.
- The command preserves the active protected administrator assignment, forces first-login password change, clears lockout state, and revokes sessions and outstanding reset tokens without printing credentials.
- Focused command tests cover production, missing-secret, unknown-user, hashing, output secrecy, forced change, revocation, and preservation of identity, membership, roles, and permissions.
- Verification passed: lint (two existing non-failing image advisories), typecheck, API 44/44, web 10/10, document placeholder 1/1, production build, format check, and diff check. A live `ALLOW_DEV_AUTH=false` run verified temporary-password login, forced change, successful change, temporary-password rejection, replacement-password login with system-administrator permissions, and logout invalidation; generated verification passwords were held only in memory and not logged.

## Delegated administration and recovery — 2026-07-20

- Added explicit administration scope, tenant-constrained managed departments, protected/delegable role metadata, administration tiers, and one shared target-user policy.
- Added generic forgot-password handling, hashed expiring single-use reset tokens, SMTP/Mailpit delivery, administrator reset email, server-generated temporary passwords, forced change, and session invalidation.
- Removed implicit development authentication: the flag alone no longer recreates a logged-out actor; an explicit request selector is required and production rejects the feature.
- Added self-session controls, scoped audit history, permission-and-scope-aware Users navigation, recovery pages, representative manager/employee seed records, and two additive migrations.
- Focused delegated-administration (13/13) and authentication/recovery (8/8) integration files passed three consecutive final runs. Full verification passed: API 40/40, web 10/10, document placeholder 1/1, lint (two existing non-failing image advisories), typecheck, format, build, diff check, Compose config/healthy services, Prisma validate/generate/status, migrations, and idempotent seed.
- Live `ALLOW_DEV_AUTH=false` checks passed reset email through Mailpit, reset completion, new-password login, `/me`, logout, old-session 401, and generic unknown-email response. Explicit development auth separately returned 401 without its selector and a scope-safe managed-department user list with it.
- Ponytail review reported `Lean already. Ship.` Local correctness review fixed production mail configuration validation, forgot-password timing, dual IP/account rate limiting, target-specific frontend actions, scoped audit retrieval, assignment controls, and user filters. External `codex review --uncommitted` was attempted as requested but tenant policy rejected private-diff transmission; no workaround was attempted.

## Real authentication and personal accounts — 2026-07-20

- Login/session architecture: normalized immutable email plus bcrypt credential (12 rounds by default), five-failure temporary lockout, 32-byte opaque tokens, SHA-256 token hashes in PostgreSQL, explicit expiry/revocation, and an HttpOnly/SameSite=Lax cookie that is Secure in production. `ALLOW_DEV_AUTH=false` real login was verified live; the local fallback remains opt-in and production-rejected.
- Route behavior: Next middleware resolves `/me` before protected pages render or fetch, carries only safe relative `returnTo` values, rejects unauthorized deep links at `/forbidden`, and forces first-login sessions to password change. The shared portal and action controls derive from effective permissions; personal Home/Profile/Change Password/Logout remain available to every normal authenticated actor.
- Personal account: `/account/profile` exposes the login email read-only, edits only the current user’s normalized display name, and uploads/replaces/removes JPEG/PNG/WebP avatars up to 2 MB under the ignored configurable local storage path using generated keys. `/account/change-password` verifies the current password, rejects reuse and bcrypt overflow, clears `mustChangePassword`, revokes all sessions, and requires clean login.
- Administration: transactional user creation creates the immutable identity, credential, active organization membership, initial department/primary assignment, and roles; the temporary password is returned once. Users exposes membership, roles, effective permissions, security state, scoped audit history, reset-password, session-revoke, disable/reactivate, and action-specific controls. Disabling a user or membership revokes sessions. Final-administrator user disable, membership disable, and role removal return 409 under serializable protection.
- Audit coverage added for login success/failure, logout, profile/avatar/password changes, password reset, session revocation, user creation/reactivation, and existing membership/department/role changes; passwords, hashes, raw tokens, cookies, and avatar bytes are excluded.
- Migration `20260720090000_real_authentication` added `normalizedEmail`, avatar/last-login fields, `PasswordCredential`, and `Session`. Prisma validate/generate/migrate/status and idempotent seed passed; five migrations are applied and current. The seed creates a missing local credential only when ignored `DEV_SEED_PASSWORD` is supplied and never overwrites it.
- Tests: API 37/37, web 10/10, document placeholder 1/1; no skipped/todo tests or timeout increases. Authentication plus authorization integration files passed 18/18 three consecutive times. Live checks with development auth disabled verified Login 200, protected redirect 307, invalid login 401 generic, valid login 201, `/me` 200 without secrets, first-login administration 403, profile/avatar/password flows, logout 201, and old-session reuse 401.
- Full final commands passed: `git diff --check`, lint (two non-failing authenticated-avatar optimization advisories), typecheck, complete tests, production build, format check, Docker config/healthy services, Prisma validate/generate/status, and seed.
- Ponytail review applied three reductions: removed dead Settings navigation, removed an unused login result, and centralized route-permission mappings (`net: -24 lines`). Local correctness review fixed the immutable-status/final-admin bypass, disabled-session resurrection, unauthorized catalogue fetching, bcrypt byte limits/test cost, safe tenant 404s, duplicate department assignment, and 409 final-admin conflicts.
- Codex review: `codex review --uncommitted` was attempted twice. Sandbox initialization failed first; the required escalation was then rejected because sending the full private uncommitted diff to an external review service needs new explicit user approval after risk disclosure. No workaround was attempted.

## Sprint 1 completion audit — 2026-07-20

- Identity model: `User` is the global human identity and exposes only safe profile fields. Email is normalized and unique. Organization settings reject global identity edits/disables for users shared by multiple organizations; their organization membership must be disabled instead.
- Organization membership: `OrganizationMembership` is unique per organization/user, timestamped, status-bearing, visible in Users, and managed through permission-protected scoped endpoints. Creation, status changes, and status changes caused by account disable are audited. The final active administrator membership cannot be disabled.
- Department membership: `DepartmentMembership` is organization scoped, unique per department/user, timestamped, and limited by a partial unique index to one primary department per organization/user. Composite foreign keys require the organization membership and department to share its organization. Add/remove actions are audited separately and grant no permissions. Users manages assignments; Departments shows counts, members, and primary indication.
- Authorization flow: development auth resolves one unambiguous active user/organization membership; active organization roles supply a sorted unique union of permission codes; global Nest guards return 401 for an unresolved actor and 403 for missing permission; services derive scope from `CurrentActor` and use scoped lookups returning 404 for foreign records. Frontend visibility is usability only.
- Permission catalogue: 20 idempotently seeded stable codes cover organization, departments, users, memberships, roles, role assignment/archive, permission read/assignment, and audit read. Normal users cannot create arbitrary permission codes.
- Roles: organization-scoped assignments support multiple active roles. Duplicate assignments and same-organization membership/role references are database constrained. The Users page edits assignments and shows effective permissions; Roles shows permissions and assigned members. Inactive roles do not grant access.
- Final-administrator protection: serializable mutations prevent disabling the final active administrator account or membership and removing its `system_admin` role. System roles cannot be archived and `system_admin` permissions remain seed controlled.
- Audit coverage: organization, department, user, organization-membership, department-membership add/remove, role, role-permission, and role-assignment mutations write actor, organization, action, entity, timestamp, and safe before/after or metadata in the same transaction. Viewing requires `audit.read`.
- Local authentication: `ALLOW_DEV_AUTH` defaults false, is rejected in production, uses the normalized seeded email, rejects zero/multiple active memberships, and remains isolated behind the `CurrentActor` boundary for later replacement.
- Tests added/expanded: direct Nest API tests cover permitted and forbidden mutations, no-write/no-audit behavior on 403, department non-authorization, role grant/removal, multi-role union, disabled account/membership, cross-organization user/department/role rejection, mutation audits, role-permission changes, and all final-administrator mutation paths.
- Endpoint evidence: `POST /api/v1/departments` returns 201 for the seeded administrator and writes one `department.create` audit; the same endpoint returns 403 for an active actor lacking `department.create`, with unchanged matching department and audit counts. A department membership alone still returns 403; adding the permission through an assigned role returns 201; removing it returns 403. `GET /api/v1/departments/:foreignId` and `GET /api/v1/users/:foreignId` return 404, and foreign department/role assignment returns 400. `GET /api/v1/me` returns 401 for disabled users and memberships. The final administrator's user disable, membership disable, generic status change, and role removal are rejected. Department-membership, role-permission, membership-status, and department mutations are verified to create audit rows.
- Migrations: `20260720032423_department_membership_updated_at` adds the relationship update timestamp safely for existing rows; `20260720034500_enforce_membership_organization_scope` adds composite tenant foreign keys. The latter SQL was generated with `prisma migrate diff`, reviewed, deployed, and reported up to date. The disposable local database contained only deterministic seed/test artifacts and was reset with approval after Prisma detected the first new migration had been reviewed after local application; no shared data was reset.
- Commands run successfully: Prisma validate/generate/migrate/deploy/status, repeated seeds, Docker config/up/ps, lint, typecheck, format check, full test (`api 31`, `web 5`, document service `1`), production build, and `git diff --check`. Five isolated forbidden tests and three subsequent complete integration runs passed. Live API and all Settings routes returned HTTP 200. A production start with development authentication enabled failed at environment validation as required.
- Ponytail review: lean already; no dependency, abstraction, or required security/test code was removed. Correctness review fixed internal external-auth field exposure in user responses/audits, inactive-member effective-permission display, a generic-update final-admin bypass, ambiguous development tenant selection, and missing database tenant foreign keys.
- One anomalous repeated focused run reported a five-second timeout for a test whose measured body was 31 ms and whose file completed under one second. No timeout was increased; five isolated reproductions and three full integration reruns passed.
- Final acceptance rerun on 2026-07-20: `git diff --check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (API 31/31, web 5/5, document service 1/1), `pnpm build`, `pnpm format:check`, Prisma validate/generate/status, and Prisma seed passed. Three additional consecutive complete Sprint 1 API integration runs passed 12/12 each. No skipped, todo, only, flaky, explicit-sleep, or timeout-configured tests were found. Ponytail diff review reported `Lean already. Ship.` (`net: -0 lines possible`). The requested Codex uncommitted review remains unverified because the execution policy rejected disclosure of private uncommitted changes to its external review service pending explicit user approval.

## Sprint 1 integration timeout fix — 2026-07-18

- Root cause: Nest application initialization did not establish Prisma connections, so the first protected request (`GET /api/v1/me`) performed the development-auth guard's lazy database connection inside the five-second test budget. `PrismaService` now connects in `onModuleInit`, which `app.init()` already awaits, and still disconnects in `onModuleDestroy`.
- Changed `apps/api/src/prisma.service.ts` and `apps/api/test/sprint1.integration.test.ts`. The integration harness now restores its development-auth environment after every test/file so failures cannot leak actor selection or authentication settings.
- Reproduction before the fix: isolated target passed in 139 ms; the full integration file passed 6/6; ten repeated integration-file runs passed 60/60; and the full API suite passed 24/24. The timeout was not deterministic on the warm local database, but tracing confirmed the first request owned lazy Prisma initialization.
- Post-fix: isolated target passed in 55 ms; the full integration file passed 6/6 with the target at 54 ms; three consecutive full API suites passed 24/24 each; full repository tests passed (API 24, web 5, document service 1); lint, typecheck, and production build passed.
- Commands run: `docker compose up -d postgres`, `docker compose ps`, `pnpm db:migrate`, `pnpm db:seed`, the requested isolated and complete integration Vitest commands, ten repeated integration-file runs, one pre-fix full API run, three consecutive post-fix full API runs, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm format:check`, and `git diff --check`.
- Full-diff Ponytail review removed only the generated `apps/web/next-env.d.ts` build change. Correctness review separated environment restoration from database cleanup; no security, validation, audit, or organization-isolation behavior changed.

## Local environment fix — 2026-07-18

- Standardized local development on the ignored root `.env.local`; API development and all Prisma scripts load it through Node 20's native `--env-file-if-exists` support.
- Added root `db:generate`, `db:migrate`, `db:status`, and `db:seed` commands; removed the duplicate API environment example and the ineffective bootstrap `.env` loader.
- Kept development authentication disabled by default, normalized its configured email in Zod, and retained production rejection when it is enabled.
- `pnpm db:migrate` reported no schema changes, `pnpm db:status` reported two migrations and an up-to-date schema, and two consecutive `pnpm db:seed` runs succeeded. PostgreSQL contained exactly one `admin@galaxy.local` user afterward.
- `pnpm dev` started web on 3000 and API on 3001. API health, readiness, `/me`, `/departments`, and web health returned HTTP 200; `/me` resolved `admin@galaxy.local`, and `/departments` included all 11 seeded Galaxy Centre departments.
- Passed `docker compose config`, `docker compose up -d`, `docker compose ps`, Prisma validate/generate/migrate/status/seed, `pnpm lint`, `pnpm typecheck`, `pnpm test` (API 24, web 5, document service 1), `pnpm build`, `pnpm format:check`, and `git diff --check`.
- Full-diff Ponytail and correctness review found no removable application code or dependency. An unrelated generated `next-env.d.ts` build change was removed. Explicit production startup with development authentication enabled exited with the expected validation error.

## Verification results — 2026-07-17

Passed:

- `pnpm --filter @galaxy/api prisma:validate`
- `pnpm --filter @galaxy/api prisma:generate`
- `pnpm --filter @galaxy/api prisma:migrate --name sprint_1_identity_access` (created and applied `20260717155135_sprint_1_identity_access`)
- `pnpm --filter @galaxy/api prisma:deploy`
- `pnpm --filter @galaxy/api prisma:seed` (rerun successfully)
- `pnpm --filter @galaxy/api prisma:status` (two migrations, database schema up to date)
- `docker compose config` and `docker compose ps` (PostgreSQL and Redis healthy)
- `pnpm --filter @galaxy/api test` (21 tests: 6 integration, 15 focused unit/API tests)
- `pnpm --filter @galaxy/web test` (5 tests)
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` (API: 21, web: 5, document service: 1)
- `pnpm build`
- `pnpm format:check`
- `git diff --check`
- Runtime checks: web `/`, all five Settings pages, API `/api/v1/health`, `/api/v1/ready`, protected Sprint 1 lists, and `/docs` returned 200
- Security runtime checks: final system-admin disable returned 403; request-supplied `organizationId` was rejected with 400; production startup with `ALLOW_DEV_AUTH=true` rejected configuration

Resolved during implementation:

- The first API integration run exposed Vitest’s lack of emitted Nest constructor metadata. Explicit Nest injection tokens now make real HTTP integration tests reliable without adding a dependency.
- The integration audit list exposed raw query-string pagination in the same harness; the controller now safely coerces page values before Prisma use.

## Ponytail and correctness review

Complete. No dependency was added. Confirmed necessary code retained: direct Prisma transactions for assignment replacement/audit atomicity, explicit injection tokens for Vitest integration reliability, and test-only cleanup deletes. Removed ordinary organization status mutation because Sprint 1 has no organization-disable workflow. Added safe unique-conflict handling instead of exposing a 500.

## Remaining limitations

- Local avatar storage is single-host and not suitable for horizontally scaled or ephemeral production deployments; configure persistent shared storage when deployment requires it.
- Sprint 1 intentionally has no registration, identifier change, MFA, or social/passwordless login.
- Development authentication intentionally rejects users with multiple active memberships because it has no tenant selector; a future production identity provider must supply the active organization explicitly.
- Sprint 1 operates with the seeded Galaxy Centre organization, although the schema and membership APIs safely support additional isolated organizations.
- No Sprint 2 customers, projects, or other business-domain functionality has been started.
- External Codex review remains blocked pending explicit approval to transmit the private uncommitted diff.

## Next recommended sprint

Sprint 2: customers, contacts, leads, opportunities, projects, project members, tasks, and milestones, reusing the Sprint 1 `CurrentActor`, organization scope, RBAC, audit, migration, and Settings patterns.

## Node TLS edge — 2026-07-22

- Added the standalone `@galaxy/edge` TypeScript workspace package: HTTP ACME/redirect service, optional Node TLS 1.2+ termination, strict Host validation, local readiness with upstream status, HTTP/WebSocket proxying, fixed forwarding headers, safe 502 handling, structured metadata-only logs, and graceful shutdown.
- Added the ignored edge environment contract, runtime-path ignores, root edge scripts, and hardened non-root `infra/systemd/galaxy-edge.service` template. Router, Windows portproxy, certificates, secrets, and Sprint 2 remain untouched.
- `pnpm install` and `pnpm edge:check` passed; the socket tests required permission to bind temporary loopback listeners in the managed verification sandbox.

## 2026-08-11 — Inline Project Document Matrix and Stage 1 UX

Status: **focused slice complete; verified with one historical-format blocker**.

- Superpowers workflow: used `using-superpowers`, systematic debugging,
  approved-design reconciliation/brainstorming, writing plans,
  subagent-driven development, TDD, review fix rounds, requesting code review,
  and verification-before-completion. Ponytail full remained active.
- Reference: inspected the existing ignored authenticated captures and recorded
  the Stage 1 audit in
  `docs/project-system/PMS_STAGE_1_REFERENCE_AUDIT.md`. No reference credential
  was stored; a new interactive reference session could not be established.
- Stage 1: one connected workspace now renders the Project/stage header,
  five-stage switcher, Project selector and permission action, initiation form
  with navy routing panel, compact readiness/alerts, stage-wide inline matrix,
  five-step navigator, selected-step detail, compact selected-step documents,
  and applicable activity/approval content.
- Responsibility and completion: the exact responsibility field/copy is
  visible, corrective actions open/focus it, Save Draft remains permissive,
  Step 1 completion returns concise structured blockers, and successful
  completion refreshes in place.
- Documents/upload: the shared matrix owns its localized header, eight-column
  desktop table, completion policy, status/actions, inline native modal upload,
  real configured limits/progress/resume/retry/abort, current file, retained
  history, and authorized review decisions. Workflow mutations refresh matrix,
  step, readiness, routing, alerts, and activity without a page reload.
- Status semantics: ordinary incomplete documents and warning red flags keep a
  stage `IN_PROGRESS`; only an unresolved rejected `APPROVED`-policy document
  is a hard document blocker. `FILE_PRESENT` requires a linked current file;
  `APPROVED` requires approval across summary, submission, and gate.
- Navigation: document and finance corrections remain on Stage 1 with field or
  row anchors. Legacy `documents?stageKey=STAGE_1..5` links replace to each
  stage matrix, including requirement anchors; the archive remains available
  without a recognized stage key.
- Stage 2–5: existing roots reuse the shared stage-filtered matrix and inline
  upload. A genuinely uninitialized stage exposes the real idempotent stage
  initialization command; an initialized template with zero requirements shows
  a truthful no-applicable-documents state. No downstream workflow was added.
- Authorization: backend Project membership/permission/scope checks remain
  authoritative. Browser acceptance proves an outsider cannot read Project or
  file metadata/checksum/bytes or download the file. Finance data remains
  permission-filtered. Storage paths are not exposed.
- Reviews: independent correctness reviews found stale history responses,
  first-page-only Project selection, permissive approval-policy readiness, and
  a downstream dead initialization state; all were reproduced and fixed.
  Security/authorization review found no remaining Project-isolation, file,
  or finance disclosure defect. UX/reference review drove native modal
  behavior, async hash scrolling, the real hard-block comparison, and exact
  short stage labels. Ponytail review result: `Lean already. Ship.` — the slice
  reuses one matrix/uploader, native dialog/select/details, and existing API
  commands with no new dependency or speculative domain layer.
- Verification (fresh): Prisma format/validate/status pass; 49 migrations are
  current. Typecheck passes for API, Web, and Edge. Lint passes for all three
  workspaces plus document-service Ruff. API 521/521, Web 285/285, Edge 4/4,
  document-service 1/1, and Stage 1 Playwright 6/6 pass. API, Web, and Edge
  production builds pass using the documented non-secret production host/proxy
  variables. `git diff --check` passes.
- Visual acceptance: inspected the requested Stage 1/matrix/upload/history,
  Stage 2, forbidden, needs-action, and genuine hard-block states at 1536×864
  and 1440×900. The hard-block flow rejects the mandatory approval document,
  then uses a PM replacement and independent approver to recover. No page
  overflow, clipped critical control, raw code, or console error was found.
- Formatting blocker: every file in this focused slice passes Prettier. The
  repository-wide `pnpm format:check` still reports 29 files, all historical
  `.superpowers/sdd/2026-08-07-galaxy-project-pms-full-replacement-plan/**`
  snapshots. They were preserved rather than broadly rewritten.
- Deleted files: none. No migration, dependency, commit, tag, push, PR, or
  database reset was created by this run.
- Exact next task: proceed only under separate approval with Stage 2 business
  workflow expansion; it remains intentionally outside this slice.

## Stage 1 governance and Required Documents rebuild handoff — 2026-08-12

### Branch and Git state

- Branch: `feature/project-business-operations`, tracking
  `origin/feature/project-business-operations`; HEAD at verification was
  `7bec1e7d915a386a6fce29263612363bdfa11939`.
- The checkout remains intentionally dirty with 127 modified/untracked status
  entries spanning the user's existing Project work and this rebuild. No file
  was staged. No commit, tag, push, PR, reset, checkout, dependency change,
  seed, drop, truncate, or business-data cleanup was performed.
- Fresh `git diff --check` passed. Tracked `git diff --diff-filter=D` was empty.
  The obsolete untracked `apps/web/tests/browser/stage-one.spec.ts` deleted in
  Task 6 remains absent; no file was deleted in Task 7.

### Database and migrations

- Prisma schema format check and validation pass. Read-only migrate status,
  rerun with narrow localhost permission after sandbox P1001, reports **50
  migrations** and an up-to-date PostgreSQL schema.
- The additive governance migration
  `20260811103000_project_stage_one_governance` remains present. Task 7 did not
  create, apply, edit, or delete a migration and did not invoke migrate dev,
  create-only, deploy, db push, reset, seed, drop, or truncate.

### Reference audit and proven root causes

- The approved read-only audit remains
  `docs/project-system/PMS_STAGE_1_REFERENCE_AUDIT.md`, backed by the existing
  ignored reference captures and cutover evidence. No authenticated reference
  navigation was repeated and no credential was stored, printed, copied, or
  embedded.
- The prior product Flow 4 deep-browser navigation intermittently emitted a
  Next development `Performance.measure` negative-timestamp page error for the
  streamed `ProjectDocumentDetailPage`. Strict collection reproduced it. The
  regression now opens the canonical Stage 1 destination for UI work, then,
  after UI teardown, uses a disposable authenticated request context to assert
  the legacy response's HTTP 200 streamed `NEXT_REDIRECT` marker and exact
  canonical destination. No production route, global suppression, or timeout
  changed.
- Edge's first sandboxed suite failed `listen EPERM` and produced two cascading
  five-second timeouts. The identical narrowly permitted local-socket command
  passed 4/4; no timeout changed.
- The repository-supported document-service venv exists, but its one pytest
  hangs in Starlette `TestClient.get('/health')`. The direct async endpoint
  returns the expected payload; a five-second faulthandler trace locates the
  wait in the AnyIO blocking portal/TestClient transport. This remains an exact
  environment/dependency blocker, not a passing test.

### Governance and Step 1

- Stage 1 has one server-owned governance model: one principal, normalized
  coordinators, a 1000-character responsibility note, bounded active-member
  resolution, policy-derived approvers, correction history, audit behavior,
  and backend authorization.
- The compact governance editor preserves mutation/refetch truth, clears stale
  success state on ordinary Edit, focuses exact correction fields, and now
  associates principal/coordinator/note validation messages through native
  `aria-invalid` and `aria-describedby` controls. The accessibility regression
  was RED, then the focused real lifecycle passed 1/1.
- Step 1 returns and renders the authoritative completion checklist, corrects
  the real governance control without reload, and completes only after the
  missing responsibility condition is remediated.

### Required Documents, applicability, UI, upload, versioning, and N/A

- One stage-wide grouped Required Document matrix owns applicability, localized
  status, completion policy, owner/due state, direct and overflow actions, and
  canonical/legacy deep anchors. Its loader fetches every page and deduplicates
  requirement IDs; the evidence wording now matches the actual 101-row test.
- `FILE_PRESENT` and `APPROVED` semantics match server readiness. Upload uses
  the existing resumable session/FileAsset path with configured constraints,
  progress, resume, cancel, completion, submission, rejection/re-upload, and
  terminal-versus-transient cleanup. Current and prior versions remain
  downloadable and approved-document/history immutability is preserved.
- N/A requires and persists a reason, updates progress/readiness without a full
  reload, and can be restored. No second uploader, document model, state
  machine, dependency, or Stage 2–5 business workflow was introduced.

### Red flags, readiness, approval, and gate

- Warning red flags remain actionable without falsely blocking the stage. An
  unresolved rejected approval-policy document is a hard blocker.
- The shared readiness card derives its prop type from the existing Project
  shell source of truth. Submission eligibility remains server-owned,
  permission-filtered, and resolver-selected; approval removes the hard block
  and closes the Stage 1 gate without making Stage 2 workflow claims.

### Authorization, routes, responsive UI, and deleted files

- Backend Project membership, permission, organization scope, file metadata,
  and download checks remain authoritative. The outsider browser/API contract
  denies discovery and direct history/file access without leaking IDs, names,
  filenames, bytes, checksums, storage, size, or fixture-user metadata.
- `/projects/:projectId/stage-1` is the canonical workspace. Stage-qualified
  legacy document routes and historical hashes resolve to canonical document
  anchors. Bare `/documents` remains an explicit read-only archive and does not
  compete with Stage 1 mutation/completion.
- Final configured acceptance covers 1536x864, 1440x900, 1280x800, and 390x844.
  Page width stays inside each viewport; mobile initial Project content is
  visible without auto-scroll; native details, dialogs, labels, focus, and
  actions remain usable.
- Task 7 removed no files. Task 6's superseded mocked
  `apps/web/tests/browser/stage-one.spec.ts` remains absent after its contracts
  were proven in the real suite and focused tests.

### Exact fresh tests, builds, and visuals

- Prisma: format check passed; validate passed; migrate status passed with
  50/50 migrations current after narrow localhost escalation.
- Typecheck: API, Web, and Edge each passed. Root lint passed with zero errors;
  final Web lint retained one unrelated `account/profile` `<img>` warning.
- Focused API governance/rules/approval/document/upload/file-auth/HTTP suites:
  **11 files, 322/322 passed**. Focused Web document/governance/readiness/route
  suites: **9 files, 233/233 passed**. Post-Minor focused Web: **2 files,
  75/75 passed**.
- Full tests: API **46 files, 559/559**; Web **23 files, 325/325**; Edge
  **1 file, 4/4** after the unchanged local-socket rerun. Document service:
  **1 collected, 0 completed, blocked by the TestClient/AnyIO hang**.
- Browser: final Stage 1 configuration **11/11 passed, 0 failed, 0 skipped in
  2.6 minutes**. Final product baseline **4/4 passed, 0 failed, 0 skipped in
  57.9 seconds**, with strict Flow 4 pageerror/error-console count **0**. Two
  immediately preceding final-structure baselines also passed 4/4 in 57.4 and
  57.8 seconds with strict error count 0.
- Production builds: API and Edge passed. Final Web build passed with only
  `TRUST_PROXY=true`, `APP_PUBLIC_ORIGIN=https://os.example.com`, and relative
  `NEXT_PUBLIC_API_URL=/api/v1`; compile 5.7 seconds, TypeScript 9.1 seconds,
  and **77/77** static pages generated.
- The repository-wide `pnpm format:check` is not green: it exits 1 on **36
  preserved plan/snapshot files**, with no application source in the reported
  list. All Task 7 touched source/tests and the corrected Task 4 report pass a
  targeted Prettier check.
- After the final browser run, the fresh desktop governance-edit capture and
  the 390x844 initial-dashboard and responsive-document captures were reopened.
  Controls and copy are legible, hierarchy is stable, initial mobile content is
  visible, and no root horizontal overflow or secret is visible.

### Handoff classifications

- **COMPLETE:** the approved Stage 1 governance, Step 1 completion,
  applicability-aware Required Document matrix, resumable upload/version/N/A,
  readiness/red-flag/approval/gate, authorization, canonical route cutover,
  and responsive browser acceptance scope. API, Web, Edge, and browser evidence
  above is fresh.
- **REUSABLE_FOUNDATION:** Project shell and five-stage navigation; governance
  and approver resolution; canonical Required Document/FileAsset/upload/history;
  readiness/approval/activity/notification; backend Project/file authorization;
  localized labels; deterministic safe browser fixtures.
- **PARTIAL:** repository-wide Definition of Done and final merge readiness are
  not COMPLETE because document-service pytest is blocked, repository-wide
  Prettier remains red on 36 preserved evidence files, and the controller's
  independent whole-working-tree review is still pending.
- **NOT_STARTED:** Stage 2 planning/Product/BOQ/review workflow; Stage 3
  commercial/supplier/contract/PO/PI; Stage 4 production/logistics/inventory/
  installation/payment/log; Stage 5 acceptance/handover/settlement/archive/
  warranty. Existing Stage 2–5 roots are access/document foundations only.
- **BLOCKERS:** document-service TestClient/AnyIO hang; 36 historical/evidence
  Prettier failures; pending independent whole-tree review. No Stage 1 product,
  schema, migration, authorization, or browser blocker was found by Task 7.

### Ponytail, correctness, security, authorization, and UX reviews

- Ponytail full removed the unused `projectId` matrix-action prop and duplicate
  readiness shape; it retained necessary test-double casts, legacy adapters,
  validation, audit, authorization, accessibility, and data-loss controls.
- Correctness review covered pagination/deduplication, applicability, status
  parity, mutation/refetch truth, upload terminal states, versions, readiness,
  approval/gate, compatibility routes, and deterministic teardown.
- Security/authorization review found no new frontend-only authority, secret,
  cross-Project response, unsafe fixture cleanup, or approved-document mutation.
- UX/reference review covered exact Vietnamese copy, responsive hierarchy,
  action density, hashes/focus, native modal/details behavior, error association,
  initial mobile visibility, and final visual reopening.
- The requesting-code-review package is prepared for the controller: full dirty
  working tree at HEAD `7bec1e7d915a386a6fce29263612363bdfa11939`, Task 7 brief,
  approved implementation plan, progress ledger, Tasks 1–7 reports, exact
  failures/blockers above, and no commit range substitution for untracked work.

### Exact next task

The controller should dispatch the required independent read-only whole-working-
tree review against the approved Stage 1 design/plan, resolve every proven
Critical or Important finding test-first, and rerun only affected plus required
final checks. After review acceptance, address the document-service and
historical-format blockers or record an explicit waiver before any merge
decision. Do not begin Stage 2–5 business work without separate user approval.

## Post-review Stage 1 final-verification amendment — 2026-08-12

- Independent whole-working-tree review and two TDD fix waves are complete.
  Review fixes narrowed Required Document PATCH input, made governance the sole
  responsibility-note writer, persisted/audited current upload versions,
  retained superseded requirements in readiness/submission/gate queries,
  aligned the server DOCUMENTS readiness card and compact action hierarchy,
  removed the duplicate matrix refetch, and made direct same-file linking
  idempotent. The final read-only re-review found no Critical or Important
  finding.
- Final visual inspection found one additional proven responsive defect:
  Tailwind scanned `app/**` but not the Stage document components in
  `features/**`, so desktop rendered mobile labels and hid semantic headers.
  A browser regression failed at 1536×864, 1440×900, and 1280×800; the minimal
  content-glob fix now passes the desktop/mobile visibility contract at all
  four configured viewports without a CSS workaround.
- Fresh current-source verification: focused API **326/326**, full API
  **563/563**, focused Web **238/238**, full Web **330/330**, Edge **4/4**,
  Stage 1 Playwright **11/11 in 2.4 minutes**, Product Playwright **4/4 in
  57.4 seconds**, and the separated mock-fixture browser baseline **6/6 in
  17.1 seconds**. Root typecheck and lint pass. The final production Web build
  compiled in 5.6 seconds, completed TypeScript in 9.3 seconds, and generated
  **77/77** pages. API and Edge production builds passed earlier on the same
  current API/Edge source.
- Final screenshots show the grouped five-column desktop table, stacked mobile
  cards, one primary action, overflow secondary actions, v1→v2 history,
  in-page upload, and forbidden state without horizontal page overflow or
  protected metadata. All requested viewport families were regenerated and
  inspected.
- Application classification is **COMPLETE** for the approved Stage 1 slice.
  Repository-wide merge readiness remains **PARTIAL** only because the inactive
  document service's single Starlette TestClient/AnyIO pytest still hangs and
  `pnpm format:check` still reports 36 preserved plan/evidence files. The fresh
  authenticated reference login also remained unavailable to automation; no
  credential was stored or exposed.
- No commit, tag, push, PR, database reset, seed, drop, truncate, dependency
  addition, applied-migration rewrite, or business-data deletion was performed.
  Stage 2–5 business workflow expansion remains **NOT_STARTED** by design.

## Simplified Stage 1 and multi-file browser handoff — 2026-08-12

- Branch remains `feature/project-business-operations`; the shared working
  tree remains intentionally dirty and unstaged. Task 5 made no commit, tag,
  push, PR, reset, seed, drop, truncate, dependency change, or applied-
  migration edit.
- Fresh `pnpm db:status` reports **53 migrations found** and the PostgreSQL
  schema up to date. The three new migrations are additive Stage 1 document,
  upload-target, and upload-idempotency changes; the database was never reset.
- Primary `/projects/:projectId/stage-1` now exposes only the Stage header,
  scoped Project context, exact four-field initiation form, one idempotent
  initiation/approval CTA, five URL-selected steps, one selected-step detail,
  one multi-file uploader, and one actual-document list.
- Proven upload roots were repaired end to end: the former single-file
  `files[0]` state was replaced by a bounded per-file queue; stable Step identity
  prevents a successful-sibling refetch from erasing failures; the existing
  UploadSession/FileAsset finalizer now targets logical Stage 1 documents and
  appends immutable versions/current links in a short transaction.
- The simplified completion policy no longer gates on hidden governance,
  Responsibility Notes, preliminary finance, legacy survey/proposal fields,
  Red Flags, or all 12 legacy Required Documents. All five steps completed in
  the real browser flow after the configured named documents and real pending
  approval decision; Step 5 completed Stage 1 without a Stage 2 redirect.
- Authorization browser evidence covers outsider Project/metadata/history/
  session/download denial, ordinary-member on-behalf rejection, authorized
  Project-administrator nomination, and distinct actual/nominated identities
  in protected version history.
- Legacy initiation/survey/requirements/approval links use native Next
  redirects to Steps 1/2/3/5. The native table fixed an intermittent Next-dev
  `Performance.measure` error produced by repeated streamed server-component
  redirects. Stage-qualified document links resolve the real Step/anchor; the
  bare Project document archive remains separate.
- Browser TDD began with the obsolete spec failing on its retired no-query
  Stage 1 anchor. Final simplified acceptance is **12/12 passed** across
  `1536×864`, `1440×900`, `1280×800`, and `390×844` in 1.6 minutes. The full
  configured Project baseline is **16/16 passed** in 1.9 minutes. Focused Web
  Stage 1 is **27/27 passed**, fixture cleanup safety is **3/3 passed**, and Web
  typecheck passed.
- Seventeen final ignored captures under `.artifacts/stage-1-simple/` were
  opened at original detail. Visual inspection found and fixed one stretched
  funding selector, then regenerated and reopened every capture. The final
  desktop/mobile views have compact cards, blue active and pale-green completed
  states, real upload progress, concise missing names, one document renderer,
  no clipping/overflow, and no old matrix/diagnostic dashboard.
- Task 4 deleted only the two verified-obsolete Stage 1 UI files:
  `apps/web/features/projects/project-governance-card.tsx` and
  `apps/web/features/projects/stage-one-readiness-card.tsx`. Reusable domain
  records/services and the Stage 2–5 shared Required Document matrix remain.
- **COMPLETE:** Task 5 browser acceptance, visual acceptance, compatibility,
  safe fixture, and handoff documentation. **REUSABLE_FOUNDATION:** current
  Project/Customer, UploadSession/FileAsset, Required Document history,
  Approval, Activity/Audit, authorization, and shell infrastructure.
  **NOT_STARTED:** expanded Stage 2–5 business workflows by explicit scope.
  **PARTIAL:** root still owns fresh whole-repository verification and the final
  whole-working-tree review before the overall completion claim.
- Exact next task: root runs the mandated final verification matrix and
  independent correctness/security/authorization/UX/Ponytail reviews against
  the complete dirty working tree, fixes any proven Critical/Important finding
  test-first, and then issues the required handoff without committing.

### Task 5 independent-review amendment — 2026-08-12

- The first independent Task 5 review reported no Critical and two Important
  findings. Both are fixed test-first: legacy requirement URLs now resolve to
  exactly one visible, in-viewport, highlighted logical-document row even when
  several uploaded documents share the type; and fixture teardown removes the
  exact owned physical storage objects as well as their database rows.
- Executable fixture safety is **3/3 passed** and proves an owned object is
  removed while a non-fixture sentinel remains. Both final browser teardowns
  left zero new blobs. The 23 known PDFs orphaned by the pre-fix 17:13 synthetic
  run were verified to have zero FileAsset rows and permanently removed; no
  referenced or business file was targeted.
- Review Minors are also closed: Flow 6 verifies authoritative Stage state
  `DONE`; every responsive project navigates steps and exercises queue/remove/
  disabled-submit behavior. The four route-page wrappers shadowed by native
  Next redirects were deleted, leaving one compatibility owner.
- Post-review evidence: simplified Stage 1 **12/12 passed in 1.6 minutes**;
  full configured Project baseline **16/16 passed in 1.9 minutes**; API/Web
  typechecks passed; fixture safety **3/3 passed**; touched lint/format and diff
  checks passed; production Web build compiled in 5.5 seconds, completed
  TypeScript in 8.7 seconds, and generated **77/77** routes. All 17 regenerated
  captures were reopened at original detail and remain visually accepted. The
  independent re-review is **APPROVED** with no Critical or Important finding.

## Simplified Stage 1 final verification amendment — 2026-08-12

- Final whole-tree review found and fixed four release blockers test-first:
  legacy `DONE` simplified-step CAS deadlock, FileAsset fixture bytes-first
  teardown, bare later-stage notification links defaulting to Stage 1, and an
  unconditional approval-sent success message. Follow-up review also protected
  legacy filename/gate evidence with the selected Project attachment scope.
- Fresh final evidence after those fixes: Prisma format/validate pass and
  **53/53 migrations** are current; API **46/46 files, 637/637 tests**; Web
  **23/23 files, 306/306 tests**; Edge **1/1 file, 4/4 tests**; API/Web/Edge
  typechecks, root lint, API/Edge/Web production builds, and `git diff --check`
  pass. The final Web build generated **77/77 pages**.
- Final Project Playwright is **16/16 passed in 1.9 minutes**, including the
  simplified Stage 1 **12/12** across four viewports. One preceding full run
  had an isolated stage-access session redirect; the exact test then passed in
  isolation and the complete fresh 16-test baseline passed without recurrence.
- All **17/17** regenerated Stage 1 screenshots were reopened at original
  detail after the final run. No duplicate uploader/list, horizontal overflow,
  clipped controls, old diagnostic matrix, raw enum/debug code, false signature
  status, or protected metadata is visible.
- Final review additionally made both Stage 1 dialogs native modals with
  accessible names, initial focus, Escape/focus trapping, and focus restoration;
  browser acceptance exercises those paths. Exact Required Document lookup now
  omits foreign owners and FileAssets not attached to the selected Project.
- Application status is **COMPLETE** for the approved simplified Stage 1.
  Repository-wide merge readiness remains **PARTIAL** only because
  repository-wide Prettier reports 41 preserved Superpowers evidence files and
  the inactive document-ai service's one collected health test still hangs
  (fresh bounded run timed out after 30 seconds).
- Full handoff: `docs/project-system/GALAXY_OS_SIMPLIFIED_STAGE_1_HANDOFF.md`.
  No commit, tag, push, PR, reset, seed, drop, truncate, applied-migration edit,
  or Stage 2–5 workflow expansion occurred.

# P0 upload, new Project, and simple Stage 1 matrix — 2026-08-14

- Branch: `feature/project-business-operations`; no commit, tag, push, PR,
  database reset, business-record deletion, or applied-migration rewrite.
- Proven reported-runtime cause: the pre-existing port-3000 Web process was
  stale/hung (TCP accepted, HTTP never returned), so its cached page never ran
  the current upload initialization and sent no first chunk. Fresh source
  immediately left `Chờ tải` and completed a real 37-byte upload.
- The confirmed stale Galaxy `pnpm dev` Web/API process tree was replaced after
  verification. The restarted default runtime now returns healthy responses on
  Web port 3000 and API port 3001.
- The former `2048.0 MB` value came from the server's 32-bit
  `FileAsset.sizeBytes` clamp, then `/uploads/constraints` and the Web formatter;
  it was not an nginx or frontend text fallback. `FileAsset.sizeBytes` is now
  `BIGINT`, and the one startup-validated server limit is 20 GiB
  (`21,474,836,480` bytes). The UI derives and displays `20 GB`; parts remain
  64 MiB.
- The existing resumable UploadSession/FileAsset pipeline now exposes explicit
  queue states, confirmed progress, bounded retry, resume, abort, two-phase
  finalization, idempotent attachment linkage, authorized download, and
  multiple persistent files per matrix row. The Web proxy streams request
  bodies without `arrayBuffer()` buffering; valid ZIP64 DOCX/XLSX validation is
  bounded.
- `/projects/new` uses a dedicated four-field create command. It creates a new
  scoped Project idempotently, creates initial membership/five steps/five exact
  matrix definitions, and redirects to the new ID at Stage 1 Step 1. Existing
  Stage 1 uses a separate idempotent PATCH command.
- The Stage 1 matrix has exactly five columns, exact Vietnamese business/Step
  labels, one `TẢI LÊN` or `THÊM TỆP` action, files/chips in `TỆP ĐÍNH KÈM`, one
  native customization dialog, no row `⋯`, and no duplicate lower file list.
  Empty rows remain optional and do not gate Step/Stage completion.
- Fresh verification: API **48/48 files, 730/730 tests**; Web **27/27 files,
  372/372 tests**; Edge **4/4 tests**; focused Stage 1 Playwright **10/10** and
  the full configured Project baseline **19/19** across four viewports;
  API/Web/Edge typecheck, lint, and production builds pass; Web generated
  **77/77** pages; Prisma validate passes and **57 migrations** are current;
  `git diff --check` passes. Fourteen ignored P0 screenshots were opened and
  inspected.
- Boundary checks accept exactly 20 GiB and reject 20 GiB + 1 byte. A real
  64 MiB + 1 KiB browser upload exercised multiple chunks and persistence.
  `FULL_20_GIB_TRANSFER_NOT_VERIFIED` because a full 20 GiB transfer was not
  required after configured support, disk headroom, and multi-chunk behavior
  were separately verified.
- Repository-wide merge readiness remains **PARTIAL** only for two preserved,
  unrelated baselines: the inactive document-ai health pytest hangs, and full
  Prettier reports historical `.superpowers` evidence/old plan files. The P0
  scope is otherwise verified; final independent review is recorded in the
  handoff.

## Project document upload P0 runtime re-verification — 2026-08-17

- Branch: `feature/project-business-operations`; the large pre-existing dirty
  worktree was preserved. No commit, tag, push, pull request, database reset,
  or history deletion was made. One post-review upload-integrity repair now
  rejects any chunk whose byte count differs from its exact expected geometry
  and rechecks stored geometry before finalization.
- Proven boundary: before the diagnostic runtime was started, nothing listened
  on Web/API ports 3000/3001. The reported screen therefore could not exercise
  the current source's submit handler or UploadSession API. Starting the current
  Web/API source, with no code change, made the same flow leave `Chờ tải`.
- Real Chromium verified a 29-byte PDF and a 24,850,000-byte `video/mp4` through
  initialization, non-zero chunk transfer, finalization, attachment linking,
  reload persistence, and authorized download. A 67,109,888-byte MP4 used two
  server-acknowledged parts (67,108,864 + 1,024 bytes). Multiple uploads,
  visible failure/retry, and abort were also exercised without mocked network.
  The 67,109,888-byte MP4 flow was repeated after the integrity repair; both
  exact parts and completion again returned 201 and survived reload.
- Persistence evidence matched UploadSession, UploadPart, FileAsset,
  ProjectStageOneDocument attachment/version relations, and physical file sizes.
  An authorized project member received 2xx responses; an outsider received 403
  for upload commands and 404 for metadata/download.
- Fresh focused/full checks: Web 372/372, API 731/731, Edge 4/4, focused upload
  integration 10/10, upload client 42/42, UploadSession unit 77/77, and Stage 1
  service 238/238. API/Web/Edge typecheck, lint, Prisma validate/status,
  `git diff --check`, focused formatting, and production builds passed.
- Strict repository completion remains **PARTIAL** in this run: the configured
  Stage 1 Playwright baseline was not rerun because its teardown deletes fixture
  UploadSession/FileAsset history, contrary to this task's explicit no-history-
  deletion rule. The inactive document-ai pytest still times out, and the full
  formatting check still reports 50 preserved unrelated files.
- Exact next task: run the configured Stage 1 Playwright baseline against an
  authorized disposable database/fixture namespace whose teardown cannot delete
  retained upload history; then repeat the repository-wide completion gate.

## Project UI reference match and Stage 1 domain separation — 2026-08-24

- Branch: `feature/project-business-operations`; the existing dirty worktree was
  preserved. No commit, tag, push, pull request, database reset, `db push`,
  applied-migration rewrite, second uploader, or second FileAsset system was
  created.
- Chrome DevTools MCP inspected the live PMS reference and Galaxy Dashboard plus
  GĐ1–GĐ5 before and after the change. Final browser measurements cover
  1536×864, 1440×900, 1280×800, and 390×844; all inspected Project pages have no
  document-level horizontal overflow. GĐ1 observed LCP is 1.35 seconds and CLS
  is 0.00. Final Console review is clean and the inspected Dashboard/GĐ1 network
  requests are all 200.
- Root cause 1: Workflow definitions/read state were derived through Matrix-
  coupled filtering, so an empty Matrix suppressed the Workflow add-file path.
  Root cause 2: Matrix upload blocking scanned every Stage 1 queue context, so a
  Workflow draft/activity polluted the Matrix uploader. Matrix and Workflow now
  use exact, independent `contextType`/`contextId` targets, definition uniqueness,
  query keys, invalidation, stale-queue removal, attachment lists, and submit
  paths. No cross-context fallback remains.
- The existing UploadSession/FileAsset/two-phase pipeline is reused. Matrix and
  Workflow uploads work in either order without reload or byte retransmission.
  Files expose only View, Download, and permission-gated Delete. Backend deletion
  requires the exact source/context, active actor, organization/project access,
  and `file.delete`; logical history, versions, audit, and referenced physical
  FileAssets are retained.
- Two additive migrations make definition and normalized-name uniqueness context
  aware. Prisma format/validate pass; all **65 migrations** are applied and the
  database schema is current.
- `ProjectStageHeader` is shared by GĐ1–GĐ5. The final UI uses one neutral Project
  workspace with blue/indigo/amber/emerald/teal Stage accents, compact Dashboard,
  Stage 1 Matrix and five-step Workflow, Galaxy terminology for GĐ2–GĐ5, and
  controlled mobile stage/tab scrolling.
- Fresh automated evidence: API **55 files, 1026/1026 tests**; Web **28 files,
  492/492 tests**; Edge **4/4 tests**; document-ai **1/1 test**; configured Project
  Playwright **30/30** across four viewports. Root lint and typecheck pass. The
  production API/Edge/Web build passes and Web generates **78/78 routes**.
  `git diff --check` and focused Project formatting pass.
- Independent correctness re-review is **APPROVED** with no Critical or Important
  finding. Ponytail Full found no removable dependency, speculative abstraction,
  duplicate uploader, or broader invalidation: **Lean already. Ship.**
- Requested Project/domain scope is **COMPLETE**. Repository-wide formatting is
  **PARTIAL** only because the root Prettier baseline still reports 60 preserved,
  unrelated historical/Superpowers and non-Project files; no out-of-scope mass
  formatting was applied.
- Exact next task: user acceptance of the captured Project UI, then an explicit
  commit/integration instruction if this dirty branch should be recorded.

## PMS parity estimate and Project risk slice — 2026-09-10

- Status: **PARTIAL**. GĐ2 now uses the canonical Estimate domain for explicit
  missing/provisional/confirmed price states, purchase versus sell quantity,
  Decimal margin/markup, dated source evidence, immutable approval, and a risk
  contingency total. GĐ3–GĐ5 orchestration remains follow-up work.
- One Project risk register was added with Project/Stage/category/owner,
  cause→event→impact, 5×5 internal score, optional explicit probability and
  financial impact, EMV, response fields, audit, and a unique contingency
  allocation per risk and draft Estimate revision. Financial risk rows and
  values require `financial_margin.read` in the backend.
- Three additive migrations add the register, widen ratio precision, and enforce
  source/risk integrity; Prisma validates and PostgreSQL reports 68 migrations
  current. No database reset, `db push`, commit, or push was performed.
- Fresh final evidence: focused API 35/35; full API 1052/1052; full Web 497/497.
  API/Web lint, typecheck, and production builds pass; Prisma validates and all
  68 migrations are current. Web lint has one pre-existing `<img>` warning.
- The final review closed cost-field redaction, cost-estimate authorization,
  parent/child estimate and quotation totals, contingency-allocation race,
  missing-price payload, and persistent-label findings with regression tests.
- Playwright Flow B passes 1/1 at 1536×864 through create → reload → risk/EMV →
  contingency → submit → second-user approve → reload. The final risk responsive
  run passes 4/4 at 1536×864, 1440×900, 1280×800, and 390×844; desktop and mobile
  screenshots were opened and checked. Full Project browser
  regression passes 29/35; six late viewport cases hit accumulated login rate
  limiting before reaching their assertions.
- Chrome DevTools MCP could not find Chrome Stable. Playwright Chromium rendered
  the live PMS login, but authenticated reference inspection remains
  **NOT_VERIFIED** pending explicit approval to send the supplied credential.
- Exact next task: authenticated PMS GĐ1–GĐ5 observation, then GĐ3 canonical
  Contract/PO → GĐ4 commitment/actual/forecast → GĐ5 acceptance/settlement.

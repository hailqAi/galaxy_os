# M3 — Kế hoạch nguồn/provider và tích hợp

Thực thi inline theo chỉ đạo hợp nhất; [DESIGN](DESIGN.md) giữ giới hạn nguồn và provider.
Không ghi kế hoạch mới đã được chủ dự án review thay cho ủy quyền thực thi.

- [x] N1: `apps/api/src/project-chat/ai-source.ts` và `.test.ts`: UTF-8 fatal,
      MIME allowlist, size giới hạn, nguồn bị cấm không index, chunk theo dòng với
      exact locator/version/hash; lexical mã hàng, deterministic top-k, không trộn
      Project/tenant. RED/GREEN qua Vitest trong môi trường riêng.
- [x] N2: `apps/api/src/project-chat/ai-provider.ts` và `.test.ts`: đọc config
      key/model/allowlist/endpoint; thiếu config không fetch; timeout/cancel; output
      strict, handle lạ/incomplete/refusal lỗi; không automatic retry/fallback.
      Mock transport chỉ trong unit, không model giả trong live.
- [x] N3 sau M2 gate: policy adapter ai.invoke + storage/index state/queue,
      conversation/answer/dependency/idempotency/quota + Prisma migration cô lập.
      Recheck trước context và delivery/history/citation; late version không current.
- [x] N4: panel Hỏi AI tại Project/nhóm/toàn hồ sơ theo quyền, new/history/reload,
      trạng thái thật, source links cùng origin; cancellation/response generation.
- [x] N5: fixture hai tenant/hai Project cùng sản phẩm/revoke/re-add/expiry,
      prompt injection, race/index retries/provider errors; browser và M2 regression.
- [ ] N6: live smoke chỉ khi key/model/allowlist/budget và dữ liệu giả được phép; hiện NOT_RUN, không dùng dữ liệu main/backup/clone.

Review focus: citation bịa, callback cancel muộn, source/version ngoài scope,
nguồn không đọc được, model/URL ngoài allowlist. N1/N2 không tự cấp quyền. N3–N5 đã triển khai/kiểm thử; N6 vẫn chưa đạt.

## Checkpoint 2026-09-30 — nền M3 đã triển khai

- CODE/TESTED_SHA `fde08f8f1cf16443049d96a5601609a7cdac8db3`, TESTED_TREE `0209392f76536a609b409e6c3c8457a065be56f2`.
- Worktree/branch hiện hữu; một sourcewriter, review Astra/high đã dispatch, actual model UNVERIFIED.
- Main source Web/API cùngfde, `galaxy_os/public` schema83/M2ON/M3ON; không runtime thử trà trộn.
- Migration mới1file đã review, restore/upgrade và fresh canonical đạt trước khi áp main.
- Backup mới226bảng và binary, đối soát hàng/ID/currency/quan hệ/binary giữ nguyên; oldAPI5d cũng readiness trên schema83.
- Quyền owner riêng300permissions/INVOKE9Project đã audit/replay, không đổi sharedrole289/5 hoặc tự cấp cho guest.
- Incremental index25/source-version/lease60s/lateCAS; exact-code lexical ACL trước limit50, chưa semantic/GIN/embeddings.
- Message/plaintext và publication version; PDF/OCR/Task/allFileAsset adapter chưa có. Trạng thái unsupported/error thật.
- Toàn bộ context thành dependency; revoke/re-add/expiry áp vào delivery/history/citation và ẩn cả nội dung dẫn xuất.
- Durable request idempotency/quota/cancel/late response; provider thiếu cấu hình/lỗi báo thật, không fake live.
- UI Hỏi AI riêng, scope nhóm/toàn hồ sơ theo các nguồn đang hỗ trợ; new/history/reload/source/cancel đã kiểm Chrome fixture.
- Source RED/GREEN đã kiểm ranking, index version/lease, revocation, quota, cancel và đổi actor khi request chậm.
- Targeted30/UI15/launcher13 PASS; fullWeb529/Chrome24/repeat10/fullAPI1222 hai lượt PASS/CLEAN.
- Rootlint/typecheck/build/schema6.19/format/edge4/Python1 PASS. Không chạy full lại chỉ vì cập nhật docs.
- `/tmp/galaxy-m3-acceptance.json` và `/tmp/galaxy-m3-controlled-cutover.log` là run/exit evidence.
- Chrome main `/me`/Project/file/download200, panel Hỏi AI hiển thị trạng thái NOT_CONFIGURED.
- DOM main `/tmp/galaxy-main-ai-dom-final.json`; không đọc cookie hoặc đăng nhập fixture trên profile người dùng.
- User sudo probe đã chạy/khôi phục timesyncd,450mẫu0breach; final gates CLEAN; writer112ms lịch sử UNKNOWN.
- M3_IMPLEMENTED; LIVE_PROVIDER NOT_RUN, M3_LIVE_VERIFIED NOT_VERIFIED. Main allowProjectData=false/maxRequests0.
- NEXT: cấu hình provider/backend và ngân sách, live smoke synthetic được phép; không cần viết lại module hoặc migration.
- [Handoff](../M2/HANDOFF.md) là checkpoint tiếp tục duy nhất; [VERIFICATION](../M2/VERIFICATION.md) giữ evidence và giới hạn.

# M3 — Kế hoạch nguồn/provider và tích hợp

Thực thi inline theo chỉ đạo hợp nhất; [DESIGN](DESIGN.md) giữ giới hạn trước gate.
Không ghi kế hoạch mới đã được chủ dự án review thay cho ủy quyền thực thi.

- [x] N1: `apps/api/src/project-chat/ai-source.ts` và `.test.ts`: UTF-8 fatal,
      MIME allowlist, size giới hạn, nguồn bị cấm không index, chunk theo dòng với
      exact locator/version/hash; lexical mã hàng, deterministic top-k, không trộn
      Project/tenant. RED/GREEN qua Vitest trong môi trường riêng.
- [x] N2: `apps/api/src/project-chat/ai-provider.ts` và `.test.ts`: đọc config
      key/model/allowlist/endpoint; thiếu config không fetch; timeout/cancel; output
      strict, handle lạ/incomplete/refusal lỗi; không automatic retry/fallback.
      Mock transport chỉ trong unit, không model giả trong live.
- [ ] N3 sau M2 gate: policy adapter ai.invoke + storage/index state/queue,
      conversation/answer/dependency/idempotency/quota + Prisma migration cô lập.
      Recheck trước context và delivery/history/citation; late version không current.
- [ ] N4: panel Hỏi AI tại Project/nhóm/toàn hồ sơ theo quyền, new/history/reload,
      trạng thái thật, source links cùng origin; cancellation/response generation.
- [ ] N5: fixture hai tenant/hai Project cùng sản phẩm/revoke/re-add/expiry,
      prompt injection, race/index retries/provider errors; browser và M2 regression.
      Live smoke chỉ khi key/budget/dữ liệu giả được phép; chưa đủ thì NOT_VERIFIED.

Review focus: citation bịa, callback cancel muộn, source/version ngoài scope,
nguồn không đọc được, model/URL ngoài allowlist. N1/N2 không tự cấp quyền hoặc
được coi là M3 hoàn chỉnh; N3–N5 là phần còn bắt buộc.

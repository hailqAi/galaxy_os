# P1 — spec đã duyệt, implementation plan chờ review

**WRITTEN_SPEC_APPROVED / NATIVE_CLI_SELECTED / WRITTEN_PLAN_REVIEW_PENDING / PRODUCT_IMPLEMENTATION_NOT_STARTED.** Owner đã chính thức duyệt spec P1 revision1 tại canonical và chọn Codex CLI thực thi trong phiên hiện tại. Không xin lại conceptual design, spec hoặc phương thức thực thi.

Plan revision1: [P1 implementation plan](../../superpowers/plans/2026-10-09-p1-project-ai-memory.md). Đã hoàn thiện toàn bộ chín task, self-review coverage/interface/test/risk/proportion và Ponytail review tài liệu. Task1–3 sửa/kiểm/release P1-A độc lập; Task4–9 migration, CRUD/ACL, budget/summary, read tools/citations, UI và nghiệm thu P1-B. Không tách cùng plan thành nhiều lần xin duyệt.

Spec đã duyệt: [P1 revision1](../../superpowers/specs/2026-10-09-p1-project-ai-memory-design.md), SHA256 `792e1ca8d564b004086f0c55d3a774b3bded693c2f770a47387456464dcc0a51`. Nội dung spec giữ nguyên, kể cả nhãn pending lịch sử lúc soạn; approval hiện hành ở handoff/status này và lệnh owner. Không diễn giải nhãn lịch sử thành thiếu approval spec.

## Phạm vi thay đổi và bằng chứng

Chỉ thêm plan/handoff này, cập nhật approval ledger và STATUS/PROJECT_STATUS ở canonical/root. Không product code/test/migration/env/credential/storage/runtime mutation hoặc git commit/stage/push/PR. Không chạy lại unit/regression code cũ để tạo báo cáo triển khai. Gate plan còn bắt buộc bởi writing-plans; code TDD bắt đầu ngay Task1 sau approval.

Đã đọc source/callers cần để plan có thể thực thi: đủ bốn call sites pilot, current request version1/history lineage, SIWC namespace/SSE, model picker/surfaces, constructor fixtures, sourceScope/checkSource, Stage2 record permissions, audit, Prisma entities/migration commands, isolated integration/browser và release scripts. Không tái khám phá IAM/OAuth hoặc mở lại nguyên nhân discovery đã chứng minh.

Self-review đã cụ thể hóa hai điểm quan trọng: P1-A dùng metadata v2 giữ causal checks của version1, P1-B dùng v3/proof riêng cho inputs đã sử dụng sau assembly và giữ tương thích v1/v2; rollback sau schema additive phải có compatibility manifest cho P1-A, không dùng expectedSchema86 hoặc drop memory tables. Summary dùng current answer lease + server job token và immutable revisions, không dựng worker service mới. Không còn placeholder chức năng; model-profile/Chrome/session live thiếu evidence được gắn gate thực thi, không chặn A bằng phầnB.

Checks mới của lượt plan: formatting theo file, links/coverage/task/interface/placeholder scan, diff whitespace, hash bảo toàn approved spec và tất cả product files/dirty work trước đó. Evidence private `/home/galaxy_os/.runtime/ai-upgrade-20261009/p1-plan-before.json` và `p1-plan-verification.json`; chỉ hashes/metadata/checks, không token/chat content.

## Provenance/runtime

- Worktree `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`.
- CODE_SHA nền `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`, với diff SIWC có trước; không commit mới. Index chưa staged lúc kiểm.
- TESTED_TREE lịch sử release08/10 `c7590f6cdd97d2b5b8c75f8331069301629b1bc4`; chưa có tested tree của implementation P1.
- Fresh `pnpm local:status`: exit0, READY `local-bf73047fa0ee`, API43595/Web43596, schema86 verified/pending0.
- Artifact `/home/galaxy_os/.runtime/releases/siwc-stream-items-20261008-r4`; Web build `Pvj1ciiD8AMIbC9YJQJu7`; source digest `bf73047fa0eec2ce787c5406d8e8b3cf27acd64b721c7e52fd5bd4a01f66b021`.
- Không restart/cutover/migrate và không thay connection đang chạy. CDP33005/executable blocker giữ bằng chứng discovery, chưa browser/main inference mới.

## Trạng thái chức năng hiện hành

Không có feature code mới trong lượt plan. FAIL là khoảng thiếu của baseline với yêu cầu mới, NOT_RUN là chưa nghiệm thu mới, runtimePASS chỉ xác nhận bản cũ được bảo toàn.

| Mục                 | Trạng thái | Bằng chứng/giới hạn                                                |
| ------------------- | ---------- | ------------------------------------------------------------------ |
| P1_PROJECT_AI       | FAIL       | Pilot vẫn chỉ Showroom; Task1 sẽ sửa ngay sau plan approval        |
| P1_PRIVATE_MEMORY   | FAIL       | Chưa entity/API/revision mới                                       |
| P1_SHARED_MEMORY    | FAIL       | Chưa explicit publication/ACL mới                                  |
| P1_MEMORY_ISOLATION | NOT_RUN    | Backend/worker/retrieval/two-tab tests mới chưa viết               |
| P2_GENERAL_QA       | NOT_RUN    | Chưa benchmark live mới                                            |
| P2_CONTEXT          | FAIL       | Server context/budget nâng cấp chưa triển khai                     |
| P2_TOOLS            | FAIL       | SIWC hiện task_list, chưa memory/history/source registry mới       |
| P2_WEB_SEARCH       | NOT_RUN    | Chưa hosted/Galaxy web live execution                              |
| P2_CITATIONS        | FAIL       | Codec chưa URL annotations/web search outputs                      |
| P3_UPLOAD           | FAIL       | Multipart chat10MiB, resumable chưa nối                            |
| P3_FILE_PARSING     | FAIL       | Baseline parser nhỏ chưa đủ contract mới                           |
| P3_AI_RETRIEVAL     | FAIL       | SIWC còn chặn sourceIds/context                                    |
| P3_10GB_LIMIT       | FAIL       | Contract/transfer/resume/resource chưa nghiệm thu                  |
| REGRESSION          | NOT_RUN    | Chưa full checks của code P1 mới; historical tests không thay live |
| SECURITY_ACL        | NOT_RUN    | ACL baseline giữ; security tests P1 mới chưa chạy                  |
| DEPLOYED_RUNTIME    | PASS       | Fresh READY local-bf73047fa0ee/schema86, artifact cũ giữ           |

## Gate còn lại trước code

Owner review đúng plan revision1 đã link. Nguồn gate là [superpowers:writing-plans SKILL.md](/home/hailq_glx/.codex/plugins/cache/openai-curated-remote/superpowers/6.4.2/skills/writing-plans/SKILL.md), Execution Handoff: “wait for that review before implementation, then use the preserved method.” Spec/method approval không phải approval plan chưa tồn tại, đúng yêu cầu owner.

Sau plan approval: dùng executing-plans/nativeCLI/TDD Task1 ngay, targeted backend/UI→full checks/review→exact artifact/browser/live→release P1-A khi an toàn. Không dừng để hỏi lại spec/method, không chờ P1-B/P2/P3; thiếuCDP không cản code/API/Web tests nhưng phải ghi riêng livegate. Sau đó Task4–9 P1-B, tiếp tục spec/plan/approval P2/P3 tương ứng. Chưa có quyền commit.

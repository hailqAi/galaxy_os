# P1 — written spec chờ review, 09/10/2026

> **Approval đã nhận:** owner chính thức duyệt written spec P1 revision1 và chọn Codex CLI trong phiên hiện tại. [Implementation plan revision1](../../superpowers/plans/2026-10-09-p1-project-ai-memory.md) đã hoàn thiện, chờ đúng gate review plan; [handoff hiện hành](2026-10-09-p1-implementation-plan.md). Phần dưới giữ lịch sử lúc trình spec, không là yêu cầu duyệt lại spec.

**CONCEPT_DESIGN_APPROVED / WRITTEN_SPEC_REVIEW_PENDING / IMPLEMENTATION_NOT_STARTED.** Owner đã phê duyệt thiết kế P1–P3 từ discovery 09/10, yêu cầu hoàn thiện bản spec cụ thể trước plan/code và giữ các gate Superpowers. Không cần xin lại approval thiết kế khái niệm.

Written spec revision 1: [P1 AI đa Project và memory cách ly](../../superpowers/specs/2026-10-09-p1-project-ai-memory-design.md). Spec có P1-A độc lập, data model/revisions/dependency, API/read-tool contracts, IAM/private/shared, token-budget history/summary, UI, migration, tests, release và rollback. Đã self-review và Ponytail review spec; không coi review tài liệu là code review hoặc nghiệm thu chức năng.

## Thay đổi trong lượt này

Chỉ thêm spec này và handoff, cập nhật đầu STATUS/PROJECT_STATUS ở canonical và entry root, thêm ghi chú approval/link ở discovery để không lặp gate cũ. Không sửa product code, OAuth, env, schema, storage, credential, network hoặc main runtime. Không commit/stage/push/PR, reset/clean/stash; bảo toàn toàn bộ diff SIWC chưa commit. Fingerprints trước/sau lưu trong evidence private để kiểm tra phạm vi thay đổi.

P1-A được thiết kế sửa đúng predicate pilot tại catalog/ask/view/run, giữ `authorized` và owner/plan fence, không nhét thêm Project IDs trong env hoặc cấp grant. Release P1-A không phải chờ P1-B/P2/P3. Các test mới/live của P1 chỉ được chạy khi code đã viết sau spec/plan approval.

## Provenance và runtime

- Canonical: `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`.
- CODE_SHA nền: `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e` + diff SIWC đã tồn tại. Index trống tại lúc kiểm, không commit mới; root checkout không là source ứng dụng.
- TESTED_TREE regression/release 08/10: `c7590f6cdd97d2b5b8c75f8331069301629b1bc4`, bằng chứng lịch sử, không cây đã test feature P1 mới.
- Runtime kiểm mới bằng `pnpm local:status`: exit0, READY `local-bf73047fa0ee`, API PID43595/Web PID43596, schema86 verified, pending0. Không restart/cutover.
- Artifact: `/home/galaxy_os/.runtime/releases/siwc-stream-items-20261008-r4`; Web build `Pvj1ciiD8AMIbC9YJQJu7`; source digest `bf73047fa0eec2ce787c5406d8e8b3cf27acd64b721c7e52fd5bd4a01f66b021`.
- Evidence private: `/home/galaxy_os/.runtime/ai-upgrade-20261009/`, bổ sung `p1-spec-before.json` và `p1-spec-verification.json`. Đây là hash/metadata nguồn và checks tài liệu, không chứa nội dung chat/token.

## Kiểm tra và giới hạn

Review spec đối chiếu charter, access/memory spec, discovery và source/callers hiện hành; đã sửa các điểm: metadata version 1 compatibility; ACL source của shared note; audit chung; dependency cycle; inactive khi nguồn đã revoke; worker CAS; unknown model budget và gates live riêng. Không còn placeholder hoặc lựa chọn kiến trúc bỏ ngỏ; capability/phiên thực chưa có được nêu là bằng chứng cần thu lúc triển khai.

Checks tài liệu: Prettier theo file, relative-link/path validation, `git diff --check` và fingerprints trước/sau. Không chạy lại full regression/build/unit của code cũ chỉ vì thêm Markdown; kết quả 74 API/30 Web và static của discovery giữ là lịch sử. Không có migration hoặc test mới của memory, chưa main cross-Project inference hoặc tool execution mới.

Browser CDP33005/executable lỗi đã có bằng chứng trong discovery, chưa sửa topology hoặc thử OAuth. Chưa nghiệm thu browser/main/live mới; không dùng fixture thay live. Khi triển khai dùng framework browser có sẵn với port cô lập hoặc manual đúng artifact nếu CDP chưa phục hồi.

## Trạng thái nghiệm thu

FAIL là chức năng baseline chưa đạt yêu cầu mới, không phải regression phát sinh từ tài liệu. DEPLOYED_RUNTIME PASS chỉ bảo toàn artifact cũ. Không có checkpoint code mới được phát hành trong lượt này.

| Trạng thái          | Kết quả | Bằng chứng/giới hạn                                                     |
| ------------------- | ------- | ----------------------------------------------------------------------- |
| P1_PROJECT_AI       | FAIL    | Pilot gate vẫn chỉ Showroom; fix đã được cụ thể trong spec, chưa code   |
| P1_PRIVATE_MEMORY   | FAIL    | Chưa có entity/API/revisions theo spec mới                              |
| P1_SHARED_MEMORY    | FAIL    | Chưa có explicit publication/ACL mới                                    |
| P1_MEMORY_ISOLATION | NOT_RUN | Tests backend/retrieval/worker/two-tab mới chưa viết                    |
| P2_GENERAL_QA       | NOT_RUN | Benchmark live chưa chạy; không tìm thấy business whitelist ở discovery |
| P2_CONTEXT          | FAIL    | Context rõ Project/actor/conversation và budget mới chưa triển khai     |
| P2_TOOLS            | FAIL    | SIWC vẫn chỉ task_list; memory/history/read registry chưa được nối      |
| P2_WEB_SEARCH       | NOT_RUN | Chưa inference live hosted search hoặc Galaxy public-search execution   |
| P2_CITATIONS        | FAIL    | Chưa giữ URL annotation/web_search_call ở codec                         |
| P3_UPLOAD           | FAIL    | Chat vẫn multipart10MiB, resumable conversation chưa nối                |
| P3_FILE_PARSING     | FAIL    | Parser nhỏ có baseline, chưa đủ định dạng/worker yêu cầu mới            |
| P3_AI_RETRIEVAL     | FAIL    | SIWC vẫn chặn sourceIds/context                                         |
| P3_10GB_LIMIT       | FAIL    | Chưa đúng contract/transfer/resume/validation/resource evidence         |
| REGRESSION          | NOT_RUN | Chưa code mới/full suite mới; không đổi TESTED_TREE lịch sử             |
| SECURITY_ACL        | NOT_RUN | ACL hiện hành giữ, tests P1 memory/shared/source mới chưa chạy          |
| DEPLOYED_RUNTIME    | PASS    | Fresh READY local-bf73047fa0ee/schema86, không cutover                  |

## Gate tiếp theo

Owner review **đúng written spec revision 1** được link ở đầu. Gate này từ AGENTS/Superpowers brainstorming: “Architectural: the human partner reviews and approves the written spec, then reviews the written implementation plan and selects its execution method.” [SKILL.md](/home/hailq_glx/.codex/plugins/cache/openai-curated-remote/superpowers/6.4.2/skills/brainstorming/SKILL.md).

Sau khi spec được duyệt, gọi writing-plans, viết plan P1 tách P1-A trước P1-B và trình plan/phương thức thực thi; khi đủ gate triển khai TDD/test/review/live và phát hành từng checkpoint. Không xin lại conceptual approval P1–P3, không lấy bước chưa duyệt của P2/P3 làm blocker P1-A. Không có quyền commit từ việc owner cho phép checkpoint có thể phát hành độc lập.

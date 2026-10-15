# E03 — Context, file, Auto research và durable runs

Version E03-SPEC-r1, 2026-10-11. Status: APPROVED theo owner reply 2026-10-11 cho mọi thiết kế chức năng E03; bugfix A và các lỗi giao diện/attachment thuộc chức năng E02 đã duyệt tiếp tục độc lập. Phương thức đã chọn: Codex CLI inline. Nguồn yêu cầu: `GALAXY_AI_E03_CONTEXT_FILES_AUTOSEARCH_UX_DEEP_RUNS_2026-10-11.txt`, toàn bộ 443 dòng/A01–A36. Không commit/push/PR.

## Mục tiêu và baseline

Sửa sản phẩm người dùng đang mở, giữ SIWC/OAuth/refresh, Create, P1-B memory/ACL, file/version và dữ liệu nghiệp vụ. Workspace và provider API-key paused giữ OFF. Source canonical `.worktrees/m2-a-20260928`; main E02 R8 `local-2837e21d800f`, tested tree `d6ecacdfbea565e16f398782242fccd2db044d90`, schema91. Không lấy fixture cũ làm bằng chứng ca mới.

Ca PDF thật đã được đọc bằng quyền hiện hữu, đối chiếu hash/version và trace riêng trong `.runtime/e03-20261011`. Hai request SIWC được chấp nhận; original được PREPARED nhưng vòng tiếp theo bị guard Galaxy từ chối vì schema/JSON 256000 bytes tính cả base64. Không có bằng chứng request chứa original đã đến provider. Browser R8 xác nhận câu hỏi đã lưu sau reload, API chưa trả attachment của user message.

## Phương án chọn

Mở rộng orchestration/source/file domain hiện có, phát hành A riêng khi full checks/review/browser đủ. Không dựng platform/queue/memory cạnh tranh. Giữ native SIWC web + bounded public fetch đang có; chưa cài Firecrawl/SearXNG/Crawl4AI nếu chưa chứng minh khoảng thiếu. Không thay memory bằng Supermemory/Nuwa/DeepTutor. ComfyUI/A23 BLOCKED đến khi có engine/model/workflow/output thật.

Hai phương án bỏ: tăng context/Buffer giới hạn toàn cục (không xử lý coverage/resource); dựng worker/tool stack mới toàn bộ trước khi sửa PDF (chậm đường sửa độc lập, tăng rủi ro). Inventory phải phân biệt installed dev/runtime/wired/ready/live và license/egress/version.

## A — Request accounting và coverage

Tách 256000-byte text envelope hiện hữu khỏi aggregate 8000000-byte media transport hiện hữu. Đây là giới hạn Galaxy của đường native reader, không phải context entitlement. Chỉ dữ liệu media đã validate trong user input được loại khỏi text count; JSON của provider/tools vẫn tính đủ. Ledger lưu wire bytes, text bytes, media bytes/type, token estimate UNKNOWN khi chưa có evidence; legacy budget vẫn đọc được. Không báo tổng VERIFIED khi thiếu token ảnh/PDF, không tăng model context hoặc giả quyền account. Model/MAX requested/sent/accepted/observed giữ pin mọi vòng; provider không trả effort thì UNKNOWN.

Source read tránh duplicate original trong cùng request. Text/history/memory/tools/source accounting và page/sheet/range coverage phải cho biết phần chưa đọc; exhaustive task không hoàn thành chỉ từ top-k. P1-B summary/retrieval giữ nguyên câu hỏi, điều kiện và Project scope. Transport/safety limits khác provider token limits. Provider rejection có receipt/stage riêng; local guard không mang nhãn provider failure.

## B — Save message trước đọc, large files ngoài RAM

Tái sử dụng `UploadSession`/chunks/checksum/quota/cancel/cleanup, `FileAsset`, conversation attachment, source index và `ChatAiAnswer` unique clientKey. Original upload/kiểm an toàn hoàn tất trước dùng nội dung. Gửi lưu question + original source/version pins rồi hiện user message; assistant đọc/parse sau. Không chờ full index ở composer. Draft chỉ xóa sau server xác nhận lưu; lỗi run retry cùng answer, không POST user message lần hai. Reload đọc attachments qua backend kiểm ACL/version; lỗi parse/context vẫn download original được.

Upload limit giữ decimal10000000000B. Các tầng Edge/Next/API/storage/chunks không nhận cả file lớn vào RAM/PostgreSQL. Worker parse PDF lớn dùng original local read-only path hoặc streamed spool, hash/version được kiểm và sandbox không mạng; không nâng Buffer8MB. Mỗi lần xử lý một page/range với timeout/output cap, lưu coverage + derivative, chỉ gửi original khi bounded route cho phép. XLSX đọc sheet/row ranges và coverage; không nói đọc toàn khi thiếu. Giới hạn CPU/RAM/concurrency theo sandbox hiện hữu; checksum streaming; temporary derivatives cleanup chỉ của run, không xóa original. Test quanh decimal50MB,50MiB và lớn hơn, riêng upload/live/validator boundary.

## C — Auto đa nguồn và policy truy vấn công khai

Session mới mặc định `AUTO` với nhãn “Tự động — Web + dự án + tài liệu”; lựa chọn `PROJECT_ONLY` rõ của user được giữ. Bỏ textbox/checkbox publicQuery khỏi composer mặc định. Không đổi quyền: file/hội thoại/memory/records/shared library/connected sources qua backend ACL hiện hữu; không tìm Project khác hoặc nguồn chưa nối.

Private inference lập nhu cầu public research trước; native web chỉ được gọi trong pha riêng không có Project/question/file/memory private. Server tạo query từ public intent/template và các thuật ngữ public được policy cho phép; không chuyển nguyên câu hỏi/private snippets sang search. Candidate chứa token, private URL, customer/address/contract/financial values hoặc không chứng minh public được giảm về generic public intent. Nếu cần chính phần private để trả lời, trả yêu cầu xác nhận đúng phần đó; không gate phổ quát. Mọi egress native/public fetch chạy qua policy, SSRF/DNS/redirect guards hiện hữu. Project-only không có web tool hoặc public phase. Questions đơn giản không cần mọi nguồn. Tests dùng sentinels ở question/history/memory/tools và inspect payload thực.

## D — Render answer và provenance

Thay parser Markdown khối thiếu inline bằng renderer Markdown/GFM nhỏ đã kiểm dependency/license; không bật raw HTML. Safe link/image protocols và authorized artifact preview; React escaping/sanitize cho trust boundary. Giữ code, dấu \* và nội dung nguyên bản; không regex xóa syntax. Heading/paragraph/table/code/copy/inline images/artifact preview/download đúng sau reload. Native web attribution nhỏ luôn thấy và bấm được; offsets/citation không bị sửa sai. Panel provenance mặc định đóng, Chi tiết giữ nguyên trace. Không đưa reasoning/tool JSON/diagnostic vào answer.

## E — Durable workflow tối đa1800s

Hiện SIWC /run là synchronous300s, lease360s, state/tool continuation phần lớn trong RAM; không phải worker bền vững. Tái sử dụng `ChatAiAnswer` queued/running, provider reservation, source/answer metadata và scheduler lifecycle trong API; không bật Workspace ticker. /run enqueue nhận answerId/runId nhanh, browser poll events/progress thực. Worker claim CAS có lease/heartbeat, reconstruct actor/session và kiểm quyền fresh trước từng tool/egress/publish. Durable deadline đặt lúc nhận run: normal giữ300s, deep tối đa1800s; không giữ browser request 30 phút, không SIWC background=true.

Checkpoint chỉ gồm scope/pins/source refs/coverage/provider accepted continuation/tool call IDs và kết quả đã hoàn tất; không binary hoặc chain-of-thought ở DB/user UI. Persist trước dispatch/tool/publish; idempotency dùng answer/tool call identity của artifact domain hiện có. Restart phục hồi accepted safe checkpoint; request đã dispatch nhưng không biết outcome đánh dấu UNKNOWN, không tự replay mua lượt. Per-tool timeout, provider-round quota, bounded retry/backoff và deadline cùng kiểm; Stop/revoke fence late output. Deadline trả PARTIAL với phần kiểm được và coverage; không chạy vô hạn. Không tăng MAX/model hay fallback qua các bước. Kết quả vẫn kiểm precision/total/source/version/artifact.

## Verification và phát hành

RED trước fix; targeted/unit/integration rồi serial lint/typecheck/test/build/format:check. Independent correctness/Ponytail/security/authorization/UX review trước release; browser trên đúng domain `https://os.galaxycentre.vn` + exact PDF trong hội thoại ngắn và hội thoại lỗi. Backup/current schema compatibility/app-only rollback, manifest/source/tested artifact phải khớp. Không reset/schema rewrite, không discard uncommitted work. CDP tạm đã được owner duyệt; không lưu browser storage state; đóng bridge sau nghiệm thu.

A01–A08: local guard/native/accounting/model/history/source coverage. A09–A16: durable message/attachment, large upload/pipeline/coverage/hash. A17–A21: default Auto/policy/ACL/outbound isolation. A22–A25: render/citations/images/download. A26–A28: durable restart/Stop/deadline/revoke. A29: exact quote→public manufacturer→verified draft XLSX/PDF image/total. A30–A33: inventory/search live/memory unchanged/image BLOCKED truthful. A34–A36: preserved SIWC/Create/P1-B/paused providers, deployed identities và before/after real question. Từng hàng lưu evidence class riêng, chưa chạy không PASS.

## Approval đã nhận

Owner đã duyệt E03-SPEC-r1 và mọi thiết kế chức năng E03 trong phiên: “duyệt tất cả thiết kế … tập trung hoàn thiện chức năng”. Scope gồm B-large/C/E (filesystem sandbox reader, safe Auto query policy và durable1800s orchestration). Các mục A/B attachment/D sửa lỗi chức năng E02 đang thực hiện độc lập. Written implementation plan đã tạo sau written-spec approval; Codex CLI inline giữ phương thức owner đã chọn.

### CP43 transport accounting correction within approved E03 scope

Encrypted provider continuation is opaque protocol state, not ordinary text. Count known reasoning summary text in the text ledger; retain encrypted byte count with token cost UNKNOWN and a separate bounded256KB transport allowance derived from the existing envelope. Keep actual encrypted payload unchanged on stateless SIWC continuation and preserve the existing128K per-item schema. Overall context remains UNKNOWN when opaque or media costs are unknown. SSE delta/done/terminal repetitions do not multiply the retained-answer budget; each frame, pending buffer and aggregate validated done output remain bounded512KB. This amendment changes Galaxy transport accounting only, never claims or raises account context capacity.

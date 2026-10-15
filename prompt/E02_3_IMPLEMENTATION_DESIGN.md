# E02-3 — web công khai và file đầu vào, thiết kế delta r1

2026-10-10. **OWNER_APPROVED** — owner “Duyệt E02-3-SPEC-r1” trong phiên hiện tại; approval SHA256 `32b709c2ec27a59bdd8bbace1c79f7f0a49935585e93b088fb1d101be3f5de67`. Đây là lát kế tiếp được yêu cầu trong E02, dùng Codex CLI inline. Approval E02-SPEC-r1/E02-PLAN-r1 cho E02-0/1/2 giữ nguyên; nghiệm thu Office vẫn tiếp tục độc lập. Chỉ sau duyệt bản này mới viết kế hoạch chi tiết theo AGENTS.md. Không mở lại mục tiêu hoặc approval P1/E01.

## Phạm vi và nguồn tái sử dụng

Tái sử dụng [P2 spec](/home/galaxy_os/.worktrees/m2-a-20260928/docs/superpowers/specs/2026-10-09-p2-general-ai-web-design.md), [P3 spec](/home/galaxy_os/.worktrees/m2-a-20260928/docs/superpowers/specs/2026-10-09-p3-chat-files-design.md), registry/ProjectAiService, SIWC connection/capability/codec, source index/native parsers, File/Draft và P1 hiện hữu. Baseline E02 candidate đầu `local-c991957408c7`, schema90, source CODE_SHA dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e; acceptance live Office đang sửa lỗi recoverable tool result, chưa coi candidate đầu là toàn E02 PASS.

Kết quả lát này: hỏi kiến thức tổng quát, tìm và đọc nguồn web công khai thật có citation; đọc PDF text nhiều trang, DOCX và Excel nhiều sheet/range qua parser hiện hữu; phân tích ảnh/scan chỉ khi model/route/account thực tế chấp nhận media. Không bật Workspace, provider API-key đã paused, hosted image/file_search/Code Interpreter/MCP/tool_search hoặc dịch vụ trả phí. Không sửa SIWC OAuth/callback/refresh. Không tạo auth/chat/storage/agent engine khác.

Giữ Create/DRAFT, artifact/download, exact model/effort, memory/history/source/ACL. PPTX tạo/sửa, formula authoring v2, resumable10GB/retention/promote và generative image là E02-4/5/6, có contract kế tiếp. Chưa tăng trần parser hoặc uploader để giả nghiệm thu10GB.

## Web: authorization và pha công khai

Giữ fence E01/E02: inference có private Project context không được nhận hosted web_search hoặc tool phát query tự do ra Internet. Thêm pha công khai trong orchestrator hiện hữu; pha này chỉ có query cụ thể đã được cho phép, model/effort đã pin và instructions công khai. Không truyền tên Project, khách hàng, contract, file, memory, history hoặc source private vào request công khai. Kết quả web là dữ liệu không tin cậy được đưa vào pha trả lời có Project context sau đó.

Request metadata v4 giữ question nguyên gốc, thêm searchMode AUTO/WEB/PROJECT_ONLY và authorization query tối đa400 ký tự; v1–3 giữ semantics. query authorization do backend bind actor/Project/conversation/answer/policy/hash, không tin model tự khai quyền. Cùng clientKey khác mode/query trả409. PROJECT_ONLY luôn zero public network.

Query lấy từ nội dung công khai người dùng yêu cầu rõ ràng trong lượt hiện tại hoặc identifier công khai đã có provenance được kiểm chứng. Không dùng history/memory/private extraction để tự viết query. Nếu chưa chứng minh được query được phép công bố, UI trình đúng query cho người dùng xác nhận; chưa có xác nhận thì không network. Không dùng checkbox đồng ý chung hoặc keyword filter làm ranh giới bảo mật.

Native search được probe bằng query tổng hợp công khai trên đúng account/model/connection, không API key. Chỉ bật khi có completed search action và URL annotation dùng được; receipt trước đây không thay probe mới của lát này. Giữ selected model/effort giữa pha công khai/tổng hợp, không fallback sang model khác. Tổng provider rounds/time vẫn bounded theo contract đã kiểm; điều chỉnh bound nếu cần là phần review plan trước code.

Phân biệt search result/snippet với page đã đọc. Đọc trang bằng fetchPublicPage/publicTarget hiện hữu và server URL handle chỉ từ kết quả thật đã validate. Giữ socket/DNS public-address pin, redirect recheck, private/link-local/metadata block, timeout/byte/node limits và không gửi Galaxy cookies/auth. Không chạy JS hoặc tài nguyên nhúng. Citation lưu URL/title/publishedAt nullable/retrievedAt/hash/coverage/action thực; không lấy retrievedAt làm publishedAt. UI link chỉ từ receipt, không từ model tự bịa.

Nếu native không được account cho phép: ghi đúng UNSUPPORTED/BLOCKED. Chỉ chọn adapter tìm kiếm Galaxy sau kiểm endpoint/terms/availability/egress và live search+read; không tự bật Tavily key, scrape trái terms hoặc dựng cả SearXNG/Crawl4AI khi chưa có gap và approval tích hợp. URL fetch riêng chỉ được ghi WEB_RETRIEVAL_ONLY, không Search PASS.

## File đầu vào và media

Upload → existing attachment/FileAsset original/hash/version → bounded parser/index → source tool → provider → source citation. Source access được kiểm trước snippet/count/binary, trước provider reinjection và delivery/reload. Private conversation source không tự thành shared Project document. Derivative Markdown/text/structured data ghi rõ coverage, không thay original.

PDF text: giữ page locator thật và phần chưa đọc. PDF scan: metadata hoặc bounded rendered pages từ scanPages, không claim OCR/vision khi chưa chạy. DOCX: giữ paragraph/table coverage, công khai phần header/footer/notes chưa đọc. Excel: dùng analyze_table/native source hiện hữu, nhiều sheet và range có giới hạn thực; giữ leading zero/number format/unit và phân biệt formula/cached values. Không tính lại workbook hoặc quảng cáo đã kiểm kết quả formula nếu chỉ đọc cache; v1 output numeric strings/no formulas giữ nguyên.

SIWC hiện chỉ nhận text trong codec. Mở media envelope nhỏ bằng adapter ngay trong codec/connection hiện hữu sau khi đọc contract và probe account: strict input_image/input_file shape, selected model/effort, original hoặc derivative byte/hash/sourceVersion/provenance và limit thật. Không đưa raw SIWC token cho thư viện bên ngoài, không Files upload API, không gửi private file lên URL public. Mỗi lần gửi binary recheck source/ACL/checksum. Giữ envelope byte/pixel/page ceiling đã kiểm; không base64 cả file lớn hoặc bỏ bound256KB hiện hữu mà chưa có measured/reviewed replacement.

Capability vision/file là evidence scoped generation/model/route riêng, không suy từ tên model hoặc khả năng embed ảnh trong báo giá. Provider từ chối phải giữ nguyên model, báo unsupported và vẫn cho đọc excerpt bằng parser khi phù hợp. UI nêu rõ “đọc đoạn dẫn xuất” hoặc “ảnh/trang đã gửi” theo receipt; không nói model đọc cả file nếu chỉ gửi3 trang.

## Callers, kiểm thử và release

Nơi thay dự kiến: ProjectChat DTO/request metadata codec; SiwcCapabilityService/connection media; ProjectAiService/source/continuation; ai-web/ai-native-source; model/search/source UI và tests. Không migration mới trong lát này trừ khi current source chứng minh bắt buộc; khi đó review delta schema trước code.

TDD: request v4/idempotency/model/effort; zero private sentinel trên public payload; PROJECT_ONLY zero outbound; denied/expired query authorization; native failed/partial search; actual snippet/read citation distinction; unsafe annotation/SSRF/DNS/redirect/injection; PDF page/Excel sheet-range/formula cache/metadata-vs-vision; malformed media/size/hash; cross-Project/actor/source revoke/cancel/late completion. Invalid tool arguments trả ERROR đúng call ID, không SUCCESS giả hoặc bỏ authorization.

Integration trên fixture PostgreSQL hiện hữu, browser desktop/mobile/two tabs/reload và real account live tách riêng. Corpus chỉ dữ liệu tổng hợp được phép: PDF text2 trang + scan đơn giản, Excel2 sheet có số/mã/formula cache rõ, DOCX bảng, ảnh có nội dung biết trước. Native public query có nguồn hãng/tài liệu chính thức; Project+web có private sentinel bị cấm trên public payload. Không dùng hồ sơ khách hàng làm corpus hoặc gửi dữ liệu bí mật để test.

Fresh full lint/typecheck/test/build/format, independent Ponytail/correctness/security/auth/UX review, frozen TESTED_TREE/candidate, backup/compatible-schema/rollback và live acceptance trước cutover. Phát hành phần đạt, giữ blocker riêng cho native search/media unavailable. Cập nhật A06–A08/A14–A19/A22/A24–A28 bằng evidence mới, không chứng nhận từ docs hoặc test lịch sử.

## Self-review và gate

Thiết kế này cụ thể hóa E02-3 theo privacy/source contracts P2/P3; không thay scope P1 hoặc approval Office hiện tại. Duyệt thiết kế chỉ cho phép viết implementation plan E02-3. AGENTS.md yêu cầu “Present a design and obtain explicit user approval”; E02-PLAN-r1 cũng giữ detailed contract/plan gate cho các lát sau. Chưa có code E02-3 từ bản này.

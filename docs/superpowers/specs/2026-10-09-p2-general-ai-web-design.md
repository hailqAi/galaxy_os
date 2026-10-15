# P2 — hỏi đáp tổng quát, read tools và web thật

Revision 1, 09/10/2026. **WRITTEN_SPEC_REVIEW_PENDING.** Định hướng P2 đã được owner duyệt. Bản này cụ thể hóa thiết kế đó; chưa phải implementation plan hoặc approval code P2. Không mở lại discovery/brainstorming của mục tiêu đã chốt. Thực thi tiếp bằng Codex CLI khi written spec và plan được duyệt.

## 1. Kết quả và ranh giới

Galaxy AI trả lời các câu hỏi hợp lệ theo model người dùng chọn, dùng nguồn Project đúng quyền, chủ động tìm thông tin cập nhật khi được phép và dẫn nguồn Internet thật. Project là ngữ cảnh, không phải whitelist chủ đề. Câu hỏi SQL JOIN, khoa học, quản trị hoặc viết nội dung không bị chặn vì thiếu Task/file.

Giữ nguyên owner connection, OAuth/callback/refresh, entitlement staff, IAM, dữ liệu nghiệp vụ, domain/Edge/network và bốn API-key providers paused. Không hosted Files API/file_search, mua dịch vụ, yêu cầu API key mới hoặc dùng cookie/token Codex/endpoint ChatGPT nội bộ. P3 chịu upload/parser/10 GB; P2 chỉ đọc nguồn đã READY và hợp lệ từ domain hiện hữu.

P2-A gồm quality/context/read tools; P2-B gồm search/citations/privacy và benchmark. Mỗi phần có release gate riêng. Thiếu native search không chặn kiến thức tổng quát hoặc read tools, nhưng WEB_SEARCH_LIVE không PASS bằng việc chỉ fetch URL.

## 2. Baseline đã kiểm chứng và code liên quan

Canonical `/home/galaxy_os/.worktrees/m2-a-20260928`, HEAD dirty `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`. P1-A main `local-62edbe7afe76`, schema86, owner inference thật ở ba Project. Candidate P1-B `local-0397d1fe9b05` có memory/history/provenance và ba read tool mới; chưa migration/cutover main. Không lấy fixture làm bằng chứng P2 live.

Discovery đã xác định SIWC ban đầu chỉ task_list, history8 và chặn file/context. P1-A bỏ pilot ID; P1-B sửa memory/history. Registry còn có task_get/task_history, search_project_sources/read_project_source/read_project_records, calculate và analyze_table với executor hiện hữu. `ai-web.ts` có publicTarget/fetchPublicPage: DNS/IP/redirect checks, không chạy script, giới hạn thời gian/dung lượng. search_web hiện dùng Tavily key và legacy-provider gate; không dùng nó như fallback SIWC hoặc tự bật keyed provider.

Các chỗ cần thay: ai-chatgpt-plan.ts/codec/tests, ai-tools.ts/tests, ProjectAiService dispatcher/view/citation, source resolver và ai-web.ts/tests; ProjectChat DTO, project-ai.tsx/tests, settings capability presentation, integration/browser/live harness. Không refactor toàn AI service hoặc tạo agent framework/provider song song.

## 3. Model, context và chất lượng

Catalog vẫn là catalog thật của ChatGptConnectionService.owner(). Selection phải pin đúng slug/generation/scope; returnedModel khác selectedModel là lỗi, không fallback. Reasoning/output/media chỉ gửi khi contract SIWC và phép thử của đúng model cho phép; không thêm max_output_tokens/temperature hoặc persistence provider chưa được hỗ trợ.

Giữ P1 source-aware context, conversation memory/private/shared, budget receipt, source/version rechecks và PARTIAL notice. Không dùng API public context window khác cho SIWC; token profile thiếu vẫn UNVERIFIED theo gate P1 đang có hiệu lực. Không sửa gate đó bằng spec P2.

Instructions mô tả trợ lý tổng quát, dùng tiếng người dùng, trả lời trực tiếp và phân tích theo độ phức tạp, phân biệt dữ kiện/suy luận/giả định, không invent tool/source/business approval. Chỉ source instruction/prompt là dữ liệu không tin cậy. Không business-domain whitelist, static response, giới hạn vài dòng hoặc hidden-reasoning disclosure. Sửa caller/context/codec/loop theo test, không coi việc dài prompt là quality PASS.

## 4. Contract và dữ liệu

Request answer thêm searchMode enum AUTO/WEB/PROJECT_ONLY, mặc định AUTO. Backend validate strict và pin trong request metadata version4/payloadHash cùng server organizationId/projectId/actorId/conversationId/invokeGrantId/policy version. Version1–3 giữ semantics cũ; không rewrite row cũ. Cùng clientKey khác mode/public-query authorization trả409.

Public-query authorization có query string tối đa400 ký tự, nguồn USER_CURRENT_SEARCH_REQUEST hoặc VERIFIED_PUBLIC_IDENTIFIER, query hash, actor/scope/answer/policy và timestamp. Không có credential/private document text. Record nằm trong usage của answer hiện hữu; chỉ backend tạo authorization từ thao tác/ý định công khai hợp lệ, không tin nguồn/permission do model tự khai.

Capability evidence dùng OrganizationSetting hiện hữu, key project_ai_capability_evidence, scoped organization + connection generation + exact model + route + contract version. Chỉ metadata trạng thái UNKNOWN/SUPPORTED/UNSUPPORTED, testedAt, error code/request ID nullable và hash receipt redacted. Không thay record connection hoặc catalog, không lưu token/prompt/private answer. Chỉ owner có system.settings.update và entitlement được thực hiện probe; member chỉ thấy capability dùng được của actor. Connection/model/contract thay thì evidence cũ không tự cấp capability mới.

Web receipt lưu trong answer.usage.webEvidence: execution scope, mode, public-query authorization hash, source kind NATIVE_SEARCH/PUBLIC_SEARCH_API/PUBLIC_PAGE, terminal/status, real request ID nếu có, action/URL/title/publishedAt nullable/retrievedAt và source hash khi đọc trang. Native URL annotation giữ provenance/offset gốc; offset/URL bất hợp lệ không được render như trusted citation. Không dùng retrievedAt thay publishedAt.

P2 không cần domain table mới: request/receipt JSON có Zod strict; capability dùng OrganizationSetting. Nếu implementation phát hiện cần schema thay ngoài thiết kế này, tách quyết định phát sinh trước migration; không tự duplicate source-of-truth.

## 5. Read tools thực thi thật

Giữ bốn P1 read tools. Nối task_get/task_history, search_project_sources/read_project_source, read_project_records(stage_two_plan) và calculate vào SIWC khi có executor/permission tương ứng. analyze_table chỉ advertise với source có sheet/range index thực; image representation chỉ khi vision đã được cấp và kiểm chứng. Không đưa create_document/revise_draft/write/approve/finance action vào allowlist này.

Tái sử dụng schema hiện hữu; tool args không nhận projectId/org/actor override. Dispatcher lấy scope đã pin, kiểm quyền/source ở query, trước reinjection và trước delivery/citation. Decimal giữ string/precision hiện hành. Financial fields chỉ khi actor có permission và request cụ thể. Không trả denied row/count/snippet để model lọc.

Mỗi invocation có call_id, tên, trạng thái, duration và consumed source/version proof. Chạy query thật, persist dependency trong transaction, trả function_call_output đúng ID và tiếp tục model tới completion. Lỗi quyền/capability trả lỗi có giới hạn, không fake-success; general QA còn được trả lời khi không cần nguồn bị từ chối. Rebudget toàn wire mỗi vòng; tối đa bốn provider rounds trong timeout110 giây hiện hữu, không giữ Project lock qua network.

## 6. Privacy: public search là pha riêng

Không đặt hosted web_search hoặc tool nhận free-form public query trong inference đang có private Project context. Pha công khai chỉ nhận public query được server cho phép, model/policy/time và public results; không nhận Project name, customer, contract, Task, memory, history, file hoặc hidden context. Kết quả công khai sau đó đưa vào pha tổng hợp có quyền Project như dữ liệu.

Với câu hỏi tổng quát, AUTO có thể lấy search intent từ chính yêu cầu hiện tại về thông tin công khai, không dùng lịch sử/private retrieval để viết query. Không suy rằng mọi nội dung người dùng dán vào chat là được công bố. Khi câu hỏi chứa/đòi hỏi thông tin Project riêng hoặc không xác định được query công khai, pipeline chỉ đề xuất query cụ thể để người dùng xác nhận; chưa xác nhận thì không network. Đây là ranh giới egress, không chỉ system prompt hoặc bộ lọc tên.

Với TV trong công trình: resolver lấy đúng thiết bị theo ACL; chỉ brand/model/version hoặc URL hãng đã được xác minh là identifier công khai mới vào public-query authorization. Nếu chưa chứng minh được hoặc identifier lấy từ nguồn bí mật, phải có xác nhận công bố query cụ thể. Không đưa tên khách/địa chỉ/giá vốn/hợp đồng vào query. Mọi model-call tool ở pha private chỉ dùng queryId đã cấp, không tự thay text/domain/URL. Authorization không có hoặc scope/policy sai thì từ chối.

PROJECT_ONLY không gọi pha web/public network, kể cả model/prompt yêu cầu. WEB ưu tiên tra cứu, chưa có source không tự biến câu trả lời từ model thành search-success. AUTO không ép tìm web cho câu hỏi kiến thức ổn định. User yêu cầu không-web được pin rõ từ UI/command; không dùng keyword parsing thay backend mode fence.

## 7. Native search và fallback hợp lệ

Đọc lại hợp đồng [SIWC preview](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations), [models/inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [Responses web search](https://developers.openai.com/api/docs/guides/tools-web-search) trước code/probe. Docs cho biết shape/capability chung; availability phải chứng minh bằng account/route thật.

Probe native một lần cho từng model/contract cần nghiệm thu, bằng câu hỏi công khai không chứa Project data. Request đúng schema, input array/store:false/stream:true, selected model giữ nguyên. Codec nhận web_search_call và URL annotations thực, giữ opaque continuation hợp lệ, không coi delta/HTTP200 là completed. HTTP/param/code/request ID và terminal được ghi redacted; 401/403/capability denial không retry vô hạn hoặc đổi credential/provider.

Chỉ bật native khi tool action thật và câu trả lời có nguồn dùng được. Public-phase budget giới hạn số provider calls trong tổng bốn rounds; theo dõi tối đa hai search actions, quá giới hạn cancel và lỗi thật. Không gửi tham số kiểm quota mà SIWC chưa hỗ trợ. Không công bố số chi phí/quota giả; tuân plan entitlement hiện hành.

Nếu native bị chặn, triển khai custom/function search_public_web({queryId}) và fetch_public_page({urlId}) trong namespace Galaxy. queryId/URL handle do server bind với public-query authorization và public results; model không gửi raw URL tùy ý. Tái sử dụng fetchPublicPage/publicTarget và codec function tools; không nới legacy provider gate để dùng Tavily.

Fallback search chỉ dùng public search API do operator cho phép truy vấn tự động, không key/đăng nhập/chi phí mới. Trước bật phải ghi endpoint/terms/contract và một search/result/read/response.completed thật. Không scrape endpoint bị cấm, dùng browser cookie, hoặc tự thêm SearXNG stack/provider trả phí. Nếu chưa tìm được đường hợp lệ/khả dụng, đánh dấu WEB_SEARCH_LIVE BLOCKED với bằng chứng; fetch URL hợp lệ vẫn có thể hỗ trợ WEB_RETRIEVAL_ONLY nhưng không thay search nghiệm thu. Chọn endpoint và chứng minh terms/availability là task kiểm capability trong plan, không tạo abstraction tìm kiếm đa provider.

## 8. Nguồn, SSRF và prompt injection

Search result giữ URL/title/snippet/date; đọc nội dung liên quan trước kết luận, ưu tiên hãng/tài liệu chính thức. Chỉ thấy snippet thì nhãn SNIPPET/chưa đọc trang; không claim đọc catalogue đầy đủ. Giá phải nêu vùng/đơn vị/thời điểm và tình trạng chưa xác minh. Không tìm nguồn tốt thì nói rõ.

Galaxy fetch chỉ http/https, không userinfo/key/token query, không port tùy ý; DNS tất cả addresses phải public và socket pin address. Chặn loopback/link-local/private/mapped IPv6/metadata endpoints/DNS rebinding và mỗi redirect; tối đa ba redirects, timeout10 giây, byte/node ceiling hiện hữu, tối đa ba trang mỗi answer. Không gửi Galaxy cookie/Authorization headers tới web. Không execute script, tải tài nguyên nhúng hoặc giải CAPTCHA.

Public content luôn untrusted. Web/document injection không được đổi scope/tool/mode/system instructions, đọc private sources hoặc ghi business data. Citation chỉ từ actual receipt/annotation/server handle; URL unsafe/tamper/source không tồn tại bị loại hoặc lỗi, không tạo citation bằng trí nhớ model. Project citation và public citation có kind riêng; final answer/citation vẫn recheck Project ACL, không biến answer chứa dữ liệu private thành public vì có link ngoài.

## 9. UI và API trình bày

UI thêm Auto/Tìm web/Chỉ Project cạnh model picker; scope theo actor/Project/conversation, mode request giữ sau reload và switch. Không hỏi lại Project đã xác định. Hiển thị trạng thái Đang tìm/Đang đọc nguồn chỉ từ actual activity, nguồn có link thật và loại Project/Web. Capability không khả dụng có lý do và lựa chọn đổi mode/model, không reconnect khi chỉ đổi Project.

Tái sử dụng SourceDrawer/citation route hiện hữu; detail public source có title/URL/publishedAt/retrievedAt/coverage. Không đưa tokenizer/policy/raw trace vào flow thường. Private query cần consent thì hiển thị đúng query sẽ công bố, không generic blanket consent. Pending A response/tool/query approval không cập nhật B; abort/unmount/source recheck giữ P1 isolation. Desktop/mobile375/keyboard kiểm thật.

## 10. Kiểm thử, release và rollback

TDD từng lỗi/contract: exact model/no fallback, general QA không nguồn, matched tool calls/executor/reinjection, schema native events/annotation, mode/idempotency, SSRF/redirect/DNS/cancel, private-to-public taint boundary, revoked Project sources và invalid citations. Real PostgreSQL integration kiểm actor/tenant/Project/source ở backend; provider mocks chỉ kiểm protocol.

Fixture browser kiểm ba modes/reload/two tabs/late stream/consent/current source links/mobile. Main live benchmark cùng model gồm: kiến thức phổ thông, SQL JOIN/Next.js, inverter kỹ thuật chuyên sâu, lựa chọn sản phẩm, thông tin mới, giá/catalogue hãng, Project tasks, Project+web và follow-up nhiều lượt; thêm không có nguồn đáng tin. Ghi model/context classes/tools advertised và tools thật chạy, terminal/usage/latency/error, accuracy/source hỗ trợ claim. Không log private context hoặc chain-of-thought.

WEB_SEARCH_LIVE chỉ PASS có network/tool tìm thật và nội dung dùng được; WEB_CITATIONS cần URL hỗ trợ câu trả lời; PROJECT_WEB_COMBINATION cần separate sources và zero private sentinels trên public requests. Chưa đạt thì BLOCKED/NOT_RUN riêng, không lấy độ dài/test count làm quality PASS hoặc hứa giống100% ChatGPT product.

Full lint/typecheck/test/build/format, independent correctness/Ponytail/security/auth/UX review, frozen artifact/provenance, backup/compatibility/rollback và candidate live phải đạt trước cutover. Release P2-A riêng nếu đạt, không đợi P3. Rollback về artifact được nghiệm thu gần nhất, giữ schema/data/evidence; không reset/restore DB để lùi app. No commit/push/PR nếu không có lệnh riêng.

## 11. Self-review revision 1

Đủ model/request contracts, mode/egress authorization, existing tools/ACL, native/fallback/error/SSRF, citation/UI, tests/quality/live và rollback. Không sửa P1 gate, OAuth hoặc entitlement. Unknown native/free-search capability có phép thử và BLOCKED disposition rõ; không ghi đã có endpoint hoặc native PASS khi chưa chạy. Written spec approval là gate tiếp theo; sau đó mới viết implementation plan đầy đủ và xin duyệt một lần theo Superpowers.

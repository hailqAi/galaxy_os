# E01-CP-r18 — SIWC/context và đóng phiên

Ngày 10/10/2026, Asia/Bangkok. Nguồn: chỉ đạo owner mới nhất, source canonical, các receipt private trong `/home/galaxy_os/.runtime/e01-20261010-r1/resume-20261010`. Bản này thay hiện trạng tạm dừng CP-r16 và bản phát hành thử r5 của CP-r17; giữ các mốc cũ làm lịch sử. Không chứng nhận hoàn thành toàn P2/P3 hoặc “full token”.

## Quyết định owner và Workspace

Owner xác nhận chỉ dùng ChatGPT cá nhân, chưa có workspace Business/Enterprise/Edu được xác minh có Workspace Agents. Nhánh Workspace **BLOCKED — chưa đủ điều kiện theo owner**; entitlement từ provider riêng biệt **UNVERIFIED**, không có phép thử provider từ chối. Không yêu cầu điền Workspace ID, agent/channel ID hoặc access token lúc này. Không thay bằng SIWC/Codex token, cookie hay API key. Chỉ tiếp tục tạo/publish agent, channel và token riêng khi có workspace phù hợp. Không mua gói/credits hoặc bật bốn provider-key paused.

User yêu cầu hoàn tất đóng phiên, giữ SIWC và tăng context. P1 spec/plan và E01 approval giữ hiệu lực; written-spec/plan gates P2/P3 còn thiếu, không tự suy approval từ yêu cầu đóng phiên. Không hỏi lại P1, không bắt đầu thiết kế lại.

## Runtime đang phục vụ

- **READY: `local-651479a7e9ce`**, API3001/Web3000, artifact `/home/galaxy_os/.runtime/releases/e01-t1-p1-b-20261009-r3`.
- Main schema **90**, pending0. Chỉ rollback ứng dụng theo manifest schema90-compatible đã chuẩn bị; không rollback/reset/restore DB. Giữ memory, conversation, file, audit và các receipt r5 trong DB/storage.
- Windows HTTP thật sau rollback: localhost3000, LAN `192.168.1.80:3000`, HTTPS `os.galaxycentre.vn` cùng Web/API release trên, health/ready200 và database connected. `routes-close.json`, `safe-rollback-status.log`, `safe-rollback-artifacts.log`.
- SIWC/OAuth/callback/refresh/owner connection và policy `CHATGPT_PLAN_ONLY` giữ. Workspace feature mặc định false trong env của artifact fallback. Env khác r5 chỉ release marker và hai Workspace settings; không thay credentials/storage/Edge/domain.
- Trước rollback:0answer RUNNING. Sau rollback:0answer RUNNING,7model capability profiles còn nguyên,7profile có observed high,1profile có native-web proof;0Workspace job/connector grant. `preserved-state-close.json`.

CODE_SHA(base, dirty source): `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`. Worktree `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`, không staged/commit/push.

| Provenance    | Deployed P1-B r3                                                   | Candidate r6 chưa phát hành                                        |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Release       | `local-651479a7e9ce`                                               | `local-08211a8fee99`                                               |
| TESTED_TREE   | `502db7d7c12415ff642400589d57994e04c2719e`                         | `c7f7e0e6c6f0456bc8ffbf536b972ec077d5bca2`                         |
| Source digest | `651479a7e9ce7a9bba8e74cf2f78a7e7fbac6f6a314ba6d7b8dc12306fa30a9b` | `08211a8fee99773fbafd7c2411acfd577a5ae94e6fc67f7a2c88ce9a16b2d960` |
| Web BUILD_ID  | `MXYPOmLgAH905VK0bENEs`                                            | `ccfjKblm4_dHpC5GXZkkp`                                            |
| Artifact      | `/home/galaxy_os/.runtime/releases/e01-t1-p1-b-20261009-r3`        | `/home/galaxy_os/.runtime/releases/e01-bridge-20261010-r6`         |

TESTED_TREE là tree frozen trước cập nhật handoff; code product/test r6 giữ khớp artifact. Tài liệu cuối phiên được ghi riêng, không giả canonical dirty tree là artifact đang chạy.

## SIWC/context đã có bằng chứng

P1-B đang chạy có AI đa Project theo actor/IAM/provider entitlement, private/shared memory với provenance/version và kiểm quyền server. Giới hạn history8lượt đã bỏ: recent history theo budget, private conversation summary có lineage và retrieval history/memory. Project là ngữ cảnh, không là whitelist chủ đề.

Main r3 đã nghiệm thu ở CP-r10:36localhost+1HTTPS answer `response.completed`, model thật `gpt-6.1-sol`, private/shared/isolation, ba memory/history read tools, nhiều lượt liên tiếp/summary/reload/hai tab. Đây là bằng chứng của đúng artifact r3; không nhận là lượt live mới sau rollback schema90.

Lượt r5 trước rollback có thêm bằng chứng thực, giữ riêng phạm vi/thời điểm:

- UI chat ba Project, model đúng, reload và kiến thức SQL/inverter: `main-browser-r5.json`, `main-tools-web-r5.json`; tool calculate/task_list thực và Decimal `9007199254740993.10` chính xác.
- Private/shared memory hai Project, revision2/1, foreignProject404, private không tự shared, actual search/read/citations: `main-memory-r5.json`; chỉ ba note tổng hợp được inactive sau test, không sửa business task/record.
- History hơn30lượt, retrieval về lượt đầu và dùng summary/lineage, `response.completed`: `main-history-r5.json`. Search lexical theo token đầy đủ; truy vấn suffix không khớp được giữ trong `main-history-suffix-r5.json`, không gọi đây là fuzzy/vector retrieval.
  -7model thực requested/observed đúng, effort high có telemetry: `live-capabilities-r5.json`. Không thử/xác minh xhigh/max, token ceiling, tokenizer/context capacity chính xác. Receipt vẫn lưu nhưng UI effort mở rộng của r5 hiện không active trên fallback r3.
- PDF tổng hợp do `create_document` tạo thật,11768bytes, SHA256 `6075d3fa105ce530f9c7610e90a3b9bb8fcf73411a02d78357918b21fcc0654d`; download/Poppler/version/foreignProject404. Sau index đúng file/version, `read_project_source` trả nội dung/page1/lines6–7 và answer `response.completed`: `main-pdf-r5.json`, `main-pdf-read-r5.json`. Không chứng nhận P3 chat upload/all-format/10GB; chức năng E01 file mở rộng này không active trên fallback r3.

**Token/context:** profile capacity SIWC vẫn UNVERIFIED theo ngoại lệ owner đã duyệt. Local wire guards256000bytes/64records không phải số token context của model. Không gửi tham số max-output không được SIWC hỗ trợ, không hứa “full token” hoặc context size từ model name. Việc bỏ8lượt + summary/retrieval đã có live proof; chưa biết toàn bộ giới hạn provider.

## Lý do r6 không phát hành và bản sửa code

Provider native web thực hỗ trợ: capability probe thật và một answer r5 có7searches,10URL annotations, `response.completed`. Các query nghiệm thu chỉ dùng nguồn OpenAI công khai; **không quan sát thấy rò rỉ**. Tuy nhiên source có đường native web dùng chung request với tên Project, actor, private history/memory và tools. Native provider không cho Galaxy duyệt query trước khi thực thi. Review xác nhận nguy cơ đưa dữ liệu riêng vào query công khai.

Fix tối thiểu r6:

1. `apps/api/src/project-chat/project-ai.service.ts`: catalog không quảng cáo native web trong Project; admission trả `SIWC_WEB_SEARCH_PRIVACY_UNVERIFIED`; dispatch cũng chặn pin native đã queued trước khi assemble context hoặc gọi provider. Giữ capability receipt thực, non-web SIWC/memory/tools.
2. `apps/api/src/project-chat/ai-chatgpt-service.test.ts`: regression admission + queued pin có scope hợp lệ, assert provider không được gọi.
3. `apps/web/features/project-chat/project-ai.tsx`: giải thích lý do privacy rõ bằng tiếng Việt, không báo lỗi cấu hình Workspace.
4. `apps/web/features/project-chat/project-ai.test.tsx`: kiểm thông báo và UI.

TDD2API+1Web RED→GREEN, API35/Web20 PASS. Focused reviewer cuối:0Critical/Important; Minor duy nhất là check capability web unreachable có thể xóa hai dòng khi cập nhật sau, không ảnh hưởng đúng/safety. Không đổi artifact frozen chỉ để cleanup này. Tách public-query phase khỏi private synthesis nằm trong P2 written spec pending; không triển khai kiến trúc chưa duyệt tại E01.

R6 build API/Web/Edge, typecheck/lint/format **PASS**. Fresh unit **1900PASS = API1309 + Web585 + Edge5 + document1**, gồm Poppler thật. Full regression mới **exit1**, integration fixture không tới được PostgreSQL55435; nguyên nhân hạ tầng đã xác định: Windows reserved range55351–55450 chứa55435, Docker `/forwards/expose`500, container fixture exited255/OOMfalse. Hai lần start đúng container hiện hữu đều thất bại. Không đổi port/network hay dựng stack/DB mới. Lỗi PDF env trong lượt full đầu đã được sửa ở runner private bằng `GALAXY_AI_PDF_LIBRARY_PATH`; unit real-Poppler sau đó PASS, không thay product để che lỗi test.

R5 full trước đó2171PASS (API1581/Web584/Edge5/document1), PostgreSQL focused39, fixture browser7 và live ở trên **không thay gate r6 mới**. Vì r6 thiếu full integration/browser gate, không cutover r6. Dùng rollback app r3 đã kiểm chứng để không để native-web path chưa an toàn phục vụ owner. R6 source/artifact giữ sẵn để tiếp tục đúng gate, không cần discovery/build thêm candidate.

Chrome Windows listener33004 hiện không còn; bridge33005 socket hangup, nên main live sau rollback **BLOCKED**, không giả PASS. Không khởi động/reconfigure Chrome. Đã dừng bridge tạm của phiên; API/Web main tiếp tục. HTTP routes vẫn được xác minh mới độc lập với browser.

## Trạng thái cuối phiên

| Mục                                 | Kết quả | Phạm vi thực tế                                                                                    |
| ----------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| P1_PROJECT_AI                       | PASS    | Live của đúng r3 tại CP-r10 và r5 ba Project; fresh post-rollback browser BLOCKED                  |
| P1_PRIVATE_MEMORY                   | PASS    | r3/r5 live; dữ liệu/ACL giữ, không có staff main session mới                                       |
| P1_SHARED_MEMORY                    | PASS    | Owner publish/manage và fixture actor2; không tự chia sẻ private                                   |
| P1_MEMORY_ISOLATION                 | PASS    | Backend integration, main foreign404 và hai Project tools/reload; post-rollback live chưa chạy mới |
| MODEL_SELECTION                     | PASS    | Exact requested/observed r3/r5;7model effort probe r5, không claim toàn benchmark                  |
| PROJECT_CONTEXT                     | PASS    | Server pin/scope, memory/history tools và project switching live trước rollback                    |
| GENERAL_QA_QUALITY / P2_GENERAL_QA  | NOT_RUN | General Q&A r3/r5 có proof; chưa benchmark đầy đủ P2                                               |
| P2_CONTEXT / P2_TOOLS               | NOT_RUN | P1 context +4tools r3 active; E01 mở rộng r5 proof lịch sử, chưa final P2                          |
| WEB_SEARCH_LIVE / P2_WEB_SEARCH     | BLOCKED | Provider proof thật giữ; app Project native web chặn vì public/private isolation chưa đạt          |
| WEB_CITATIONS / P2_CITATIONS        | BLOCKED | 10URL annotations thật r5; không báo native web an toàn đang active                                |
| PROJECT_WEB_COMBINATION             | BLOCKED | Chờ P2 public-query/private-synthesis gate                                                         |
| FILE_UPLOAD / P3_UPLOAD             | NOT_RUN | P3 resumable chat upload chưa triển khai/nghiệm thu                                                |
| FILE_EXTRACTION / P3_FILE_PARSING   | NOT_RUN | E01 PDF/DOCX/XLSX parser/source proof không thay toàn P3                                           |
| FILE_AI_RETRIEVAL / P3_AI_RETRIEVAL | NOT_RUN | E01 PDF đọc thật r5; mở rộng file AI chưa active trên fallback                                     |
| LARGE_FILE_10GB / P3_10GB_LIMIT     | NOT_RUN | Chưa bật/nghiệm thu10000000000bytes                                                                |
| SECURITY_ACL                        | PASS    | P1 + r5 fixture/source/version/revoke checks; r6 privacy fix reviewed, chưa deployed               |
| REGRESSION                          | BLOCKED | R6 unit1900/static/build PASS; full integration exit1 vì reserved port55435                        |
| DEPLOYED_RUNTIME                    | PASS    | Safe r3 READY/schema90, exact artifacts và3origins HTTP200; fresh browser/live BLOCKED             |
| WORKSPACE                           | BLOCKED | Owner personal account; provider entitlement UNVERIFIED;0job/connector, featurefalse               |

## Điểm tiếp tục nếu owner mở phiên mới

Không có yêu cầu owner làm thêm khi đóng phiên này. Nếu tiếp tục: xử lý đúng blocker fixture55435 bằng quyết định vận hành có quyền, chạy lại một full regression trên frozen r6/source khớp, exact artifact browser, main owner live và app-only cutover theo gate. Không dùng main làm test DB. Không mở Workspace khi chưa có entitlement. P2/P3 tiếp tục written gates còn thiếu, không hỏi lại P1/E01 approvals. Giữ backups/restore receipts/schema90/fallback; không sửa OAuth/network hoặc paused providers.

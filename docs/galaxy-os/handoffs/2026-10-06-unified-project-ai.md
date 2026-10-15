# Chat AI thống nhất theo Project — bàn giao 06/10/2026

## Trạng thái thực

Đã phát hành local và nghiệm thu luồng chính trên Chrome LAN: Project → Galaxy AI → câu hỏi/file → Gửi. **Chưa đánh dấu hoàn tất toàn bộ yêu cầu**: tổng hợp nghiệp vụ đầy đủ chưa nối read service có quyền từng trường. Hồi quy chuẩn cuối cùng đã đạt; các lượt timeout trước đó được giữ trong sổ kiểm thử. Các giới hạn định dạng và phạm vi test ảnh được ghi riêng dưới đây.

Worktree `/home/galaxy_os/.worktrees/m2-a-20260928`, branch `m2/project-chat-20260928`. HEAD nền `32d62a244fce352e29a712bc3b19bfa9c66afab2`; source/docs đang có diff, không commit/push/merge. CODE_SHA và DOCS_COMMIT_SHA mới chưa tồn tại. Artifact được build từ snapshot SHA256 `a0429faf5733b54f13d125da20c7990a9c965ffa48f9c2f81674d4a2cf8ec5eb`; đây là TESTED_SNAPSHOT, không phải Git commit. So sánh 380 tệp TS/TSX ứng dụng với artifact khớp, digest tập này `d7d8b8664106987089bd548e1495af597b2c97b93d4fcaa7378b56eb8ca3812b`.

Release cuối `local-a0429faf5733`, artifact `/home/galaxy_os/.runtime/releases/unified-project-chat-20261006-r3`, webBuildId `yDShl4tt3WFOqtWexrpdl`. API/Web systemd READY, schema86. Manifest canonical `/home/galaxy_os/.runtime/local-runtime.json`. Credential canonical, policy/privacy/FREE_ONLY, Edge/keeper, DB/storage/session giữ; public domain đóng. Không next dev, không đổi clock/firewall.

## Quyết định thay pilot và quyền giữ lại

Nguồn phê duyệt: prompt trực tiếp của chủ dự án ngày06/10, OWNER_APPROVED_CURRENT_PROMPT; [quyết định canonical](../02-SCOPE-AND-DECISIONS.md), [thiết kế/kế hoạch](../milestones/M3/UNIFIED-CHAT.md). Metadata thực lưu `PROJECT_AUTHORIZED`, revision `owner-project-chat-20261006`, organization `0d00c5d0-c41c-4e82-b05e-9ff54c59a861`, thời điểm UTC và decisionReference. Không giả actor/chữ ký, không tạo approval đầu vào.

Chỉ OpenRouter đang bật của tenant này được dùng câu hỏi/nguồn actor được đọc. Request mới UNIFIED do server xác định, không cần mode, approvalId hoặc synthetic/public flag. Giữ enum và audit cũ, lịch sử provider, approved-document immutability và duyệt nghiệp vụ. Giữ fresh ai.invoke/Project INVOKE, source/room/version/field permissions, upload/download, source/project revocation độc lập, quota, FREE_ONLY và `data_collection=deny`. Không mở Gemini/Mistral/Kira/LlamaCloud, không nới privacy hoặc dùng paid để tìm endpoint.

Đã bỏ thật control mode, approve/revoke input, checkbox synthetic, provider config/diagnostics/paused list và LlamaCloud khỏi composer/popup/P04/trang AI. Chỉ model khả dụng, mặc định OpenRouter. Cấu hình quản trị hiện hữu không bị xóa.

## Context, bộ nhớ và isolation

Tái dùng conversation, FileAsset, version, storage, ChatAiSourceIndex và dependency/citation. Retrieval UNIFIED lấy nguồn có quyền toàn Project; group là ngữ cảnh làm việc. File chọn được ưu tiên, lượt nối tiếp kế thừa nguồn đã dùng và kiểm lại quyền; chat mới cùng Project tìm lại file riêng đã index. Không dùng provider conversation ID hoặc một summary làm nguồn chính. Context/history có giới hạn; index theo version, lease fencing; bản cũ bị thay version không lấn top-k bản hiện hành.

File AI riêng gắn owner/conversation/Project, không cần room và không public. Generic search/list/download không lộ file riêng; hồ sơ nghiệp vụ dùng lại FilesService/ACL, lọc tài chính trước retrieval. Nguồn không phải chỉ thị; không model tool thực thi SQL/shell/URL. Revocation kiểm ở dispatch/delivery/history. Answer AI vẫn chưa là quyết định đã duyệt.

Đã kiểm DB cô lập: hai Project, quyền riêng theo owner, nguồn hồ sơ chia sẻ được phép, chat mới, cross-project source bị từ chối trước dispatch, revoke và cache/history, version cũ/bản mới, nguồn chứa injection, 51 index phiên bản cũ được loại khỏi source metadata; bản hiện hành còn lại, pin bản cũ không trả nguồn. Không chạy test revoke/cross-tenant/phá dữ liệu trên main.

**Giới hạn còn lại:** chưa có đường tổng hợp nghiệp vụ đầy đủ (tổng tiền/số lượng/tập dữ liệu toàn miền) từ read service có field authorization tương ứng. Không dùng `operationsSummary` nguyên khối vì quyền từng miền chưa đủ, tổng inventory còn trộn vật tư/đơn vị. System instruction cấm gọi top-k là tổng đầy đủ; điều này chưa thay thế một cơ chế aggregate backend. Không báo AI hiểu toàn bộ ERP hoặc đủ12giai đoạn bằng vài đoạn nguồn.

## Root cause đính kèm và sửa thực

Nút cũ chỉ mở/cập nhật danh sách nguồn index; không có đường input file/upload từ máy. Source index còn bắt room; OpenRouter cũ không nhận source context. Đã thêm menu “Tải tệp từ máy”/“Chọn trong hồ sơ dự án”, input type=file native, FormData File thật qua proxy cùng origin, boundary do browser tạo. Tạo conversation riêng idempotent nếu chưa có, không tạo room giả.

Tái dùng multipart admission, MIME/size validation, storage và FileAsset; source/link transaction kiểm owner/Project/version/checksum và kiểm quyền lại sau publish. Retry cùng key không nhân bản ghi; đã có source thì retry index, bỏ chip không xóa binary. Các trạng thái tải/lưu/đọc/sẵn sàng/lỗi, giữ nháp khi lỗi. Test Chrome giữ index pending rồi Gửi: tự tiếp tục một lần, một dispatch.

PDF live đầu trả vendor200 nhưng ANSWER_SCHEMA: adapter mới chỉ nhắc JSON bằng prompt. Patch thêm OpenRouter `response_format=json_schema`, strict, require_parameters và giới hạn answer/citation/uncertainty khớp validator; citation enum do backend cấp, không nhận URL/ID model bịa. Test RED→GREEN và review đạt. Lượt lỗi được giữ, không tính PASS.

Định dạng: TXT/MD text; PDF có text trích local pdftotext, page locator; PNG/JPG từ bytes storage vào image_url data URI; XLSX dùng ExcelJS đã có, bounded workbook và sheet/cell locator, không tính lại formula. DOCX chưa có extractor hỗ trợ trong gói; PDF scan/password/ngoài giới hạn trả lỗi riêng, không giả đã đọc. Không OCR/LlamaCloud/plugin trả phí. PDF tối đa10trang, context text bị giới hạn.

## Nghiệm thu main và Chrome LAN

Windows/Chrome xác minh LAN hiện hành `http://192.168.1.80:3000/`; `.90` timeout, không giả định theo báo cáo cũ. Localhost và LAN cùng release cuối, session có hiệu lực. Đúng Project `d44348d5-89aa-46b2-8590-57c596275b28`, nhóm COMMERCIAL; API rooms trả0, panel AI vẫn dùng được.

Một hội thoại riêng kiểm chứng `23598caf-07d6-426b-82fa-85f87f8fe2f8`; một file “Kiểm chứng AI.pdf”,723byte, FileAsset `3306a202-70ca-4230-abf9-3abff964c5d3`, source `4a3c4342-eee6-4cb9-bc60-9c80fc8df6a8`. Version `1:81529169f4ac7b823c2ee62c99362f541cf1a47a76b90c68daa0f3b26d8d7644`; download200 khớp SHA256/bytes. Binary INTERNAL, owner đúng actor; source READY một chunk trang1. Không thêm Project/khách/room/dữ liệu tài chính main.

Native filechooser event đã phát sinh từ click + → Tải tệp từ máy; element type=file. Sau đó automation đưa file thật vào chooser, quan sát multipart có boundary, HTTP201, binary/link/extract/answer/download. Bằng chứng không chỉ là setInputFiles. Không secure-context flag, không gọi localhost3001 từ browser LAN, không public URL/file.

| Lượt                                    | Request                                | Kết quả thực                                                                   |
| --------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| Câu mới chuyển chữ hoa, không whitelist | `1b0a85c3-076b-4843-bbec-32cf310392bb` | COMPLETED; source0; BÌNH MINH ZQ7419; release r1, nhánh text không đổi trên r3 |
| PDF trước sửa response schema           | `d5fb3985-a6ca-44ba-9879-4b38f556220c` | FAILED/ANSWER_SCHEMA; vendor200; không xóa lịch sử                             |
| PDF trên release cuối                   | `e305d1e0-7d54-46f8-a97e-a852e375bde9` | COMPLETED; đúng LAN-Q8473,1379mm,14/10/2026; citation trang1/version trên      |
| Nối tiếp “cái đó…”                      | `00d89bd5-7227-468b-a9af-a9d3058c77b7` | COMPLETED;1379mm,14/10/2026; client sourceIds rỗng, không upload/chọn lại      |
| PNG capability kỹ thuật                 | `b3c2d0f4-93be-4f78-abcd-611b6137f3ef` | API main/vendor200, nhận đúng nền xanh, evidence PASS                          |

Requested `openrouter/free`, returned `dots-studio/dots-3-note-preview:free`, provider AtlasCloud ở các lượt chat hoàn tất. Mỗi request trên có đúng một log dispatch attempt1, không retry; ba answer cá nhân thành công đều usage.cost0. Citation click mở drawer và link đúng version200. PNG dùng fixture của endpoint kiểm capability quản trị, không upload FileAsset thứ hai; **không coi đây là nghiệm thu upload ảnh main qua composer**. Chưa live JPG/XLSX/DOCX. Không coi admin echo200 là bằng chứng PDF/main chat.

Popup560/mở rộng1100, font16/line26 đo bằng Chrome. Panel→popup→trangAI→reload giữ history,0POST phát sinh; control cũ vắng. Chrome trả về Project/Làm việc/COMMERCIAL. Screenshot/receipts riêng ở `/home/galaxy_os/.runtime/unified-chat-20261006/`, không chứa credential.

## Kiểm thử và release

- Trước patch structured output: `pnpm test` run4 PASS API1314/Web564/Edge5/document1.
- Lượt trước trên mã cuối: `pnpm test` run6 API1313PASS/1FAIL, Web564PASS/Edge5PASS. FAIL duy nhất `m2-project-chat.integration.test.ts:2760`, snapshot contract/payment/installation, timeout5000ms. Chạy riêng cùng timeout cũng FAIL; lượt chẩn đoán15000ms đạt đủ assertion trong5099ms. **Không sửa timeout/test chuẩn, không tính run6 là PASS.**
- **Hồi quy cuối `pnpm test` run7 PASS: API1314/Web564/Edge5/document1**, sau khi dừng đúng API/Web/TLS fixture nền của phiên. Test snapshot M2 đạt4839ms dưới timeout5000ms nguyên bản; chưa đủ bằng chứng kết luận nguyên nhân timeout trước là contention. Không còn test FAIL trong lượt cuối.
- Focused OpenRouter/API22PASS; CLI26PASS; document-ai health riêng1PASS (cần môi trường cho phép test transport; bản sandbox bị dừng đúng PID). Chrome DB fixture: unified file/no-room1PASS, lifecycle/revoke/idempotency/late-Project7PASS. M3 integration33test đạt trong run6.
- Lint/typecheck/format/build và diff check đạt. Artifact cuối build production từ source snapshot riêng; review Astra high correctness/security/IAM/Ponytail đạt, không thêm dependency hoặc router mới. Các test cross-tenant/private/financial/paid-denial được giữ.
- Migration85/86 additive được diễn tập DB clone mới,229 bảng cũ khớp hash theo cột cũ. Khi main dừng writer: backup pg_dump/storage, áp dụng migration,229 bảng và67binary nguyên vẹn. Kiểm hash ban đầu so sánh thứ tự UNION không ổn định nên tự rollback ứng dụng; so sánh theo từng bảng chứng minh nguyên vẹn, sửa kiểm chứng rồi tiếp tục, không sửa/chạy lại migration đã áp dụng.
- Timestamp policy ban đầu dùng UTC+00:00 trong runbook, API contract yêu cầuZ: đã chuẩn hóa cùng thời điểm bằng CAS/lock; không đổi decision/revision/quyền/credential.
- R1 `local-dca01cca5b71` đã chạy trước khi phát hiện lỗi schema answer; r2 chỉ build, không phát hành; r3 `local-a0429faf5733` đang chạy. Chuyển r3 không migration/config change. Backup và rollback manifest/unit ở thư mục receipt riêng; rollback giữ schema86/data, không reset/restore DB.

Lệnh full test dùng env DB test `/home/galaxy_os/.runtime/ai-env-policy-20261005/fixture-api.env`, bỏ GALAXY_AI_CONFIG_FILE cho test legacy, cấp GALAXY_AI_PDFINFO/GALAXY_AI_PDF_LIBRARY_PATH đúng bộ công cụ local. Browser dùng cả env API/Web test, NODE_ENV=test và CDP33005; không chạy fixture vào main. Build dùng `scripts/prepare-local-release.py build` với manifest hiện hữu. Không chạy `prisma migrate dev` đòi reset hoặc db push.

## Phần tiếp tục, không che bằng READY

1. Kết nối aggregate nghiệp vụ có scope/field authorization và precision, đủ dữ liệu; hiện chưa triển khai.
2. Theo dõi độ ổn định thời gian test M2: lượt cuối đạt4839ms nhưng gần timeout5000ms; hai lượt trước timeout. Không thay timeout hoặc xóa test để tạo PASS.
3. Nghiệm thu upload PNG/JPG qua composer main chưa chạy để giữ đúng giới hạn một file kiểm chứng; PNG vendor capability thật đã PASS. XLSX mới kiểm extractor/bounds, chưa live vendor; DOCX và PDF scan chưa hỗ trợ.
4. Không triển khai OCR corpus, paid fallback, vector DB hoặc hệ thống bộ nhớ song song. Không khẳng định các phần này đã có.

Tham khảo contract đã đối chiếu: [OpenRouter Free Router](https://openrouter.ai/docs/guides/routing/routers/free-router), [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [provider selection](https://openrouter.ai/docs/guides/routing/provider-selection), [PDF inputs](https://openrouter.ai/docs/guides/overview/multimodal/pdfs), [input file](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file), [showOpenFilePicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker).

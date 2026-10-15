# P3 — file trong chat, extraction/retrieval và giới hạn10GB

Revision1, 09/10/2026. **WRITTEN_SPEC_REVIEW_PENDING.** Định hướng P3 đã được owner duyệt; bản viết cụ thể này chưa được duyệt. Không mở lại discovery. Chưa implementation plan/code/migration/cutover P3; sau written-spec approval mới viết plan và trình gate kế tiếp bằng Codex CLI.

## 1. Kết quả và phạm vi

Chat nhận file thật, lưu vào File domain/storage hiện hữu, xử lý có trạng thái, cho AI đọc phần được phép và dẫn đúng trang/sheet/range/đoạn/region. File riêng trong conversation không tự thành dữ liệu chia sẻ của Project. Giới hạn mỗi file mới là **10.000.000.000byte**, không phải token capacity hoặc binary gửi sang OpenAI.

P3-A phát hành độc lập pipeline upload/format thông dụng/retrieval/citations khi đạt gate; P3-B hoàn thiện xử lý theo phần, legacy converters và nghiệm thu storage10GB. Uploader resumable được nối từ P3-A, nhưng trần nhận file của runtime chỉ tăng tới10GB khi gate tài nguyên/full transfer P3-B đạt. UI trả effective maximum thật, không quảng cáo10GB trước khi bật an toàn. Giữ file đã tồn tại lớn hơn trần mới; không sửa/xóa dữ liệu cũ hoặc bỏ quota dự phòng.

Không sửa owner OAuth/lifecycle/connection, topology/domain/Edge/network, IAM/entitlement staff, four paused API-key providers hoặc nghiệp vụ12stage. Không tạo bucket/storage public, upload service song song, Files API/hosted file_search hoặc kích hoạt services/document-ai placeholder. Không thực thi file/macro/script, mua dịch vụ hoặc gửi file riêng lên public web.

## 2. Baseline và nơi tái sử dụng

Worktree `/home/galaxy_os/.worktrees/m2-a-20260928`, dirty HEAD `dd66c64046bcfcd5a40bdbf4bfa8df15d80ff04e`. Main P1-A `local-62edbe7afe76`, schema86; P1-B candidate `local-0397d1fe9b05` chưa main migration/cutover. Không dùng candidate/fixture làm bằng chứng main đọc file SIWC.

Chat upload đang dùng FileInterceptor/genericFileUploadLimits10MiB → FilesService.upload → FileAsset/EntityAttachment/ChatAiSourceIndex. SIWC nhánh inference hiện từ chối source/file context; UI chọn file thành công không phải model đã đọc. UploadsService đã streaming parts/hash/finalization/idempotency/quota/lease/cleanup, nhưng target chỉ requiredDocument hoặc stageOneDocument. Không tạo hồ sơ nghiệp vụ giả để dùng uploader.

FileAsset.sizeBytes và UploadSession.declaredSize/uploadedBytes đã BigInt. FileStorage có private path/no-follow/key validation/putStream và bounded scanner. Quota hiện giữ staging amplification3lần và global admission lock; chưa có filesystem free-space admission đủ cho10GB. Env uploader mặc định20GiB không có nghĩa chat/hạ tầng đã nghiệm thu10GB; phải đặt đúng decimal limit cho upload mới, bảo toàn quota legacy.

SourceIndex hiện có scope/private conversation, version/checksum, status/attempts/lease. Existing documentText đọc PDF text qua local Poppler, DOCX qua office-document/saxes và XLSX qua ExcelJS; phần lớn input8MB/XLSX5MB, text/index256KB. Source text/binary nhỏ được buffer có trần, không thể đổi trần thành10GB. Office archive có ZIP/DTD/macro/depth/expansion checks. Excel formula đọc cached value, không tính lại; DOCX hiện báo header/footer/footnotes chưa đọc. scanPages render tối đa ba trang có provenance, không chứng nhận toàn scan.

Frontend tái sử dụng `document-upload.tsx` validate/part geometry/resume/hash helpers và queue pattern hiện hữu, không sao chép toàn stage-document submission workflow vào chat. digestUploadBlob hiện arrayBuffer của Blob; chỉ dùng cho **part giới hạn**, không gọi trên File10GB. Progress tính bytes server xác nhận.

Các files/callers cần thay trong plan: uploads DTO/controller/service/module/tests; FileStorage/FilesService/quota/office parsers; Prisma schema/migrations; ProjectAiService/source index/checkSource/dispatcher/codec và source tools; project-ai.tsx/tests, upload helpers/browser tests; env example/runtime artifact/STATUS. Giữ legacy routes/contracts và source ACL.

## 3. Data model: mở rộng domain hiện hữu

UploadSession thêm nullable `aiConversationId` với composite FK tới ChatAiConversation `(id,organizationId,projectId,ownerId)` qua `(aiConversationId,organizationId,projectId,actorId)`. Exactly-one-target CHECK cho requiredDocumentId/stageOneDocumentId/aiConversationId; legacy rows phải hợp lệ trước validate. Unique `(organizationId,projectId,actorId,aiConversationId,idempotencyKey)` cho target mới; legacy uniqueness giữ. Không backfill conversation giả hoặc đổi hồ sơ cũ. Idempotency key UUID của chat; payload hash gồm scope/file name/declared size/MIME/checksum/target.

FileAsset vẫn là file gốc, immutable version/checksum cho index đang dùng; EntityAttachment nối vào owned ChatAiConversation, projectId lấy từ conversation server. ChatAiSourceIndex vẫn là source/processing job, không tạo tài liệu hay conversation domain khác. Parent private scope/source references/version hiện hữu phải được giữ.

Thêm child **ChatAiSourceChunk** để index lớn không nằm trong một JSON/text. Fields: idUUID, indexId/organizationId/projectId composite FK, sourceVersion, parserVersion, ordinal, contentText tối đa32768UTF8byte, contentHashSHA256, locatorJSON strict, coverageTEXT/OCR/VISION/METADATA/PARTIAL, createdAt. Unique indexId/parserVersion/ordinal; index tenant/project/indexId/ordinal. Private ownership và Project source quyền lấy từ parent hiện hành, không dùng chunk để mở ACL mới. FileId/version/checksum phải truy ngược parent/source và khớp trước trả chunk.

Locator theo kind: PDF page1-based + line/region khi parser cung cấp; spreadsheet sheet name + A1 range + row/column/unit/number format; Word paragraph/table/row/cell; presentation slide + notes; text/code line/column; image pixel region + original/derived dimensions. Không dựng locator từ model tự khai. Source handles gồm tenant/Project/index/file version/parser/locator/hash, server cấp và pin vào actual consumed-source receipt.

SourceIndex mở rộng processing metadataJSON strict: parser version, stored/preview/extraction/AI capability, completed coverage/cursor/counts, byte totals, resource error, optional derived object references. Existing text/chunks fields giữ cho legacy bounded indexes; new chunked indexes không mirror toàn nội dung vào đó. Citation nhận legacy và chunked source nhưng không nâng legacy thiếu proof thành trusted record.

Derived text/chunks là index có thể dựng lại, không file gốc hoặc approval nghiệp vụ. File update tạo version/index mới; không sửa chunk đã được answer dùng. Delete/inactive file/index làm future retrieval/citation fail closed theo ACL/version; retention/audit không xóa nguồn nghiệp vụ được bảo vệ.

## 4. API và upload target

Tái sử dụng `/uploads/initiate`, `/:id/parts`, `/:id/complete`, `/:id/abort`, `/:id/refresh`, `/:id`, `/recovery`, `/constraints`. Initiate có target aiConversationId khi không có target hồ sơ; backend xác thực actor/organization/Project/owner conversation và current ai.invoke/file.upload/INVOKE grant. Part/checksum/geometry không đổi wire contract. Recovery lọc owner/tenant/Project/conversation, không liệt kê session Project khác hoặc tự gắn session vào active Project mới.

Constraints cho target chat trả maxBytes effective = min(10.000.000.000, runtime admitted maximum), partSize, allowed storage formats/capability status. Không cho model hoặc frontend override target/quota/storage path. Size JSON gửi decimal string nơi response hiện đã dùng string; number input validate integer safe và convert BigInt khi persist.10GB còn trong Number.MAX_SAFE_INTEGER, không làm tròn qua32-bit.

Complete streaming verify all parts/checksums/size/MIME/container, giữ verification claim/CAS và current quyền trước finalization. Trong transaction cuối tạo đúng một FileAsset + EntityAttachment + private SourceIndex QUEUED, trả sourceId/fileId/version/checksum/processingStatus. Complete replay cùng payload trả cùng records; scope/payload đổi409, expired/abort/revoked từ chối. Không cần gọi `/uploads/submit` tạo business document cho target chat. Stage-document submit flow cũ giữ invariant và tests.

Upload tiến trình: INITIATED → UPLOADING → VERIFYING/SCANNING → AVAILABLE hoặc FAILED/ABORTED/EXPIRED/QUARANTINED. AVAILABLE chỉ stored/verified, **không đồng nghĩa AI readable**. File processing riêng QUEUED/PROCESSING/READY/PARTIAL/UNSUPPORTED/FAILED/FORBIDDEN. Status/download/index/citation API current source-check; không log file content hoặc private error detail.

## 5. Limit, disk, quota và cleanup

Server kiểm declared size tại initiate, expected part size/received bytes tại mỗi stream, aggregate và full file tại complete, final FileStorage limit trước commit. >10.000.000.000byte từ chối413; actual stream không được vượt declared size dù Content-Length giả/thiếu. Multipart route nhỏ legacy giữ trần nhỏ; không bodySizeLimit10GB.

Hash SHA256 incremental bằng Node crypto khi stream part/assembly; không Buffer.concat toàn file. Client hash từng part tối đa configured partSize, concurrency chat tối đa hai parts và một finalization; không WebCrypto arrayBuffer toàn file. Full checksum do server streaming tính và download/read-back xác minh; expected full checksum nếu caller cung cấp phải khớp. Resume chọn lại file cùng name/size, so part hashes đã upload và full finalize, không chỉ tin filename.

Reuse global/organization quota lock/reservations và actor session limits. Admission kiểm free bytes thực tại filesystem staging/final/DB-derived output, theo3lần amplification hiện hữu; same volume không double-count available, different volumes kiểm từng nơi. Giữ tối thiểu max(5GB,10%volume) headroom và reserve worst-case incoming/current outstanding sessions. Recheck trước part/finalization và xử lý ENOSPC streaming error/cleanup; quota config không thay disk capacity.

Không hạ legacy unmeasured reservation để vừa quota mới. Cleanup chỉ private staging/derived objects của sessions/claims expired hoặc detached được chứng minh, never parent business file. Trong-flight part/finalization/index lease không bị cleanup xóa; CAS/restart recovery, releasedAt và grace periods hiện hữu giữ. Abort/revoke dừng stream/child, release đúng claim; không xóa file đã attached/committed hoặc double-charge/release khi retry.

Resource evidence gồm actual disk/quota/reserved/amplification/peak RSS/CPU/IO/time. Main không dùng cho stress; đạt fixture trước bật effective maximum main. Nếu tài nguyên không đủ, upload lớn BLOCKED đúng reason và UI lower effective limit; không ghi10GB PASS bằng schema/metadata.

## 6. Extraction theo phần và processing lease

Reuse SourceIndex claim/attempts/lease; batch parse bên ngoài Project transaction. Job pin organization/Project/owner/conversation/file version/checksum/policy/parser/lease token. Recheck current quyền và original source before read, trước chunk write/checkpoint và trước READY. Worker cũ không commit sau replacement/revocation hoặc sang Project khác. Không dùng credential owner để xử lý inference cho staff chưa entitlement.

Text/CSV/TSV/JSON/XML/YAML/code lớn dùng streams/decoder state/cursor, giữ UTF8 boundaries và line/range. PDF đọc theo page batches từ private local input path; Office container đọc entries có limits thay full binary buffer; XLSX dùng parser theo worksheet/row sau bounded ZIP checks. Parser nhỏ hiện hữu vẫn được dùng với trần đã kiểm, không gọi workbook.xlsx.load/officeParts trên file nhiềuGB.

Một heavy parser/converter chạy cùng lúc trên runtime local; mỗi batch có wall-time tối đa60giây, child memory tối đa512MiB, output tối đa32MiB và bounded page/entry/pixel/depth/ZIP expansion. Tổng derived text một file tối đa32MiB ở checkpoint này, ghi PARTIAL/coverage khi chạm trần; original vẫn stored và người dùng có thể yêu cầu trang/sheet/range cụ thể trong giới hạn. Không silent truncate/claim đọc hết. Chunks insert/read bằng batches, không gom toàn index trong RAM; resource gate phải kiểm cơ chế limit thực, không chỉ timer TypeScript.

Child converters phải chạy unprivileged sandbox riêng, input read-only, output private disposable, không network/credential/env secrets, process-tree cancel và filesystem/CPU/RAM/output limits thật. Dùng local binaries version-pinned từ bundle hiện hữu hoặc open-source converter cần thiết sau plan approval; không host install/config changes chưa nêu trong plan. Nếu chưa chứng minh sandbox hoặc binary phù hợp, capability tương ứng BLOCKED/UNSUPPORTED, không chạy converter không an toàn để đạt bảng PASS.

Không external entity/DTD, script/macro/formula execution, external relations fetching, recursive ZIP tự động hoặc hidden embedded executables. File MIME/signature/container mismatch, path traversal/symlink, ZIP bomb, image decompression bomb, parser abuse/malware nghi ngờ → quarantine/reject trước extraction/AI; không công bố malware-clean nếu không có scanner thực đã kiểm. Document/web text luôn untrusted data, không quyền điều khiển system/tool.

## 7. Capability theo định dạng

Capability UI/API tách STORED/PREVIEW/EXTRACTED/AI_READABLE và reason/parser evidence theo format/file cụ thể. Storage an toàn có thể hoạt động khi extraction/vision thiếu; không advertise AI đọc mọi format chỉ vì extension allowlist. ImageAI cần actual selected model/generation vision evidence, không suy từ tên hoặc supported schema.

| Format                              | Đường xử lý dự kiến và provenance                                                                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF                                 | Poppler hiện hữu theo trang, text/table fragments có page; không coi layout text là nhận dạng bảng hoàn chỉnh. Scan dùng local OCR đã kiểm hoặc page render/selected vision thật; nói rõ trang/coverage chưa đọc |
| DOCX                                | Reuse office-document/ZIP/XML checks; paragraph/table/cell. Mở rộng headers/footnotes/comments có provenance; phần chưa parse ghi PARTIAL, không giấu hiện trạng                                                 |
| DOC/XLS/PPT                         | Local converter đã version/sandbox/fixture-verified, giữ original + conversion/parser lineage; không thực thi macro. Thiếu converter thì stored/unsupported rõ, chưa AI PASS                                     |
| XLSX                                | ExcelJS/streaming row extraction trong limits + bounded archive; raw/cached value, type, unit/number format, sheet/A1 range. Decimal/string precision; formula cached-only, không cập nhật link hoặc tính macro  |
| CSV/TSV                             | Stream quoted fields/newlines/encoding, row/column/header, decimal strings; CSV formula là dữ liệu, không execute                                                                                                |
| PPTX                                | Bounded Office XML parts, slide/text/table/notes, preserve slide number; theme/layout không là proof geometry; không execute linked object                                                                       |
| TXT/MD/HTML/JSON/XML/YAML/code      | Stream text, line/column; HTML sanitize không JS, XML no DTD/entity, structured parse có depth/size limits; không chạy code/YAML constructors                                                                    |
| JPG/JPEG/PNG/WEBP                   | Signature/dimensions/decoded-pixel limit, original retained; safe resize/tiling với source region; actual vision analysis trong verified media envelope                                                          |
| RTF/ODS/ODP/TIFF/BMP/GIF/HEIC       | Local parser/converter nếu đã kiểm, static/selected-frame coverage rõ; capability từng format, chưa có parser không báo extracted/AI                                                                             |
| DWG/DXF/RVT/IFC/SKP/ZIP/audio/video | Storage/metadata/preview chỉ tới mức parser có bằng chứng; không claim dimensions/full geometry/transcription/frames nếu chưa thực thi phù hợp. Không nằm trong P3-A critical format acceptance                  |

P3-A tối thiểu PDF/DOCX/XLSX/CSV/TXT/MD và JPG/PNG/WEBP có thực nghiệm; P3-B gồm legacy DOC/XLS/PPT/PPTX vàlarge-file gate. Format chưa đạt requirement ghi BLOCKED riêng, không gọi toàn P3 hoàn tất.

## 8. AI context/tools và citation

Bỏ SIWC từ chối tất cả file/source chỉ sau integration chứng minh đọc đúng nguồn. Advertise existing search_project_sources/read_project_source/analyze_table khi capability hợp lệ, dùng chunks authorized của selected sourceId/fileVersion/locator; không hosted file_search/Files API. Args không override actor/Project hoặc raw storage path. Query/search/read check tenant/Project/actor/source trước snippet/count/paging, trước gửi provider và delivery/citation.

SIWC function outputs chứa excerpt bounded, source handle/version/locator/coverage/cursor; không toàn file hoặc fabricated summary. Context assembly dùng budget P1 hiện hành và actual source-dependency pin. Media input chỉ selected verified model/route/schema trong bounded envelope, không gửi binary10GB. File stored/processing/unsupported phải báo đúng; không knowledge-general giả thành nội dung file. Không tự đổi model/provider khi vision thiếu; cho người dùng chọn.

Two-file compare pin cả hai versions và sourceproofs, giữ units/Decimal/table range; chỉ kết luận phần đã đọc. Citation route resolver mở original đúng version/trang/sheet/range/region và parser provenance, backend currentACL trước trả. File revoked/deleted/version changed làm source/answer/citation fail closed theo causal semantics; không dùng parent index cache/summary như bypass. Private attachment chỉ same owner/Project/conversation policy; reuse in conversation khác cùngProject cần explicit authorized select/import, không leak qua global search.

P1 Memory nguồn File vẫn lấy current authorized proof; chunk parser/locator/hash là provenance bổ sung, không biến AI interpretation thành shared fact hoặc business approval. P2 public search phase tuyệt đối không nhận file/contract/extracted text/private identifier nếu chưa có precise public-query authorization.

## 9. UI và UX

Chat tái sử dụng upload controls/parts helper với scope actor/Project/conversation; có filename/decimal size/progress/server-confirmed bytes/pause-resume/cancel/retry và processing status. Reload recovery trả đúng scope; chọn lại file, check uploaded parts; không persist private file content/credentials vào localStorage. Pending upload/index/answer A không hiển thị/gắn vào B; hủy local UI request, server session vẫn ownedA hoặc explicit abort theo hành động người dùng. Hai tab giữ session/client keys riêng, retries idempotent.

Stored file vẫn có authorized download khi safe; riêng status Extracted/AI readable phải từ backend capability/execution evidence. File unsupported hiển thị reason; người dùng vẫn hỏi kiến thức tổng quát, không bị business/file-only whitelist. Khi processing chưa hoàn tất giữ câu hỏi và báo trạng thái, không silent answer từ general knowledge.

Desktop/mobile375/keyboard test gồm drag/file picker, progress, resume/reselect mismatch, cancel, queued extraction, two-file selection, source drawer/page/sheet/range và chuyển Project/reload/two tabs. Không thêm upload topology/network hoặc đổi login flow.

## 10. Migration, tests và release

Migration additive qua quy trình Prisma hiện hữu, review SQL; không rewrite applied/DBpush/reset. Preflight legacy target rows, composite FK/uniques, parent chunk scope/size guard, lease/CAS/idempotency. Backup DB/storage manifest/source checksums, restore rehearsal và compare business rows trước main apply. Migrations/chunk schema phải compatible previous artifact; rollback giữ additive data/schema, stop new processing bằng actual release mechanism, không drop tables/storage hoặc restore main để lùi app.

TDD focused unit: decimal10GB/+1, geometry/stream overrun/hash mismatch/dedup/resume/abort/expire/ENOSPC, checksum/MIME/container/path/ZIP bomb/parser CPU/pixels, lease replacement/revoke, UTF8 boundaries, page/sheet/range/Decimal provenance, unsupported states, source citation tamper, model media mismatch/no fallback. Update every caller/constructor/DTO consumer and existing stage-document uploader regression.

Real DB/API integration: owned conversation target không room/document giả; current INVOKE/file upload/read/download; private vs shared/project-origin source; denied actor/foreign tenant/Project; revoke during parts/finalize/parser/tool/provider; no leaked snippet/count/chunk or wrong commit; complete idempotency/cleanup/quota transactions. Fixture browser actual storage/extraction/ACL/file downloads; mock provider chỉ protocol.

Main/candidate OpenAI thật tối thiểu: PDF có known text trang1/2 → summary/citation page; DOCX paragraphs/table → source-backed comparison; XLSX sheet/range/numeric → exact values; image có known diagram/text → verified vision; hai báo giá/contract phụ lục → accurate difference; unsupported/private foreign file → correct status/deny. Ghi selected/returned model, actual chunks/media sent, tools executed, parser/source versions, terminal response.completed hoặc error thật và latency; không log private contents/secret/chain-of-thought. Upload200 không là AI_READ_LIVE.

10GB gate fixture: trước tạo dữ liệu phải verify capacity/quota/headroom; generate non-sparse streaming data đúng10.000.000.000byte có deterministic checksum, actual parts over existing loopback API, interrupted/resumed transfer, full finalize, authorized read-back hash. Record peak RSS/disk amplification/CPU/IO/time/quota-rejections/cleanup; boundary+1 rejected before consuming disk. Sparse file/declared metadata/1MB scaled fixture không thay full10GB transfer. Dừng nếu resource threshold vi phạm, cleanup chỉ own fixture sessions; không stress main hoặc làm đầy WSL. Nếu chưa chạy đủ giữ LARGE_FILE_10GB NOT_RUN/BLOCKED vàeffective maximum thấp.

Full lint/typecheck/test/build/format và independent correctness/Ponytail/security/auth/UX review; một frozen candidate/checkpoint bằng release tooling hiện hữu, readiness/schema compatibility/rollback/candidate browser/OpenAI live trước cutover, mainverify sau cutover. Không nhiều full regression song song, không nhiều candidate chưa dùng, không commit/push/PR khi chưa có lệnh. Report stored/extracted/vision/retrieval/10GB bằng chứng riêng và CODE_SHA/TESTED_TREE/artifact/runtime rõ.

## 11. Self-review revision1

Đủ data model/API/target/permissions/private scope, limit/quota/resource/cleanup, parser/worker/chunks/provenance, format matrix/vision limitations, UI/tests/migration/rollback. Không duplicate File/Upload/Conversation domain, create fake business record hoặc activate placeholder/provider. Bounded legacy parser được giữ đúng limits; chunked path giải quyết file lớn theo từng phần, không tăng buffer. Missing converter/vision/sandbox/capacity có gate và status thật; spec không giả định đã cài converter hoặc10GB PASS.

Phê duyệt spec này chỉ cho phép viết implementation plan P3; approval plan vẫn cần trước code. Không thay gate P1/P2 hoặc dùng conceptual approval thay written-spec gate. Các root causes đã được discovery chứng minh được tái sử dụng, chỉ inspect current callers/contracts để cụ thể hóa thiết kế.

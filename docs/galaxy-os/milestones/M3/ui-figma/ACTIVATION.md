# Kích hoạt và xác minh AI

## Hiện hành 05/10 — env backend đã chuyển và kiểm API

Release `local-a33d8a12318c`; CODE_SHA=TESTED_SHA
`3a00f4ed9274fa5d7fb9c47dc3ea2ef3e4eb43c7`. Ba credential đã có ở baseline,
được chuyển nguyên giá trị, không nhập lại hoặc xoay khóa. API sau restart báo
`credentialSource=env`, `credentialState=LOADED` cho cả ba provider. Active JSON
đã bỏ mọi trường API key, giữ revision, model flags, policy và evidence trước đó.

### Nguồn cấu hình duy nhất

- Secret canonical: `/home/galaxy_os/.runtime/ai-providers.env`, owner
  `hailq_glx`/uid1000, mode0600. Đây **không phải mã hóa**.
- Metadata canonical: `/home/galaxy_os/.runtime/ai-providers.json`, mode0600;
  `credentialSource={"mode":"env","path":"/home/galaxy_os/.runtime/ai-providers.env"}`.
- `galaxy-os-api.service` tham chiếu private API env
  `/home/galaxy_os/.runtime/ai-env-policy-20261005/api.env`, nơi giữ
  `GALAXY_AI_CONFIG_FILE` trỏ metadata. Backend đọc secret bằng
  `scripts/ai-credentials.cjs`; Python CLI dùng cùng resolver. Khóa được truyền
  trực tiếp vào adapter, không lấy `GOOGLE_API_KEY` từ môi trường SDK.
- Web/build/Edge/global systemd manager không nhận ba khóa. Không thêm khóa vào
  `.env.local`, `NEXT_PUBLIC_*`, shell profile hoặc literal trong service unit.
- File secret dùng **mỗi dòng `KEY=JSON_STRING`**, chỉ ba tên `GEMINI_API_KEY`,
  `MISTRAL_API_KEY`, `KIRA_API_KEY`. Không shell source/eval; không nạp file này như
  dotenv hay systemd EnvironmentFile. JSON escaping giữ `$`, `#`, nháy và
  backslash; giá trị có whitespace/control/newline bị từ chối. Test dùng khóa giả.
- Mode env thiếu/sai/rỗng/quyền không hợp lệ sẽ lỗi rõ, **không fallback JSON**.
  Migration stage/activate/finalize đã kiểm boolean giữ cả ba khóa/revision.
  Backup0600 trong thư mục0700 ngoài Git tại
  `/home/galaxy_os/.runtime/ai-env-policy-20261005/secret-backup/`.
  Không đổi quyền đệ quy thư mục runtime dùng chung.

### Đổi khóa khi có nhu cầu thật

Không cần chạy CLI mỗi lần chat. Tiện ích tùy chọn trong worktree canonical:

```bash
python3 scripts/configure-ai.py status --provider kira
python3 scripts/configure-ai.py key --provider kira
python3 scripts/configure-ai.py enable --provider kira
systemctl --user restart galaxy-os-api.service
python3 scripts/local-runtime.py status
```

`key` chỉ dùng terminal input ẩn, xác nhận host; trong mode env nó ghi env atomic,
đổi revision và đặt provider disabled/evidence chưa kiểm trước khi ghi secret.
Chỉ enable sau khi xác nhận đúng tài khoản/host. Không ghi key vào argv. Không dùng
chỉnh tay env để giữ lại cờ kiểm chứng của credential cũ. API đọc lại ở mỗi gate;
restart đúng API là bước đối soát cutover, rồi xem **Cấu hình nhà cung cấp và hạn mức**
hoặc GET `/api/v1/project-chat/projects/:id/ai/settings`: source/state/revision,
adminEnabled, providerReady, health, lastSuccessfulCallAt và từng capability.
Lưu file hay CLI status riêng chưa phải bằng chứng API đã nạp. Khi thay khóa phải
smoke lại capability liên quan; không khôi phục khóa đã thu hồi từ backup.

### Kết quả provider thực

| Provider / endpoint cố định                                                                 | Kết quả mới                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kira `kira-3.5-pro` — `https://kiraai.vn/api/v1/chat/completions`                           | Text main GENERAL PASS sau env; fixture lexical RAG, hỏi tiếp, chat mới, citation Chrome PASS. Requested/returned đều `kira-3.5-pro`.                                             |
| Gemini `gemini-3.8-flash` — `https://generativelanguage.googleapis.com/v1beta/interactions` | Một request fixture gặp503→503→200, Retry-After30s mỗi lần được tôn trọng. Smoke cuối text và đổi model/RAG đều200 lần đầu; requested/returned khớp. Không bảo đảm vendor hết503. |
| Mistral `mistral-medium-3-5` — `https://api.mistral.ai/v1/chat/completions`                 | Upstream429, code đã làm sạch `1300`, không Retry-After. `RATE_LIMITED_UNKNOWN`, 1attempt, không tự retry; text/RAG live BLOCKED. Chưa có căn cứ quota tháng/credit/billing.      |

Health tại main phản ánh lượt gọi của tổ chức main: Kira NORMAL sau smoke mới;
Gemini/Mistral còn receipt lỗi cũ. Evidence mới ở DB fixture không được chép vào
DB main hoặc giả làm ADMIN_SMOKE. Gemini vẫn chọn được cho text khi đủ policy;
textLiveVerified quản trị ở main còn false, không khóa text bằng cờ PDF pending.
Ảnh/PDF chưa live verified, chưa bật; lexical không phải semantic embeddings/OCR.

### Sử dụng chat và cấp phép nguồn

Trong khung hiện có chọn **Hỏi thông thường** hoặc **Hỏi theo nguồn dự án**.
GENERAL hiện “Không sử dụng hồ sơ dự án”, không tự lấy file, tên khách, metadata,
summary hay lịch sử RAG. Đổi chế độ mở ngữ cảnh sạch; hội thoại cũ còn nguyên.
Pilot vẫn yêu cầu quản trị duyệt **đúng nội dung nhập** theo Project/provider;
checkbox người gửi không tự cấp quyền. Một câu mới/chỉnh nội dung chưa duyệt vẫn
bị `INPUT_POLICY_DENIED` — không được dùng GENERAL để gửi dữ liệu mật dán tay.

Quản trị phải có `ACCESS_ADMIN` và quyền AI hiện hữu. Trong cấu hình chọn provider,
duyệt Project thử, từng nguồn/phiên bản cụ thể và nội dung hỏi; không mặc định tất cả.
API `POST /project-chat/projects/:id/ai/settings/egress` nhận
`kind=PROJECT|SOURCE|INPUT`, `action=APPROVE|REVOKE`, model và phạm vi cụ thể;
backend kiểm actor/Project/source/version. Policy revision, actor, thời gian và
phạm vi được ghi atomic cùng audit trong metadata. Thu hồi vẫn làm được khi
provider disabled hoặc thiếu credential; không xóa tài liệu/hội thoại.

Mọi retrieval/dispatch/retry/delivery/source viewer và lịch sử dẫn xuất đều kiểm
lại quyền/egress. Chỉ một phần nguồn được phép thì UI báo phạm vi; không có nguồn
hợp lệ thì không giả vờ đã đọc. Sau khi đã gửi vendor, thu hồi chặn phần tiếp theo
và delivery; không tuyên bố lấy lại được dữ liệu đã gửi.

**Dữ liệu thật vẫn chưa được mở**: kiểm9Project×3provider đều DENIED sau restart.
`SYNTHETIC_PUBLIC_APPROVED` giữ nguyên. Workflow quản trị đã dùng được trên fixture;
việc duyệt dữ liệu cá nhân/giá vốn/hợp đồng thật còn cần xác minh tier/điều khoản và
chấp thuận phạm vi cụ thể. Lượt này không có căn cứ để mở cả9Project hoặc phòng riêng
cho khách. Env hợp lệ không thay quyết định dữ liệu hay quota vendor.

### Retry, rollback và bằng chứng

Native fetch, không SDK retry. Một lớp adapter sở hữu retry: tối đa3 lần gọi gồm
lần đầu, deadline tổng90s, backoff/jitter, Retry-After/RetryInfo; nếu thời gian chờ
vượt deadline thì dừng. Chỉ retry lỗi tạm thời có căn cứ, không429 không rõ subtype,
không quota dài hạn hoặc timeout không rõ kết quả. Lease/concurrency dùng chung
credential qua DB; không thêm quota lượt/ngày, không key/account/model rotation.

Mã **bổ sung mới trong patch này**: `INPUT_POLICY_DENIED`,
`RATE_LIMITED_UNKNOWN`, `RATE_LIMITED_TEMPORARY`, `QUOTA_EXHAUSTED`,
`BILLING_ACTION_REQUIRED`, `PROVIDER_COOLDOWN`, `INVALID_CREDENTIAL_SOURCE`,
`SECRET_FILE_MISSING`, `SECRET_FILE_INVALID`, `SECRET_FILE_UNREADABLE`.
`EGRESS_POLICY_DENIED`, `TEMPORARY_ERROR`, `ADAPTER_RESPONSE_ERROR` đã tồn tại.
Diagnostic server chỉ metadata request/stage/provider/model/config revision,
policy reason/outbound/status/code/duration/retry; không prompt/header/key/raw error.

Rollback giữ schema84 và dữ liệu; code cũ tương thích CHECK mới. Recipe và unit/
manifest cũ ở thư mục private `ai-env-policy-20261005/rollback`, được review tĩnh;
**chưa diễn tập rollback thực tế**. Nếu cần chạy code JSON cũ, materialize credential
**hiện hành từ env** vào JSON dưới lock rồi đổi source mode; không copy key từ backup,
không restore DB. Không chạy lại nguyên cutover script để rollback.

Evidence private: `cutover-result.json`, `secret-cutover-audit.json`,
`main-general-smoke.json`, `main-real-policy-check.json`, `final-live-evidence.json`,
`accepted-release-rag.json`, `accepted-chrome-citation.json`, `network-smoke.json`
trong `/home/galaxy_os/.runtime/ai-env-policy-20261005/`.
[Kiểm chứng và lệnh](../VERIFICATION.md), [bàn giao](HANDOFF.md).

---

## Lịch sử trước bản env/chat/RAG ngày 05/10

Các nhận định dưới đây thuộc các lần bàn giao cũ; trạng thái hiện hành là phần trên.

Cập nhật05/10: **3credential đã được tìm thấy trong store canonical hiện hữu**,
replacementConfirmed=true nhưng ban đầu enabled=false. Đã dùng đúng CLI `enable`
từng provider; không nhập lại, không tạo store khác, không sửa resolver/adapter T1.
API đọc revision mới ngay theo gate; không restart API để kích hoạt. Nơi nhập cũ
`PREVIOUS_INPUT_LOCATION_UNKNOWN`; nguyên nhân lần nhập cũ không đến backend vẫn
`NOT_PROVEN`, không suy ra key sai.

## Writer–store–API–UI hiện hành

- CLI absolute `/home/galaxy_os/.worktrees/m2-a-20260928/scripts/configure-ai.py`;
  root/worktree cùng resolver `/home/galaxy_os/.runtime/ai-providers.json`.
- Owner terminal/API hailq_glx uid1000; store0600 ngoài artifact, cha traversable.
  Schema contract `providers` hiện hữu; không tự thêm schemaVersion.
- Cả3entry có credential không rỗng, replacementConfirmed=true, enabled=true.
  So sánh boolean nội bộ trước/sau mỗi enable: giữ nguyên3key và toàn bộ sibling.
  API/UI đều LOADED, revision khớp; các lỗi parse/quyền/rỗng vẫn tách biệt.
- Sau cutover Web/API mới: cấu hình và bằng chứng live giữ nguyên; so sánh toàn
  store trong RAM, không xuất key/prefix/suffix/hash. Không store riêng mỗi release.
- Registry không có một boolean READY gộp mọi bước: credential loaded,
  providerReady, textLiveVerified và sourcePolicy thể hiện riêng.

| Provider | Config revision                        | Text live qua Chrome localhost3000                           |
| -------- | -------------------------------------- | ------------------------------------------------------------ |
| Gemini   | `42f289ab-f8da-422b-b737-f3565c202f0c` | Câu đầu đạt; câu tiếp503 TEMPORARY_ERROR; chưa text verified |
| Mistral  | `6b102872-8ff0-40b5-b962-c895732ed9d4` | 429 RATE_LIMITED; chưa chứng minh model access/text          |
| Kira     | `004d59a2-0baa-4ef2-9028-8bcc6ac41f16` | PASS3câu, HTTP200, textLiveVerified=true                     |

## Evidence vendor thật

Một lượt admin synthetic/provider trên API release local79e2ba59dd6d trước cutover;
Chrome → Galaxy API → adapter → vendor → ADMIN_SMOKE/answer lưu trong Galaxy.
Fixture cố định `galaxy-ai-activation-v1`: câu tiếng Việt, NG-42 rộng900mm/chưa xác
nhận, câu nối tiếp cùng conversation. Không mock runtime thật hoặc gửi nguồn doanh nghiệp.

| Provider | Galaxy request ID                      | Requested / returned model          | Usage input/output     |
| -------- | -------------------------------------- | ----------------------------------- | ---------------------- |
| Gemini   | `cd8b93fc-98c8-423d-b6b0-0fa3f082c2f0` | gemini-3.8-flash / gemini-3.8-flash | 219/68 phần thành công |
| Mistral  | `245da2a6-f71f-45b6-bec7-b575096c43df` | mistral-medium-3-5 / null           | null                   |
| Kira     | `00392844-efea-43de-bcde-b86c05d34654` | kira-3.5-pro / kira-3.5-pro         | 1874/470               |

Request ID trên là ID kiểm thử Galaxy; không giả thành upstream vendor request ID.
Không retry để săn PASS, không fallback/mua credit/đổi gói;503/429 không được gọi
là credential sai. Kira đạt không bật Gemini/Mistral/media. Ngưỡng concurrency,
input/output, timeout/retry hữu hạn giữ nguyên; không thêm giới hạn lượt/ngày.

Model/endpoint/reasoning đã đối chiếu tài liệu chính thức:
[Gemini current model](https://ai.google.dev/gemini-api/docs/latest-model?hl=en),
[Interactions API](https://ai.google.dev/api/interactions-api),
[Mistral Medium3.5](https://docs.mistral.ai/models/mistral-medium-3-5-26-04),
[Mistral reasoning](https://docs.mistral.ai/studio/conversations/reasoning),
[Kira3.5Pro](https://kiraai.vn/models/kira-3.5-pro/).
Không đổi ID/endpoint hoặc dùng câu trả lời model tự nhận danh tính làm chứng minh upstream.

## Giới hạn live còn lại

ADMIN_SMOKE ẩn khỏi history/ownedAnswer theo thiết kế; không nới ACL để mở citation
của run này. Hành trình citation/source và đổi model đã PASS bằng fixture; **chưa
đạt live Project RAG/citation trên localhost3000**. Đã hỏi owner lựa chọn fixture
namespace/account/Project riêng trong DB local hoặc giữ DB local nguyên. Lý do:
API3000 dùng DB local, trong khi yêu cầu test ghi dùng DB fixture riêng. Chưa tạo
namespace đó/duyệt egress mới hoặc dùng9Project thật; việc này không chặn phát hành UI.

SOURCE_EGRESS_STATUS: SYNTHETIC_PUBLIC_APPROVED,9Project thật DENIED. Text kết nối
được không cấp quyền gửi hồ sơ. Gemini image/PDF NOT_RUN/DISABLED; Mistral/Kira text.
Evidence an toàn nằm `.runtime/ai-floating-ui-evidence/live-*.json`; không secret
trong Git/browser/logs/trace; request bodies/headers bí mật không được ghi.

## Chuỗi cấu hình

`configure-ai.py key` → private store → `GALAXY_AI_CONFIG_FILE` của API systemd →
registry mỗi gate → metadata configLoaded/revision/providerReady/sourcePolicy → UI.
API không cache credential theo phiên; thay file đúng đường không cần restart.
Không xuất giá trị key về hội thoại Codex, argv/history/browser/docs/artifact.
CLI dùng input ẩn, owner service hailq_glx. Chạy tại worktree canonical:

```bash
python3 scripts/configure-ai.py key --provider google_gemini
python3 scripts/configure-ai.py key --provider mistral
python3 scripts/configure-ai.py key --provider kira
```

Chỉ nhập provider chưa có khóa hợp lệ. Lệnh key vô hiệu kết nối và bằng chứng cũ.
Sau khi xác nhận đúng vendor/account, dùng subcommand có thật `enable --provider ...`;
`status --provider ...` chỉ trả metadata. `disable` giữ khóa riêng.
Không bật bằng cách tự ghi cờ textLiveVerified. `record-test` là bước nội bộ nhận
metadata đã kiểm từ API, writer flock + compare-and-swap digest + atomic replace.

## Lần thử đầu tiên

Trong Project → Làm việc → Hỏi AI hoặc Galaxy AI toàn dự án → Quản trị kết nối,
actor cần ai.invoke/INVOKE và ACCESS_ADMIN hiện hành. Nút kiểm thử không yêu cầu
model đã live verified hoặc duyệt dữ liệu Project trước đó. Nó chỉ dùng fixture
cố định `galaxy-ai-activation-v1`, không nhận question/source/URL từ client.

- Text: tối đa3 câu tiếng Việt, thẻ tổng hợp NG-42 rộng900mm/chưa xác nhận và câu nối tiếp.
- Gemini ảnh: PNG xanh128×128, một câu; PDF: một trang mã ACTIVATION-PDF-47/625mm, một câu.
- Cùng adapter/parser/citation checks; kiểm tên model returned khi có, không hỏi model tự nhận danh tính.
- Dùng conversation/answer/reservation hiện hữu, run ADMIN_SMOKE ẩn khỏi lịch sử người dùng;
  không tạo Project/room demo, không lập chỉ mục thiết kế hoặc dữ liệu doanh nghiệp.
- Recheck quyền, config revision/digest và lease trước/sau I/O. Retry cùng clientKey không gọi lại.
  Crash quá lease → FAILED_UNKNOWN/INTERRUPTED_NO_AUTO_RETRY; lần thử mới phải do người dùng chủ động.
- Evidence: requestId, model requested/returned, HTTP status, usage thực hoặc null,
  fixtureVersion, capability, revision, result. PASS text không bật image/PDF.
- Không hạn mức ngày mới, không billing/tier/fallback tự động; concurrency/output/context/timeout vẫn giữ.

Provider đã nối nhưng nguồn chưa duyệt sẽ báo EGRESS_POLICY_DENIED thay vì thiếu khóa.
Project + từng source/version phải được quản trị duyệt qua CLI hiện hữu; permission
đọc hoặc file đã phát hành không thay egress approval. Không duyệt chín Project thật.
Đổi model vẫn giữ conversation/index; history/answer cũ phải qua ACL và policy của
provider mới trước khi dùng, retry giữ model/revision ban đầu.

## Phân loại và giới hạn nghiệm thu

MISSING_CREDENTIAL, CREDENTIAL_NOT_LOADED, INVALID_CREDENTIAL, MODEL_NOT_AVAILABLE,
UNSUPPORTED_PARAMETER, ACCOUNT_QUOTA_OR_BILLING, NETWORK_OR_TLS,
EGRESS_POLICY_DENIED, ADAPTER_RESPONSE_ERROR được phân biệt. Config/lease/revoke
có mã riêng; không gộp về thiếu key. Models list không thay generation test.

Candidate giữ nguyên: Gemini gemini-3.8-flash, Mistral mistral-medium-3-5, Kira kira-3.5-pro.
Đối chiếu tài liệu chính thức: [Google Models](https://ai.google.dev/api/models),
[Gemini3.8Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash),
[Mistral reasoning](https://docs.mistral.ai/studio/conversations/reasoning),
[Kira3.5Pro](https://kiraai.vn/models/kira-3.5-pro/).
Tài liệu không chứng minh quyền của credential. Kira returnedModel cũng không
phải xác minh độc lập upstream.

Các điều kiện live còn thiếu được ghi tại mục trên; không còn blocker thiếu credential.
Không bật image/PDF trước kiểm riêng, không cho phép nguồn Project chỉ vì text đạt.

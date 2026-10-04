# Kích hoạt và xác minh AI

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

# Kích hoạt và xác minh AI

Cập nhật đối soát04/10: bản chẩn đoán `local-79e2ba59dd6d` đã phát hành. Trong các
nguồn cấu hình có căn cứ đã kiểm, chưa có credential; nơi người dùng đã nhập vẫn
chưa xác định. Không kết luận người dùng chưa nhập, không yêu cầu nhập lại trước
khi biết entrypoint. Store hiện có được giữ nguyên, không tạo/ghi lại trong lượt này.
Không có request vendor live. Việc tạo store0600 providers rỗng thuộc lượt trước.

## Đối soát writer–store–API–UI mới nhất

| Thành phần            | Quan sát thật                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| CLI                   | `/home/galaxy_os/.worktrees/m2-a-20260928/scripts/configure-ai.py`; owner terminal/service `hailq_glx`                            |
| Cwd                   | Entrypoint absolute chạy từ root hoặc worktree đều resolve cùng store; root không có `scripts/configure-ai.py`                    |
| Resolver              | `--file` ưu tiên, rồi `GALAXY_AI_CONFIG_FILE`, rồi default absolute; relative path bị từ chối                                     |
| Store canonical       | `/home/galaxy_os/.runtime/ai-providers.json`, regular0600, cùng owner, cha traversable                                            |
| Schema/revision       | Contract `providers` hiện hữu, không có trường schemaVersion; không provider entry nên revision=null                              |
| Nội dung an toàn      | Root JSON hợp lệ, providerCount=0, mọi credentialNonempty=false; không xuất giá trị/dấu vân tay key                               |
| Nguồn đã kiểm         | Root `.env.local`, worktree `.env.local` (không tồn tại), env/process hiện hành, env release trước được rollback manifest dẫn tới |
| API mới               | PID434812, cwd `/home/galaxy_os/.runtime/releases/ai-config-20261004/apps/api`, đọc canonical store                               |
| UI thật               | Chrome localhost3000, registry và màn quản trị cùng `EMPTY_STORE`, revision=null; không báo đã kết nối                            |
| Nguồn người dùng nhập | UNKNOWN; cần tên lệnh/màn hình và cwd/user nếu nhớ, không cần gửi key                                                             |

Lệch path/owner/cache của runtime hiện tại **không được chứng minh**. CLI trước đây
không nhận env override là lỗi có thể tái hiện bằng fixture; đó chưa phải bằng chứng
nguồn gốc khóa người dùng bị thiếu. Registry trước đây gom lỗi đọc/parse, và UI cấu
hình quản trị giữ snapshot cũ; bản mới phân loại và refresh metadata đúng.

Chẩn đoán phân biệt `EMPTY_STORE`, `PROVIDER_ENTRY_MISSING`, `CREDENTIAL_EMPTY`,
`STORE_UNREADABLE`, `STORE_INVALID_FORMAT`, `CREDENTIAL_NOT_LOADED`,
`CREDENTIAL_NOT_CONFIRMED`, `INVALID_CONFIG`. Vendor từ chối credential chỉ được
báo khi có vendor response; không suy ra từ file rỗng. Có bytes không đồng nghĩa
model/account đã verified. `status` chỉ dùng evidence đủ contract và cùng revision.

Lệnh đọc an toàn, dùng được từ root/worktree, không yêu cầu nhập key:

```bash
python3 /home/galaxy_os/.worktrees/m2-a-20260928/scripts/configure-ai.py status --provider google_gemini
```

Writer giữ flock/atomic replace/CAS có sẵn; cập nhật một provider không mất provider
khác; JSON lỗi không tạo file rỗng để repair. Không sửa store thật trong lượt này.
API đọc lại mỗi gate; kiểm revision mới bằng file fixture và refresh Chrome. Cutover
đã xác minh process API mới nhận cùng path và trạng thái rỗng; **chưa thể kiểm key
hợp lệ tồn tại qua restart** khi chưa tìm thấy credential đủ điều kiện.

## Chuỗi cấu hình

`configure-ai.py key` → private store → `GALAXY_AI_CONFIG_FILE` của API systemd →
registry mỗi gate → metadata configLoaded/revision/providerReady/sourcePolicy → UI.
API không cache credential theo phiên; thay file đúng đường không cần restart.
Không đọc giá trị key trong Codex, không đưa vào argv/history/browser/docs/artifact.
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

Còn phải làm khi có khóa: test live từng provider; hành trình UI → API đang phục vụ →
vendor → answer lưu → citation mở; đổi model trong cùng hội thoại với fixture được
quản lý và approved sources; Gemini image/PDF live riêng. Hiện chỉ UNIT/INTEGRATION/
CHROME fixture được xác minh, LIVE_PROVIDER=NOT_RUN/BLOCKED_BY_CREDENTIALS.

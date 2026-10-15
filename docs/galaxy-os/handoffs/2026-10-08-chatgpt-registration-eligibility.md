# Điều kiện kết nối trung tâm ChatGPT — 08/10/2026

Trạng thái: owner xác nhận “Chưa có hồ sơ chấp thuận” trong phiên08/10. Chưa bắt đầu OAuth hoặc gửi hồ sơ OpenAI. Main admin UI đã phát hành độc lập, không chờ inference live. Check hiện tại chỉ local audit; không phải kiểm grant với vendor.

## Đã kiểm chứng từ nguồn chính thức

OpenAI mô tả SIWC commercial partner qua chương trình chọn lọc/interest form; Galaxy chưa có hồ sơ chấp thuận được xác minh. [Request a client ID](https://developers.openai.com/siwc/request-client-id), [form chính thức](https://openai.com/form/sign-in-with-chatgpt-interest/).

Tài liệu plan usage mô tả client registration gắn với một user/workspace; chia sẻ client giữa các host trong cùng user/workspace. Điều đó không chứng minh một Pro cá nhân được phục vụ mọi người dùng Galaxy. Đây là kết luận về thiếu bằng chứng cho topology Galaxy, không phải tuyên bố nhà cung cấp cấm mọi mô hình central. [Plan usage overview](https://developers.openai.com/siwc/token-sharing-open-source).

Grant danh tính chưa đủ inference; token scope cần chatgpt.tokens.use.direct và resource.invoke, issued client ID được kiểm audience/issuer/signature/nonce. Dynamic OSS registration không được áp dụng như app class đã được xác minh cho Galaxy. [Registration/sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).

Loopback127.0.0.1 callback chạy trên máy browser. LAN/mobile tới host Galaxy là topology khác, chưa nghiệm thu. Hướng dẫn VM chuyển protected credentials cho cùng tool/user/workspace, không cấp quyền multiuser mới. [Self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms).

## Hồ sơ cụ thể cần owner/OpenAI xác minh

- Ứng dụng: Galaxy OS, private/local nội bộ Galaxy Centre; Next/Nest trên host hiện hữu, localhost3000/LAN192.168.1.80:3000, public access đóng. Không tuyên bố open-source hay công bố repository để lấy registration.
- Topology cần chấp thuận: một system admin quản lý kết nối trung tâm; nhân viên đăng nhập bằng IAM Galaxy và dùng AI theo Project/room/source permission, không đăng nhập ChatGPT riêng. Xác nhận account/workspace/provider scope, ai chịu usage và liệu topology này được quyền dùng ChatGPT plan.
- Cấp app/client registration phù hợp cùng allowed redirect/resource/scopes; xác nhận inference cho topology trên và policy user count/model/usage/revoke. Không dùng một checkbox Galaxy làm chứng nhận quyền vendor.
- Xác nhận callback trên host và flow LAN/mobile; chỉ sau contract được chấp thuận mới triển khai lifecycle/OIDC đã review và request đăng nhập/MFA/consent.

Chủ ứng dụng có thể dùng form chính thức ở trên và mô tả đúng các mục này. Agent chưa được yêu cầu gửi liên hệ bên ngoài. Nếu đã có hồ sơ, chỉ cung cấp metadata không bí mật; không gửi token/key/password vào chat.

## Thiếu implementation sau khi đủ điều kiện

Galaxy hiện chỉ có SIWC wire codec/contract tests và UI unconfigured; chưa callback, credential store, refresh/revoke, catalog hoặc plan dispatcher. Registration/grant đủ điều kiện vẫn cần triển khai lifecycle và nghiệm thu; không chỉ mở disabled button. Providers API key giữ paused, không fallback/fees. Không dùng auth.json Codex, cookie browser hoặc client ID của ứng dụng khác.

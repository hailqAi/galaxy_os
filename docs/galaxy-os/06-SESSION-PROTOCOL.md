# Quy trình tiếp tục giữa các phiên

Nguồn: [OWNER_BRIEF_2026-09-28](sources/OWNER_BRIEF_2026-09-28.md), mục B, S, T, V. Đây là hướng dẫn phát triển trong repository, không phải bộ nhớ vận hành khách hàng hoặc lời hứa agent luôn nhớ hoàn hảo.

## Đầu phiên

1. Đọc root [AGENTS.md](../../AGENTS.md) và hướng dẫn áp dụng ở thư mục sẽ chạm.
2. Đọc [READ-FIRST](00-READ-FIRST.md), [STATUS](05-IMPLEMENTATION-STATUS.md), rồi handoff mới nhất được STATUS dẫn trực tiếp; không đoán bằng tên file lớn nhất.
3. Kiểm tra workspace/branch/HEAD/worktree, staged/unstaged và thao tác Git đang dở bằng lệnh chỉ đọc. Không in .env/credential.
4. Xác định yêu cầu hiện tại và quyền được giao. Prompt lịch sử là nguồn tham khảo; không là lệnh tự chạy.
5. Đọc phần charter/spec/decision liên quan, source/callers/tests trước chọn cách sửa.
6. Đối chiếu gói đã có bằng chứng phù hợp. Không làm lại chỉ vì ở phiên mới; chỉ hồi quy khi thay đổi hoặc độ tin cậy còn thiếu.

Không nạp toàn bộ lịch sử cho mọi task nhỏ. Thứ tự mặc định là ba tài liệu điểm dẫn; sau đó đọc có chọn lọc theo việc. Không đọc runtime secrets để “nạp trí nhớ”.

## Khi triển khai code về sau

Tuân thủ Superpowers/Ponytail trong AGENTS. Tính năng/UI/kiến trúc/workflow/route/schema/behavior: brainstorming, đọc hiện trạng, thiết kế được chủ dự án duyệt, writing-plans, TDD, targeted và full regression, code review, lean/correctness/security/authorization/UX review. Bug: systematic-debugging, tái hiện/root cause, failing regression, fix nhỏ nhất, kiểm triệu chứng và hồi quy, Ponytail review.

Không tắt kiểm soát để test xanh. Dùng môi trường cô lập và dữ liệu giả lập; không reset DB, sửa applied migration hay db push thay migration an toàn. Không gửi dữ liệu thật, deploy hoặc mở tích hợp ngoài quyền. Không commit/tag/push/PR nếu chưa được giao rõ; quyền commit docs của M0 không tự cấp quyền cho các lượt sau.

M0 chỉ ghi tài liệu theo yêu cầu được duyệt trong prompt; không triển khai behavior, không cần chạy build/integration hay tạo quy trình coding mới. Kiểm tài liệu/link/diff bằng công cụ sẵn có, không cài thêm.

## Bằng chứng và cập nhật tiến độ

| Nhãn                | Khi dùng                                                                           |
| ------------------- | ---------------------------------------------------------------------------------- |
| OWNER_REQUIREMENT   | Yêu cầu chủ dự án, không chứng minh runtime                                        |
| USER_REPORTED       | Kết quả người dùng cung cấp, chờ đối chiếu phù hợp                                 |
| ASSISTANT_REFERENCE | Đầu mối từ bản tổng hợp trợ lý                                                     |
| REPO_OBSERVED       | Đã đọc đúng source/report/Git trong phạm vi phiên                                  |
| TEST_VERIFIED       | Có lệnh, môi trường, SHA/tree và kết quả kiểm phù hợp; ghi rõ phạm vi và thời điểm |
| UNKNOWN             | Chưa đủ bằng chứng                                                                 |

Báo cáo lịch sử được đọc ở phiên này là REPO_OBSERVED về nội dung báo cáo. Số test trong đó phải ghi “báo cáo ghi”, không nói vừa chạy lại. Với bằng chứng test lịch sử đầy đủ, ghi rõ lần chạy lịch sử và SHA; không biến thành runtime hiện tại.

Luôn tách: code tồn tại; test tại SHA/tree nào; đã tích hợp vào branch nào; đang chạy/deploy ở đâu. Test ở worktree riêng không chứng minh đã merge/deploy. PARTIAL không phải VERIFIED. Không tìm thấy report không chứng minh chưa từng code.

Blocker phải có thao tác, nguồn chặn, phạm vi tác động và phần độc lập tiếp tục được. Không dùng thiếu raw/report để bỏ lưu yêu cầu; không dùng yêu cầu đã lưu để kết luận code được xác minh.

## Cuối phiên

- Ghi file và hành vi thay đổi; kết quả người dùng nhận; CODE_SHA và TEST_SHA/tree, lệnh, exit code, môi trường, thời gian thực.
- Ghi phần chưa kiểm chứng, blocker, quyết định còn thiếu, trạng thái tích hợp/deploy riêng.
- Cập nhật STATUS, handoff và điểm dẫn PROJECT_STATUS sau công việc được giao; giữ báo cáo cũ.
- Chỉ stage từng file đã review/privacy; không git add . hoặc git add -A. Index có thay đổi ngoài scope thì giữ nguyên, không unstage/reset hoặc commit cuốn theo.
- Commit local khi được phép, không bypass hooks/guard, không empty commit khi rerun không đổi. Không cố chèn SHA của commit vào nội dung chính commit đó; trả DOCS_COMMIT_SHA sau commit.
- Bước tiếp theo ghi cụ thể và điều kiện quyền. Không tự chuyển M1–M7 sau M0.

Không ghi “xong” khi mới có code; không ghi “test pass” khi chỉ đọc báo cáo cũ; không ghi “đã lưu bộ nhớ dài hạn” khi chỉ trả lời chat.

## Rerun M0 và bootstrap

Dùng lại bộ canonical ở docs/galaxy-os; so diff rồi bổ sung phần thiếu, không tạo bộ song song. Giữ đúng một cặp marker BEGIN/END GALAXY_OS_CORE_BOOTSTRAP trong root AGENTS. Nếu guard chặn, ghi BOOTSTRAP_BLOCKED, giữ docs/điểm dẫn hợp lệ, không sửa global instructions hay tạo override. Điểm đọc giúp tiếp tục, không bảo đảm trí nhớ hoàn hảo.

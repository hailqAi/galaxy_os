# Kiểm toán tham chiếu — Project Workspace PMS

Ngày: 2026-08-22  
Phạm vi: tài liệu tham chiếu chỉ đọc cho Project Dashboard và workspace GĐ1–GĐ5. Đây không phải là bằng chứng chạy ứng dụng hay quyết định về dữ liệu nghiệp vụ.

## Nguồn đã kiểm tra và giới hạn

- Đã mở toàn bộ PNG trong `.artifacts/pms-reference/`, gồm `dashboard`, modal phân quyền, GĐ1 (ma trận, năm bước và bộ `stage-1-simple`), GĐ2 (ba tab), GĐ3 (ba mô-đun), GĐ4 (bốn tab), GĐ5 (ba tab), và hai ảnh `p0-create-upload-matrix`.
- Đã mở năm PNG trong `.artifacts/pms-reference/project-workspace/`: trước tải, đã tải tạm, sau reload ở localhost/LAN và bản nháp được khôi phục. Chúng là ảnh trạng thái Galaxy phục vụ ngữ cảnh upload; không dùng để suy ra hành vi mạng hay backend ngoài điều thấy được.
- Đã đọc: amendment 2026-08-22 ở đầu `docs/superpowers/specs/2026-08-07-galaxy-project-pms-full-replacement-design.md`, các audit/handoff/cutover Project liên quan và kế hoạch workspace-upload ngày 2026-08-22.
- Không đăng nhập, không thao tác trên trang tham chiếu, không đọc, in hay lưu thông tin xác thực. Nội dung tài khoản, tên, email, mã, số tiền, đường dẫn lưu trữ và tệp mẫu nhìn thấy trong ảnh không được chép vào đây.

Ảnh chỉ chứng minh bố cục và trạng thái tĩnh đã chụp. Không suy luận route URL, quyền, API, lưu/chuyển tab, tải lên, ký số, tính toán, phân trang hoặc khả năng đáp ứng nếu ảnh không thể hiện trực tiếp.

## Hệ phân cấp và token có thể tái sử dụng

1. Shell doanh nghiệp: sidebar trắng cố định, top bar trắng, canvas xám-xanh rất nhạt; nội dung cuộn dọc dưới shell ổn định.
2. Ngữ cảnh dự án: một card đầu trang gom nhãn/badge giai đoạn, tiêu đề, switcher GĐ1–GĐ5, rồi bộ chọn Dự án và hành động phân quyền. GĐ4–GĐ5 thêm bộ chọn gói ở dưới ngữ cảnh Dự án.
3. Điều hướng nội giai đoạn: một hàng tab/bước/mô-đun ngang, tab đang chọn nền xanh; các bề mặt nội dung là card trắng độc lập.
4. Nội dung vận hành: heading đậm, mô tả ngắn, hành động chính đặt trong card sở hữu; bảng dày, header xám-xanh nhạt, dòng gọn, hành động ở cột cuối; số liệu được căn phải.
5. Trạng thái: xanh dương cho lựa chọn/chính, xanh lá cho thành công/hoàn tất, hổ phách cho cảnh báo/thiếu, đỏ cho rủi ro, tím cho tiến độ; pill nhỏ và không dùng màu làm tín hiệu duy nhất.
6. Nhịp độ: card bo tròn khoảng 16 px, padding khoảng 20–24 px, khoảng cách giữa card khoảng 20–24 px; desktop chứa nhiều cột nhưng vẫn ưu tiên một CTA rõ ràng trong từng ngữ cảnh.
7. Modal phân quyền: lớp nền mờ, hộp trung tâm, thanh tiêu đề navy, nút đóng rõ ràng và luồng owner/thành viên theo tầng. Galaxy phải giữ dialog có nhãn, focus và quyền backend; ảnh không chứng minh hành vi modal.

## Quan sát theo bề mặt

| Bề mặt                   | Tham chiếu hình ảnh                                                       | Mẫu giao diện được lấy                                                                                    | Áp dụng Galaxy bắt buộc                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Executive Dashboard      | `dashboard.png`, `p0-create-upload-matrix/01-home.png`                    | banner xanh/indigo, KPI gọn, vùng planned-vs-actual, bảng dự án và CTA chi tiết                           | `/projects` là dashboard lọc theo quyền với số liệu thật; chỉ render chỉ số/tài chính/chart khi dữ liệu và capability thật có sẵn.                                                            |
| Header/switcher/selector | `stage-1.png`, `stage-2.png`, `stage-3.png`, `stage-4.png`, `stage-5.png` | badge/tên giai đoạn và switcher ở trên; selector Dự án và phân quyền dưới                                 | một `ProjectStageHeader` hai hàng cho GĐ1–GĐ5; đổi Dự án giữ route giai đoạn nhưng reset trạng thái UI cục bộ theo amendment.                                                                 |
| GĐ1 Matrix               | `stage-1.png`, `stage-1-simple/stage-1-overview.png`, `02-stage-one.png`  | card ma trận năm cột, một hành động ngắn mỗi hàng, file hiển thị gọn                                      | Matrix là một vùng độc lập trước Workflow; chỉ định nghĩa/tài liệu `initialMatrix=true` xuất hiện tại đây.                                                                                    |
| GĐ1 Workflow và upload   | `stage-1-tab-1..5.png`, `stage-1-simple/step-1..5.png`                    | năm bước ngang; một bước chọn có heading, vùng upload và danh sách đã nộp bên dưới                        | Workflow chỉ hiển thị định nghĩa/tài liệu `initialMatrix=false` đúng Step; không lồng hay lặp Matrix trong Workflow. Một uploader dùng chung, không tạo kho/tệp vật lý thứ hai.               |
| Hai pha upload           | năm ảnh `project-workspace/phase1-*.png`                                  | trạng thái thấy được: đã tải tạm/chờ nộp, tiến độ xác nhận, nộp, giữ/đóng/hủy bản tạm, và file sau reload | Phase A chỉ truyền byte và hoàn tất tạm; Phase B `NỘP HỒ SƠ` chỉ liên kết bản tạm. Lifecycle, idempotency, retry, quyền và LAN transport do amendment/API chứng minh, không phải do ảnh tĩnh. |
| GĐ2                      | `stage-2-tab-1..3.png`                                                    | ba tab ngang; bảng baseline/BOQ và card thẩm định ở mật độ cao                                            | nhãn Galaxy: `KẾ HOẠCH & KHẢO SÁT`, `THIẾT KẾ, SẢN PHẨM & BOQ`, `THẨM ĐỊNH & PHÊ DUYỆT`; chỉ ghép domain đang có.                                                                             |
| GĐ3                      | `stage-3-tab-1..3.png`                                                    | ba mô-đun ngang, bảng và form/card theo ngữ cảnh                                                          | nhãn Galaxy: `BÁO GIÁ & HỢP ĐỒNG KHÁCH HÀNG`, `NHÀ CUNG CẤP & MUA HÀNG`, `PO, PI & KẾ HOẠCH THANH TOÁN`.                                                                                      |
| GĐ4                      | `stage-4-tab-1..4.png`                                                    | bốn tab; bảng/card cho hợp đồng, thanh toán, tiến độ và nhật ký; accent xanh/xanh lá/tím/cam              | nhãn Galaxy: `SẢN XUẤT & QC`, `LOGISTICS & HẢI QUAN`, `KHO & GIAO HÀNG`, `LẮP ĐẶT & TIẾN ĐỘ`; bộ chọn package/contract ở dưới shared header, không làm header cao hơn.                        |
| GĐ5                      | `stage-5-tab-1..3.png`                                                    | ba tab; danh sách bàn giao, quyết toán và archive/bảo hành                                                | nhãn Galaxy: `NGHIỆM THU & BÀN GIAO`, `QUYẾT TOÁN & THANH LÝ`, `BẢO HÀNH & HẬU MÃI`.                                                                                                          |

## Điều chỉnh bắt buộc cho Galaxy OS

- Giữ shell/tokens hiện có, Project, IAM, domain nghiệp vụ, FileAsset, UploadSession, Activity và Audit là nguồn sự thật duy nhất; tham chiếu chỉ cung cấp hierarchy, density và treatment trạng thái.
- Mọi GĐ1–GĐ5 được phép phải mở trực tiếp. Không suy diễn gate từ ảnh; theo amendment, GĐ1, file thiếu và trạng thái giai đoạn trước không chặn route sau.
- Dùng tên giai đoạn/tabs Galaxy trong amendment, không dùng nhãn public-construction, quy trình pháp lý, SmartCA/GPS, Drive, kho lưu trữ vật lý hay trạng thái mã thô của mẫu.
- Thay sample rows/chart/KPI/tiền/tệp bằng record thật hoặc empty state trung thực. Không tạo fake CTA, fake file, fake approval, fake completion hay giả định preview.
- Phân quyền, tài chính, download/preview, selector Dự án, submitted officer và target upload do backend quyết định. Ẩn trên UI không phải là authorization.

## Nội dung cấm sao chép

- Không sao chép dữ liệu mẫu, danh tính/tài khoản/email, mã dự án/gói/hợp đồng, số tiền, ngày, file name, storage path, token, pháp lý/quy chuẩn, SmartCA/Google Drive/GPS hoặc tuyên bố tích hợp từ ảnh.
- Không dùng credential, cookie, session, URL nội bộ, dữ liệu fixture hay ảnh này làm dữ liệu seed/mock/screenshot mới.
- Không sao chép yêu cầu upload bắt buộc, giới hạn kích thước, chữ ký số, auto-routing, công thức/biểu đồ hoặc hành vi workflow của nguồn. Galaxy dùng cấu hình, quyền và domain đã được xác thực.

## Ánh xạ yêu cầu sang tham chiếu

| Yêu cầu 2026-08-22     | Bằng chứng tham chiếu                                                                          | Diễn giải triển khai                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard              | `dashboard.png`                                                                                | banner → KPI → chart → bảng là thứ bậc hình ảnh; nội dung là aggregate thật, capability-gated.                                                                                |
| Shared header hai hàng | mọi ảnh GĐ1–GĐ5                                                                                | hàng 1 chuẩn hoá badge/tên/switcher; hàng 2 chuẩn hoá selector/code-name/phân quyền. Ảnh cho thấy hai tầng này, amendment quy định một component duy nhất.                    |
| Tách Matrix/Workflow   | `stage-1*.png`, `02-stage-one.png`                                                             | ma trận nằm trước navigator/detail; Galaxy làm hai context sibling và lọc theo `initialMatrix`, không lặp thành hai bề mặt cho cùng tài liệu.                                 |
| Upload hai pha         | `project-workspace/phase1-*.png`                                                               | ảnh minh hoạ các trạng thái tạm/nộp/reload; contract Phase A/Phase B, transport và audit theo amendment, không suy từ ảnh.                                                    |
| Tabs GĐ2–GĐ5           | `stage-2-tab-1..3.png`, `stage-3-tab-1..3.png`, `stage-4-tab-1..4.png`, `stage-5-tab-1..3.png` | dùng đúng số tab và hierarchy; map nội dung sang canonical Galaxy domain và nhãn nêu trên.                                                                                    |
| Responsive             | captures desktop 1536 px; `p0-create-upload-matrix/*` 1440 px                                  | giữ shell/card/table density ở desktop. Không có ảnh mobile nên phải kiểm thử riêng: switcher cuộn ngang native, selector full width, bảng/card không cắt hay overflow trang. |

## Khoảng trống bằng chứng

- Không có capture mobile/tablet, trạng thái xoay màn hình hoặc hành vi scroll/focus/keyboard; không thể xác nhận responsive runtime từ nguồn.
- Không có chuỗi tương tác/video hoặc network trace; không thể xác nhận route, submit, idempotency, resume, reload, authorization, error/loading/forbidden, download/preview hay modal focus bằng ảnh tĩnh.
- Các ảnh Stage 2–5 là desktop sample UI; chúng không chứng minh rằng mọi submodule, số liệu, CTA hay document requirement phù hợp Galaxy.
- Một số capture GĐ1 giữ copy/legal workflow và upload bắt buộc mâu thuẫn amendment 2026-08-22; chỉ hierarchy/density được tái sử dụng.

Xác nhận cuối: tham chiếu được dùng như visual/interaction vocabulary. Amendment 2026-08-22 và các domain/policy Galaxy quyết định route, dữ liệu, quyền, upload lifecycle và trạng thái nghiệp vụ.

## Checkpoint triển khai 2026-08-24

- Galaxy đã dùng một header/switcher/selector chung cho năm route giai đoạn,
  Dashboard thật tại `/projects`, hai section Matrix/Workflow độc lập và một
  transport UploadSession/FileAsset chung. GĐ2–GĐ5 dùng route/domain Galaxy hiện
  hữu; không đưa số, file hay hàng mẫu từ PMS vào production.
- Route backend được xác nhận bằng source là `POST /api/v1/uploads/initiate`.
  Proxy Next same-origin cho phép root `uploads` và các root downstream thật,
  truyền stream thay vì đọc `ArrayBuffer`, giữ cookie/CSRF/range/status/header.
  Bằng chứng unit mới: proxy **40/40**, Web **485/485**.
- Năm PNG và một PDF trong `.artifacts/pms-reference/project-workspace/` vẫn là
  bằng chứng ignored hiện có. Chúng không thay thế cho capture mới đủ 17 trạng
  thái ở bốn viewport.
- Browser/runtime acceptance chưa được tái xác nhận sau patch cuối: fixture
  Playwright không thể bind `127.0.0.1:3101` trong runner (`EPERM`) và PostgreSQL
  `localhost:5432` không truy cập được (`P1001`). Vì vậy localhost/LAN, reload,
  preview/download, responsive và forbidden state vẫn là khoảng trống bằng
  chứng, không phải kết quả pass.

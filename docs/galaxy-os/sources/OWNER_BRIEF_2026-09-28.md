# GALAXY OS — NẠP CỐT LÕI, KIẾN THỨC DỰ ÁN VÀ LỘ TRÌNH TRIỂN KHAI

Nguồn: yêu cầu chủ dự án ngày 2026-09-28, nhãn OWNER_REQUIREMENT. Bản lưu nội dung tự đủ của prompt A–W, chuẩn hóa bố cục Markdown và cách trình bày (các bảng đối chiếu là chỉ mục biên tập); không tuyên bố nguyên byte. Đây là bản giao việc/hợp nhất, không phải raw v0.2.

SOURCE_RAW_NOT_FOUND: chưa tìm thấy raw v0.2 trong phạm vi repository/docs/Git được kiểm tra ở M0; không bịa tên file/hash/dòng. Quan sát mới và kết quả thực hiện phải đọc ở [STATUS](../05-IMPLEMENTATION-STATUS.md), không sửa ngược thành nội dung người dùng đã cung cấp. Các chữ A–W giữ phép truy ngược về prompt; nguồn lưu trữ này không tự cho phép chạy lại lệnh của phiên cũ.

Workspace dự kiến: /home/galaxy_os. Ngôn ngữ tài liệu/báo cáo: tiếng Việt. Prompt độc lập, toàn bộ nội dung cần nạp đã có. Không yêu cầu upload tài liệu, tải ZIP, giải nén, chép file hoặc cung cấp lại nội dung. Trực tiếp đọc repo, tạo/cập nhật tài liệu cốt lõi, điểm dẫn phiên sau, kiểm tra và commit local đúng phạm vi nếu an toàn. Lượt này M0; chưa sửa ứng dụng hay triển khai M1–M7.

## A. Kết quả muốn nhận ngay

1. Cốt lõi lưu thành tài liệu thật trong repo, đủ dùng, không chỉ “đã ghi nhớ”.
2. Phiên sau đọc được mục tiêu, cốt lõi nghiệp vụ, UI/UX/chat/AI/quyền, quyết định chưa chốt, trạng thái có bằng chứng, việc hiện tại và bước tiếp.
3. Có lộ trình từng mốc, scope/kết quả nghiệm thu, mapping G00–G09 hiện có; không lập lại từ đầu.
4. Có handoff M0 và danh sách file thực đổi.
5. Nếu đủ điều kiện, commit LOCAL riêng docs/hướng dẫn; không push/merge/deploy.

Phân biệt tài liệu ghi nhớ PHÁT TRIỂN Galaxy OS với bộ nhớ vận hành từng dự án KHÁCH HÀNG. Chỉ tạo phần đầu, không tuyên bố xây xong phần sau hoặc đã cập nhật Saved Memory/Project settings ChatGPT.

## B. Quyền thực hiện và rào an toàn

Được đọc source/docs/hướng dẫn/lịch sử Git; viết docs Galaxy OS; thêm điểm dẫn ngắn root AGENTS nếu không xung đột; ghi hiện trạng có nguồn; kiểm tài liệu/liên kết/phạm vi; commit local các file đúng scope đã review.

Không được sửa source ứng dụng/API/UI/schema/migration/IAM; dependency/lockfile/runtime config/test hiện có; reset/seed/migrate DB đang dùng; chạy email/publish/payment/order thật; xóa/ghi đè lịch sử/dữ liệu/báo cáo cũ; git reset/clean/stash bỏ thay đổi người dùng; amend/rebase/force push/bypass hooks/guard; tự merge worktree/branch; đổi remote/visibility/quyền chia sẻ; push/release/deploy; gửi source/khách/secrets ra ngoài; sửa global instructions/tạo override lách hướng dẫn.

Đọc/giữ AGENTS/guard/Ponytail hiện có. Bị chặn thì ghi đúng blocker, tiếp tục phần độc lập an toàn; không bỏ toàn bộ vì blocker nhỏ. Không hỏi thông tin đọc được trong repo, không hỏi lại quyền lưu docs đã giao.

## C. Mục tiêu và bảy nguyên tắc

Galaxy OS là hệ thống vận hành riêng của Galaxy Centre. Mục tiêu là gom toàn bộ cuộc trao đổi, file, kiến thức và quá trình làm việc vào từng hồ sơ dự án; nhân viên làm việc thuận tiện bằng chat và công cụ AI, người quản lý nhìn được thực trạng và căn cứ.

Đây không phải ứng dụng chỉ lưu chat, phần mềm chỉ bắt tải hồ sơ, hệ thống biểu mẫu gắn ô hỏi GPT, ERP tổng quát mở rộng vô hạn, hoặc PMS đầu tư xây dựng áp bắt buộc cho mọi công việc Galaxy.

Chuỗi quản lý: Khách hàng tiềm năng → Khảo sát và yêu cầu → Thiết kế → Lựa chọn sản phẩm/vật liệu → Dự toán/báo giá → Hợp đồng/phụ lục → Thu tiền/công nợ/dòng tiền → Đặt hàng → Sản xuất/nhập khẩu → Kho/giao hàng → Thi công → Nghiệm thu/bàn giao/bảo hành.

1. Dự án là trung tâm.
2. Dữ liệu chỉ nhập một lần, tái sử dụng bằng liên kết.
3. Các bộ phận dùng chung một nguồn thông tin theo quyền.
4. Mọi thay đổi quan trọng có lịch sử và phiên bản.
5. Mọi công việc có người chịu trách nhiệm.
6. Các hành động quan trọng có điều kiện và phê duyệt.
7. Người quản lý nhìn được tiến độ, tiền, hàng, lợi nhuận, vướng mắc, rủi ro và căn cứ quyết định.

Đích đến: “Nhân viên làm việc tự nhiên bằng chat và AI; hệ thống giữ kết quả bằng hạng mục, công việc, quyết định, phiên bản và chứng từ; người quản lý biết đang đến đâu, chờ ai và cần xử lý gì.”

## D. Một hồ sơ xuyên suốt: tiềm năng ↔ đã ký

Khách hàng tiềm năng là chế độ rút gọn của cùng hồ sơ dự án; khách hàng đã ký là cùng hồ sơ được mở rộng để thực hiện. Chuyển nhóm làm việc, không sao chép dữ liệu.

Hồ sơ có định danh ổn định xuyên suốt. Chat, file, phiên bản, công việc, quyết định và kiến thức không mất khi chuyển tiềm năng sang đã ký, về chăm sóc/thương lượng lại, tiếp tục thực hiện, đổi tên, đổi nhân viên, mở chat mới hoặc đổi model AI. Không tự tạo Project, Customer, doanh số hay bộ nhớ mới mỗi lần chuyển.

Một khách hàng có nhiều công trình/hồ sơ riêng; không trộn bộ nhớ vì cùng khách. Một dự án có thể có nhiều hợp đồng, phụ lục, thương hiệu, nhà cung cấp, đơn hàng, chuyến hàng, đội thi công, đợt thanh toán và đợt nghiệm thu.

Tách ba loại trạng thái:

| Trục      | Nội dung                                      |
| --------- | --------------------------------------------- |
| Chăm sóc  | Tiếp nhận, tư vấn, thương lượng, chăm sóc lại |
| Cam kết   | Phần nào đã ký, nghĩa vụ nào còn hiệu lực     |
| Thực hiện | Tiền, hàng, thi công, nghiệm thu đến đâu      |

Chuyển về chăm sóc không tự hủy hợp đồng, tiền đã thu/chi, PO, công nợ, lịch sử hoặc bảo hành. Ký phần cửa không làm phần đèn thành đã ký. Đang tư vấn vẫn có thể khảo sát, thiết kế, hỏi giá và báo giá. Lưu được hồ sơ ban đầu không đồng nghĩa đủ điều kiện thực hiện mọi bước.

Nếu code có Lead và Project riêng: đọc rồi đề xuất giữ định danh/liên kết/lịch sử; M0 không tự gộp bảng hay tạo lại domain.

## E. Đủ 12 giai đoạn nghiệp vụ

Đây là đặc tả hợp nhất từ yêu cầu chủ dự án, không phải raw v0.2 nguyên byte. Nếu tìm thấy nguồn v0.2 đầy đủ thì giữ nguyên và đối chiếu; khi chưa tìm thấy ghi SOURCE_RAW_NOT_FOUND, vẫn hoàn thành M0 từ nguồn hiện tại.

### 01. Khách hàng tiềm năng và cơ hội bán hàng

- Thông tin: khách/người liên hệ, điện thoại, email, địa chỉ công trình, nguồn khách, người giới thiệu, loại công trình, quy mô, ngân sách dự kiến, thời gian cần hoàn thành, người phụ trách.
- Nguồn: trực tiếp, kiến trúc sư/nhà thiết kế, đối tác, website, Facebook, Zalo, showroom, khách cũ hoặc nhà cung cấp giới thiệu.
- Quá trình: mới tiếp nhận, liên hệ, gặp, khảo sát nhu cầu, có khả năng, chưa đủ điều kiện, tạm dừng, không thành công, chuyển tiếp.
- Giữ lịch chăm sóc và bước tiếp theo. Trước bước làm việc cần đủ căn cứ: khách thật, công trình, phạm vi sơ bộ, người phụ trách, lịch khảo sát/buổi làm việc tiếp theo.

### 02. Khảo sát và xác lập yêu cầu

- Ghi hiện trạng, ảnh/video, số đo, bản vẽ kiến trúc/kết cấu/điện nước, nhu cầu, phong cách, ngân sách, thời gian và các bên.
- Đầu ra: biên bản khảo sát, bản vẽ/ảnh hiện trạng, nhiệm vụ thiết kế, danh sách yêu cầu, phạm vi và rủi ro ban đầu.
- Khách hoặc đại diện đúng thẩm quyền xác nhận nhiệm vụ/phạm vi. Tải ảnh lên chưa phải hoàn tất xác lập yêu cầu.

### 03. Thiết kế

- Bộ môn: layout, kiến trúc, nội thất, trần, sàn, đèn, điện, nước, điều hòa, Smart Home, đồ gỗ, cửa, kính, đá, thiết bị, đồ nội thất nhập khẩu.
- Mỗi bản vẽ có mã, tên, bộ môn, phiên bản, ngày phát hành, người thiết kế/kiểm tra/phê duyệt, trạng thái.
- Phân biệt đang làm, kiểm tra nội bộ, chờ khách duyệt, yêu cầu sửa, đã duyệt, phát hành thi công, hủy bỏ.
- Không dùng bản chưa đủ trạng thái/điều kiện cho hành động đặt hàng hoặc thi công tương ứng.

### 04. Lựa chọn sản phẩm và vật liệu

- Quản lý thương hiệu, nhà sản xuất/nhà cung cấp, mã/model, tên, kích thước, vật liệu, màu, hoàn thiện, phụ kiện, số lượng, đơn vị, phòng/vị trí, giá list, chiết khấu, giá mua/bán, thuế, vận chuyển, lắp đặt, bảo hành, lead time.
- Phân biệt đề xuất, chờ mẫu/giá/duyệt, đã duyệt, tạm giữ, thay thế, hủy, đã đặt/giao/lắp.
- Nguồn lựa chọn: ảnh, catalog, spec, mẫu, bản vẽ, email hoặc phiếu xác nhận.
- Biết cấu hình và phiên bản áp dụng cho từng hạng mục. Ảnh minh họa không tự thay xác nhận kỹ thuật.

### 05. Dự toán và báo giá

- Tổ chức theo khu vực, phòng, hạng mục, thương hiệu, nhà cung cấp, gói việc.
- Mỗi dòng: mã hạng mục, tên hàng/công việc, mô tả, quy cách, đơn vị, số lượng, đơn giá, thành tiền, thuế, chiết khấu, ghi chú, nguồn giá, giá vốn và chênh lệch dự kiến theo định nghĩa.
- Quản lý phiên bản, so sánh dòng thêm/bỏ, số lượng, cấu hình, giá, giá trị tăng/giảm và ảnh hưởng chi phí.
- Kiểm tra nội bộ: giá vốn, tỷ giá, thuế, logistics, thi công, hoa hồng/chi phí đối tác và biên theo chính sách.
- Phân biệt ngân sách khách, dự toán nội bộ, báo giá bán, ngân sách thực hiện và dự báo mới nhất.

### 06. Hợp đồng và phụ lục

- Quản lý hợp đồng chính, phụ lục, biên bản điều chỉnh, phạm vi, giá trị, thời gian, thanh toán, giao hàng, nghiệm thu, bảo hành, bảo lãnh ngân hàng, phạt và phần loại trừ.
- Trạng thái: soạn, kiểm tra, chờ khách ký, đã ký, thực hiện, tạm dừng, thanh lý, hoàn thành, tranh chấp.
- Mỗi phụ lục thể hiện ảnh hưởng tới giá trị, phạm vi, tiến độ, thanh toán, đặt hàng và chi phí.
- Bản đã ký không bị sửa âm thầm bởi danh mục/báo giá mới.

### 07. Thu tiền, công nợ và dòng tiền

- Quản lý giá trị nghĩa vụ, đã thu/trả, đến hạn, quá hạn, giữ lại, bảo hành/bảo lãnh, ngày dự kiến và ngày thực. Theo dõi cả khách và nhà cung cấp.
- Dự báo tiền thu khách, trả nhà cung cấp, thuế, logistics, thi công/nhân công, thiếu/thừa tiền theo thời điểm.
- Cảnh báo đến hạn, quá hạn, chưa đủ điều kiện đặt hàng, yêu cầu trả nhà cung cấp, lệch hợp đồng, vượt ngân sách.
- Phân biệt chứng từ khách gửi, giao dịch đã đối chiếu, tiền thực và tiền đã phân bổ vào nghĩa vụ.

### 08. Đặt hàng nhà cung cấp

- Đơn hàng có mã, dự án, nhà cung cấp, thương hiệu, dòng sản phẩm, PI/chào giá, tiền/currency/tỷ giá, điều kiện thanh toán/giao, lead time, địa điểm, người phụ trách và phê duyệt.
- Quá trình: chuẩn bị, xác nhận kỹ thuật, duyệt, chờ tiền, đặt cọc, xác nhận sản xuất, sản xuất, hoàn thành, chờ lấy, vận chuyển, kho, giao công trình, hoàn thành, khiếu nại.
- Trước phát hành kiểm tra đúng lựa chọn/cấu hình, kích thước, màu/vật liệu, số lượng, giá, điều kiện tiền, địa điểm giao, khách thanh toán đủ THEO THỎA THUẬN.
- Không tự áp quy tắc phải thu 100% toàn hợp đồng.

### 09. Sản xuất, nhập khẩu và logistics

- Sản xuất: xác nhận đơn, ngày bắt đầu, tiến độ, ngày dự kiến/thực tế xong, kiểm tra chất lượng, ảnh sản xuất/đóng gói, packing list, kiện, kích thước, trọng lượng.
- Vận chuyển: hình thức, đơn vị, ngày lấy, cảng đi/đến, container, vận đơn, ETD/ETA, thông quan, thuế, VAT, chi phí phát sinh, ngày về kho.
- Cảnh báo chậm sản xuất, thiếu chứng từ/packing list, ETA đổi, giữ tại cảng, thiếu tiền thuế/phí, hàng về khi công trình chưa sẵn sàng hoặc ngược lại.
- Giữ mốc cũ, mốc mới, nguồn và ảnh hưởng.

### 10. Kho và giao hàng

- Nhập kho: ngày nhận, nhà cung cấp/đơn, số kiện, bao bì, tình trạng sản phẩm, thiếu/thừa/hỏng, ảnh và vị trí lưu.
- Phân bổ theo dự án, tầng, phòng, khu vực, hạng mục, đợt giao.
- Phân biệt chờ nhận, thực nhận, kiểm tra, đạt/thiếu/hỏng, chờ giao, xuất, giao, lắp.
- Điều kiện giao/xuất theo chính sách: lệnh giao, mặt bằng sẵn sàng, người nhận, kế hoạch vận chuyển, đội lắp và hồ sơ giao nhận.
- “Đã nhận” chưa đồng nghĩa đủ và đạt chất lượng. Phần chuẩn bị trước giao và phần ký sau giao cần quyết định rõ.

### 11. Thi công và lắp đặt

- Theo dõi khu vực/tầng/phòng/hạng mục, đội/nhà thầu, ngày bắt đầu, hạn, ngày thực tế hoàn thành.
- Trạng thái: chưa triển khai, chờ mặt bằng/vật tư, đang làm, tạm dừng, chờ kiểm tra, cần sửa, hoàn thành, đã nghiệm thu.
- Nhật ký có nhân lực, công việc, khối lượng, ảnh, vật tư, vướng mắc, phối hợp, rủi ro, sự cố.
- Phát sinh ghi ai yêu cầu, nguyên nhân, nội dung, tiền tăng/giảm, ảnh hưởng tiến độ, trách nhiệm chi phí, duyệt và hồ sơ liên quan.
- Đội thi công báo xong không tự là khách đã nghiệm thu.

### 12. Nghiệm thu, bàn giao và bảo hành

- Quá trình: kiểm tra nội bộ, lập lỗi, sửa, kiểm tra lại, nghiệm thu khách, bàn giao hồ sơ/sản phẩm, hướng dẫn và ký biên bản.
- Hồ sơ: nghiệm thu, bàn giao, danh mục sản phẩm, hướng dẫn, bảo hành, nguồn cung, hoàn công, hồ sơ kỹ thuật, lỗi và hạn xử lý.
- Bảo hành: mã yêu cầu, khách/dự án/hạng mục, ngày, nội dung, ảnh/video, nguyên nhân, trách nhiệm, phương án, chi phí, người phụ trách, hạn, xác nhận khách.
- Trách nhiệm có thể thuộc sản xuất, vận chuyển, lắp đặt, thiết kế, sử dụng, hao mòn, hỗ trợ thiện chí hoặc phát sinh tính phí.
- Phân biệt tiếp nhận phản ánh với kết luận trách nhiệm. Mâu thuẫn về bàn giao còn lỗi phải chờ quyết định, không tạo ngoại lệ hay bản ký giả.

## F. Phân hệ, dữ liệu, dashboard và giới hạn

12 giai đoạn là chuỗi nghiệp vụ; 12 phân hệ là cách tổ chức năng lực, không phải quan hệ một–một.

| Mã phân hệ | Phân hệ gốc                      | Giai đoạn đối chiếu      |
| ---------- | -------------------------------- | ------------------------ |
| PH01       | CRM                              | 01, liên kết xuyên hồ sơ |
| PH02       | Quản lý dự án                    | 01–12                    |
| PH03       | Thiết kế và lựa chọn sản phẩm    | 02–04                    |
| PH04       | Báo giá                          | 05                       |
| PH05       | Hợp đồng và thanh toán           | 06–07                    |
| PH06       | Mua hàng và nhà cung cấp         | 08                       |
| PH07       | Sản xuất, logistics và nhập khẩu | 09                       |
| PH08       | Kho và giao nhận                 | 10                       |
| PH09       | Thi công và nghiệm thu           | 11–12                    |
| PH10       | Bàn giao và bảo hành             | 12                       |
| PH11       | Tài liệu                         | 01–12                    |
| PH12       | Galaxy AI Assistant              | Hỗ trợ 01–12 theo quyền  |

28 nhóm dữ liệu gốc (nhóm nghiệp vụ, không phải lệnh tạo 28 bảng mới):

| Mã   | Nhóm                      | Mã   | Nhóm                  |
| ---- | ------------------------- | ---- | --------------------- |
| DL01 | Khách hàng                | DL15 | Đợt thanh toán        |
| DL02 | Người liên hệ             | DL16 | Đơn đặt hàng          |
| DL03 | Đối tác giới thiệu        | DL17 | Chuyến hàng           |
| DL04 | Kiến trúc sư/nhà thiết kế | DL18 | Kiện hàng             |
| DL05 | Dự án                     | DL19 | Kho                   |
| DL06 | Công trình/bất động sản   | DL20 | Lệnh giao             |
| DL07 | Phòng/khu vực             | DL21 | Công việc thi công    |
| DL08 | Hạng mục                  | DL22 | Nhà thầu phụ          |
| DL09 | Sản phẩm                  | DL23 | Biên bản nghiệm thu   |
| DL10 | Thương hiệu               | DL24 | Yêu cầu bảo hành      |
| DL11 | Nhà cung cấp              | DL25 | Tài liệu              |
| DL12 | Báo giá                   | DL26 | Phê duyệt             |
| DL13 | Hợp đồng                  | DL27 | Nhắc việc             |
| DL14 | Phụ lục                   | DL28 | Người dùng/phân quyền |

Dashboard cần có:

- Kinh doanh: khách/cơ hội, báo giá, chờ duyệt, chuyển đổi, doanh số theo nhân viên/thương hiệu.
- Tài chính: hợp đồng, thu, nợ đến/quá hạn, phải trả, dòng tiền 30/60/90 ngày, lợi nhuận theo định nghĩa được duyệt.
- Mua hàng: chờ cọc, sản xuất, chậm, vận chuyển, sắp về, thiếu chứng từ, khiếu nại.
- Thi công: đúng/nguy cơ chậm, chờ hàng/mặt bằng, cần sửa.
- Bảo hành: mới, quá hạn, lặp lỗi, chi phí và trách nhiệm.

MVP gốc: CRM, dự án, sản phẩm, báo giá, hợp đồng/thanh toán, đặt hàng/sản xuất, thi công/bàn giao, tài liệu, dashboard cơ bản.

Để sau theo nguồn gốc: kế toán đầy đủ, lương, nhân sự chuyên sâu, kho đa địa điểm nâng cao, bảo trì định kỳ, portal và ứng dụng công trường chuyên biệt.

Chat khách/đối tác và AI đa năng là yêu cầu mới mở rộng trải nghiệm/phạm vi; không bịa rằng v0.2 đã mô tả đầy đủ. Marketing/Publishing cho hai hệ sinh thái Galaxy có yêu cầu trong lịch sử: giữ trạng thái/phạm vi có nguồn, không tự hủy, bật hoặc xuất bản thật, không làm thêm trong M0.

## G. Giao diện và cách sử dụng

Điều hướng chính: Việc của tôi; Dự án (Khách hàng tiềm năng, Khách hàng đã ký / Dự án); Thư viện công ty.

Trong mỗi hồ sơ có bốn mục: Tổng quan, Làm việc, Hạng mục, Hồ sơ & kiến thức.

| Nhóm trong Làm việc  | Giai đoạn nghiệp vụ |
| -------------------- | ------------------- |
| Tư vấn & báo giá     | 02–05               |
| Hợp đồng & tài chính | 06–07               |
| Cung ứng & giao hàng | 08–10               |
| Thi công & hậu mãi   | 11–12               |

Stage 01 thuộc tiếp nhận/chăm sóc của cùng hồ sơ. Phòng khách hàng là phạm vi chia sẻ, không là stage 13. Bốn nhóm không phải bốn kho dữ liệu/bộ nhớ độc lập. Không khóa cả nhóm chỉ vì nhóm trước chưa xong; kiểm tra điều kiện tại hành động và phạm vi tương ứng theo chính sách đã xác nhận.

Cuộc làm việc có danh sách chủ đề/công việc; chat với đồng nghiệp hoặc gọi AI có nhận diện rõ; panel bảng/tài liệu/ảnh khi cần. Đầu việc ghim mục tiêu, owner, hạn, trạng thái, đầu ra/bản hiện hành, đang chờ ai, bước tiếp theo. Không ép mọi chat thành task; không gom mọi việc vào chat tên nhân viên. Có thể tạo việc từ một tin hoặc liên kết chat vào việc đã có.

Nhân viên mở Việc của tôi/việc gần nhất; quản lý mở Tổng quan. Đây là góc nhìn trên cùng dữ liệu.

Ưu tiên không nhập lại dữ liệu đã biết; dùng lại file đính kèm không upload lần hai; lưu nháp và giữ nội dung khi lỗi; trạng thái gửi/lưu thật từ server; retry không trùng; mobile dùng được không buộc đọc bảng quá rộng; không báo hoàn thành giả bằng toast hoặc trạng thái frontend.

## H. Hai vòng làm việc

Vòng 1: hỏi, dịch, tìm, phân tích, thử phương án, sửa ảnh, soạn tài liệu và tạo nháp.

Vòng 2: kiểm tra, xác nhận, phê duyệt, phát hành, ghi nhận thực hiện và nghiệm thu.

Điểm nối: thẻ cập nhật có nguồn → người có quyền kiểm tra → gọi domain service → lưu kết quả và lịch sử. Không bắt nhập lại thông tin AI đã trích xuất; cho xem nguồn và sửa dữ liệu trước xác nhận.

Không tự chuyển:

- Tin “khách muốn đổi màu” thành mẫu đã duyệt.
- Ảnh chuyển tiền thành tiền đã đối chiếu.
- Nhà máy báo xong thành hàng đạt chất lượng.
- Đội lắp báo xong thành nghiệm thu.
- Hợp đồng AI soạn thành hợp đồng đã ký.

Tự động phân loại/gợi ý người nhận chỉ là hỗ trợ. Không rõ thì vào hàng đợi cần phân loại. Không tự mở quyền vì model đoán một người nên nhận việc.

## I. Phân quyền theo dự án, mục và cuộc trao đổi

Tái sử dụng IAM hiện có. Kiểm tra tổ chức/tài khoản hợp lệ, permission, scope, target-policy, delegation-policy và active-status theo mô hình thực tế. Giữ action và scope cùng đường cấp quyền hợp lệ; không mượn action ở binding A và scope ở binding B để vượt quyền.

Tách các hành động: xem; gửi tin; đính kèm; dùng AI; tải/xuất/chia sẻ; sửa dữ liệu; giao việc; kiểm tra; phê duyệt; phát hành; mời/quản trị thành viên; quản lý quyền/ủy quyền; xem giá vốn, margin và thông tin tài chính nhạy cảm.

Mẫu giao diện “Không truy cập / Chỉ xem / Trao đổi / Phụ trách mục” là đề xuất UX, không phải role runtime đã cấp. Không tự cộng quyền tài chính, phê duyệt hoặc quản trị vì tên “quản lý”.

Quyền phải thực thi ở API, dữ liệu trả về, URL trực tiếp, socket subscribe/broadcast, search, file/preview/download, log, notification, export, cache, job và công cụ AI.

Phân công không tự cấp quyền. Membership dự án không tự cấp quyền tài chính. Mention không cấp quyền. Có link không đồng nghĩa được xem. Người chỉ xem không gửi được qua API hoặc socket. Quyền gọi AI không tự cho phép đăng kết quả vào phòng chung. Mục hạn chế và room riêng giữ ranh giới dữ liệu.

Thu hồi quyền phải được kiểm tra lại ở các truy cập/phát dữ liệu tiếp theo, gồm lịch sử AI/context/cache và câu trả lời đang tạo. Không hứa thu hồi nội dung người nhận đã đọc/tải hợp lệ. Quyền admin cuối cùng, delegation và tách người lập/duyệt theo chính sách có nguồn; thiếu thì chờ quyết định.

## J. Chat với khách hàng và đối tác

Cùng Project nhưng tách vùng nội bộ Galaxy, trao đổi với khách, trao đổi với từng nhà cung cấp/đối tác khi cần. Không mời khách vào nguyên phòng nội bộ rồi ẩn vài tin; không mở lịch sử giá vốn/nhà máy/đàm phán nội bộ cho khách.

Chia sẻ: chuẩn bị nội bộ → xem trước người nhận và nội dung → kiểm tra → phát hành bản cụ thể → phản hồi. Bản phát hành giữ liên kết nguồn/phiên bản, không sao chép toàn bộ dự án.

Quyền mời xác định ai, project, mục/room, xem hay gửi, file/lịch sử được thấy, thời hạn khi áp dụng. Khách xem/gửi trong phạm vi của họ; nhà cung cấp không xem báo giá/đơn của bên khác.

Mặc định AI soạn phản hồi để nhân viên kiểm tra; không tự gửi câu trả lời nội bộ cho khách. AI trực tiếp với khách chỉ bật khi được cho phép: dùng nguồn đã phát hành, nhận diện là AI, không tự cam kết giá/ngày/điều kiện, có đường chuyển sang người phụ trách.

Nhắn “đồng ý” không tự ký hợp đồng hoặc duyệt khoản phát sinh chưa xác định rõ. Chat native trong Galaxy là phạm vi đầu; email/Zalo/WhatsApp là tích hợp riêng cần quyền và kết nối thực tế, không mặc định đã có.

## K. Bộ nhớ dự án và AI có nguồn

Bốn lớp dữ liệu vận hành:

1. Nguồn gốc: chat/file/ảnh/email được nhập, tác giả, thời điểm, phiên bản và quyền.
2. Thông tin đã xác nhận: yêu cầu, cấu hình, lựa chọn, giá/phạm vi/quyết định có căn cứ.
3. Thực hiện: task, hợp đồng, PO, tiền, hàng, nghiệm thu.
4. Chỉ mục/tóm tắt/liên kết phục vụ tìm kiếm, có thể dựng lại.

Galaxy giữ dữ liệu chính. Không chỉ lưu summary hoặc provider conversation ID rồi gọi là bộ nhớ đầy đủ. Thông tin trong chat không tự là sự thật đã duyệt; suy luận AI không tự là nguồn xác nhận cho suy luận sau.

Giữ nguồn, tác giả, ngày nhận, thời điểm áp dụng, trạng thái xác nhận và quan hệ thay thế. File mới tải không tự thay bản hiện hành; giá mới trong thư viện không tự đổi hợp đồng/PO cũ.

Thư viện công ty gồm catalog, template, hướng dẫn, giá chung theo quyền. Nguồn riêng dự án gồm giá thương lượng, thông tin khách, điều khoản, bản vẽ, quyết định công trình. Không tự lấy dữ liệu riêng từ project khác; tham chiếu chéo cần đúng thẩm quyền và phạm vi.

Câu hỏi tìm lý do có thể tìm chat/tài liệu liên quan. Câu hỏi “tất cả”, tổng tiền, sản phẩm thiếu điều kiện phải dùng tập dữ liệu nghiệp vụ đầy đủ theo quyền, không lấy vài kết quả semantic search thay kiểm tra toàn bộ.

Hiển thị nguồn: đã lưu / đang xử lý / tra cứu được / cần kiểm tra / lỗi. Thiếu hoặc mâu thuẫn phải nói rõ. Không khẳng định AI nhớ mọi thứ. Câu trả lời quan trọng dẫn đúng nguồn/phiên bản/thời điểm.

Import chat cũ giữ nguồn/tác giả/thời gian khi có, preview mapping project, chống trùng, báo thiếu attachment. Không tự nói API đọc toàn bộ ChatGPT cá nhân; không chỉ nhập summary rồi báo đã nhập đủ lịch sử.

M0 chỉ ghi tài liệu ghi nhớ cho PHÁT TRIỂN Galaxy OS. Bốn lớp trên là yêu cầu bộ nhớ VẬN HÀNH dự án KHÁCH HÀNG chưa được M0 xây dựng; không tuyên bố đã cập nhật Saved Memory hay Project settings ChatGPT.

## L. Nền AI, công cụ và chất lượng

Một nền trợ lý có trọng tâm theo nhóm chuyên môn, không tạo bốn bộ nhớ độc lập.

Luồng: xác định actor/quyền → tìm nguồn đúng phạm vi/phiên bản → lấy dữ liệu nghiệp vụ → gọi công cụ cần thiết → kiểm tra mâu thuẫn/thiếu → trả lời có căn cứ.

Xét cả quyền người hỏi và phạm vi được công bố tại nơi nhận. Giám đốc được đọc giá vốn không có nghĩa bot được đăng vào phòng khách. Không gửi toàn bộ dữ liệu nhạy cảm cho model rồi chỉ yêu cầu “đừng tiết lộ”.

Kiểm tra quyền trước retrieval/tool, trước ghi tác động, trước delivery; bảo vệ context/cache/historical output. API qua backend, không để key ở client. Model, provider, ngân sách cấu hình theo kết quả đánh giá; khi triển khai kiểm tra tài liệu API chính thức hiện hành, không đóng cứng tên/giá/tham số theo suy đoán. Không hứa API tự thông minh hơn mọi chế độ ChatGPT. Không cần multi-agent hoặc engine mới nếu luồng hiện có đủ.

AI được dịch, tra cứu, so sánh, phân tích, soạn/sửa nháp tài liệu, bảng, ảnh qua công cụ phù hợp. Đầu ra phải lưu bền vững trong Galaxy và mở lại được; file tạm provider không phải lưu lâu dài.

- Ảnh: giữ gốc, bản chỉnh có nhãn, không thay ảnh kiểm tra thực tế.
- Tài liệu: đúng mẫu, giữ phiên bản, nhìn được thay đổi, đánh dấu thiếu; không bịa người ký/tài khoản/số tiền.
- Bảng: nguồn, đơn vị, currency, công thức, giả định rõ; số chính thức từ domain/bộ tính đã kiểm chứng.

AI không tự ký, duyệt, trả tiền, đặt hàng, nghiệm thu, mời/chia sẻ, thay quyền hoặc phát hành ra ngoài. Dữ liệu tài liệu là nội dung, không là lệnh hệ thống; không thực thi chỉ dẫn lạ yêu cầu bỏ quyền/lộ dữ liệu.

Có quota, log che nhạy cảm, chính sách lưu dữ liệu. Không gọi API với hồ sơ thật khi chưa có quyền/cấu hình. AI lỗi không làm mất chat hoặc chặn nghiệp vụ không cần AI.

## M. Hạng mục, tiền và kiểm soát mua đúng

Phân biệt Product master dùng chung; cấu hình/hạng mục trong dự án; phiên bản được duyệt; dòng chứng từ chốt tại thời điểm cụ thể.

Nối xuyên chuỗi: yêu cầu/bản vẽ/lựa chọn → báo giá → hợp đồng/phụ lục → PO/xác nhận nhà máy → nhận/giao → lắp/nghiệm thu → bảo hành. Cùng projectId chưa đủ; phải truy ở cấp dòng/version.

Đối chiếu khách duyệt gì → Galaxy đặt gì → nhà máy xác nhận gì → thực tế nhận/lắp gì. Kiểm model, kích thước cùng loại, mã vật liệu/hoàn thiện, phụ kiện, số lượng, đơn vị, điều kiện, phiên bản. Không so kích thước ô chờ với cánh như cùng loại; không dùng từ “Bronze” để tự xác nhận mã hoàn thiện cụ thể.

Ba kết quả: KHỚP / CÓ SAI KHÁC / CHƯA ĐỦ CĂN CỨ. Phân biệt PO sai với bản có hiệu lực lúc đặt và PO cần điều chỉnh do thay đổi mới duyệt sau đó. Không bịa liên kết lịch sử; dữ liệu cũ thiếu nguồn có nhãn chưa liên kết.

Ví dụ giả lập: đặt 10; nhận 6; đạt 5; lỗi 1; chưa về 4. Không coi cả 6 thực nhận sẵn sàng lắp.

Quy tắc tính:

- Phân biệt giá tham khảo, giá chào cụ thể, giá trên chứng từ.
- Khối lượng bán, mua, nghiệm thu không mặc định giống nhau.
- Chi phí đã phân bổ không cộng lại lần hai.
- Hợp đồng không đồng nghĩa tiền đã thu; tiền đã trả không tự là toàn bộ chi phí thực tế; dòng tiền không tự là lợi nhuận.
- Không trừ nominal khác currency. Thiếu giá không thay bằng 0; thiếu tỷ giá không dùng 1.
- Phân biệt dữ liệu âm sai với giảm giá trị/hoàn/đảo hợp lệ.
- Retry/concurrency không tạo tác động kép hoặc vượt lượng.

Số chính thức do service/bộ tính có quy tắc và kiểm thử. AI tìm nguồn và giải thích, không thay chính sách tài chính.

## N. Tái sử dụng nền hiện có

Không xóa toàn bộ Galaxy OS. Tách công việc nghiệp vụ, hạ tầng upload/FileAsset và job xử lý nền như đọc file/index/export nếu thực có. UI nặng upload không có nghĩa hạ tầng file phải bỏ.

Giữ sau kiểm chứng: Project, IAM/session, FileAsset/version/download, Task, Approval, audit, notifications, commercial, procurement, inventory, installation, after-sales và Document AI thực có.

Chat/AI dùng lại nguồn/domain; không tạo sổ hợp đồng/PO/thanh toán riêng cho AI, không tạo upload service thứ hai để né lỗi upload chưa đóng. Không bắt nhân viên nhập đủ rồi xuất PDF và upload lại chỉ để đủ gate. Hồ sơ cần bản ký/bản phát hành vẫn phải có đúng căn cứ; thay loại chứng cứ cần chính sách rõ, không tự nới gate.

Chỉ ngừng UI/mã cũ sau khi xác minh sử dụng, thay thế được nghiệp vụ, test hồi quy và có phương án quay lại. Không xóa migration/dữ liệu/lịch sử.

## O. Trạng thái lịch sử: chỉ là đầu mối cần đối chiếu

Không coi phần này là xác nhận runtime hiện tại.

Mốc audit người dùng trực tiếp chuyển:

- Branch: audit/galaxy-core-20260914-120217.
- CHECKPOINT_SHA: e42390ce2e10ff310708a2be5e1e321854aaff3b.
- DOCS_COMMIT_SHA: 6a8d45c2de5a34912e00c36f46bab51b6e2daf86.
- Báo cáo: docs/audits/20260914-120217-galaxy-core/.
- Audit khi đó PARTIAL, commit local; push bị chặn do origin được báo public. Không tự suy visibility hiện nay.

Đầu mối về sau từ bản tổng hợp trợ lý:

- G00 được báo đã triển khai.
- G01 được báo IMPLEMENTED/VERIFIED, 1097 API tests.
- G02-R2 được báo còn PARTIAL, có /me timeout và upload chưa đóng đầy đủ.
- Nhiều worktree; không mặc định app đang dùng đã tích hợp mọi sửa đổi.

Đầu mối G01: 9e4bd0390d289cc8d575a27c6b75a8533149fd72; /tmp/galaxy-os-g01-20260914-162913. Đầu mối G02: g02/iam-scope-target-final-admin-20260915; /tmp/galaxy-os-g02-20260915-142744.

Đây là điểm tìm, không là lệnh checkout/reset/merge. Báo cáo trợ lý không thay report gốc/Git/test. M0 chỉ đọc đủ ghi trạng thái/nguồn, không chạy toàn audit/test production.

Nhãn: OWNER_REQUIREMENT (chủ dự án yêu cầu); USER_REPORTED (người dùng cung cấp kết quả); ASSISTANT_REFERENCE (đầu mối trợ lý); REPO_OBSERVED (thực đọc repo); TEST_VERIFIED (có lệnh, môi trường, SHA, kết quả phù hợp); UNKNOWN (chưa đủ bằng chứng).

Không tìm thấy G03+ không chứng minh chưa từng code. PARTIAL không là VERIFIED; test worktree riêng không là merge/deploy.

## P. Các quyết định còn mở

Tất cả D01–D08 là OPEN / AWAITING_OWNER_DECISION. Không tự giải quyết bằng suy đoán.

| ID  | Nội dung cần chốt                                                                        | Phần phụ thuộc                                   |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| D01 | Ai xem giá vốn/lợi nhuận; ai kiểm tra/duyệt/phát hành; hạn mức và tách người lập–duyệt   | Quyền tài chính, phê duyệt, dashboard, phát hành |
| D02 | Currency quản trị; nguồn/ngày/hướng tỷ giá; thuế, làm tròn, phân bổ, công thức lợi nhuận | Tính tiền, quy đổi, lợi nhuận, bảng và dashboard |
| D03 | Gate theo toàn dự án/hợp đồng/gói/hạng mục; trường hợp không áp dụng, hạng mục song song | Kiểm tra điều kiện từng hành động                |
| D04 | Bàn giao còn lỗi, từng phần, điều kiện đóng, công nợ còn lại                             | Nghiệm thu, bàn giao, bảo hành                   |
| D05 | Delegation, phạm vi/thời hạn/trần quyền, admin cuối cùng đủ điều kiện                    | IAM, thu hồi quyền, quản trị                     |
| D06 | Phạm vi dữ liệu AI, lưu trữ, chia sẻ ngoài, nháp riêng, AI trả lời trực tiếp khách       | Retrieval, công cụ, lưu/delivery AI              |
| D07 | Quyền sửa/gỡ tin, giữ lịch sử, thêm thành viên, lịch sử được công bố                     | Chat, invitation, công bố                        |
| D08 | Phạm vi Marketing/Publishing đã quyết định và tích hợp ngoài thực sự được phép           | Marketing, kết nối và phát hành                  |

Hai mâu thuẫn phải giữ:

- v0.2 được mô tả là không bàn giao khi lỗi chưa hoàn thành, nhưng danh mục bàn giao có lỗi tồn tại và hạn sửa.
- Biên bản giao nhận ở điều kiện xuất kho cần tách phần chuẩn bị trước giao và phần ký sau giao.

Không tạo ngoại lệ hoặc bản ký giả; chỉ chặn phần phụ thuộc quyết định thiếu. Quyết định mới cần người quyết định, nguồn, ngày hiệu lực, phạm vi và tiêu chí kiểm thử.

## Q. Mốc nghiệm thu M0–M7

M0–M7 là mốc nghiệm thu sản phẩm, không thay G00–G09, không làm lại các gói đã đạt và không là workflow/domain engine mới. Mọi gói đã code phải đối chiếu bằng chứng phù hợp; P0 bảo mật/sai dữ liệu phải xử lý trước mở dữ liệu thật, không đợi mốc cuối.

### M0 — Nạp cốt lõi và trí nhớ làm việc vào docs

- Phạm vi: charter, nguồn, quyết định, trạng thái, mốc nghiệm thu, protocol, acceptance, handoff; điểm dẫn AGENTS an toàn.
- Kết quả: phiên mới có căn cứ tiếp tục, không mất định hướng, không coi kế hoạch là code hoàn thành.
- Nghiệm thu: docs có thật, đủ nội dung, links đúng, bootstrap duy nhất, không sửa app, trạng thái có mức bằng chứng.
- Liên quan Gxx: lưu và dẫn G00–G09, không thực hiện gói code.
- Phụ thuộc: repository/hướng dẫn hiện có và prompt tự đủ; thiếu raw v0.2 không chặn lưu yêu cầu.
- Trạng thái: phạm vi duy nhất được phép thực hiện ngay; kết quả kiểm tra thực tế ở STATUS/handoff.

### M1 — Xác định baseline và bản đồ tái sử dụng

- Mapping: G00, báo cáo G01/G02 và các gói thực sự có sau đó.
- Phạm vi khi được giao: đọc branch/worktree/HEAD/report, xác định app đang chạy, kiểm tra lỗi liên quan trong môi trường được phép; lập KEEP / ADAPT / ADD / RETIRE_CANDIDATE.
- Kết quả: biết nền thực dùng được, phần còn thiếu cho chat/AI/quyền; không bỏ phí code cũ.
- Nghiệm thu: phát hiện có path/service/API/test; tách code có, đã test, đã tích hợp, đang chạy; có thiết kế/kế hoạch tiếp theo để duyệt.
- Phụ thuộc: phạm vi M1 được giao, quyền môi trường đọc/kiểm tra rõ; báo cáo lịch sử là đầu mối.
- Không tự merge, sửa app hoặc mở rộng audit ngoài phạm vi.
- Trạng thái: PLANNED; mức hoàn tất theo yêu cầu mới UNKNOWN.

### M2 — Không gian dự án, chat và phân quyền

- Mapping: G00/G02/G07 và Project/File/Task thực có.
- Phạm vi: hồ sơ xuyên suốt, nhóm, chủ đề, chat bền vững, file chung, quyền chỉ xem/gửi, room khách/đối tác theo phạm vi phát hành.
- Kết quả: nhân viên/khách thử nghiệm trao đổi đúng vùng; người chỉ xem không gửi; ngoài phạm vi không thấy.
- Nghiệm thu: hai dự án giả lập; người chỉ xem/người gửi/khách; UI/API/socket/file/search/count; retry không trùng; thu hồi quyền hiệu lực.
- Phụ thuộc: baseline/IAM được xác minh; thiết kế và chính sách D01/D03/D05/D07 cho phần liên quan; P0 chia sẻ được xử lý.
- Không chờ toàn ERP mới thử chat khách, nhưng không mời khách thật trước kiểm thử chia sẻ.
- Trạng thái: PLANNED; implementation UNKNOWN, không do M0 triển khai.

### M3 — Bộ nhớ dự án và AI hỏi đáp có nguồn

- Mapping: G01/G02/G04/G07 về quyền, nguồn, liên kết.
- Phạm vi: nguồn bền vững; import có kiểm tra; index/summary dựng lại được; retrieval theo quyền/phiên bản/thời điểm; hỏi trong nhóm và xuyên hồ sơ.
- Kết quả: chat mới tìm đúng quyết định cũ; đổi người/model/vòng đời không mất nguồn.
- Nghiệm thu: nguồn cũ/mới/mâu thuẫn/thiếu; hai project cùng tên sản phẩm; thu hồi quyền; không lộ sang room khách; truy vấn toàn danh mục không bỏ sót vì top-k search.
- Phụ thuộc: ranh giới hồ sơ/room và nguồn của M2, chính sách D06/D07, quyền trước retrieval/tool/delivery; kiểm tra API chính thức khi triển khai.
- Trạng thái: PLANNED; implementation UNKNOWN.

### M4 — Dịch, tài liệu, bảng và ảnh ngay trong dự án

- Mapping: G05/G06 phần đầu ra, G07 quyền công cụ.
- Phạm vi: dịch, sửa/soạn hợp đồng/công văn, bảng/dữ liệu, tạo/chỉnh ảnh, panel chỉnh sửa, lưu version và xuất file.
- Kết quả: đầu ra dùng được, sửa được, mở lại được; không copy/upload lại vào dự án.
- Nghiệm thu: giữ mã/số/đơn vị; không bịa trường hợp đồng; nguồn/gốc nguyên vẹn; ảnh minh họa có nhãn; file không mất khi phiên AI kết thúc.
- Phụ thuộc: nguồn/file/quyền M2–M3, D02/D06 và mẫu/quyền công cụ cho phạm vi cần dùng; không tự phát hành.
- Trạng thái: PLANNED; implementation UNKNOWN.

### M5 — Từ chat tới nghiệp vụ và hạng mục xuyên chuỗi

- Mapping: G03/G04/G05/G06.
- Phạm vi: thẻ cập nhật có nguồn, gọi domain service sau kiểm tra, tiền/quantity đúng, lineage cấp dòng/version; đối chiếu lựa chọn–PI/PO–nhận hàng; nối giao/lắp/nghiệm thu/bảo hành.
- Kết quả: không chỉ chat; biết đặt đúng chưa/còn thiếu gì, tác động truy được nguồn và người làm.
- Nghiệm thu: PI khác mã vật liệu bị phát hiện; thay phương án sau đặt không ghi đè; giao/nhận nhiều đợt đúng; payment/appendix/shipment retry/concurrency không trùng.
- Phụ thuộc: nguồn có quyền, domain thực được giữ lại, chính sách D01–D05 theo hành động; bảo toàn G01/G02 đã kiểm chứng. P0 không được đợi M5 mới sửa.
- Trạng thái: PLANNED; mức khép kín chuỗi UNKNOWN.

### M6 — Tổng quan và hàng đợi điều hành

- Mapping: G07/G08, dữ liệu G03–G06.
- Phạm vi: việc của tôi/phòng/dự án; owner/hạn/phụ thuộc; tiến độ, tiền, hàng, lỗi; dashboard drilldown tới căn cứ.
- Kết quả: quản lý chọn dự án biết tới đâu, vướng đâu, ai xử lý, cần quyết định gì.
- Nghiệm thu: dự án thứ 21/25 vẫn được tổng hợp đúng quyền; tổng khớp nguồn; không suy tiến độ từ chat/file; dữ liệu cũ/thiếu có nhãn; không lộ giá vốn qua số tổng.
- Phụ thuộc: dữ liệu và lineage được xác minh; D01/D02 và công thức tiến độ/SLA còn mở ở sổ OD; không invent KPI.
- Trạng thái: PLANNED; implementation UNKNOWN.

### M7 — Nghiệm thu tích hợp và chuyển giao diện

- Mapping: G09 và hồi quy các gói đã dùng.
- Phạm vi: hành trình nhiều persona/dữ liệu giả lập; hồi quy quyền/AI/file/export/concurrency; backup/restore có đối soát; chất lượng/thời gian/chi phí AI; chuyển UI từng phần cùng nguồn.
- Kết quả: bằng chứng đủ/chưa đủ chạy thử nội bộ hoặc nhóm khách được cho phép.
- Nghiệm thu: không mất nguồn/nghĩa vụ, không lộ dữ liệu; AI lỗi vẫn làm việc không cần AI; khôi phục thực tế; không dual-write hai sổ; unit test xanh chưa đủ end-to-end.
- Phụ thuộc: các lát cắt M2–M6 được duyệt và kiểm tra, môi trường cô lập, chính sách còn phụ thuộc đã chốt, browser acceptance và đường quay lại.
- Không tự deploy production.
- Trạng thái: PLANNED; implementation/acceptance UNKNOWN.

## R. Tài liệu cần tạo/cập nhật ngay

Mặc định docs/galaxy-os/. Nếu có canonical phù hợp thì dùng lại, không dựng bộ thứ hai mâu thuẫn; có thể đặt README/điểm dẫn ở đây và báo path thật.

- 00-READ-FIRST.md: mục tiêu ngắn, canonical, đọc đầu phiên/khi đổi code/cuối phiên, STATUS và handoff mới nhất.
- 01-CORE-CHARTER.md: đầy đủ C–F; mục tiêu, 12 giai đoạn, 12 phân hệ, dữ liệu, dashboard, vòng đời, giới hạn; không rút thành vài dòng.
- 02-SCOPE-AND-DECISIONS.md: yêu cầu có nguồn, thiết kế đề xuất chưa là quyền runtime, D01–D08/mâu thuẫn, phần chưa được phép.
- 03-EXPERIENCE-AND-ACCESS.md: G–M; UI/chat/khách/quyền/AI/memory/hạng mục/tiền; ví dụ allowed/denied và kết quả người dùng.
- 04-DELIVERY-MILESTONES.md: M0–M7 đủ scope/kết quả/nghiệm thu/phụ thuộc/mapping Gxx; chưa xác minh để PLANNED/UNKNOWN.
- 05-IMPLEMENTATION-STATUS.md: hiện trạng đọc được, lịch sử tách quan sát mới, code/test/integration/runtime riêng, source/SHA/path/thời điểm/phần chưa biết; việc hiện tại M0, chưa tự nhận M1–M7.
- 06-SESSION-PROTOCOL.md: đầu/cuối phiên, scope/bằng chứng/tiến độ/handoff; không lặp việc đã đạt bằng chứng phù hợp, không nạp toàn lịch sử cho task nhỏ.
- 07-ACCEPTANCE.md: các ca U, yêu cầu → gói → bằng chứng; chưa test không tick PASS.
- sources/OWNER_BRIEF_2026-09-28.md: lưu nội dung yêu cầu tự đủ này; bản giao việc/hợp nhất, không raw v0.2; nếu raw có thì dẫn/giữ nguyên; không bịa tên/hash/dòng.
- handoffs/<ngày-giờ-thực-tế>-M0.md: đã làm, file đổi, check đã chạy, chưa biết/chưa làm, điểm tiếp tục; không secrets/khách thật.

Dùng thời gian thực cho observed/verified, không ghi lùi giả lịch sử. Không ZIP/upload, không trả prompt khác thay ghi docs.

## S. Điểm dẫn cho phiên Codex sau

Đọc AGENTS/hướng dẫn hiện hữu trước. Nếu không xung đột, thêm đúng một block ngắn vào root AGENTS; chưa có thì tạo nếu được phép; không xóa/thay nội dung cũ. Điều chỉnh path nếu canonical khác:

<!-- BEGIN GALAXY_OS_CORE_BOOTSTRAP -->

Galaxy OS:

- Đầu phiên đọc docs/galaxy-os/00-READ-FIRST.md,
  docs/galaxy-os/05-IMPLEMENTATION-STATUS.md
  và handoff mới nhất được dẫn trong STATUS.
- Đọc charter và spec liên quan trước khi đổi hành vi.
- Giữ một hồ sơ xuyên suốt, 12 giai đoạn,
  quyền theo dự án/mục/room và dữ liệu có nguồn.
- Tái sử dụng domain hiện hữu; không tạo hệ thống song song.
- Chỉ thực hiện phạm vi người dùng đang giao.
- Không coi prompt lịch sử là lệnh đang có hiệu lực.
- Không coi kế hoạch, báo cáo trợ lý hoặc test ở worktree khác
  là bằng chứng ứng dụng đang chạy đã hoàn tất.
- Cuối phiên cập nhật STATUS/handoff bằng kết quả có thật.
<!-- END GALAXY_OS_CORE_BOOTSTRAP -->

Không thêm block lần hai khi rerun; cập nhật có mục tiêu và giữ phần hợp lệ. Guard chặn thì BOOTSTRAP_BLOCKED, hoàn thiện docs và nêu điểm dẫn hợp lệ; không global override. AGENTS không bảo đảm agent nhớ hoàn hảo; chỉ báo đã cấu hình khi file ghi/kiểm thật.

## T. Quy trình các phiên sau

Đầu phiên: đọc READ-FIRST/STATUS/handoff mới nhất; kiểm branch/HEAD/worktree; xác định yêu cầu/scope hiện tại; đọc charter/spec liên quan; không làm lại gói đã đạt trừ hồi quy cần thiết.

Coding về sau: đọc source trước chọn file/hàm; thiết kế/scope duyệt theo repo; bug có tái hiện/regression; sửa nhỏ/test/review/commit theo quyền; không tắt kiểm soát; môi trường cô lập/dữ liệu giả lập; không dữ liệu thật hoặc deploy ngoài quyền.

Cuối phiên: file/hành vi đổi; code SHA, test SHA/tree, lệnh/exit code/môi trường; kết quả người dùng; chưa kiểm/blocker/quyết định thiếu; tách tích hợp/deploy; cập nhật bước tiếp. Không ghi “xong” khi chỉ có code, “test pass” khi chỉ đọc kết quả lịch sử, hoặc “đã lưu bộ nhớ dài hạn” khi mới trả lời chat.

## U. Tình huống nghiệm thu cần lưu

M0 chỉ lập ma trận, KHÔNG giả lập đã chạy.

1.  Chuyển tiềm năng → đã ký → chăm sóc lại → thực hiện: Cùng hồ sơ; không mất chat/file/nghĩa vụ, không tính trùng.

2.  Một khách hai công trình: Chuyển một hồ sơ không đổi hoặc trộn hồ sơ kia.

3.  Chat mới hỏi quyết định cũ: Tìm đúng nguồn/phiên bản, không chỉ summary.

4.  Bản nháp mới mâu thuẫn bản đã duyệt: AI phân biệt, không tự ghi đè.

5.  File lưu nhưng trích xuất lỗi: Hiện trạng thái đúng, không giả đã hiểu.

6.  Người chỉ xem gửi qua API/socket: Bị từ chối.

7.  Người ngoài project thử URL/search/file/count: Không lộ dữ liệu.

8.  Có quyền mục A, không có quyền mục B: Không lấy B qua AI hoặc file liên kết.

9.  Nhiều binding: Không ghép chéo action/scope để vượt quyền.

10. Giám đốc hỏi trong room khách: Không công bố dữ liệu nội bộ vượt phạm vi phòng.

11. Thu hồi quyền lúc AI đang chạy: Kiểm tra lại context/tool/delivery; không phát phần bị cấm.

12. Khách/nhà cung cấp: Chỉ thấy hồ sơ đã phát hành cho mình, không thấy bên khác.

13. Upload/gửi tin lỗi và retry: Không thành công giả, không trùng bản ghi.

14. Nguồn đính kèm ở nhiều chỗ: Không vô tình mở quyền gốc rộng hơn.

15. Soạn hợp đồng thiếu tài khoản/người ký: Đánh dấu thiếu, không bịa hoặc phát hành.

16. Dịch và xử lý bảng: Giữ mã, số, đơn vị, nguồn và công thức liên quan.

17. Chỉnh ảnh: Giữ gốc, lưu bản mới có nhãn; không thay chứng cứ QC.

18. PI sai model/mã da/kích thước: Bảng đối chiếu chỉ rõ sai hoặc thiếu nguồn.

19. Khách đổi sau PO: Giữ căn cứ tại thời điểm phát hành và yêu cầu điều chỉnh mới.

20. Đặt 10, nhận 6, đạt 5, lỗi 1: Chưa về 4; không coi hàng lỗi là sẵn sàng, tối đa 5 đạt trước điều kiện lắp khác.

21. Payment/appendix/shipment đồng thời hoặc retry: Không tác động kép, không nhầm tenant/target/currency.

22. Dashboard: Đúng tập dữ liệu theo quyền, không giới hạn 20 Project (kiểm dự án 21/25), tổng khớp nguồn, nhãn dữ liệu cũ/thiếu.

23. AI ngừng hoạt động: Chat người-người, file và nghiệp vụ không cần AI vẫn dùng.

24. Backup/restore và đổi model: Khôi phục đúng nguồn/liên kết/phiên bản/quyền; dựng lại tìm kiếm, không phụ thuộc duy nhất provider session.

## V. Thực hiện M0 ngay

1. Xác minh repo/Git bằng pwd; git rev-parse --show-toplevel; git status --short --branch; git branch --show-current; git rev-parse HEAD; git worktree list; git diff --stat; git diff --cached --stat. Không in secrets/.env/credential, không truy cập máy/repo khác ngoài quyền.
2. Đọc hướng dẫn áp dụng, canonical, nguồn trong repo; không tìm toàn máy vô hạn.
3. Đối chiếu prompt, giữ phần cũ đúng, thêm thiếu, ghi mâu thuẫn; không hai nguồn chuẩn trái nhau.
4. Ghi tài liệu mục R đủ nội dung, không để trống/“tham khảo chat trước”; phiên mới chỉ đọc file vẫn hiểu.
5. Nhãn nguồn/trạng thái đúng; thiếu report không chặn lưu yêu cầu nhưng chặn kết luận code được kiểm chứng.
6. Bootstrap mục S nếu được phép.
7. Kiểm link/đích, đủ 12 giai đoạn/12 phân hệ/28 nhóm, bốn nhóm đúng, M0–M7 đủ scope/kết quả/nghiệm thu/mapping Gxx, quyết định mở không biến đã duyệt, bootstrap duy nhất/rerun không trùng, giữ nguồn/hướng dẫn an toàn, không đổi source/config/tests/migrations, claim không vượt bằng chứng.
8. Không cần build/integration chỉ ghi tài liệu; chỉ kiểm docs/link/diff/nội dung an toàn bằng công cụ hiện có, không cài mới.
9. Privacy review rồi stage từng file scope; không git add . / git add -A / stage cả docs có thay đổi ngoài lượt.
10. Index có thay đổi khác: không commit cuốn theo, không tự unstage/reset. Không tách an toàn được thì giữ docs và báo blocker.
11. Đủ điều kiện thì commit local với subject: docs: establish Galaxy OS core charter and continuity handbook. Không bypass hook, empty commit rerun hay push.
12. Handoff/trạng thái nhất quán; không chèn hash vào chính commit; DOCS_COMMIT_SHA trả cuối.

## W. Phản hồi cuối

Báo ngắn, cụ thể các trường DOCS_INIT_STATUS, CANONICAL_DOCS_PATH, BOOTSTRAP_STATUS, SOURCES_STATUS, COMMIT_STATUS, DOCS_COMMIT_SHA, PUSH_STATUS: NOT_REQUESTED, FILES_CREATED_OR_UPDATED, VERIFICATION_RUN, UNVERIFIED_IMPLEMENTATION_STATE, OPEN_DECISIONS, HANDOFF_PATH, NEXT_RECOMMENDED_STEP.

Nêu file đã ghi, kiểm gì, chưa làm gì, blocker còn không; bước đề nghị M1 theo hiện trạng. Không trả chỉ kế hoạch, không yêu cầu tạo file/upload, không gửi prompt để người dùng tự M0, không sửa ứng dụng.

Bắt đầu M0 từ repository hiện tại.

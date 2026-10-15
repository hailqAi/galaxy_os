# Cốt lõi Galaxy OS

Nguồn chuẩn yêu cầu: [OWNER_BRIEF_2026-09-28](sources/OWNER_BRIEF_2026-09-28.md), mục C–F; nhãn OWNER_REQUIREMENT. Đây là mục tiêu sản phẩm, không phải chứng nhận code/runtime. Trạng thái thực tế: [STATUS](05-IMPLEMENTATION-STATUS.md).

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

## ADDED Requirements

### Requirement: Tiến trình mua và đồng hồ giữ vé dùng chung

Các bước phòng chờ, chọn vé, thanh toán, kết quả và xác nhận SHALL hiện cùng một tiến trình bốn bước (Chọn ngày → Chọn vé → Thanh toán → Hoàn tất) với bước hiện tại được đánh dấu. Hạn chọn vé và hạn thanh toán SHALL dùng cùng một đồng hồ, hiển thị giờ khi thời gian còn từ một giờ trở lên, cảnh báo khi còn hai phút và chỉ thông báo cảnh báo một lần cho trình đọc màn hình.

#### Scenario: Khách đến bước thanh toán

- **WHEN** khách mở thanh toán cho một đơn đang chờ thanh toán
- **THEN** tiến trình ghi "Bước 3/4" với Thanh toán là bước hiện tại và đồng hồ hiện thời gian còn lại của đơn.

#### Scenario: Còn hai phút

- **WHEN** đồng hồ của bước hiện tại còn hai phút
- **THEN** đồng hồ chuyển sang trạng thái cảnh báo và trình đọc màn hình đọc cảnh báo đúng một lần, không đọc từng giây.

#### Scenario: Hết giờ

- **WHEN** đồng hồ về 0
- **THEN** đồng hồ hiện cùng nhãn hết giờ ở mọi bước, thông báo một lần, và trang vẫn đưa ra hành động tiếp theo hiện hành của bước đó.

#### Scenario: Phòng chờ mở bán sau hơn một giờ

- **WHEN** giờ mở bán còn hơn một giờ
- **THEN** đếm ngược hiển thị dạng giờ:phút:giây.

### Requirement: Giá trọn gói

Giá hiển thị cho khách SHALL là giá trọn gói. Tổng tiền ở chọn vé, thanh toán và xác nhận SHALL kèm câu "Giá đã gồm mọi khoản phí". Nơi chỉ có mức giá thấp nhất SHALL hiển thị "Từ ₫X". Giao diện SHALL không hiện bảng tách phí.

#### Scenario: Khách xem tổng tiền

- **WHEN** khách xem tổng tạm tính hoặc tổng đơn
- **THEN** số tiền được định dạng VND theo ngôn ngữ hiện tại và kèm câu giá đã gồm mọi khoản phí.

### Requirement: Kết quả đơn được xác định thống nhất

Khôi phục checkout, trang kết quả thanh toán và trang xác nhận SHALL xác định trạng thái đơn theo cùng một quy tắc từ đơn và trạng thái thanh toán do máy chủ trả về, và dùng cùng nội dung thông báo. Hành vi đã chấp nhận của từng trang SHALL được giữ nguyên.

#### Scenario: Cùng một đơn ở các trang khác nhau

- **WHEN** cùng một đơn được mở ở khôi phục checkout, kết quả thanh toán và xác nhận
- **THEN** cả ba trang đưa ra cùng kết luận đã thanh toán, đang xác minh, cần đối soát, hết hạn hoặc đã đóng, với cùng tiêu đề và hành động tương ứng.

#### Scenario: Chờ xác nhận thanh toán

- **WHEN** cổng chưa trả kết quả cuối cùng
- **THEN** trang kết quả kiểm tra lại định kỳ trong giới hạn số lần hiện hành rồi cho khách quay lại đơn hoặc mở lịch sử đơn.

### Requirement: Trang sự kiện cũ dùng cùng guard danh mục

`/concerts/:id` SHALL áp dụng cùng quy tắc vai trò với `/events/:eventId`.

#### Scenario: Nhân viên mở trang sự kiện cũ

- **WHEN** tài khoản không được duyệt danh mục mở `/concerts/:id`
- **THEN** trang chuyển tài khoản về trang chủ theo vai trò như với `/events/:eventId`.

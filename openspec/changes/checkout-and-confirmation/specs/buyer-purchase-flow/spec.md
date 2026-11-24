## ADDED Requirements

### Requirement: Thanh toán rõ ràng và thử lại trên cùng đơn

Trang thanh toán SHALL hiện thông tin nhận vé (email tài khoản, số điện thoại), phương thức thanh toán kèm ghi chú chuyển hướng, điều khoản mua vé khi hệ thống đã cấu hình đường dẫn điều khoản, và tóm tắt đơn có áp phích, sự kiện, ngày giờ, địa điểm, các dòng vé, một tổng tiền đã gồm mọi phí và mã đơn. Khi thanh toán thất bại, trang SHALL nêu lý do và cho phép khách thử phương thức khác trên cùng đơn; hủy đơn là hành động phụ và SHALL cần xác nhận trong hộp thoại.

#### Scenario: Điều khoản được cấu hình

- **WHEN** khách bấm thanh toán mà chưa đồng ý điều khoản và hệ thống có đường dẫn điều khoản
- **THEN** trang báo cần đồng ý điều khoản và không tạo lượt thanh toán.

#### Scenario: Thanh toán thất bại còn hạn

- **WHEN** khách quay lại với `payment=failed` và đơn còn hạn thanh toán
- **THEN** trang nêu lý do, nút "Thử phương thức thanh toán khác" mở lại chính đơn đó và cho chọn phương thức mới mà không đưa khách vào lại phòng chờ.

#### Scenario: Khách hủy đơn

- **WHEN** khách chọn hủy đơn đang giữ vé
- **THEN** hộp thoại xác nhận xuất hiện với tiêu điểm trong hộp thoại, và đơn chỉ bị hủy sau khi khách xác nhận.

### Requirement: Xử lý thanh toán và xác nhận đặt vé có thể mở lại

Trang `/payment/result` SHALL hiện màn hình toàn trang "Đang xác nhận thanh toán" với các bước nhận thanh toán, xác nhận đơn và phát hành vé, rồi chuyển tới xác nhận khi đơn đã thanh toán. Khi đơn cần rà soát hoặc chờ quá lâu, trang SHALL hiện mã đơn, liên hệ hỗ trợ và cho biết khách sẽ nhận email. Trang `/orders/:orderId/confirmation` SHALL tải đơn từ máy chủ theo mã đơn, chỉ xác nhận khi đơn đã thanh toán và hiện vé còn hiệu lực của đơn kèm mã QR.

#### Scenario: Khách mở liên kết xác nhận

- **WHEN** khách đã đăng nhập mở `/orders/:orderId/confirmation` của đơn đã thanh toán
- **THEN** trang hiện email nhận vé, các vé đã phát hành với mã QR, chỉ đường, tóm tắt đơn và bước tiếp theo mà không cần trạng thái điều hướng.

#### Scenario: Vé chưa phát hành xong

- **WHEN** đơn đã thanh toán nhưng chưa có vé sau vài lần kiểm tra
- **THEN** trang nói vé đang được phát hành, vé sẽ có trong Vé của tôi và khách sẽ nhận email.

#### Scenario: Đường dẫn xác nhận cũ

- **WHEN** khách mở `/booking-confirmation` kèm mã đơn trong trạng thái điều hướng
- **THEN** trang chuyển sang `/orders/:orderId/confirmation`.

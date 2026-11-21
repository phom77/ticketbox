# Hộp thông báo của khách mua vé

## Purpose

Giúp khách đọc thông tin về vé, đơn và lịch sự kiện, nhận ra tin chưa đọc và tìm được bước tiếp theo khi có.

## ADDED Requirements

### Requirement: Danh sách thông báo trong ứng dụng

Trang Thông báo SHALL hiển thị bản tin trong ứng dụng của khách theo thứ tự mới trước, có bộ lọc Tất cả và Chưa đọc. Mỗi mục SHALL có chủ đề, nội dung, thời điểm và trạng thái đọc bằng chữ hoặc nhãn truy cập phù hợp.

#### Scenario: Một sự kiện tạo cả bản tin trong ứng dụng và email

- **WHEN** máy chủ trả về hai bản tin cho cùng một sự kiện, một bản trong ứng dụng và một bản email
- **THEN** hộp thư hiển thị bản trong ứng dụng một lần và không hiển thị thống kê gửi email.

#### Scenario: Khách đổi ngôn ngữ web

- **WHEN** khách chuyển giữa tiếng Việt và tiếng Anh
- **THEN** nhãn giao diện, tên loại đã biết và cách trình bày thời gian dùng ngôn ngữ đã chọn
- **AND** chủ đề và nội dung đã nhận được giữ nguyên.

### Requirement: Đường dẫn theo loại thông báo

Trang SHALL chỉ cung cấp nút đích phù hợp với loại thông báo và dữ liệu máy chủ cung cấp.

#### Scenario: Thông báo xác nhận thanh toán hoặc nhắc lịch

- **WHEN** khách đọc xác nhận thanh toán hoặc nhắc lịch sự kiện
- **THEN** thông báo cho khách mở trang Vé của tôi bằng liên kết có tên rõ ràng.

#### Scenario: Thông báo hoàn tiền hoặc sự kiện bị hủy

- **WHEN** khách đọc thông báo hoàn tiền hoặc sự kiện bị hủy
- **THEN** thông báo cho khách mở Lịch sử đơn hàng bằng liên kết có tên rõ ràng.

#### Scenario: Thay đổi lịch hoặc loại chưa biết

- **WHEN** khách đọc thông báo dời lịch hoặc một loại chưa có đích được hỗ trợ
- **THEN** trang hiển thị nội dung đã nhận và không suy ra liên kết sự kiện hoặc đơn từ văn bản.

### Requirement: Khôi phục và xem thông báo cũ hơn

Trang SHALL cho khách xem các trang thông báo cũ hơn và thể hiện riêng các trạng thái đang tải, lỗi có thể thử lại, hộp thư trống và bộ lọc chưa có kết quả.

#### Scenario: Trang đã tải chưa có mục khớp

- **WHEN** chưa có mục trong ứng dụng khớp bộ lọc ở các trang đã tải và máy chủ còn trang kế tiếp
- **THEN** khách vẫn có thể tải thông báo cũ hơn và giao diện nêu rõ kết quả hiện tại chỉ là phần đã tải.

#### Scenario: Tải hoặc làm mới thất bại

- **WHEN** lần tải đầu, tải thêm hoặc làm mới thất bại
- **THEN** khách thấy lỗi và thao tác thử lại tương ứng
- **AND** các thông báo đã tải trước đó vẫn sử dụng được nếu phiên còn hợp lệ.

### Requirement: Đánh dấu đã đọc và đồng bộ số chưa đọc

Trang SHALL dùng trạng thái đã đọc do máy chủ xác nhận và đồng bộ số thông báo chưa đọc trong điều hướng với cùng tài khoản đang đăng nhập.

#### Scenario: Máy chủ xác nhận đã đọc

- **WHEN** máy chủ xác nhận mục vừa được đánh dấu đã đọc
- **THEN** mục đổi trạng thái, rời bộ lọc Chưa đọc và số chưa đọc trên điều hướng được đồng bộ
- **AND** focus chuyển tới mục hoặc điều khiển gần nhất nếu nút vừa dùng biến mất.

#### Scenario: Yêu cầu đánh dấu thất bại rồi được thử lại

- **WHEN** thao tác đánh dấu đã đọc thất bại
- **THEN** mục vẫn hiện là chưa đọc, không giảm số chưa đọc và khách có thể thử lại ngay tại mục đó.

#### Scenario: Phiên hết hạn hoặc tài khoản thay đổi

- **WHEN** người dùng mất phiên mua hợp lệ hoặc chuyển tài khoản
- **THEN** nội dung và số chưa đọc của phiên trước không còn hiển thị, kể cả khi phản hồi của phiên trước đến muộn.

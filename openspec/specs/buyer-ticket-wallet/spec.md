# buyer-ticket-wallet Specification

## Purpose
Giúp khách tìm lại vé đã phát hành, phân biệt từng vé trong nhóm và mở mã QR cần xuất trình tại cổng.

## Requirements

### Requirement: Tìm và phân biệt vé theo sự kiện

Trang Vé của tôi SHALL gom vé của khách theo sự kiện, hiển thị số vé, thông tin sự kiện có sẵn, bộ lọc trạng thái và thao tác mở nhóm hoặc mở vé dễ nhận biết.

#### Scenario: Khách có vé cho nhiều sự kiện

- **WHEN** danh sách có các nhóm vé cho sự kiện khác nhau
- **THEN** nhóm có vé hợp lệ và có giờ diễn sắp tới gần nhất được ưu tiên khi hiển thị ngày giờ đáng tin cậy
- **AND** các nhóm còn lại vẫn có thể mở, kể cả khi chưa có giờ diễn.

#### Scenario: Nhiều vé cùng hạng trong một sự kiện

- **WHEN** khách mở nhóm có nhiều vé cùng hạng
- **THEN** từng vé có trạng thái, mã rút gọn để nhận diện và nút riêng có tên truy cập phân biệt được.

#### Scenario: Thông tin sự kiện tải chậm hoặc lỗi

- **WHEN** danh sách vé đã tải và ảnh, lịch hoặc địa điểm từ Catalog chưa có
- **THEN** vé xuất hiện với tên sự kiện trong dữ liệu vé và khách vẫn mở được vé
- **AND** giờ và địa điểm chỉ hiện khi có dữ liệu phù hợp.

### Requirement: Phân biệt danh sách trống và lỗi tải vé

Trang SHALL hiển thị khác nhau khi đang tải lần đầu, tải lỗi, tài khoản chưa có vé hoặc bộ lọc không có kết quả. Khi có thể, thông báo SHALL đi cùng thao tác tiếp theo.

#### Scenario: Chưa mua vé hoặc lọc hết kết quả

- **WHEN** danh sách đã tải thành công nhưng đang trống
- **THEN** khách có đường khám phá sự kiện nếu chưa có vé, hoặc thao tác xóa bộ lọc nếu có vé ngoài bộ lọc.

#### Scenario: Tải vé lỗi rồi thử lại

- **WHEN** yêu cầu tải vé thất bại bởi lỗi có thể thử lại
- **THEN** trang báo lỗi tải, cung cấp nút thử lại và hiện kết quả thật khi tải thành công.

### Requirement: Mở chi tiết và xuất trình QR

Khung chi tiết SHALL đặt tên sự kiện, hạng và trạng thái vé cạnh mã QR dễ thấy của vé hợp lệ. Khung SHALL hỗ trợ thao tác cảm ứng và bàn phím, có nút đóng và trả focus khi đóng.

#### Scenario: Khách mở vé hợp lệ ở cổng

- **WHEN** khách chọn mở QR của một vé hợp lệ
- **THEN** khung hiện QR đúng vé trên nền sáng với khoảng trắng quanh mã và hướng dẫn xuất trình
- **AND** ở viewport 390 × 844 CSS px với kích cỡ chữ mặc định, QR có thể thấy trọn mà không cần cuộn, còn thông tin phụ có thể cuộn.

#### Scenario: Vé không còn hợp lệ

- **WHEN** khách mở vé đã dùng, đã hủy hoặc đã chuyển, hoặc yêu cầu làm mới đang chờ trả về một trong các trạng thái đó cho vé đang mở
- **THEN** khung hiển thị tên trạng thái bằng chữ và không hiển thị QR.

#### Scenario: Khách mở và đóng khung bằng bàn phím

- **WHEN** khách mở vé, nhấn Tab hoặc Shift+Tab rồi nhấn Escape
- **THEN** focus vào khung khi mở, chỉ di chuyển trong khung khi đang mở, và quay về nút mở hoặc vị trí có nghĩa gần nhất khi khung đóng.

### Requirement: Giữ quyền truy cập và tính riêng tư của vé

Trang SHALL chỉ hiển thị vé của phiên mua hợp lệ theo quyền hiện hành. Trong Vé của tôi, QR SHALL xuất hiện khi khách chủ động mở vé hợp lệ và SHALL nằm ngoài URL, bản ghi ứng dụng và dữ liệu phân tích.

#### Scenario: Tìm lại vé sau khi tải lại trang

- **WHEN** khách đã thanh toán thành công quay lại Vé của tôi từ luồng xác nhận hoặc tải lại trang
- **THEN** vé đã phát hành vẫn tìm được và khách có thể mở lại QR từ danh sách.

#### Scenario: Vé không còn trong danh sách được cấp quyền

- **WHEN** khách mất phiên đăng nhập hợp lệ hoặc phản hồi danh sách mới không còn chứa vé đang mở
- **THEN** QR không còn hiển thị và trang áp dụng điều hướng xác thực hiện hành nếu phiên đã hết hạn.

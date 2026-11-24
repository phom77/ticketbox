## ADDED Requirements

### Requirement: Chia vé theo sắp tới và đã qua

Trang Vé của tôi SHALL có tab Sắp tới và Đã qua; bộ lọc trạng thái là điều khiển phụ.

#### Scenario: Khách có vé của sự kiện đã diễn ra

- **WHEN** danh sách vé được tải
- **THEN** sự kiện đã qua nằm ở tab Đã qua và sự kiện sắp tới nằm ở tab Sắp tới

### Requirement: Trang chi tiết vé

Mỗi vé SHALL có trang \`/my-tickets/:ticketId\` với mã QR lớn, chế độ toàn màn hình, vị trí chỗ, hướng dẫn vào cổng, thêm vào lịch và bản sao ngoại tuyến theo tài khoản.

#### Scenario: Mất kết nối khi mở vé

- **WHEN** yêu cầu tải vé thất bại và có bản sao đã lưu của cùng tài khoản
- **THEN** mã QR được hiển thị kèm nhãn bản sao ngoại tuyến

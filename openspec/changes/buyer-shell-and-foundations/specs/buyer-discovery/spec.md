## ADDED Requirements

### Requirement: Gợi ý và tìm kiếm gần đây trong header

Ô Tìm gì SHALL gợi ý sự kiện và địa điểm khớp từ kết quả tìm kiếm khám phá hiện có sau khi khách nhập ít nhất hai ký tự. Khi ô trống, ô SHALL đưa ra tối đa năm lượt tìm gần đây lưu trên thiết bị và cho phép xóa. Danh sách gợi ý SHALL dùng được bằng bàn phím và trình đọc màn hình.

#### Scenario: Khách chọn một gợi ý bằng bàn phím

- **WHEN** khách nhập từ khóa, dùng phím mũi tên để chọn một sự kiện gợi ý và nhấn Enter
- **THEN** trang chi tiết của sự kiện đó mở và lượt tìm được lưu vào danh sách gần đây.

#### Scenario: Khách chọn một địa điểm gợi ý

- **WHEN** khách chọn một địa điểm trong nhóm Địa điểm
- **THEN** địa điểm được điền vào ô Ở đâu để khách tiếp tục tìm.

#### Scenario: Gợi ý không tải được hoặc không có kết quả

- **WHEN** yêu cầu gợi ý thất bại hoặc không có mục khớp
- **THEN** danh sách nói rõ không có gợi ý và khách vẫn gửi tìm kiếm được.

#### Scenario: Khách nhấn Escape trong danh sách gợi ý

- **WHEN** danh sách gợi ý đang mở và khách nhấn Escape
- **THEN** danh sách đóng, focus ở lại ô nhập và khung tìm kiếm trên điện thoại vẫn mở.

### Requirement: Trạng thái tải, trống và lỗi nhất quán

Trang danh sách và chi tiết sự kiện SHALL hiện khung tải giữ chỗ (skeleton) có nhãn trạng thái thay cho dòng chữ đang tải. Trạng thái trống và lỗi SHALL dùng một khối thông báo chung có hành động tiếp theo, và lỗi tải SHALL cho phép thử lại. Hiệu ứng skeleton SHALL dừng khi người dùng bật giảm chuyển động.

#### Scenario: Danh mục đang tải lần đầu

- **WHEN** khách mở trang chủ hoặc `/events` và Catalog chưa trả kết quả
- **THEN** trang hiện các thẻ giữ chỗ cùng thông báo trạng thái cho trình đọc màn hình.

#### Scenario: Chi tiết sự kiện không tải được

- **WHEN** Catalog lỗi khi tải trang sự kiện
- **THEN** trang phân biệt sự kiện không khả dụng với lỗi tạm thời, và lỗi tạm thời có nút thử lại.

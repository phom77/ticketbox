## MODIFIED Requirements

### Requirement: Điều hướng theo ngữ cảnh và vai trò

Header SHALL có bố cục nhất quán giữa các trang duyệt vé, với logo, tìm kiếm ba phần (Ở đâu · Khi nào · Tìm gì), hàng duyệt nhanh tới các chế độ xem danh mục, nút chuyển giao diện sáng/tối, chọn ngôn ngữ, Vé của tôi cho khách mua và menu tài khoản. Ở màn rộng, chọn ngôn ngữ SHALL nằm trực tiếp trên header; ở màn hẹp, nó SHALL nằm trong menu tài khoản. Menu SHALL chứa các mục phù hợp với tài khoản và thông báo chưa đọc của khách mua. Header gọn SHALL áp dụng cho các đường phòng chờ, chọn vé, thanh toán và kết quả, và giữ chọn ngôn ngữ cùng nút giao diện.

#### Scenario: Khách dùng menu trên điện thoại hoặc bàn phím

- **WHEN** khách mở menu, nhấn Escape hoặc chọn một đường dẫn
- **THEN** menu đóng đúng lúc và trả focus về nút mở khi đóng bằng Escape.

#### Scenario: Khách tìm qua header

- **WHEN** khách gửi từ khóa, địa điểm hoặc mốc ngày từ header
- **THEN** `/events` mở với `q`, `date`, `from` và `to` tương ứng và giữ các bộ lọc khác khi tìm ngay trên danh mục.

#### Scenario: Khách dùng hàng duyệt nhanh

- **WHEN** khách chọn một mục trong hàng duyệt nhanh như Đang mở bán hoặc Cuối tuần này
- **THEN** `/events` mở với bộ lọc tương ứng và mục đang xem được đánh dấu `aria-current`.

#### Scenario: Khách đổi ngôn ngữ từ header trên màn rộng

- **WHEN** khách trên màn rộng chọn ngôn ngữ khác ngay trên header
- **THEN** giao diện đổi ngôn ngữ mà không cần mở menu tài khoản và lựa chọn được ghi nhớ như hiện hành.

## ADDED Requirements

### Requirement: Giao diện sáng/tối được ghi nhớ

Trang khách mua và không gian làm việc SHALL dùng chung một lựa chọn giao diện sáng/tối. Lần đầu SHALL theo thiết lập màu của trình duyệt. Lựa chọn rõ ràng SHALL được ghi nhớ trên thiết bị và áp dụng cho cả hộp thoại và thông báo nổi.

#### Scenario: Khách chọn giao diện tối

- **WHEN** khách bấm nút chuyển sang giao diện tối trên header rồi tải lại trang hoặc mở không gian làm việc
- **THEN** trang vẫn dùng giao diện tối, nút có nhãn chuyển sang giao diện sáng, chữ và focus vẫn đạt độ tương phản đọc được.

#### Scenario: Bộ nhớ trình duyệt bị chặn

- **WHEN** trình duyệt không cho ghi bộ nhớ cục bộ
- **THEN** lựa chọn vẫn áp dụng trong phiên hiện tại và trang không báo lỗi.

### Requirement: Trang không tồn tại

URL không khớp đường nào SHALL hiện trang không tồn tại trong bố cục khách mua thay vì tự chuyển về trang chủ.

#### Scenario: Khách mở liên kết hỏng

- **WHEN** khách mở một đường dẫn không tồn tại
- **THEN** trang giữ nguyên URL, hiện tiêu đề không tìm thấy nhận focus, có tìm kiếm trên header và hành động về trang chủ theo vai trò cùng lối sang danh mục khi vai trò được duyệt danh mục.

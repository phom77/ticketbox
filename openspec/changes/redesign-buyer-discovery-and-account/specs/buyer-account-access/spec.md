# Điều hướng và tài khoản khách mua

## Purpose

Giúp khách tìm đúng điểm vào, tiếp tục hành trình sau xác thực và xem đơn hoặc vé thuộc tài khoản đang dùng.

## ADDED Requirements

### Requirement: Điều hướng theo ngữ cảnh và vai trò

Header, menu và footer SHALL cung cấp điểm vào khám phá, xác thực và các mục tài khoản được phép. Khách đã đăng nhập SHALL thấy đường mở Vé của tôi trên màn hẹp. Badge thông báo và header dành cho luồng mua SHALL tiếp tục hoạt động.

#### Scenario: Khách dùng menu trên điện thoại hoặc bàn phím

- **WHEN** khách mở menu, nhấn Escape hoặc chọn một đường dẫn
- **THEN** menu đóng đúng lúc và trả focus về nút mở khi đóng bằng Escape.

#### Scenario: Khách tìm qua header

- **WHEN** khách gửi từ khóa từ header
- **THEN** kết quả khám phá mở với đúng từ khóa và các bộ lọc hiện hành khi tìm ngay trên danh sách.

### Requirement: Xác thực giữ đích quay lại

Đăng nhập, đăng ký và khôi phục SHALL dùng các hành động được hỗ trợ. Luồng đăng ký qua đăng nhập SHALL giữ đích nội bộ do guard cung cấp. Các vai trò vẫn chịu kiểm tra quyền hiện hành.

#### Scenario: Khách tạo tài khoản khi đang mua vé

- **WHEN** khách từ một route được bảo vệ mở đăng nhập, chuyển sang đăng ký và sau đó đăng nhập
- **THEN** khách tiếp tục đúng đích nội bộ gồm query và fragment nếu có.

#### Scenario: Khôi phục và phản hồi lỗi

- **WHEN** khách gửi thông tin không hợp lệ hoặc một yêu cầu khôi phục
- **THEN** form hiển thị phản hồi có thể đọc và giữ các bảo vệ khôi phục đã có, gồm phản hồi gửi email nhất quán và hành động cho liên kết không dùng được.

### Requirement: Hồ sơ và lịch sử đơn tải độc lập

Tài khoản SHALL dùng dữ liệu của người đang đăng nhập, tải hồ sơ và đơn theo từng mục, và có phản hồi riêng cho tải, lỗi và trống. Thông tin có thể chỉnh gồm tên và số điện thoại theo API hiện hành.

#### Scenario: Một mục tải lỗi hoặc khách đổi tài khoản

- **WHEN** một mục không tải được hoặc người dùng đổi phiên
- **THEN** mục khác có thể sử dụng theo quyền của phiên hiện tại và dữ liệu phiên cũ không xuất hiện.

#### Scenario: Lưu hồ sơ lỗi rồi thử lại

- **WHEN** yêu cầu lưu thất bại
- **THEN** giao diện giữ phần đã nhập và báo lỗi. Nếu lưu thành công, hồ sơ và tên trên header phản ánh dữ liệu mới.

### Requirement: Tìm lại đúng đơn và tập trung việc mở vé

Lịch sử đơn SHALL giữ đường `/profile?tab=orders`, trình bày mã, sự kiện, ngày đặt, tổng, trạng thái và lọc nhóm trạng thái. Hành động SHALL dựa trên dữ liệu đơn và đưa khách tới checkout của đơn hoặc luồng kiểm tra hiện có. Vé của tôi SHALL là điểm mở QR dành cho khách mua.

#### Scenario: Đơn có thể tiếp tục hoặc đã thanh toán

- **WHEN** khách chọn xử lý đơn còn khả năng thanh toán hoặc xem vé từ đơn đã thanh toán
- **THEN** khách vào đúng checkout theo mã đơn hoặc vào Vé của tôi theo sự kiện khi xác định được.

#### Scenario: Đơn đóng hoặc trạng thái giao dịch chưa rõ

- **WHEN** đơn đã hết hạn, hoàn tiền, hủy hoặc chưa có xác nhận thanh toán
- **THEN** lịch sử hiển thị dữ liệu đã biết và không trình bày đơn đóng như một lần thanh toán mới đang khả dụng.

#### Scenario: Khách dùng đường cũ tới vé

- **WHEN** khách truy cập `/profile?tab=tickets`
- **THEN** web đưa khách tới Vé của tôi qua kiểm tra quyền hiện hành.

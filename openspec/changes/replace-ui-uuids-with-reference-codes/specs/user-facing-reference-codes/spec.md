# Mã tham chiếu người dùng

## Purpose

Cho khách mua và nhân viên nhận biết đúng đơn, vé và người phụ trách bằng thông tin có thể đọc và đối chiếu.

## ADDED Requirements

### Requirement: Mã đơn và vé nhất quán

Ticketing SHALL cấp mã ngắn duy nhất và ổn định cho mỗi đơn và vé. Web, PDF, thông báo và dữ liệu phục vụ soát vé SHALL dùng mã này khi cần hiện định danh cho người dùng.

#### Scenario: Mở lại đơn hoặc vé sau nâng phiên bản

- **WHEN** khách mở đơn hoặc vé đã tồn tại trước lần phát hành này
- **THEN** dữ liệu đã được cấp mã và các màn hình sử dụng cùng mã. Các đường dẫn đã phát hành và QR vẫn hoạt động.

#### Scenario: Client đọc dữ liệu cũ chưa có mã

- **WHEN** nguồn cũ chưa trả mã tham chiếu
- **THEN** màn hình vẫn dùng được và không hiện UUID dưới dạng nhãn, tooltip hoặc tham chiếu giả.

### Requirement: Tra cứu có phân quyền

Hỗ trợ đơn SHALL nhận mã ngắn theo giá trị chính xác. Máy quét SHALL cho đối chiếu mã vé khi dữ liệu có mã và SHALL kiểm tra QR cho thao tác vào cổng.

#### Scenario: Tra đơn bằng mã từ email

- **WHEN** nhân viên có quyền nhập mã chính xác của đơn thuộc phạm vi mình
- **THEN** danh sách trả đúng đơn. Nếu đơn ngoài phạm vi, kết quả không tiết lộ dữ liệu.

#### Scenario: Dùng mã vé ngắn tại cổng

- **WHEN** nhân viên nhập mã tham chiếu ngắn thay cho nội dung QR
- **THEN** mã có thể dùng để tìm dữ liệu vé khi được hỗ trợ, nhưng không thay thế bước kiểm tra QR để vào cổng.

### Requirement: Giao diện vận hành dùng nhãn nghiệp vụ

Giao diện SHALL trình bày tên, ngày giờ, loại vé hoặc trạng thái thay cho ID nội bộ trong nội dung người dùng. Ban tổ chức SHALL gán nhân viên qua tên hoặc email với quyền phân công hiện có.

#### Scenario: Phân công tại tổ chức mình

- **WHEN** người có quyền phân công mở danh sách ứng viên
- **THEN** họ có thể chọn nhân viên đủ điều kiện trong tổ chức mình và không phải nhập UUID.

#### Scenario: Khôi phục quản lý tổ chức

- **WHEN** quản trị viên khôi phục quyền quản lý cho tổ chức không còn quản lý hoạt động
- **THEN** màn hình nhận email của tài khoản quản lý thay thế và áp dụng các điều kiện khôi phục hiện có.

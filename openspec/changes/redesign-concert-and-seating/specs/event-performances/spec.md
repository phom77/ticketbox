# Event performances

## Purpose

Khách tìm được các suất của cùng một sự kiện. Ban tổ chức vận hành lịch, cửa sổ bán và cấu hình phát hành của từng suất độc lập.

## ADDED Requirements

### Requirement: Các suất của sự kiện

Catalog SHALL cho ban tổ chức chuẩn bị nhiều suất trong một sự kiện. Mỗi suất MUST có giờ, địa điểm và trạng thái bán riêng. Khách chỉ thấy các suất đủ điều kiện hiển thị công khai.

#### Scenario: Hai đêm của một tour

- **WHEN** hai đêm đã xuất bản tại hai địa điểm với giờ và tồn kho khác nhau
- **THEN** trang sự kiện hiển thị dữ liệu riêng của mỗi suất và dẫn người mua vào đúng luồng mua đã chọn.

#### Scenario: Một suất đã đóng hoặc bản nháp

- **WHEN** trong sự kiện có một suất công khai đã đóng bán, một suất đang bán và một bản nháp
- **THEN** khách chỉ thấy các suất công khai, trạng thái đóng chỉ áp dụng cho suất tương ứng và khách không mở được bản nháp.

#### Scenario: Mốc giờ không hợp lệ

- **WHEN** ban tổ chức lưu lịch có giờ kết thúc trước hoặc bằng giờ bắt đầu, giờ mở cửa sau giờ bắt đầu hoặc cửa sổ offer ngoài cửa sổ bán
- **THEN** hệ thống chỉ rõ mốc cần sửa và không đưa cấu hình đó vào mở bán.

### Requirement: Phân quyền chuẩn bị và phát hành

Catalog SHALL xác minh quyền quản lý tổ chức trước khi cho lưu, xem trước hoặc xuất bản suất. Ticketing MUST áp dụng cấu hình của đúng suất và đúng phiên bản trước khi khách có thể mua.

#### Scenario: Thử quản lý suất của tổ chức khác

- **WHEN** người dùng của tổ chức A gửi ID suất hoặc ID mẫu riêng thuộc B
- **THEN** hệ thống từ chối và không trả nội dung nháp hay sửa dữ liệu.

#### Scenario: Xuất bản gặp lỗi hoặc phản hồi trễ

- **WHEN** Catalog lưu phiên bản mới nhưng Ticketing chưa xác nhận hoặc gửi ACK cho phiên bản cũ
- **THEN** ban tổ chức thấy trạng thái chưa đồng bộ và khách chưa thể mua theo cấu hình mới.
- **AND** phát lại cùng phiên bản không sinh thêm suất, ghế hoặc tồn kho.

### Requirement: Phạm vi của phòng chờ và quyền vào cửa

Ticketing SHALL ràng buộc quyền vào luồng mua với suất đã chọn. Check-in SHALL xác minh quyền của nhân viên đối với suất và quyền vào cửa của vé đó.

#### Scenario: Dùng nhầm phiên hoặc vé của đêm khác

- **WHEN** người mua gửi phiên của đêm thứ nhất để giữ ghế đêm thứ hai hoặc nhân viên quét vé đêm thứ nhất ở đêm thứ hai
- **THEN** hệ thống từ chối thao tác mà không giữ ghế hoặc đánh dấu đã vào.

#### Scenario: Soát cùng vé hai lần

- **WHEN** hai thiết bị cùng xác nhận một vé hợp lệ cho cùng suất
- **THEN** chỉ một lượt được xác nhận bởi hệ thống trung tâm. Lượt quét đang chờ xác nhận offline vẫn tuân theo quy trình đồng bộ và ghi xung đột.

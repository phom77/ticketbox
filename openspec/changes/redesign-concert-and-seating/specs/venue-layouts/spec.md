# Venue layouts

## Purpose

Ban tổ chức dựng và tái sử dụng các bố trí địa điểm. Khách hiểu mình mua khu hoặc ghế nào trên sơ đồ đã xuất bản của đúng suất.

## ADDED Requirements

### Requirement: Dựng và tái sử dụng bố trí

Ban tổ chức được cấp quyền SHALL có thể bắt đầu từ sơ đồ trống hoặc từ phiên bản mẫu được cấp quyền. Bản nháp SHALL cho phép tổ chức khu, hàng, ghế, lối đi và sân khấu theo mặt bằng của suất.

#### Scenario: Sân khấu khác trên cùng địa điểm

- **WHEN** ban tổ chức sao cùng một mẫu cho hai suất rồi đổi vị trí sân khấu, thêm khu GA và khóa hàng bị khuất trong một bản nháp
- **THEN** bản xem trước chỉ của suất đã sửa phản ánh bố trí mới và mẫu gốc vẫn phục vụ suất còn lại.

#### Scenario: Sơ đồ bị trùng hoặc thiếu liên kết

- **WHEN** bản nháp có ghế trùng nhãn trong một hàng, ghế nằm ngoài khu hoặc ghế được mở bán thiếu nhóm tồn kho
- **THEN** hệ thống chỉ vị trí vấn đề và không xuất bản sơ đồ đó.

#### Scenario: Hai người lưu cùng bản nháp

- **WHEN** người thứ hai lưu hoặc xuất bản dựa trên bản đã bị người thứ nhất thay đổi
- **THEN** hệ thống báo bản nháp đã đổi, giữ lần ghi hợp lệ và cho tải lại để sửa tiếp.

#### Scenario: Nhập sơ đồ SVG tương thích

- **WHEN** ban tổ chức nhập SVG có dữ liệu khu, hàng và ghế theo định dạng sơ đồ
- **THEN** editor tạo geometry có thể sửa và giữ mã khu, số ghế cùng các cờ ghế trong bản nháp.
- **AND** chỉ dữ liệu sơ đồ được lưu qua kiểm tra layout sẵn có.

#### Scenario: Hai ghế cùng hàng bán hai hạng vé

- **WHEN** ban tổ chức gán một ghế cho Premium và ghế bên cạnh cho Standard trong cùng một khu
- **THEN** mỗi ghế thuộc đúng nhóm tồn kho của hạng đã chọn và hệ thống báo đúng giá khi khách giữ ghế.
- **AND** thao tác gán các ghế còn lại giữ nguyên những ghế đã được gán.

### Requirement: Phiên bản sơ đồ của suất

Mỗi suất có sơ đồ công khai SHALL tham chiếu một phiên bản bố trí cụ thể. Trang mua SHALL dùng phiên bản tương ứng để diễn giải ID khu và ghế. Sửa mẫu hoặc nháp khác MUST giữ nguyên bố trí và nhãn chỗ của suất đã phát hành.

#### Scenario: Mẫu đổi sau khi bán

- **WHEN** một ghế đã được bán và ban tổ chức cập nhật mẫu địa điểm hoặc sơ đồ của đêm khác
- **THEN** ghế trong đơn, vé và trang của suất đã bán giữ đúng khu, hàng và số ghế đã xác nhận.

#### Scenario: Trình duyệt còn bản đồ cũ

- **WHEN** trình duyệt gửi lựa chọn với phiên bản sơ đồ khác phiên bản của suất
- **THEN** hệ thống từ chối giữ chỗ và yêu cầu tải đúng sơ đồ trước khi gửi lại.

### Requirement: Chọn từ sơ đồ và danh sách

Giao diện mua SHALL cho khách chọn khu, hạng và ghế qua sơ đồ khi có hoặc danh sách tương đương. Bố trí kết hợp MUST cho phép mở khu GA để chọn số lượng và mở khu đánh số để chọn ghế.

#### Scenario: Mở chi tiết một khu tại sân lớn

- **WHEN** khách mở tổng quan và chọn khán đài A
- **THEN** giao diện tải chi tiết của A theo yêu cầu và hiển thị hàng, ghế, giá và khả dụng theo dữ liệu cập nhật của khu.

#### Scenario: Sơ đồ lỗi hoặc dùng bàn phím

- **WHEN** tài sản đồ họa không tải hoặc khách dùng bàn phím và trình đọc màn hình
- **THEN** khách vẫn đọc được tên, loại ghế, giá, tình trạng và chọn, bỏ chọn hoặc tiếp tục với cùng vé trên danh sách.

#### Scenario: Đổi suất trong lúc tải

- **WHEN** khách đổi suất khi phản hồi sơ đồ hoặc tồn của suất cũ chưa đến
- **THEN** phản hồi cũ không thay thế bố trí, tồn kho hoặc lựa chọn của suất mới.

### Requirement: Biên tập sơ đồ bằng thao tác trực tiếp

Trình biên tập SHALL cho người dùng vẽ, chọn, di chuyển, đổi kích thước và nhân bản khu trên canvas. Tên và mã khu, nhãn hàng và số ghế ban đầu MUST có giá trị mặc định hợp lệ. Người dùng SHALL có thể tạo nhiều hàng ghế trong một lần, chừa lối đi và hoàn tác thay đổi trước khi lưu phiên bản nháp.

#### Scenario: Dựng khu ghế từ sơ đồ trống

- **WHEN** ban tổ chức vẽ khu ghế hoặc thêm khu bằng nút rồi nhập số hàng, số ghế mỗi hàng và chọn chừa lối đi
- **THEN** trình biên tập tự đặt ghế trong biên khu, đánh số ghế và hiện số lượng thực trước khi lưu.

#### Scenario: Sửa sơ đồ đã có ghế

- **WHEN** ban tổ chức di chuyển hoặc đổi kích thước khu ghế
- **THEN** các ghế di chuyển theo khu và giữ định danh
- **AND** khu không chồng lên khu khác, thao tác có thể hoàn tác và không đổi bản đã phát hành.

#### Scenario: Tái sử dụng và chuyển sang cấu hình vé

- **WHEN** ban tổ chức bắt đầu bằng mẫu địa điểm, bản đồ SVG tương thích hoặc vẽ trên ảnh nền
- **THEN** họ có thể chỉnh sửa trên canvas, lưu sơ đồ và tiếp tục gán vé trên sơ đồ vừa lưu.

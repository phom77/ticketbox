# Performance ticket inventory

## Purpose

Khách mua vé theo số lượng hoặc ghế đánh số trong cùng một suất. Hệ thống giữ đúng chỗ, đúng giá và đúng số lượng khi có nhiều người mua cùng lúc.

## ADDED Requirements

### Requirement: Tồn kho dùng chung giữa các hạng

Một suất SHALL bán được GA, ghế đánh số hoặc kết hợp cả hai. Các hạng cùng bán một khu hoặc một nhóm ghế MUST sử dụng cùng tồn kho. Giới hạn theo tài khoản của suất SHALL đếm vé từ mọi hạng.

#### Scenario: Early Bird và Standard cùng một khu

- **WHEN** khu còn một chỗ và hai khách gửi yêu cầu hợp lệ gần như đồng thời qua hai hạng cùng dùng khu
- **THEN** chỉ một chỗ được giữ và yêu cầu còn lại nhận kết quả hết chỗ.

#### Scenario: Tài khoản đổi hạng để vượt giới hạn

- **WHEN** một tài khoản đã dùng hết giới hạn của suất rồi thử một hạng khác hoặc đổi giữa GA và ghế
- **THEN** hệ thống từ chối phần vượt giới hạn và không đổi tồn kho.

### Requirement: Giữ và giải phóng một lựa chọn

Ticketing SHALL xác nhận giá, hạn và toàn bộ lựa chọn đã giữ từ máy chủ. Mỗi ghế chỉ có một chủ giữ hoặc phân bổ tại một thời điểm. Thao tác gồm nhiều ghế hoặc nhiều kiểu vé MUST áp dụng toàn bộ hoặc giữ nguyên lựa chọn cũ.

#### Scenario: Hai người tranh một ghế

- **WHEN** hai tài khoản gửi yêu cầu hợp lệ cho cùng ghế
- **THEN** đúng một yêu cầu giữ được ghế, còn yêu cầu kia nhận lỗi nêu ghế vừa thay đổi và có thể tiếp tục chọn ghế khác.

#### Scenario: Một ghế trong lựa chọn kết hợp vừa hết

- **WHEN** khách gửi cùng lúc vé GA và nhiều ghế nhưng một ghế đã bị người khác giữ
- **THEN** hệ thống giữ nguyên lựa chọn trước đó của khách và không lấy thêm GA hoặc ghế.

#### Scenario: Gửi lại hoặc đổi dữ liệu của yêu cầu đã xử lý

- **WHEN** khách gửi lại cùng khóa với cùng lựa chọn sau khi mất phản hồi
- **THEN** khách nhận lại kết quả của đúng thao tác cũ mà không tăng số vé giữ.
- **AND** dùng khóa đó với lựa chọn khác bị từ chối.

#### Scenario: Giá đổi hoặc dừng bán

- **WHEN** hạng đổi giá hoặc dừng nhận lượt mua mới trong khi khách còn hold hợp lệ
- **THEN** hold đã xác nhận giữ giá tới khi hết hold hoặc cửa sổ bán của suất kết thúc, tùy mốc đến trước.
- **AND** nếu suất bị đình chỉ hay hủy, hệ thống chặn tạo đơn mới từ hold đó.

### Requirement: Chốt đơn và phát vé đúng một lần

Ticketing SHALL chuyển hold hợp lệ thành một đơn của đúng suất và giữ nguyên giá xác nhận. Vé phát hành MUST chỉ rõ suất và khu, cùng hàng và ghế với vé đánh số. Kết quả thanh toán lặp hoặc đến muộn SHALL tuân theo quy tắc đối soát hiện hành.

#### Scenario: Tạo đơn rồi mất phản hồi

- **WHEN** người mua lặp lại khóa tạo đơn với cùng lựa chọn đã giữ sau khi commit
- **THEN** hệ thống trả đúng đơn cũ với giá và chỗ đã xác nhận.

#### Scenario: Hết hạn cùng lúc người khác chọn

- **WHEN** đơn hết hạn, ghế được cấp cho khách khác và kết quả thành công của đơn hết hạn mới tới
- **THEN** kết quả đi vào đối soát, không phát vé cho đơn hết hạn và không lấy ghế của khách mới.

#### Scenario: Callback trùng sau khi phát vé

- **WHEN** kết quả thanh toán đã xác minh của cùng một đơn được gửi lại
- **THEN** đơn và số vé đã phát hành giữ nguyên.

### Requirement: Tương thích với sự kiện đã mở bán

Hệ thống SHALL tiếp tục cho phép đọc, thanh toán, đối soát và kiểm tra vé thuộc luồng cũ. Một suất MUST chỉ có một đường ghi tồn kho được cấp quyền.

#### Scenario: Bật luồng mới cho một suất chưa mở

- **WHEN** chuyển đổi một suất trước lúc mở và các đường cũ lẫn mới gửi yêu cầu giữ
- **THEN** chỉ đường ghi đã được kích hoạt được xử lý và không có tồn kho bị đổi bởi hai đường.

#### Scenario: Dừng rollout sau khi đã bán ghế

- **WHEN** vận hành đóng nhận lượt mua mới của suất V2 do lỗi triển khai
- **THEN** đơn và vé đã tạo vẫn có thể phục hồi, thanh toán, đối soát hoặc soát vé theo trạng thái hợp lệ.
- **AND** ghế vẫn thuộc đường dữ liệu đã bán.

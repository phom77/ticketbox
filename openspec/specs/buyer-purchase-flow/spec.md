# buyer-purchase-flow Specification

## Purpose
Giúp khách hiểu trạng thái mua, giữ đúng vé, thanh toán đúng đơn và tìm lại vé đã phát hành khi luồng bị gián đoạn.

## Requirements

### Requirement: Thông tin và hành động mua trên trang sự kiện

Trang sự kiện SHALL đưa tên, ngày giờ, địa điểm, giá và trạng thái mở bán vào phần mua vé. Hành động chính SHALL phản ánh trạng thái bán và quyền của người dùng.

#### Scenario: Khách xem sự kiện trước hoặc trong giờ bán

- **WHEN** khách xem sự kiện còn khả năng mở bán hoặc đang bán
- **THEN** trang cho biết mốc mở bán, trạng thái phòng chờ hoặc hành động vào luồng mua tương ứng
- **AND** khách có thể xem giá và tình trạng từng hạng vé khi dữ liệu có sẵn.

#### Scenario: Sự kiện hết vé, đã đóng bán hoặc bị hủy

- **WHEN** dữ liệu sự kiện đang hiển thị xác nhận hết vé, kết thúc bán hoặc bị hủy
- **THEN** trang cho biết lý do bằng chữ và chặn thao tác vào luồng mua.

#### Scenario: Catalog không còn cung cấp trang công khai

- **WHEN** Catalog trả về 404 cho URL sự kiện công khai
- **THEN** trang thông báo sự kiện không khả dụng và dẫn trở về danh sách sự kiện.

#### Scenario: Khách mua cần đăng nhập

- **WHEN** khách chưa đăng nhập chọn hành động mua hợp lệ rồi đăng nhập với tài khoản khách mua
- **THEN** khách tiếp tục luồng mua của đúng sự kiện qua điểm vào đã yêu cầu.

#### Scenario: Ban tổ chức xem trước sự kiện

- **WHEN** người dùng mở bản xem trước được cấp quyền
- **THEN** trang hiện trạng thái xem trước và các hành động mua không được kích hoạt.

### Requirement: Nhận biết trạng thái phòng chờ và hàng chờ

Trang chờ SHALL phân biệt trước giờ bán, đang xếp hàng, đang khôi phục kết nối, được cấp lượt và phiên kết thúc. Thông tin về lượt SHALL căn cứ vào trạng thái do hệ thống trả về.

#### Scenario: Từ phòng chờ sang hàng chờ

- **WHEN** sự kiện đến giờ mở bán và hệ thống chuyển khách vào hàng chờ
- **THEN** đồng hồ mở bán nhường chỗ cho trạng thái xếp hàng cùng vị trí hoặc số người phía trước khi có
- **AND** thời gian chờ được ghi rõ là ước tính khi có dữ liệu.

#### Scenario: Mất kết nối rồi được cấp lượt

- **WHEN** cập nhật thời gian thực bị gián đoạn và kết nối lại hoặc kiểm tra định kỳ nhận lượt hợp lệ
- **THEN** trang thông báo khi đang khôi phục và tự chuyển đúng sự kiện sang chọn vé khi có quyền hợp lệ.

#### Scenario: Hàng chờ hoặc lượt của khách đã kết thúc

- **WHEN** hệ thống báo khách đã rời hàng chờ hoặc phiên đã hết hạn
- **THEN** trang cho biết lượt không còn hiệu lực và hiển thị bước quay lại chi tiết sự kiện hoặc tham gia lại theo trạng thái bán hiện tại.

### Requirement: Chọn và giữ vé theo phân khu

Trang chọn vé SHALL cho khách thao tác bằng danh sách hạng vé và bằng sơ đồ khi có. Trang SHALL hiển thị giá, tồn kho, giới hạn áp dụng, số lượng đã giữ được xác nhận và tổng tạm tính với hành động tiếp tục.

#### Scenario: Sơ đồ và danh sách cùng hiện diện

- **WHEN** khách chọn phân khu hoặc hạng tương ứng trên một trong hai vùng
- **THEN** cả hai vùng phản ánh cùng lựa chọn
- **AND** khách vẫn có thể chọn và chỉnh số lượng từ danh sách khi sơ đồ không có hoặc tải lỗi.

#### Scenario: Tồn kho đổi hoặc giữ vé thất bại

- **WHEN** hạng vé vừa hết, chạm giới hạn hoặc yêu cầu thay đổi số lượng chưa được máy chủ xác nhận
- **THEN** giao diện cho biết hạng bị ảnh hưởng và chỉ tính số lượng đã được xác nhận
- **AND** khách vẫn thấy các hạng đã giữ còn hiệu lực.

#### Scenario: Khách đã giữ vé trên điện thoại

- **WHEN** khách đã giữ ít nhất một vé ở viewport 390 × 844 CSS px với cỡ chữ mặc định
- **THEN** số vé đã giữ, tổng tạm tính và thao tác tiếp tục nằm cùng một cụm trong vùng nhìn mà không che điều khiển danh sách.

#### Scenario: Hết phiên chọn vé hoặc truy cập trực tiếp

- **WHEN** khách hết phiên chọn vé hoặc vào trang chọn mà chưa có lượt hợp lệ
- **THEN** trang giải thích tình trạng và chuyển khách về bước chờ hoặc điểm vào phù hợp theo luồng hiện hành.

### Requirement: Tóm tắt đơn và hạn thanh toán

Checkout SHALL hiển thị sự kiện, số lượng và giá theo từng hạng, tổng của đơn khi đã tạo, hạn thanh toán từ đơn và hành động tương ứng với cổng được cấu hình. Hạn thanh toán SHALL phân biệt với hạn của phiên chọn vé.

#### Scenario: Khách chuẩn bị thanh toán trên điện thoại

- **WHEN** khách có đơn đang chờ thanh toán ở viewport 390 × 844 CSS px với cỡ chữ mặc định
- **THEN** một cụm điều khiển đặt tổng tiền và nút thanh toán cạnh nhau trong vùng nhìn khi nút sẵn sàng
- **AND** hạn thanh toán có một vị trí chính và phần tóm tắt chi tiết vẫn đọc được.

#### Scenario: Cổng chưa sẵn sàng hoặc đơn hết hạn

- **WHEN** cổng chưa tải được, cổng không khả dụng hoặc hạn thanh toán đã qua
- **THEN** checkout chặn khởi tạo thanh toán và giải thích hành động hợp lệ tiếp theo cho từng trạng thái.

### Requirement: Hiển thị kết quả và khôi phục đúng đơn

Checkout và màn kết quả SHALL dùng trạng thái xác minh từ máy chủ để chọn nội dung và hành động. Khôi phục SHALL theo cùng đơn hoặc khóa yêu cầu hiện hành và tuân theo chính sách một lần thử thanh toán mỗi đơn.

#### Scenario: Tải lại khi phản hồi tạo đơn bị mất

- **WHEN** khách tải lại hoặc mất phản hồi sau khi gửi yêu cầu tạo đơn
- **THEN** giao diện tìm lại đơn bằng luồng khôi phục hiện có và không tạo thêm đơn cho cùng lần mua.

#### Scenario: Cổng chuyển khách về trước khi máy chủ xác nhận

- **WHEN** khách quay về từ cổng và máy chủ vẫn đang xác minh giao dịch
- **THEN** màn kết quả hiển thị đang xác nhận và cho khách kiểm tra đơn hiện tại, không khởi tạo lần thử thanh toán mới.

#### Scenario: Đơn hết hạn trong lúc kết quả còn chưa rõ

- **WHEN** hạn thanh toán đã qua trong khi kết quả vẫn chưa được xác minh
- **THEN** màn kết quả phân biệt hạn thanh toán đã qua với tình trạng giao dịch đang được kiểm tra và chỉ đường tới lịch sử đơn.

#### Scenario: Máy chủ báo thanh toán thất bại hoặc đơn đã đóng

- **WHEN** máy chủ báo lần thử thất bại hoặc đơn ở trạng thái đã đóng có kết quả rõ ràng
- **THEN** giao diện hiển thị bước kiểm tra đơn, hủy đơn hoặc chọn vé lại theo hành động hiện được phép
- **AND** khách chỉ vào lượt mua mới khi luồng hiện có đã xử lý đơn cũ.

#### Scenario: Thanh toán được xác nhận

- **WHEN** máy chủ xác nhận đơn đã thanh toán
- **THEN** khách thấy tóm tắt đơn và có thể mở QR của vé đã phát hành trong Vé của tôi, kể cả khi quay lại sau tải lại.

#### Scenario: Khách vào thẳng trang xác nhận

- **WHEN** khách mở trực tiếp trang xác nhận mà thiếu đơn đã được xác minh
- **THEN** trang đưa đường tới lịch sử đơn và chỉ hiển thị xác nhận thành công khi có đơn đã thanh toán được xác minh.

#### Scenario: Tài khoản khác mở lại xác nhận trong lịch sử trình duyệt

- **WHEN** một khách mở lại trang xác nhận của đơn mà tài khoản hiện tại không được cấp quyền xem
- **THEN** trang giữ kín chi tiết đơn và cho khách mở lịch sử đơn của chính mình.

### Requirement: Điều khiển dễ dùng trong suốt luồng mua

Các màn trong luồng SHALL giữ nội dung và bước hiện tại dễ đọc bằng tiếng Việt và tiếng Anh. Nút chính, trạng thái và lỗi SHALL có nhãn rõ ràng, dùng được bằng bàn phím và cảm ứng.

#### Scenario: Khách thao tác ở màn hẹp hoặc zoom lớn

- **WHEN** khách dùng bàn phím, màn rộng 320 CSS px hoặc zoom trình duyệt 200%
- **THEN** nội dung luồng không tràn ngang, focus vẫn thấy được, và phần tóm tắt cố định nếu có không che điều khiển hoặc thông báo.

# Trải nghiệm soát vé của nhân viên

## Purpose

Giúp nhân viên TicketBox soát vé nhanh trên Android, nhận biết quyết định cho khách vào cổng và tra lại các lượt quét của sự kiện đang làm việc.

## ADDED Requirements

### Requirement: Event and gate context

Ứng dụng SHALL hiển thị sự kiện và cổng đang dùng trên màn Quét vé, đồng thời yêu cầu chọn sự kiện và xác nhận cổng trước khi cho quét hoặc gửi mã nhập tay.

#### Scenario: Chưa có thông tin cổng

- **WHEN** nhân viên vào luồng soát vé khi sự kiện chưa có cổng được xác nhận
- **THEN** ứng dụng hướng dẫn đặt cổng và chưa gửi yêu cầu soát vé

#### Scenario: Đổi sự kiện trong khi đang xử lý

- **WHEN** nhân viên đổi sự kiện và một thao tác của sự kiện trước hoàn thành muộn
- **THEN** kết quả và số lượt chờ trên màn hiện tại vẫn thuộc sự kiện đang chọn
- **AND** nhân viên xác nhận cổng cho sự kiện mới trước khi quét, các lượt chờ vẫn thuộc sự kiện đã ghi nhận chúng

### Requirement: Camera and manual entry

Ứng dụng SHALL ưu tiên camera QR, cung cấp lối nhập tay và chỉ xử lý một lượt quét tại một thời điểm. Cả hai cách nhập SHALL dùng cùng quy tắc soát vé và phản hồi.

#### Scenario: Camera đọc lặp lại cùng một mã

- **WHEN** camera liên tục đọc cùng một mã trong khi lượt trước đang xử lý
- **THEN** ứng dụng gửi một yêu cầu soát vé cho lượt đó và hiển thị trạng thái đang xử lý

#### Scenario: Camera không khả dụng

- **WHEN** nhân viên từ chối cấp quyền hoặc camera không khởi động
- **THEN** ứng dụng hiển thị cách khôi phục quyền hoặc thử lại phù hợp, và nhân viên có thể nhập tay khi đủ điều kiện soát vé

#### Scenario: Mở lớp điều hướng hoặc đưa app về nền

- **WHEN** nhân viên mở menu, chuyển màn, mở nhập tay hoặc đưa app về nền
- **THEN** camera dừng gửi lượt đọc
- **AND** camera chỉ nhận mã trở lại sau khi trở về màn Quét vé có quyền camera và đủ điều kiện

### Requirement: Clear admission outcomes

Ứng dụng SHALL phân biệt quyết định của Check-in, lượt chờ xác nhận, lượt bị từ chối và lỗi xử lý bằng nhãn cùng biểu tượng. Trạng thái cho vào cổng MUST dựa trên xác nhận từ Check-in.

#### Scenario: Mạng nội bộ còn hoạt động

- **WHEN** thiết bị mất Internet nhưng vẫn gọi được Check-in qua LAN và nhận kết quả thành công
- **THEN** ứng dụng hiển thị “Cho phép vào cổng” sau khi nhận xác nhận

#### Scenario: Lưu lượt khi Check-in không truy cập được

- **WHEN** Check-in không truy cập được và vé đủ điều kiện theo dữ liệu đã tải
- **THEN** ứng dụng lưu lượt theo cơ chế hiện hành và hiển thị “Chờ xác nhận” cùng hướng dẫn chờ trước khi cho khách vào
- **AND** lượt này xuất hiện trong số lượt đang chờ của sự kiện

#### Scenario: Thiếu dữ liệu để ghi nhận lượt ngoại tuyến

- **WHEN** Check-in không truy cập được và thiết bị chưa có dữ liệu của sự kiện hoặc mã không có trong dữ liệu đã tải
- **THEN** ứng dụng nêu rõ cần tải dữ liệu hoặc thử lại khi kết nối được, và không hiển thị quyết định cho vào cổng

#### Scenario: Vé trùng hoặc bị từ chối

- **WHEN** ứng dụng phát hiện mã trùng trên thiết bị hoặc Check-in trả kết quả từ chối
- **THEN** ứng dụng hiển thị trạng thái tương ứng và lý do ở mức chắc chắn mà dữ liệu hỗ trợ
- **AND** nhãn “Vé đã dùng” chỉ xuất hiện khi dữ liệu xác định vé đã dùng

#### Scenario: Check-in từ chối quyền truy cập

- **WHEN** Check-in trả lỗi xác thực hoặc quyền truy cập cho lượt quét hoặc đồng bộ
- **THEN** ứng dụng hiển thị lỗi truy cập tương ứng và không ghi lượt quét đó vào hàng chờ như khi mất kết nối
- **AND** lỗi khi đồng bộ không làm mất các lượt đang chờ

### Requirement: Scan history and synchronization

Ứng dụng SHALL hiển thị lịch sử của sự kiện đang chọn theo thứ tự mới nhất trước, với tìm kiếm, bộ lọc trạng thái và thông tin về phạm vi dữ liệu đã tải. Lịch sử và khối lượt quét gần đây SHALL dùng cùng cách diễn giải trạng thái.

#### Scenario: Xem và lọc lịch sử

- **WHEN** nhân viên mở lịch sử từ thanh điều hướng hoặc bấm “Xem tất cả” trên màn Quét vé
- **THEN** ứng dụng mở lịch sử của sự kiện hiện tại và cho lọc theo “Tất cả”, “Đã xác nhận”, “Đang chờ” hoặc “Lỗi”
- **AND** nhân viên có thể tìm theo mã vé hoặc mã QR khi dữ liệu hỗ trợ, thấy thời điểm, cổng nếu có và trạng thái của từng lượt

#### Scenario: Lịch sử máy chủ tải chưa xong hoặc không khả dụng

- **WHEN** lịch sử máy chủ đang tải hoặc tải thất bại và thiết bị có dữ liệu cục bộ
- **THEN** ứng dụng giữ phần lịch sử sự kiện đang có, ghi rõ phạm vi dữ liệu và cho thử tải lại
- **AND** ứng dụng phân biệt lịch sử trống với bộ lọc không có kết quả

#### Scenario: Đồng bộ lượt chờ

- **WHEN** nhân viên chọn “Đồng bộ ngay” hoặc cơ chế tự đồng bộ hiện tại được kích hoạt
- **THEN** ứng dụng thể hiện tiến trình và cập nhật lịch sử cùng số lượt chờ theo kết quả thực tế
- **AND** lượt đã xác nhận xuất hiện một lần khi bản ghi thiết bị và máy chủ cùng mô tả lượt đó
- **AND** lượt chưa được xử lý vẫn có thể đồng bộ lại, lỗi và xung đột hiện riêng với lượt đã xác nhận

### Requirement: Accessible scanner navigation

Ứng dụng SHALL cung cấp đường dẫn trực tiếp tới màn Quét vé và Lịch sử, cùng menu trượt cho thao tác vận hành. Các điều khiển SHALL có tên đọc được, vùng chạm tối thiểu 48 dp, nhãn trạng thái độc lập với màu và tính đến vùng an toàn Android.

#### Scenario: Mở và đóng menu bằng TalkBack và nút Back

- **WHEN** nhân viên mở menu từ màn trong sự kiện
- **THEN** tiêu điểm chuyển vào menu và nội dung phía sau tạm ngừng nhận thao tác
- **AND** nút đóng, vùng nền ngoài menu hoặc Android Back đóng menu, với tiêu điểm trở lại nút mở khi ở lại màn cũ

#### Scenario: Dùng các chức năng phụ

- **WHEN** nhân viên cần tải dữ liệu, tra vé, đổi sự kiện hoặc đăng xuất
- **THEN** các thao tác tương ứng có lối vào từ menu, và khách mời xuất hiện khi dữ liệu và quyền hiện hành cho phép

### Requirement: Scanner language preference

Ứng dụng SHALL cho nhân viên chọn Tiếng Việt hoặc English trên màn đăng nhập, màn chọn sự kiện và trong menu. Ứng dụng SHALL lưu lựa chọn trên thiết bị, dùng tiếng Việt khi chưa có lựa chọn và dùng ngôn ngữ đã chọn cho nhãn, phản hồi và định dạng.

#### Scenario: Đổi ngôn ngữ khi đang làm việc

- **WHEN** nhân viên đổi ngôn ngữ trong lúc nhập liệu hoặc sau khi ghi lượt chờ
- **THEN** ứng dụng cập nhật nội dung giao diện và phản hồi hiện tại, đồng thời giữ phiên, dữ liệu nhập và lượt quét
- **AND** các yêu cầu API tiếp theo gửi ngôn ngữ đã chọn, với mã trạng thái và dữ liệu nguồn giữ nguyên

#### Scenario: Mở lại app hoặc đăng xuất

- **WHEN** nhân viên khởi động lại app hoặc đăng xuất sau khi chọn ngôn ngữ
- **THEN** giao diện tiếp tục dùng ngôn ngữ đã lưu trên thiết bị

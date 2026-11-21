# Thiết kế luồng mua vé

## Context

`ConcertDetailPage` phục vụ cả khách mua và bản xem trước được cấp quyền cho ban tổ chức. `WaitingRoomPage` lấy trạng thái hàng chờ qua cập nhật thời gian thực và kiểm tra định kỳ, rồi lưu lượt hợp lệ để mở trang chọn vé. `SeatSelectionPage` dùng `ConcertSeatMap` và danh sách hạng chung dữ liệu. `CheckoutPage` và `PaymentResultPage` đã có đường khôi phục đơn và đối chiếu trạng thái với máy chủ. Hệ chữ và trạng thái của ưu tiên 1 đã có tài liệu sử dụng. [Nền tảng giao diện](../../../frontend/DESIGN_SYSTEM.md) · [Proposal](proposal.md)

## Goals / Non-Goals

**Goals**

- Cho khách thấy đang mua sự kiện nào, bước hiện tại và hành động tiếp theo bằng cả hai ngôn ngữ web.
- Tạo một đường mua có thể tiếp tục sau khi tải lại hoặc mất phản hồi, theo dữ liệu và quy tắc hiện có.

**Non-Goals**

- Chọn ghế đánh số, bổ sung cổng thanh toán, chỉnh nghiệp vụ bán vé hoặc thiết kế lại trang đăng nhập và khu vực vận hành.

## Decisions

### 1. Bố cục mobile-first và phần dùng chung

Duyệt wireframe 390 px cho Chọn vé, Thanh toán và Kết quả trước. Lấy cách đặt thông tin show gần thao tác và cách bố trí khu chọn cạnh tóm tắt đơn trong ảnh tham chiếu làm nguyên tắc. Dùng Manrope, cấp chữ và màu hành động đã áp dụng cho Vé của tôi. Dùng khối nhận diện sự kiện ngắn và chỉ hiển thị tiến trình ở nơi nó giúp định hướng, với bước hiện tại đọc được bằng chữ. Trên desktop, dùng cột tóm tắt bên cạnh nội dung. Trên mobile, chọn bố cục một cột với tổng và nút chính trong cùng một cụm, cho xem chi tiết ngay trong luồng. Nếu cụm được neo, chừa đủ chỗ cuộn đến nội dung cuối và kiểm tra khi zoom.

Giữ bố cục chi tiết sự kiện có ảnh khi dữ liệu có sẵn. Đưa hành động mua và tình trạng bán lên cạnh thông tin show trước nội dung giới thiệu dài. Cách vá riêng từng trang có chi phí thiết kế ban đầu thấp nhưng sẽ tiếp tục tạo khác biệt giữa hai đồng hồ, các nút điều hướng và cách báo lỗi ở điểm chuyển màn.

### 2. Giữ quyền và trạng thái qua các điểm chuyển màn

Dùng `PublicLayout`, các route hiện có và đường quay lại từ `ProtectedRoute` khi đăng nhập. Bản preview dùng cùng thành phần trình bày với trạng thái xem trước và phân quyền hiện có. Trên phòng chờ, dùng trạng thái và số liệu máy chủ, giữ chuyển tự động sang `/concerts/:id/seats` sau khi có lượt hợp lệ. Làm rõ việc kiểm tra lại khi kết nối gián đoạn và chỉ đổi bước khi quyền vào đã được xác nhận. Giữ các yêu cầu kiểm tra định kỳ và kết nối hiện có để khách tiếp tục từ phiên đang dùng.

Catalog công khai trả 404 cho sự kiện không còn hiển thị, bao gồm sự kiện bị hủy hoặc đã kết thúc. Khi có dữ liệu trạng thái, dùng lý do bán tương ứng. Với 404, hiển thị thông báo sự kiện không khả dụng và đường về danh sách.

### 3. Trình bày phần giữ vé ngay cạnh thao tác chọn

Dùng `ConcertSeatMap` và danh sách hạng cùng phản ánh một lựa chọn. Danh sách là lối thao tác đầy đủ khi sơ đồ thiếu hoặc không đọc được. Ở nút tăng/giảm, hiện trạng thái đang cập nhật và lỗi theo hạng liên quan. Giữ số lượng đã xác nhận khi một yêu cầu khác thất bại. Tổng ở bước chọn là **tạm tính theo vé đang giữ**. Hiển thị hạn phiên chọn ở bước này và hạn thanh toán theo đơn ở checkout. Tránh hai đồng hồ cùng hiển thị và tránh thông báo lại mỗi giây cho trình đọc màn hình.

### 4. Gắn nút và thông báo với trạng thái đơn

Giữ logic tạo đơn, khóa chống trùng, khôi phục checkout và một lần thử thanh toán hiện hành. Bố cục mới đọc kết quả qua các API và helper hiện có. Khi có đơn, hiển thị giá theo dòng và tổng từ đơn. Cổng chưa sẵn sàng, đang xác minh, thất bại, hết hạn và đã thanh toán có nội dung và nút theo trạng thái hiện tại. Tín hiệu ở URL trả về từ cổng chỉ kích hoạt việc đối chiếu với máy chủ. Nếu đơn đã hết hạn nhưng giao dịch còn đang kiểm tra, ưu tiên đường về đúng lịch sử đơn. Sau khi máy chủ xác nhận đã thanh toán, dùng tóm tắt có mã đơn và nút **Xem vé của tôi**. Bỏ hình QR minh họa khỏi tóm tắt.

Trang xác nhận dùng ID từ điều hướng để đọc lại đơn theo quyền của phiên hiện tại trước khi hiển thị chi tiết. Cách này xử lý cả trường hợp trình duyệt còn lịch sử của một tài khoản đã đăng xuất. Gộp checkout và kết quả thành route mới sẽ buộc đổi các đường khôi phục đang được dùng qua tải lại, lịch sử đơn và trang trả về của cổng. Dùng cùng mẫu bố cục và văn bản trạng thái trên các route đã có để giữ đường đi có thể khôi phục.

## Risks / Trade-offs

- Mất phản hồi trong lúc chuyển bước có thể khiến khách bấm lần nữa. Tóm tắt và nút phản ánh trạng thái đang chờ của yêu cầu. Kiểm thử tiếp tục cùng đơn và đối chiếu khi kết quả đến muộn.
- Quyền mua và tình trạng tồn kho có thể đổi khi khách đang thao tác. Kiểm tra truy cập thẳng, hết phiên, tồn kho thay đổi, chạm giới hạn và sơ đồ thiếu.
- Khối tóm tắt ở màn hẹp có thể che lỗi hoặc làm mất focus của bàn phím. Kiểm tra bằng Việt/Anh, zoom 200% và tên sự kiện/hạng vé dài.
- CSS dùng chung và catalog bản dịch là điểm giao giữa các nhóm. Một người sở hữu nền tảng và tích hợp, mỗi nhóm giữ CSS và khóa bản dịch theo phần mình.

## Migration Plan

Triển khai qua gói frontend hiện hành. Kiểm tra phục hồi đơn từ phiên và lịch sử cũ, bản xem trước của ban tổ chức, luồng MOCK cục bộ và trả về từ VNPAY theo cấu hình sandbox khi nghiệm thu môi trường đó. Quay lui bằng cách phát hành bản frontend trước theo quy trình hiện có.

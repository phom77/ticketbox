# Thiết kế giao diện Vé của tôi và Thông báo

## Context

[Proposal](proposal.md) giới hạn đợt này ở hai trang cho khách mua. `PublicLayout` đã cung cấp vùng nội dung chính, còn `ModalPortal` gắn khung vé vào `document.body` và khóa cuộn. CSS hiện dùng nhiều khai báo font và cỡ chữ cục bộ. Ticketing trả danh sách vé đã phát hành, trong khi ảnh, ngày giờ và địa điểm đến từ Catalog và có thể tải muộn. Notification trả các trang theo thời gian và có endpoint riêng cho số bản tin trong ứng dụng chưa đọc.

## Goals / Non-Goals

**Goals**

- Khách nhận ra đúng sự kiện, phân biệt vé cùng hạng và mở QR trên điện thoại ngay khi cần xuất trình.
- Hộp Thông báo cho biết tin nào mới, nội dung nói gì và khách có thể đi tiếp đâu. Khi thao tác thất bại, khách có thể thử lại ngay tại ngữ cảnh đó.

**Non-Goals**

- Thay đổi mô hình phát hành vé, quyền truy cập, API, nhận diện toàn bộ web hoặc các chức năng ngoài phạm vi ưu tiên 1.
- Bổ sung chỗ ngồi, giao dịch chuyển/bán lại, cache QR ngoại tuyến hoặc liên kết chi tiết cần trường dữ liệu mới.

## Decisions

### 1. Dùng cùng nền tảng chữ và điều khiển trong phạm vi change

Dùng Manrope đã có cho tiêu đề, nội dung và điều khiển, với chuỗi font dự phòng hỗ trợ tiếng Việt. Mốc thiết kế là tiêu đề trang 28–36 CSS px, tiêu đề nhóm 18–22 px, nội dung 16 px, bộ lọc và thông tin phụ từ 14 px. Dùng khoảng cách nhất quán và vùng chạm tối thiểu 44 CSS px cho điều khiển chính. Dùng nền sáng, màu chữ hiện hành và màu thương hiệu cho hành động chính, trạng thái đang chọn và focus. Trạng thái vé và tin chưa đọc có dấu hiệu đọc được bằng chữ; ưu tiên tối giản nhãn dẫn, vạch trang trí và khối thống kê. Đặt cùng lớp giao diện ở gốc hai trang và khung trong portal. Ghi quy ước vào `frontend/DESIGN_SYSTEM.md`.

Thay token gốc toàn web sẽ kéo các màn mua và vận hành vào cùng đợt kiểm thử. Phạm vi theo lớp cho phép hai trang kiểm chứng hệ chữ và cách dùng màu trước. Dùng các nút lọc có trạng thái nhấn thay cho tab ARIA vì các bộ lọc thay đổi cùng một danh sách. Dùng vùng nội dung chính do `PublicLayout` cấp và cho bộ lọc xuống dòng khi cần.

### 2. Dẫn từ sự kiện tới từng vé rồi tới QR

Thẻ nhóm đặt tên sự kiện, thời gian, địa điểm, số vé và nút **Xem vé** cạnh nhau. Trong nhóm, mỗi hàng có hạng vé, trạng thái và mã vé rút gọn. Nút **Mở mã QR** dành cho vé hợp lệ, nút **Xem chi tiết** dành cho các trạng thái khác. Khách đóng khung rồi chọn vé tiếp ngay tại nhóm đang mở. Bố cục này áp dụng cách ảnh Ticketmaster đặt thông tin sự kiện gần thao tác mở vé, với các trường thực tế từ TicketBox.

Dựng nhóm bằng snapshot của `/api/tickets` ngay khi có kết quả. Tải bổ sung theo ID sự kiện duy nhất và ghép tên bản địa hóa, ảnh, thời điểm và địa điểm vào nhóm nếu có. Dùng bộ định dạng ngày giờ cục bộ của tính năng để hiện giờ diễn và tránh thay cách hiển thị ở các trang khác. Ưu tiên nhóm có vé hợp lệ với giờ diễn tương lai gần nhất. Giữ thứ tự xác định cho nhóm còn lại và dùng tên lưu trên vé khi thiếu Catalog. Mốc thời gian chỉ dùng để xếp thứ tự, còn trạng thái vé lấy từ Ticketing. Khi khách đã chọn nhóm hoặc mở vé, dữ liệu Catalog tới muộn vẫn giữ nguyên lựa chọn và focus. Đợi toàn bộ Catalog trả lời sẽ làm đường xuất trình vé phụ thuộc vào dữ liệu bổ sung như ảnh.

Giữ `ModalPortal` và QR hiện có, với một khung ưu tiên QR trên điện thoại và dialog gọn trên desktop. Focus vào vị trí phù hợp trong khung, giới hạn Tab trong khung, đóng bằng Escape hoặc nút đóng và trả focus về nút mở hoặc nhóm. QR dùng payload thật đã phát hành, nền trắng, mã tối và khoảng trắng quanh mã. Phần thông tin phát hành nằm sau QR. Khi khách làm mới danh sách, giữ danh sách đã tải trong lúc chờ để khách vẫn có thể mở vé. Khi yêu cầu đó hoàn tất, đọc lại trạng thái vé đang mở theo ID. Nếu vé đổi sang trạng thái khác, cập nhật khung và gỡ QR. Nếu vé biến mất khỏi danh sách được cấp quyền hoặc phiên kết thúc, đóng khung. QR thu nhỏ trong từng hàng và thêm route dành riêng cho chi tiết đã được cân nhắc. Nút mở chủ động cho khách biết vé nào đang được trình và duy trì đường khôi phục `/my-tickets` hiện có.

### 3. Hộp thông báo tập trung vào nội dung dành cho người mua

Hiện kênh `APP`. Các luồng phát hành hiện tạo bản `APP` và `EMAIL` cùng nội dung, nên hiển thị cả hai tạo mục trùng và lẫn trạng thái gửi email. Dùng **Tất cả** và **Chưa đọc**, kèm tên loại trên từng mục, vì mục đích chính là đọc và xử lý tin mới. Giữ nguyên chủ đề và nội dung đã lưu dưới dạng văn bản. Định dạng thời điểm và dịch nhãn giao diện, loại đã biết (xác nhận vé, nhắc lịch, hoàn tiền, hủy hoặc dời lịch) và loại mặc định.

Dùng phân trang hiện có để tải thêm tin cũ. Lọc theo kênh sau khi nhận từng trang, hợp nhất theo ID và giữ khả năng tải tiếp nếu trang chỉ có email. Làm mới từ trang đầu có thể đặt lại cửa sổ phân trang sau khi tải thành công. Khi lỗi, giữ các mục đã tải cho phiên hợp lệ. Bộ đếm dùng `/api/notifications/unread-count`, còn cập nhật mục dùng phản hồi đánh dấu đã đọc. Truyền thao tác yêu cầu cập nhật badge qua ngữ cảnh của layout hiện có. Khi tải badge thất bại, giữ giá trị đã xác nhận cho cùng tài khoản và cho phép đồng bộ lại ở lần làm mới kế tiếp. Hủy hoặc bỏ qua kết quả cũ khi tài khoản đổi. Cách này dùng lại API và tránh đưa trạng thái hộp thư vào kho toàn cục.

Nút **Vé của tôi** cho xác nhận thanh toán và nhắc lịch. Nút **Lịch sử đơn hàng** cho hoàn tiền và hủy sự kiện. Dời lịch hiện nội dung đã nhận, bao gồm ngày mới nếu có, và dùng bố cục tin không cần nút. DTO hiện thiếu ID đơn/sự kiện, vì vậy hai đường dẫn là các trang tổng hợp đã có trong web. Các đích phù hợp với nội dung mẫu của Notification. [Nội dung thông báo](../../../services/notification/src/main/resources/messages.properties)

## Risks / Trade-offs

- Dữ liệu sự kiện đến muộn có thể đổi ưu tiên hiển thị. Giữ hàng đang chọn, nhóm đã mở và focus khi danh sách được bổ sung.
- Phân trang phía máy chủ xen các bản email. Đếm chưa đọc từ endpoint, phân biệt hết danh sách với chưa tìm thấy trong phần đã tải, và bỏ mục trùng khi tải thêm.
- Nội dung tiếng Việt và tên sự kiện dài có thể đẩy thao tác khỏi vùng nhìn. Kiểm tra cỡ chữ mặc định ở 390 px, reflow ở 320 px và zoom 200%, cùng tương phản, bàn phím và focus rõ trên các phần đã đổi.
- CSS toàn cục và catalog bản dịch là điểm giao giữa các nhóm. Giao mỗi nhóm CSS theo trang, một người phụ trách thay đổi dùng chung và người tích hợp đối chiếu các khóa bản dịch theo tiền tố.
- Ảnh kiểm thử có thể chụp QR đang hiển thị. Dùng vé fixture cho ảnh và quét thử, giữ payload thật khỏi log và dữ liệu phân tích.

## Migration Plan

Triển khai bằng gói web hiện hành với hai URL đã có và xác minh luồng quay lại từ xác nhận đặt vé. Có thể quay về bản web trước qua quy trình phát hành hiện tại. Dữ liệu hiện hành dùng trực tiếp theo hợp đồng API đang chạy.

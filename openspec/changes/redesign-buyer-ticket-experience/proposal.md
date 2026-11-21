# Thiết kế lại Vé của tôi và Thông báo trên web TicketBox

## Why

Khách cần tìm nhanh đúng vé khi tới cổng và hiểu ngay một thông báo có cần xử lý hay không. Hai màn hiện dành nhiều chỗ cho tiêu đề và số liệu tổng hợp, trong khi thông tin vé, bộ lọc và thao tác quan trọng khó đọc hoặc khó tìm.

## What Changes

- Dùng cùng hệ chữ, khoảng cách, nút, bộ lọc và trạng thái cho Vé của tôi, khung chi tiết vé và Thông báo. Bỏ dòng dẫn và vạch màu trang trí ở đầu các màn này.
- Gom vé theo sự kiện, đưa thông tin nhận diện và nút mở vé lên trước. Dành vị trí nổi bật cho QR của vé hợp lệ trong khung chi tiết, với thao tác rõ ràng khi khách có nhiều vé.
- Đưa thông báo đến người mua lên đầu trang. Hiển thị loại thông báo, thời điểm, nội dung và trạng thái đọc. Đồng bộ số chưa đọc với điều hướng và hỗ trợ thử lại khi thao tác thất bại.
- Lấy cách đặt thông tin sự kiện cạnh thao tác và phân cấp thẻ vé trong ảnh Ticketmaster làm tham chiếu. Dùng dữ liệu, ngôn ngữ và nhận diện của TicketBox.

## Capabilities

### New Capabilities

- `buyer-ticket-wallet` mô tả cách khách tìm, phân biệt và xuất trình vé của mình trên web.
- `buyer-notification-inbox` mô tả hộp thông báo trong ứng dụng, trạng thái đã đọc và cách đi tới khu vực liên quan.

### Modified Capabilities

Không có.

## Impact

- Phạm vi ưu tiên 1 gồm `/my-tickets`, chi tiết/QR mở từ trang này, `/notifications` và số chưa đọc trong `PublicLayout`. Áp dụng nền tảng giao diện mới tại các màn này. Các đợt thiết kế lại trang khám phá, luồng mua, hồ sơ và công cụ vận hành được lên kế hoạch riêng.
- Dùng route, dữ liệu và quyền sở hữu đã có của Ticketing, Catalog và Notification. Các trường chỗ ngồi, liên kết chính xác tới một đơn hoặc sự kiện từ thông báo, chuyển vé, bán lại và lưu QR ngoại tuyến cần dữ liệu hoặc hành vi ngoài phạm vi change.
- Tiếp nối luồng khôi phục vé sau thanh toán và sử dụng lựa chọn Việt/Anh hiện hành. [Khôi phục cho khách mua](../buyer-recovery-and-support/specs/buyer-recovery/spec.md) · [Ngôn ngữ web](../web-language-and-concert-translations/specs/web-language-preference/spec.md)

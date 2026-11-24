# Thiết kế lại luồng mua vé trên web TicketBox

## Why

Khách cần biết khi nào mua được vé, đang giữ bao nhiêu vé, phải trả bao nhiêu và làm gì khi gián đoạn. Hiện các thông tin này nằm rải giữa nhiều khối, hạn thanh toán xuất hiện hai lần trong checkout và trang xác nhận có hình QR minh họa dễ nhầm với mã vào cổng.

## What Changes

- Đưa thông tin sự kiện, tình trạng mở bán, giá và hành động mua vào cùng vùng nhìn. Phân biệt phòng chờ trước giờ bán với hàng chờ đang hoạt động và hướng dẫn khi kết nối gián đoạn.
- Bố trí sơ đồ phân khu, danh sách hạng vé, số lượng đã giữ và tổng tạm tính theo cùng một lựa chọn. Cho phép hoàn tất thao tác chọn bằng danh sách trên điện thoại và bằng bàn phím.
- Tóm tắt đơn, hạn thanh toán và cổng được cấu hình bằng bố cục dùng chung trên mobile và desktop. Hiển thị hành động tiếp theo theo trạng thái đơn và kết quả đã xác minh.
- Dẫn khách từ xác nhận thành công đến Vé của tôi để mở mã QR đã phát hành. Dùng nền tảng typography, focus và trạng thái của ưu tiên 1 cho các màn trong phạm vi này.

## Capabilities

### New Capabilities

- `buyer-purchase-flow` mô tả trải nghiệm web từ xem sự kiện, chờ lượt, chọn và giữ vé đến thanh toán, khôi phục và mở vé đã phát hành.

### Modified Capabilities

Không có.

## Impact

- Phạm vi frontend gồm chi tiết sự kiện, phòng chờ/hàng chờ, chọn phân khu, checkout và kết quả/xác nhận. Điểm nối gồm đăng nhập, lịch sử đơn, Vé của tôi và bản xem trước của ban tổ chức. Đặc tả này tận dụng các điểm nối hiện hành.
- Catalog cung cấp thông tin sự kiện. Ticketing quyết định quyền vào phiên, tồn kho, giữ vé, đơn và phát hành vé. Payment xác minh giao dịch. Change triển khai bằng gói web hiện có và dùng các hợp đồng hiện hành của các dịch vụ đó.
- Tiếp nối [Vé của tôi](../redesign-buyer-ticket-experience/specs/buyer-ticket-wallet/spec.md), [khôi phục đơn của khách mua](../buyer-recovery-and-support/specs/buyer-recovery/spec.md), [thanh toán VNPAY và kết quả đã xác minh](../vnpay-merchant-and-sales-reconciliation/specs/vnpay-merchant-reconciliation/spec.md) và [ngôn ngữ web](../web-language-and-concert-translations/specs/web-language-preference/spec.md).

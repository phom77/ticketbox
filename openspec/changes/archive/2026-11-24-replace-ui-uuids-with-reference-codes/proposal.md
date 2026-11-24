# Mã đơn và vé dành cho người dùng

## Why

Người mua thấy những mã dài và không nhất quán giữa lịch sử đơn, thanh toán, ví vé, thông báo và PDF. Tám ký tự đầu của UUID hiện không dùng được để tra cứu. Ban tổ chức còn phải tự nhập UUID để phân công nhân viên soát vé.

## What Changes

- Cấp một mã tra cứu riêng cho mỗi đơn và vé, gồm dữ liệu đã phát hành. Dùng cùng mã ở web, hỗ trợ, thông báo, PDF và thiết bị quét.
- Cho bộ phận hỗ trợ tra đúng đơn bằng mã ngắn trong phạm vi quyền hiện có. Thay các UUID khác bằng tên, thời gian và trạng thái có ích cho công việc.
- Cho người có quyền phân công tìm nhân viên đủ điều kiện theo tên hoặc email trong tổ chức của mình.

## Capabilities

### New Capabilities

- `user-facing-reference-codes`: cấp và trình bày mã đơn, mã vé và cách tìm đúng bản ghi.

## Impact

Ticketing sở hữu mã và cấp cho dữ liệu cũ. Web, Notification và Check-in nhận các trường bổ sung. Luồng mua, đường dẫn đã phát hành, quyền, dữ liệu đồng bộ và QR tiếp tục dùng các định danh hiện hành. Tiếp nối [hỗ trợ đơn](../order-support-and-event-refunds/specs/order-support/spec.md), [ví vé](../redesign-buyer-ticket-experience/specs/buyer-ticket-wallet/spec.md) và [mô hình dịch vụ](../../../docs/adr/0001-service-domain-models.md).

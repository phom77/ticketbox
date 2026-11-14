# Thiết kế lại ứng dụng soát vé TicketBox

## Why

Nhân viên cần nhìn thấy sự kiện, cổng và quyết định soát vé ngay khi thao tác trong hàng chờ. Màn hiện tại phân tán thông tin qua nhiều khu vực và tô xanh cả lượt đã xác nhận lẫn lượt lưu trên thiết bị đang chờ xác nhận.

## What Changes

- Dùng ba mẫu HTML làm tham chiếu cho ba bề mặt trong cùng một ứng dụng Android. Màn Quét vé ưu tiên camera, Lịch sử quét dùng để tra soát, menu trượt bên trái dành cho thao tác vận hành.
- Dùng nền trắng, đường viền nhẹ, bo góc nhất quán và phản hồi bằng chữ, biểu tượng và màu. Giữ đường vào nhập tay, tra vé, khách mời, tải dữ liệu và đồng bộ ở các vị trí dễ tìm.
- Hiển thị riêng kết quả được Check-in xác nhận, lượt đang chờ, vé bị từ chối và lỗi thao tác. Hiển thị lý do cụ thể như vé đã dùng khi dữ liệu hiện có xác định được lý do.

## Capabilities

### New Capabilities

- `staff-scanner-experience` mô tả luồng quét vé, điều hướng vận hành, lịch sử và phản hồi trạng thái trên ứng dụng soát vé của nhân viên.

### Modified Capabilities

## Impact

- Phạm vi triển khai nằm trong [ứng dụng Expo React Native hiện tại](../../../mobile-scanner/README.md). Giao diện hỗ trợ Tiếng Việt và English, cho phép nhân viên chọn và lưu ngôn ngữ trên thiết bị. Các mã trạng thái giao tiếp giữ nguyên.
- Việc phân công theo sự kiện hoặc ca, cấp lại quyền trên API và triển khai tại cổng thuộc đợt scanner trong [roadmap A1 và A5](../../../docs/superpowers/plans/2026-11-11-ticketbox-production-roadmap.md). [Quy tắc chặn API staff toàn cục](../organizer-identity-and-access/specs/scoped-admission-access/spec.md) tiếp tục áp dụng. Dùng dữ liệu mô phỏng trong môi trường phát triển để nghiệm thu luồng UI khi các tuyến staff đang bị chặn.

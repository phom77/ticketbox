# Proposal

## Why

TicketBox hiện gắn lịch diễn, cấu hình bán vé và sơ đồ SVG vào một Concert. Cơ chế giữ vé đếm theo hạng nên dùng được cho vé vào cửa, nhưng chưa diễn tả một ghế cụ thể, nhiều suất hay sơ đồ thay đổi theo cách bố trí sân khấu.

## What Changes

- Tách sự kiện được giới thiệu cho khách khỏi từng suất có giờ, địa điểm, cấu hình mở bán và quyền vào cửa riêng.
- Cho ban tổ chức dùng mẫu địa điểm hoặc bắt đầu từ sơ đồ trống, tùy chỉnh theo suất, xem trước và xuất bản một phiên bản xác định.
- Bán vé vào cửa tự do (GA), vé theo khu không đánh số và vé ghế đánh số. Một suất và một đơn có thể kết hợp các hình thức này.
- Tách hạng, giá và điều kiện bán khỏi tồn kho. Nhiều hạng giá có thể dùng cùng một khu hoặc nhóm ghế mà vẫn giới hạn đúng số chỗ.
- Cho khách chọn vé qua sơ đồ hoặc danh sách tương đương, nhận xác nhận giữ chỗ từ máy chủ và tìm lại đúng suất, khu, hàng và ghế trên vé.
- Giữ đường phục vụ sự kiện cũ song song, bật mô hình mới theo từng suất và nghiệm thu tải, thanh toán, soát vé trước khi mở bán thật.
- Lộ trình sau đợt đầu gồm vé nhiều suất hoặc nhiều ngày, vé 0 đồng, bàn/box, quyền vào nhiều khu, gói đoàn và quản lý nhiều cổng. Mỗi tính năng cần yêu cầu và nghiệm thu riêng.

## Capabilities

### New Capabilities

- `event-performances` — lịch nhiều suất, phân quyền chuẩn bị và phát hành suất với cấu hình riêng.
- `venue-layouts` — mẫu địa điểm, công cụ dựng sơ đồ, phiên bản và điều hướng sơ đồ cho người mua.
- `performance-ticket-inventory` — bán theo số lượng hoặc ghế trong một suất, quản lý giữ chỗ, phát hành vé và đối chiếu khi chuyển đổi.

### Modified Capabilities

## Impact

- Catalog sở hữu nội dung, suất, mẫu sơ đồ và cấu hình bán. Ticketing sở hữu hàng chờ, tồn kho và đơn. Check-in sở hữu quyết định cho vào cửa. Payment tiếp tục nhận số tiền và định danh đơn như hiện tại.
- Luồng mua web, workspace ban tổ chức, hợp đồng snapshot, vé và báo cáo sẽ cần đọc đúng suất. Bản đề xuất áp dụng cách thêm dần, giữ ID công khai, hợp đồng v1 và lịch sử cho sự kiện cũ. Đường soát vé mới phụ thuộc phân quyền nhân viên theo phạm vi.
- Các thay đổi liên quan gồm [xuất bản sự kiện](../organizer-event-publishing/specs/organizer-event-publishing/spec.md), [luồng mua vé](../buyer-recovery-and-support/), [phòng chờ thích ứng](../adaptive-concert-admission/specs/concert-admission/spec.md), [quy trình hoãn/hủy và hoàn](../order-support-and-event-refunds/), [thiết kế scanner](../redesign-staff-scanner-mobile/) và [ADR quyền sở hữu tổ chức](../../../docs/adr/0002-organization-ownership.md).

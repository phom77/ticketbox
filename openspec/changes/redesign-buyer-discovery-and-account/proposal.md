# Thiết kế lại khám phá và tài khoản người mua

## Why

Khách cần tìm sự kiện phù hợp, quay lại đúng kết quả sau khi xem chi tiết và tìm đúng đơn hoặc vé sau khi mua. Trang chủ hiện chỉ đọc một trang dữ liệu, mục sắp mở bán dựa vào trạng thái nháp, còn hồ sơ tải chung dữ liệu cá nhân, đơn và vé dù khách chỉ mở một mục.

## What Changes

- Thiết kế lại trang chủ, danh sách, thẻ sự kiện và bộ lọc từ khóa, ngày diễn, tình trạng bán với dữ liệu Catalog hiện có. Cho tải thêm và trình bày rõ phạm vi kết quả đã tải.
- Tạo bản preview tương tác bằng fixture cho tỉnh/thành, thể loại và giá, để duyệt trước khi Catalog cung cấp dữ liệu tương ứng.
- Làm rõ điều hướng, tìm kiếm, truy cập Vé của tôi, Thông báo và Lịch sử đơn hàng. Đơn giản hóa đăng nhập, đăng ký, khôi phục mật khẩu và giữ đích quay lại.
- Tách tải hồ sơ và lịch sử đơn, dùng trạng thái đơn từ API, đưa khách sang checkout của đúng đơn hoặc Vé của tôi.
- Tách trang chủ khám phá khỏi danh mục `/events`. Dùng một ô tìm kiếm trên header nhất quán và gom thông báo, ngôn ngữ vào menu tài khoản.
- Áp dụng từ khóa, ngày và trạng thái bán trước khi phân trang Catalog. Dự kiến thêm lối vào Âm nhạc và Thể thao khi có sự kiện công khai thuộc các nhóm này và bộ lọc thể loại dùng dữ liệu thật.

## Capabilities

### New Capabilities

- `buyer-discovery` mô tả trang khám phá, tìm kiếm, lọc, phân trang và preview tính năng Catalog tương lai.
- `buyer-account-access` mô tả điều hướng khách mua, xác thực, hồ sơ và tìm lại đơn, vé.

### Modified Capabilities

Không có.

## Impact

Phạm vi nằm ở web công khai, khách mua và truy vấn đọc công khai của Catalog. Tiếp nối [luồng mua](../redesign-buyer-purchase-flow/specs/buyer-purchase-flow/spec.md), [Vé của tôi](../redesign-buyer-ticket-experience/specs/buyer-ticket-wallet/spec.md), [khôi phục tài khoản và đơn](../buyer-recovery-and-support/specs/buyer-recovery/spec.md) và [ngôn ngữ web](../web-language-and-concert-translations/specs/web-language-preference/spec.md).

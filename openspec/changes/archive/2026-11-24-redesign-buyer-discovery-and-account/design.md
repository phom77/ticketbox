# Thiết kế khám phá và tài khoản

## Context

Catalog công khai phân trang bằng `page` và `size`. Dữ liệu tóm tắt có tên và bản dịch, địa điểm, ngày diễn, giờ mở và đóng bán. Identity và Ticketing đã có đường xác thực, chỉnh hồ sơ và đọc đơn. Hai đợt trước đã ổn định luồng mua, Ví vé và số thông báo chưa đọc. [Nền tảng giao diện](../../../frontend/DESIGN_SYSTEM.md)

## Goals / Non-Goals

**Goals**

- Cho khách tìm sự kiện, quay lại kết quả và dễ đến đúng đơn hoặc vé bằng Việt/Anh.
- Dùng dữ liệu hiện có cho hành vi công khai và fixture phát triển cho trường Catalog tương lai.

**Non-Goals**

- Đổi nghiệp vụ Identity/Ticketing, tích hợp Google, đổi quy trình thanh toán hoặc thiết kế lại workspace.

## Decisions

1. Dùng `/` để giới thiệu sự kiện công khai nổi bật và một nhóm sự kiện sắp tới, có nút xem tất cả. `/events` là danh mục chuẩn và nhận từ khóa, ngày, trạng thái bán và sắp xếp trong query. Chuyển đường dẫn tìm/lọc cũ trên `/` tới `/events` cùng lựa chọn, đọc cả mã trạng thái cũ. Tìm trong header giữ bộ lọc hiện hành khi đang ở `/events`. Back từ chi tiết khôi phục các trang đã tải, vị trí cuộn và focus.
2. Thêm `GET /api/v2/events/discovery` tại Catalog. Đây là truy vấn đọc từ view sự kiện và suất công khai hiện có, gồm cả legacy, với `q`, `date`, `from`, `to`, `status`, `sort`, `page` và `size`. Ngày theo `Asia/Ho_Chi_Minh`. Tìm tên sự kiện, tiêu đề bản dịch và địa điểm không phân biệt dấu; điều kiện phải khớp trên cùng suất. Chọn một suất đại diện theo thứ tự đã chọn và ID, sau đó đếm số sự kiện và phân trang. Phản hồi gồm dữ liệu thẻ và ID đường dẫn chi tiết hiện có. Trang kế lỗi giữ kết quả và có thể thử lại.
3. Dùng một bề mặt lọc với bản preview phát triển tại `/discover-preview`, chỉ đăng ký route khi chạy Vite dev. Fixture chứa tỉnh/thành, thể loại và giá. Khi API có dữ liệu, các trường này sẽ chuyển sang Catalog công khai và điều kiện lọc được áp dụng trước phân trang. Dữ liệu và bộ lọc preview không đi vào danh sách thật.
4. Header dùng cùng khung trên trang chủ, danh mục, chi tiết và tài khoản. Logo về trang chủ; tìm kiếm, Vé của tôi và Tài khoản là điểm vào chính. Menu chứa hồ sơ, lịch sử đơn, thông báo và ngôn ngữ theo vai trò. Khách có đăng nhập, đăng ký và ngôn ngữ trong cùng menu. Số chưa đọc có trên nút mở và mục thông báo. Menu trả focus khi Escape; giữ header gọn cho cả hai đường mua. Các guard, đích quay lại và luồng xác thực hiện hành vẫn áp dụng.
5. Giữ `/profile?tab=orders` để checkout và thông báo tiếp tục về đúng mục. Tải hồ sơ và đơn theo mục đang mở, dùng kiểu `Order` chung và nhóm lọc theo trạng thái. Kiểm tra hạn đơn trước khi mời tiếp tục. Checkout và kết quả hiện có xác minh giao dịch. Vé đã phát hành mở tại `/my-tickets`; link theo sự kiện định hướng khách đến nhóm vé khi có, với danh sách chung khi nhóm không tồn tại. Dữ liệu khách mua được làm mới khi tài khoản đổi.

## Risks / Trade-offs

- Đường dẫn cũ có thể dùng trạng thái bằng tiếng Việt hoặc mã `DRAFT` cho bộ lọc sắp mở bán. Quy đổi chúng sang bộ lọc mới và chỉ hiển thị sự kiện công khai. Khi Back từ một thẻ, khôi phục cả các trang đã tải rồi trả về vị trí cuộn. Giữ đường dẫn mục vé cũ trong hồ sơ.
- Mục Thể thao mở danh mục lọc bằng `/events?category=sports` khi thể loại đã được chuẩn hóa trên các sự kiện công khai. Bản hiện tại dùng một hàng header. Bộ lọc thể loại, địa phương, giá và liên kết chính xác từ thông báo đến vé/đơn cần dữ liệu Catalog hoặc mã tham chiếu thông báo tương ứng.
- Hành động ở danh sách đơn có thể gặp thay đổi trạng thái. Bàn giao qua các route xác minh hiện hành và không khởi tạo giao dịch từ lịch sử.
- Tiêu đề tiếng Việt dài và các menu có thể tràn ở 320 px hoặc zoom 200%. Kiểm tra vùng chạm, reflow và focus trên bản render.

## Migration Plan

Phát hành Catalog trước frontend. Hai API danh sách cũ và các endpoint chi tiết tiếp tục phục vụ bản frontend trước đó. Khi khôi phục, đưa frontend về bản trước rồi mới khôi phục Catalog nếu cần.

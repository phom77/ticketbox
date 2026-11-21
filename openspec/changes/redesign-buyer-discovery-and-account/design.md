# Thiết kế khám phá và tài khoản

## Context

Catalog công khai phân trang bằng `page` và `size`. Dữ liệu tóm tắt có tên và bản dịch, địa điểm, ngày diễn, giờ mở và đóng bán. Identity và Ticketing đã có đường xác thực, chỉnh hồ sơ và đọc đơn. Hai đợt trước đã ổn định luồng mua, Ví vé và số thông báo chưa đọc. [Nền tảng giao diện](../../../frontend/DESIGN_SYSTEM.md)

## Goals / Non-Goals

**Goals**

- Cho khách tìm sự kiện, quay lại kết quả và dễ đến đúng đơn hoặc vé bằng Việt/Anh.
- Dùng dữ liệu hiện có cho hành vi công khai và fixture phát triển cho trường Catalog tương lai.

**Non-Goals**

- Mở rộng Catalog hoặc nghiệp vụ Identity/Ticketing, tích hợp Google, đổi quy trình thanh toán hoặc thiết kế lại workspace.

## Decisions

1. Giữ `/` làm đường khám phá và lưu từ khóa, ngày, trạng thái bán và sắp xếp trong query. Đọc giá trị trạng thái cũ đã chia sẻ, dùng mã ổn định cho giá trị mới. Ô tìm trong header giữ các lọc hiện hành khi đang ở `/`. Khi mở chi tiết, quay lại danh sách theo lịch sử trình duyệt và khôi phục vị trí đã xem. Dùng dữ liệu công khai cho show nổi bật và một lưới kết quả khi tìm hoặc lọc.
2. Dùng ngày theo múi giờ `Asia/Ho_Chi_Minh` cho bộ lọc, với cuối tuần tính thứ Bảy và Chủ nhật. Dùng giờ mở và đóng bán cùng trạng thái Catalog để phân loại thay vì dùng nháp để suy ra sắp bán. Chuẩn hóa dấu và khoảng trắng khi so tên gốc, bản dịch và địa điểm. Tải thêm từng trang, hợp nhất theo ID và giữ kết quả khi trang kế lỗi. Client hiển thị phạm vi đã tải; tải toàn bộ Catalog hoặc gọi từng chi tiết để tìm giá sẽ làm thời gian đáp ứng phụ thuộc số sự kiện.
3. Dùng một bề mặt lọc với bản preview phát triển tại `/discover-preview`, chỉ đăng ký route khi chạy Vite dev. Fixture chứa tỉnh/thành, thể loại và giá. Khi API có dữ liệu, các trường này sẽ chuyển sang Catalog công khai và điều kiện lọc được áp dụng trước phân trang. Dữ liệu và bộ lọc preview không đi vào danh sách thật.
4. Giữ điều hướng của vai trò qua các guard. Khách mua có lối mở vé ở header hẹp. Menu dùng disclosure, giữ trạng thái mở và trả focus khi Escape. Giữ hàng mua gọn, badge hiện tại và link hỗ trợ thực. Form xác thực dùng chung kiểu trình bày. Chuyển qua lại giữa login và register giữ đích cùng origin đã được guard cung cấp. Điều khoản mua vé và điều khoản tài khoản có nguồn cấu hình riêng. Giữ ngữ nghĩa xác nhận đăng ký hiện hành và dùng đường dẫn thật khi có cấu hình tài khoản.
5. Giữ `/profile?tab=orders` để checkout và thông báo tiếp tục về đúng mục. Tải hồ sơ và đơn theo mục đang mở, dùng kiểu `Order` chung và nhóm lọc theo trạng thái. Kiểm tra hạn đơn trước khi mời tiếp tục. Checkout và kết quả hiện có xác minh giao dịch. Vé đã phát hành mở tại `/my-tickets`; link theo sự kiện định hướng khách đến nhóm vé khi có, với danh sách chung khi nhóm không tồn tại. Dữ liệu khách mua được làm mới khi tài khoản đổi.

## Risks / Trade-offs

- Tìm trên các trang đã tải có thể bỏ sót một sự kiện. Hiển thị giới hạn rõ và vẫn cho tải tiếp khi chưa khớp mục nào.
- Đường dẫn cũ có thể dùng trạng thái bằng tiếng Việt hoặc mã `DRAFT` cho bộ lọc sắp mở bán. Quy đổi chúng sang bộ lọc mới và chỉ hiển thị sự kiện công khai. Khi Back từ một thẻ, khôi phục cả các trang đã tải rồi trả về vị trí cuộn. Giữ đường dẫn mục vé cũ trong hồ sơ.
- Hành động ở danh sách đơn có thể gặp thay đổi trạng thái. Bàn giao qua các route xác minh hiện hành và không khởi tạo giao dịch từ lịch sử.
- Tiêu đề tiếng Việt dài và các menu có thể tràn ở 320 px hoặc zoom 200%. Kiểm tra vùng chạm, reflow và focus trên bản render.

## Migration Plan

Phát hành gói frontend hiện hành. Khôi phục bằng bản frontend trước khi cần. Các URL công khai, hồ sơ, đơn và vé tiếp tục dùng hợp đồng hiện hành.

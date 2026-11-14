# Thiết kế giao diện soát vé Android

## Context

[Proposal](proposal.md) tổng hợp ba mẫu HTML đính kèm trong cuộc trao đổi. [App.tsx](../../../mobile-scanner/App.tsx) hiện quản lý phiên, sự kiện, cổng, thao tác quét và đồng bộ. [Màn quét](../../../mobile-scanner/src/screens/ScannerHomeScreen.tsx) dùng Expo Camera. [Màn dữ liệu](../../../mobile-scanner/src/screens/ConcertDataScreen.tsx) ghép lịch sử SQLite với lịch sử máy chủ.

| Mẫu HTML | Điểm giữ lại | Điều chỉnh cho app Android |
| --- | --- | --- |
| **Quét vé** | Tiêu đề ngắn, thẻ sự kiện và cổng, khung camera tối, nút nhập tay ngay bên dưới và tối đa ba lượt gần đây. | Đặt kết quả mới cạnh camera và trước danh sách gần đây. Phần camera co giãn theo chiều cao. Đèn pin nằm trong khung và chỉ hiện khi khả dụng. |
| **Lịch sử quét** | Tìm kiếm và lọc nhanh, dòng kết quả theo thời gian, trạng thái kèm biểu tượng, thanh đồng bộ phía dưới. | Dùng “Đã xác nhận” thay cho “Hợp lệ” để nói về lượt vào cổng. Số liệu ghi rõ phạm vi lịch sử hiện có. Hiện cổng từng lượt vì lịch sử có thể gồm nhiều cổng. |
| **Navigation Drawer** | Menu trượt trái trên nền mờ, ngữ cảnh sự kiện ở đầu và đồng bộ ở cuối. | Dùng danh tính, cổng và số liệu có thật. Nút Android Back đóng menu. Thanh điều hướng hệ thống do Android hiển thị. |

## Goals / Non-Goals

- Nhân viên thấy mình đang soát vé cho sự kiện nào, tại cổng nào và phải làm gì với kết quả vừa nhận. Lối vào nhập tay vẫn dễ chạm khi camera bị chặn.
- Hai đích Quét vé và Lịch sử dùng chung điều hướng trong sự kiện. Menu tập trung các tác vụ ít dùng hơn.
- Mã giao tiếp, phiên đăng nhập, SQLite, dữ liệu đã tải, cơ chế đồng bộ và chính sách phân quyền hiện hành là ranh giới kỹ thuật của change. Phát hành APK/AAB, phân ca, cài đặt âm thanh và chức năng hỗ trợ kỹ thuật có thể được đặc tả riêng.

## Decisions

### Bố cục và điều hướng

- Sau khi chọn sự kiện, dùng màn tổng quan hiện có để xác nhận cổng và chuẩn bị dữ liệu, sau đó mở Quét vé. Giữ cổng đã lưu cho sự kiện hiện tại. Khi chuyển sự kiện, yêu cầu xác nhận cổng trước khi quét.
- Giữ Quét vé và Lịch sử trên thanh điều hướng dưới để chuyển nhanh khi làm việc. Menu trái là lớp phủ khoảng 82% chiều rộng, tối đa 344 dp. Menu chứa Tổng quan và cổng, Danh sách vé, Khách mời khi khả dụng, Đồng bộ dữ liệu, Đổi sự kiện và Đăng xuất. Mở “Xem tất cả” từ Quét vé đi thẳng đến Lịch sử. Phương án bỏ thanh dưới sẽ tăng số lần chạm trong vòng quét và tra soát thường xuyên.
- Dùng Android Back cho lớp trên cùng. Đóng lớp phủ hoặc nhập tay trước khi rời màn. Chuyển tiêu điểm TalkBack vào menu lúc mở, chặn tương tác phía sau và khôi phục tiêu điểm khi đóng tại chỗ. Khi đổi màn, chuyển tiêu điểm đến tiêu đề của đích.

### Giao diện và camera

- Tận dụng [theme hiện có](../../../mobile-scanner/src/ui/theme.ts). Dùng nền trắng, mặt phụ xám nhạt, chữ đậm, viền nhẹ và nền tối sau vùng camera. Chuẩn hóa nhịp khoảng cách 4/8/12/16/24 dp, bo 12 dp cho nút và thẻ, 16 dp cho khung camera. Dùng font hệ thống Android với cỡ chữ hệ thống và vùng chạm tối thiểu 48 dp.
- Màn quét xếp theo thứ tự tiêu đề và menu, sự kiện và cổng, camera và kết quả, nhập tay, lượt gần đây rồi thanh điều hướng. Ở màn thấp hoặc chữ lớn, cho cuộn phần phụ để giữ thao tác chính và tránh che thông báo bằng bàn phím. Tôn trọng vùng an toàn và tùy chọn giảm chuyển động.
- Dùng cùng quy trình xử lý cho camera và nhập tay. Tạm dừng nhận QR khi camera mất tiêu điểm hoặc trong lúc gửi, dùng khóa đồng bộ kết hợp khoảng chống đọc lặp hiện có. Giữ mã nhập tay khi lỗi có thể phục hồi. Kết quả hiện bằng chữ và biểu tượng, thông báo cho TalkBack khi đổi trạng thái mà không giành tiêu điểm đang nhập.

### Trạng thái Check-in

| Tín hiệu hiện có | Phản hồi chính |
| --- | --- |
| `ONLINE_ACCEPTED`, hoặc lượt `SYNCED` và bản ghi đã được Check-in xác nhận trong lịch sử | Xanh với dấu kiểm và “Cho phép vào cổng” ở kết quả quét hoặc “Đã xác nhận” trong lịch sử. |
| `PENDING` | Hổ phách với biểu tượng đồng hồ, “Chờ xác nhận” và hướng dẫn chờ trước khi cho khách vào. |
| `DUPLICATE_LOCAL` | “Mã đã quét trên thiết bị”, kèm trạng thái lượt trước nếu có. |
| `INVALID_LOCAL`, phản hồi từ chối từ Check-in, `CONFLICT` hoặc `FAILED` của lượt đồng bộ | Nhãn theo dữ liệu xác định được, lý do cụ thể nếu có. |
| Thiếu quyền, lỗi dữ liệu hoặc lỗi xử lý | Nhãn riêng kèm bước khôi phục phù hợp với loại lỗi. |

- [Check-in](../../../services/checkin/src/main/java/org/ticketbox/checkin/admission/application/CheckinService.java) gộp nhiều lý do vào `FAILED`. Dùng “Vé đã dùng” khi trạng thái có cấu trúc như `USED` hoặc kết quả đồng bộ xác định rõ. Với phản hồi không đủ chi tiết, dùng “Không thể soát vé” hoặc “Vé không được chấp nhận” theo loại lỗi. So sánh chuỗi thông báo dịch không đủ ổn định để suy diễn lý do.
- NetInfo cung cấp trạng thái kết nối của thiết bị. Trạng thái Check-in dựa trên lần gọi thực tế tới API đã cấu hình, gồm cả địa chỉ LAN. Khi chưa có tín hiệu từ Check-in, ghi rõ đang kiểm tra hoặc trạng thái kết nối thiết bị. Giữ cơ chế ghi `PENDING` khi mất kết nối thực sự và có dữ liệu dùng được. HTTP 401/403 phải hiện lỗi truy cập riêng.
- Tập trung ánh xạ nhãn và kiểu hiển thị trong scanner để dùng chung giữa kết quả, lịch sử, lượt gần đây và đồng bộ. Tiêu đề sự kiện lấy nguyên văn từ dữ liệu hiện có. Mã trạng thái và các hợp đồng API giữ dạng hiện tại.

### Lịch sử và đồng bộ

- Tái sử dụng phần ghép lịch sử trong màn dữ liệu, tách điểm vào Lịch sử và Danh sách vé. Nguồn gồm nhật ký SQLite của sự kiện và trang lịch sử máy chủ đã tải. Đối chiếu các bản ghi đã đồng bộ để một lượt xác nhận chỉ xuất hiện một lần. Giữ riêng lượt chờ, lỗi và xung đột ngay cả khi cùng mã có một lượt được máy chủ xác nhận. Dùng dữ liệu này cho tối đa ba lượt gần đây.
- Tìm theo mã vé hoặc QR tương ứng với trường có sẵn. Hiện mã vé khi API cung cấp, che QR trong danh sách. Chỉ hiện tên hạng vé hoặc giờ vé đã dùng khi có dữ liệu. Nhãn số liệu lịch sử mô tả các lượt đã tải, số lượt chờ theo bộ đếm SQLite cho sự kiện; lý do bị từ chối chưa được lưu chỉ hiện trong kết quả ngay sau khi quét.
- Làm mới phần máy chủ và SQLite sau đồng bộ. Khi API lỗi, giữ dữ liệu đang có của cùng sự kiện và hiện thử lại. Chặn chạy hai lượt đồng bộ cùng lúc từ nhiều nút, khóa kết quả bất đồng bộ theo sự kiện và phiên để kết quả đến muộn không lẫn sang sự kiện khác.

## Risks / Trade-offs

- Camera, menu và bàn phím có thể che nhau trên màn thấp. Kiểm tra Android với màn nhỏ, chữ lớn, bàn phím đang mở, TalkBack và trạng thái thiếu quyền.
- Dữ liệu từ thiết bị có thể cũ hoặc chỉ chứa một trang. Gắn nhãn phạm vi dữ liệu và hạn chế số liệu theo đúng nguồn.
- [Quyền staff toàn cục đang bị chặn](../organizer-identity-and-access/specs/scoped-admission-access/spec.md). Dùng fixture phát triển với phản hồi theo đúng hợp đồng, bao gồm 401/403. Nghiệm thu phân quyền, ca làm và vận hành ngoài thực tế tiếp tục theo [roadmap scanner](../../../docs/superpowers/plans/2026-11-11-ticketbox-production-roadmap.md).

## Migration Plan

Triển khai trong app Expo hiện có cùng cấu trúc SQLite và khóa dữ liệu hiện hành. Xác minh bằng dữ liệu từ bản app cũ và fixture sandbox, rồi chạy thử camera trên Android. Có thể quay lại giao diện cũ bằng cách hoàn nguyên phần mã giao diện, giữ dữ liệu sự kiện và lượt chờ trên máy. Phát hành vận hành theo mốc quyền staff được duyệt riêng.

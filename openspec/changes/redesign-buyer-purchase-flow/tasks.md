# Công việc triển khai

Chốt bố cục và cách hiển thị trạng thái trong nhóm 1 trước. Các nhóm 2, 3 và 4 sau đó có thể triển khai song song theo màn hình. Một người sở hữu phần dùng chung và xử lý giao nhau trong CSS, điều hướng và bản dịch. Nhóm 5 kiểm tra các điểm chuyển màn.

## 1. Nền tảng luồng mua

- [x] 1.1 Duyệt wireframe 390 × 844 px của Chọn vé, Thanh toán và Kết quả. Kiểm tra vị trí tóm tắt, nút chính, trạng thái đang đợi/thất bại và nhãn riêng cho hạn chọn vé và hạn thanh toán.
- [x] 1.2 Thống nhất cấp chữ, bố cục nhận diện sự kiện, mẫu tiến trình và phản hồi theo nền tảng ưu tiên 1. Ghi quy ước vào `frontend/DESIGN_SYSTEM.md` và kiểm tra CSS giới hạn theo phạm vi màn hình, điều hướng bàn phím và cách thông báo trạng thái.

## 2. Sự kiện và phòng chờ

- [x] 2.1 Sắp lại thông tin sự kiện, hạng vé và hành động mua trong `ConcertDetailPage`. Kiểm tra Chromium với trước mở bán, đang bán, hết vé, đóng bán, dữ liệu xác nhận sự kiện hủy, URL công khai trả 404, khách đăng nhập giữa luồng và bản xem trước của ban tổ chức.
- [x] 2.2 Sắp lại trạng thái và thông tin cần đọc trong `WaitingRoomPage`. Kiểm tra chuyển từ phòng chờ sang hàng chờ, ước tính chưa có dữ liệu, đứt cập nhật thời gian thực rồi hồi phục qua kiểm tra định kỳ, được cấp lượt và phiên đã kết thúc.

## 3. Chọn khu và giữ vé

- [x] 3.1 Đồng bộ lựa chọn của `SeatSelectionPage` và `ConcertSeatMap` với danh sách hạng. Kiểm tra chọn bằng sơ đồ, bàn phím và danh sách khi sơ đồ thiếu. Tại 390 × 844 px, xác nhận số vé đã giữ, tổng tạm tính và nút tiếp tục thấy cùng lúc.
- [x] 3.2 Hiển thị hạn phiên và phản hồi giữ/thả theo hạng. Kiểm thử số lượng đã xác nhận và tổng khi tồn kho đổi, chạm giới hạn, mất phản hồi, hết phiên hoặc mở trực tiếp khi thiếu lượt. Kiểm tra sang checkout với đúng hạng và số lượng đã giữ.

## 4. Thanh toán và kết quả

- [x] 4.1 Sắp lại `CheckoutPage` để có một vị trí hiển thị hạn thanh toán, tổng theo đơn và nút theo cổng đã cấu hình. Kiểm tra trên mobile và desktop khi đang tạo đơn, đã có đơn, cổng chưa sẵn sàng và hết hạn. Kiểm tra tổng lấy từ đơn sau khi khôi phục.
- [x] 4.2 Thiết kế thông báo và hành động trong `PaymentResultPage` và các trạng thái phục hồi của checkout. Mở rộng ca liên quan trong `scripts/e2e/checkout-recovery.mjs` để xác nhận cùng đơn sau mất phản hồi/tải lại, trả về trước xác nhận, thất bại, hết hạn trong lúc chưa rõ kết quả và thanh toán đến muộn cạnh thao tác hủy.
- [x] 4.3 Thiết kế lại `BookingConfirmationPage` bằng tóm tắt đơn và nút mở Vé của tôi. Bỏ QR minh họa. Kiểm tra mở trực tiếp thiếu dữ liệu dẫn tới lịch sử đơn, tài khoản khác không đọc được xác nhận cũ và đơn đã thanh toán đi tới đúng vé đã phát hành.

## 5. Kiểm tra tích hợp

- [x] 5.1 Chạy `npm --prefix frontend run lint`, `npm --prefix frontend run build` và `openspec validate redesign-buyer-purchase-flow --type change --strict`. Chạy bộ Chromium checkout recovery và `scripts/e2e/organization-workspace.mjs` qua gateway cô lập để đi từ chi tiết sự kiện tới thanh toán MOCK, rồi mở lại QR sau tải lại. Đối chiếu route, dữ liệu đơn và số lần tạo đơn/lần thử qua các ca phát sinh lỗi. [Hướng dẫn kiểm thử](../../../docs/development.md#distributed-and-browser-regression)
- [x] 5.2 Rà luồng hiển thị bằng Việt/Anh ở 320, 390, 834 và 1440 CSS px, thao tác bàn phím và zoom trình duyệt 200%. Xác nhận tránh tràn ngang và che lỗi, đồng hồ đúng từng bước, phần tóm tắt và nút chính đọc được. Lưu ảnh fixture và ghi ca đã chạy qua gateway cục bộ hoặc VNPAY sandbox theo môi trường đã cấu hình.

## Kết quả kiểm tra

- Frontend lint, build và OpenSpec strict đạt. Build báo cảnh báo kích thước bundle.
- Fixture sự kiện/phòng chờ, chọn vé, Vé của tôi và Thông báo đạt. Checkout recovery đạt 26 ca, gồm giữ đúng đơn khi mất phản hồi, phân biệt đang xác minh với hết hạn, và kiểm tra lại quyền xem đơn trước khi hiện xác nhận.
- Luồng Chromium qua gateway Compose cô lập đi từ chi tiết sự kiện đến mua bằng MOCK rồi mở lại QR đã phát hành sau khi tải lại. Các ca VNPAY dùng fixture mô phỏng phản hồi cổng.
- Đã kiểm tra hai ngôn ngữ ở 320, 390, 834 và 1440 CSS px, bàn phím và zoom trình duyệt 200%. Ảnh fixture, kết quả và log nằm trong `.artifacts/e2e/buyer-purchase-flow/`.

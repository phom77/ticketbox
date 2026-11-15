# Công việc triển khai

Nhóm 1 phụ trách quy ước và CSS dùng chung. Sau khi chốt lớp và token dùng chung, nhóm 2 và 3 có thể triển khai song song. Hai nhóm này tích hợp mẫu tiêu đề và bộ lọc, đồng thời sở hữu thành phần, CSS và khóa bản dịch của màn mình. Người tích hợp xử lý phần giao nhau trong `app.css` và `i18n/{vi,en}/customer.json`, rồi chạy nhóm 4.

## 1. Nền tảng giao diện

- [x] 1.1 Định nghĩa lớp giao diện giới hạn cho hai trang và khung QR trong portal. Đồng bộ font, cấp chữ, khoảng cách, điều khiển và focus. Cập nhật `frontend/DESIGN_SYSTEM.md`. Kiểm tra bằng chữ Việt có dấu, tên dài và font dự phòng. Rà phạm vi CSS qua trang khám phá, checkout, hồ sơ và một màn vận hành.
- [x] 1.2 Định nghĩa mẫu tiêu đề gọn và các nút lọc có trạng thái, dùng tài liệu thiết kế để ghi cách bỏ vạch trang trí và kiểm tra tương phản, focus cùng vùng chạm 44 px cho điều khiển chính trên hai trang.

## 2. Vé của tôi và khung QR

- [x] 2.1 Tổ chức thẻ sự kiện và hàng vé, áp dụng thứ tự ưu tiên, xử lý dữ liệu Catalog đến muộn và thêm bản dịch Việt/Anh. Kiểm thử Chromium với nhiều sự kiện, 28 vé, các vé cùng hạng, tên dài, thiếu ảnh hoặc Catalog lỗi, danh sách trống, bộ lọc trống và thử lại.
- [x] 2.2 Thiết kế khung chi tiết ưu tiên QR ở 390 × 844 CSS px, hỗ trợ nút đóng, Escape, vòng Tab và trả focus. Kiểm thử mở vé hợp lệ trong lúc làm mới danh sách, sau đó phản hồi báo đổi trạng thái hoặc vé biến mất, và trường hợp mất phiên. Đối chiếu QR của fixture với payload phát hành và kiểm tra URL, log ứng dụng, sự kiện phân tích nếu có.
- [x] 2.3 Cập nhật đường kiểm thử phục hồi vé ở `scripts/e2e/organization-workspace.mjs` theo nút có nhãn. Xác minh khách mở được vé đúng sự kiện sau khi mua MOCK và tải lại ở 390 px, rồi chuyển ngôn ngữ và mở lại cùng vé.

## 3. Thông báo

- [x] 3.1 Dựng danh sách tin trong ứng dụng theo đặc tả, thêm bản dịch Việt/Anh và đường dẫn theo loại, cho tải thêm tin cũ. Kiểm thử Chromium với bản tin APP/EMAIL cùng nội dung, loại chưa biết, trang chỉ có email, mục trùng giữa các trang, bộ lọc trống và tải thêm hoặc làm mới thất bại.
- [x] 3.2 Xử lý đánh dấu đã đọc, đồng bộ badge trong điều hướng desktop/mobile và khôi phục khi lỗi. Kiểm thử thành công, thất bại rồi thử lại, focus khi mục biến mất, làm mới đồng thời và phản hồi đến muộn sau khi đổi tài khoản hoặc hết phiên.

## 4. Kiểm tra tích hợp

- [x] 4.1 Chạy `npm --prefix frontend run lint`, `npm --prefix frontend run build` và `openspec validate redesign-buyer-ticket-experience --type change --strict`. Chạy các ca Chromium đã thêm/cập nhật và luồng khôi phục checkout hiện có theo [hướng dẫn kiểm thử](../../../docs/development.md#distributed-and-browser-regression). Xác nhận frontend vẫn dùng đúng các URL và hợp đồng API hiện hành, kiểm tra tài khoản thường, chưa đăng nhập và phản hồi từ chối truy cập. Ghi kết quả chạy và môi trường vào bằng chứng nghiệm thu.
- [x] 4.2 Rà trang hiển thị thực tế bằng tiếng Việt và tiếng Anh ở 320, 390, 834 và 1440 CSS px, có bàn phím và zoom 200%. Xác nhận không tràn ngang, tiêu đề và trạng thái dễ đọc, focus rõ, khung QR fixture quét được, và bước đi từ xác nhận thanh toán, hộp Thông báo hoặc tải lại tới mở vé hoạt động đúng. Lưu ảnh bằng dữ liệu fixture và ghi ca nào đã kiểm tra trên thiết bị thật nếu có.

## Kết quả kiểm tra

- Frontend lint và build đạt. Lint báo hai cảnh báo đã có ở Checkout và SeatSelection. Vite báo cảnh báo kích thước bundle.
- Hai fixture Chromium cho Vé và Thông báo đạt. Bộ checkout recovery đạt 20 ca. Chromium kiểm tra hai ngôn ngữ ở 320, 390, 834 và 1440 CSS px, cùng mức zoom trình duyệt 200% ở cả hai ngôn ngữ.
- Kiểm thử qua gateway Compose cục bộ đã mua vé bằng MOCK, đi từ xác nhận tới Vé của tôi và mở lại đúng QR sau tải lại. Kiểm tra quyền gồm khách chưa đăng nhập, vai trò bị từ chối, hai tài khoản mua khác nhau và thao tác đánh dấu tin của chính chủ.
- ZXing giải mã ảnh QR fixture đúng payload. Ảnh và log nằm trong `.artifacts/e2e/buyer-priority-1/`. Phạm vi kiểm tra là trình duyệt và gateway cục bộ, với QR fixture được giải mã bằng phần mềm.

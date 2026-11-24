# Công việc triển khai

Chốt URL và nền tảng giao diện trước. Triển khai theo ba nhóm Khám phá, Điều hướng và xác thực, Tài khoản và đơn hàng. Mỗi nhóm giữ CSS và khóa bản dịch theo phần mình, sau đó kiểm tra các điểm nối.

## 1. Khám phá

- [x] 1.1 Thiết kế trang chủ, một lưới kết quả và thẻ sự kiện theo hệ chữ đã có. Kiểm tra trên mobile với tìm kiếm ở vùng đầu trang, show công khai sắp mở bán, tiêu đề dài và dữ liệu ảnh thiếu.
- [x] 1.2 Nối từ khóa không dấu, ngày diễn, tình trạng bán, sắp xếp và phân trang vào Catalog hiện có. Kiểm tra áp dụng/xóa lọc, URL cũ và mới, Back từ thẻ ngoài trang đầu, dữ liệu hơn 60 sự kiện, không khớp trong phần đã tải và lỗi trang kế tiếp.
- [x] 1.3 Tạo `/discover-preview` chạy với fixture tỉnh/thành, thể loại và khoảng giá. Kiểm tra tổ hợp, chip và xóa lọc, đồng thời xác minh các trường fixture không xuất hiện trên trang thật hoặc route không hiện diện trong build production.

## 2. Điều hướng và xác thực

- [x] 2.1 Thiết kế header, tìm kiếm, menu và footer theo vai trò và chiều rộng. Kiểm tra tải lại query, badge chưa đọc, Escape/trả focus, link đơn hàng, Vé của tôi và header mua gọn.
- [x] 2.2 Làm gọn đăng nhập, đăng ký và khôi phục bằng mẫu form chung. Kiểm tra bảo toàn đích khi chuyển qua đăng ký, lỗi và focus, luồng reset hiện hành, và nguồn HTTPS cho điều khoản tài khoản khi được cấu hình.

## 3. Tài khoản và đơn hàng

- [x] 3.1 Tách dữ liệu hồ sơ khỏi lịch sử đơn và cập nhật tên hiển thị sau lưu. Kiểm tra tải lỗi theo mục, thử lại, giữ nội dung sửa và cách ly phản hồi lưu đến trễ khi đổi tài khoản.
- [x] 3.2 Làm rõ trạng thái, bộ lọc và hành động theo đơn. Kiểm tra đơn còn hạn dùng đúng ID, hết hạn không mời thanh toán thêm, trạng thái hoàn tiền, ưu tiên đúng nhóm sự kiện trong Vé của tôi và tương thích URL vé cũ.

## 4. Tích hợp

- [x] 4.1 Chạy frontend lint, build và OpenSpec strict. Chạy fixture mới, web-language, checkout recovery, Vé của tôi, Thông báo và luồng mua qua gateway cô lập. Đối chiếu quyền hiện hành, URL và API tương thích. [Hướng dẫn kiểm thử](../../../docs/development.md#distributed-and-browser-regression)
- [x] 4.2 Rà bản render Việt/Anh ở 320, 390, 834 và 1440 CSS px, bàn phím và zoom trình duyệt 200%. Lưu ảnh dữ liệu fixture và ghi phạm vi kiểm tra thực tế.

## 5. Header và danh mục công khai

- [x] 5.1 Catalog cung cấp danh mục công khai đã lọc và phân trang. Kiểm tra tên tiếng Việt không dấu, dữ liệu legacy và native, điều kiện cùng suất, tổng số kết quả và sự kiện chưa công bố.
- [x] 5.2 Web dùng chung header với một ô tìm kiếm, Vé của tôi và menu tài khoản. Kiểm tra khách, người mua, menu bàn phím, badge, header phòng chờ và chọn vé trên cả hai đường mua.
- [x] 5.3 Trang chủ giới thiệu sự kiện và dẫn sang danh mục `/events`. Dùng truy vấn Catalog đã lọc, giữ URL cũ, thử lại sau lỗi và khôi phục Back từ chi tiết. Kiểm tra bố cục Việt/Anh từ mobile đến màn hình rộng.
- [x] 5.4 Chạy kiểm tra Catalog, OpenSpec strict, frontend lint/build và fixture browser bị ảnh hưởng. Catalog đạt 58 kiểm thử và gate build độc lập. Chromium đã kiểm tra dữ liệu fixture cho khám phá, điều hướng, tài khoản, thông báo, vé, hàng chờ, chọn chỗ và checkout. Luồng mua qua gateway cô lập chưa chạy cho đợt này.

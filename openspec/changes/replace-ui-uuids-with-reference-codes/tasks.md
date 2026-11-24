# Công việc

- [x] 1. Cấp và điền mã đơn, mã vé ở Ticketing, trả qua API và tra cứu hỗ trợ theo mã. Kiểm tra migration, phát hành mới, PDF, dữ liệu cũ và phạm vi tổ chức.
- [x] 2. Dùng mã ở tài khoản, checkout, kết quả thanh toán và ví vé. Kiểm tra bằng fixture UUID đầy đủ, kể cả khi API cũ thiếu mã.
- [x] 3. Dùng mã ở email và thông báo in-app. Kiểm tra thông điệp mới, hàng đợi cũ và nội dung đã lưu.
- [x] 4. Đưa mã và tên hạng vé vào dữ liệu Check-in, danh sách và lịch sử máy quét. Kiểm tra snapshot cũ, dữ liệu offline và xác thực QR.
- [x] 5. Dùng nhãn nghiệp vụ ở workspace, phân công nhân viên từ danh sách theo tổ chức và khôi phục quản lý bằng email. Kiểm tra quyền, tìm theo email, tài khoản không còn đủ điều kiện và thao tác thu hồi.
- [x] 6. OpenSpec strict, lint/build web và typecheck máy quét đạt. Chromium đã kiểm tra ví vé, lịch sử đơn, checkout, hỗ trợ, phân công và máy quét web. Maven kiểm tra các dịch vụ bị ảnh hưởng. Luồng mua MOCK trên gateway cô lập xác nhận mã đơn ở hỗ trợ và thông báo, mã vé trong dữ liệu soát vé và chống quét trùng. Kiểm tra PostgreSQL xác nhận cấp mã cho dữ liệu cũ. Phạm vi kiểm tra tập trung theo yêu cầu, chưa chạy CI toàn repo hoặc camera và SQLite trên thiết bị thật.

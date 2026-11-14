# Công việc triển khai

## 1. Giao diện chung và ngữ cảnh sự kiện

- [ ] 1.1 Chuẩn hóa token, nút, nhãn trạng thái và vùng an toàn trong scanner. Kiểm tra nút có vùng chạm 48 dp, nhãn tiếng Việt hiển thị đủ dấu, nội dung dài xuống dòng và thao tác chính dùng được trên màn nhỏ.
- [ ] 1.2 Dùng màn Tổng quan hiện có để xác nhận cổng. Giữ cổng đã lưu cho sự kiện đang khôi phục, xác nhận lại khi đổi sự kiện và cô lập kết quả tải, quét, danh sách khách mời và bộ đếm theo phiên và sự kiện. Kiểm tra bằng hai sự kiện và phản hồi đến muộn. Xác nhận dữ liệu SQLite từ bản trước vẫn đọc được.
- [ ] 1.3 Thêm thanh Quét vé và Lịch sử, menu trái và các lối vào Tổng quan, Danh sách vé, Khách mời, Đồng bộ dữ liệu, Đổi sự kiện và Đăng xuất. Kiểm tra đích điều hướng, điều kiện hiện khách mời, đóng menu bằng vùng nền và Android Back, thứ tự tiêu điểm TalkBack khi mở và đóng.

## 2. Quét QR, nhập tay và phản hồi

- [ ] 2.1 Thiết kế lại khung camera, đèn pin khi thiết bị hỗ trợ, thao tác nhập tay và khối kết quả. Kiểm tra khi từ chối quyền, quyền bị chặn, camera lỗi, mở bàn phím, mở menu, rời màn và quay lại từ nền.
- [ ] 2.2 Dùng chung xử lý mã cho camera và nhập tay, bảo vệ thao tác đang chạy và giữ cách chống đọc lặp hiện có. Bằng phản hồi chậm, xác nhận nhiều lần đọc liên tiếp và chạm lặp chỉ gửi một yêu cầu cho lượt đang xử lý.
- [ ] 2.3 Ánh xạ trạng thái quét, lượt chờ, từ chối, trùng và lỗi truy cập. Kiểm tra bằng fixture theo hợp đồng cho `SUCCESS`, `FAILED`, HTTP 401/403, Check-in không truy cập được có hoặc thiếu dữ liệu đã tải, và Check-in truy cập được qua LAN khi thiết bị mất Internet. Chỉ phản hồi được xác nhận mới hiển thị “Cho phép vào cổng”.

## 3. Lịch sử và đồng bộ

- [ ] 3.1 Tách điểm vào Lịch sử và Danh sách vé. Dùng chung dữ liệu lịch sử cho ba lượt gần đây và đích “Xem tất cả”. Kiểm tra thứ tự mới nhất trước, cổng từng lượt, tìm mã QR hoặc mã vé, bốn bộ lọc, dữ liệu tải một phần, lịch sử trống và bộ lọc không khớp.
- [ ] 3.2 Hiển thị số chờ, tiến trình đồng bộ và cập nhật hai nguồn lịch sử. Kiểm tra cùng lúc bấm từ nhiều lối vào, mất kết nối, lỗi truy cập, đồng bộ thành công và xung đột. Lượt đã xác nhận chỉ hiện một lần, lượt chưa xử lý còn nguyên sau khi mở lại app.
- [ ] 3.3 Cập nhật hướng dẫn scanner về trạng thái chờ xác nhận, LAN và cách chạy fixture phát triển. Đối chiếu hướng dẫn với hành vi trên thiết bị và xác nhận fixture không được đóng gói trong app phát hành.

## 4. Nghiệm thu tích hợp

- [ ] 4.1 Chạy `npm run typecheck` trong `mobile-scanner/` và `openspec validate redesign-staff-scanner-mobile --type change --strict`. Rà diff để xác nhận API, setting bảo mật của Check-in, hợp đồng HTTP và schema SQLite giữ nguyên.
- [ ] 4.2 Chạy walkthrough trên Android cho toàn bộ luồng chọn sự kiện, xác nhận cổng, quét QR thật, nhập tay, mở menu, tra lịch sử và đồng bộ lại. Lưu bằng chứng với màn thấp, chữ lớn và TalkBack. Ghi riêng kết quả fixture và giới hạn nghiệm thu với API staff hiện hành.

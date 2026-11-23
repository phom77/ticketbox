# Tasks

## 1. Điều hướng hai cấp và ranh giới workspace

- [ ] 1.1 Tổ chức sidebar chính và sidebar Concert theo vai trò bằng khung hiện có. Nhóm các route Admin đã có dưới Concert và đưa mục đang trỏ sang Organizer về đích Admin. Kiểm tra Enter, Space, chỉ báo trang hiện tại, thu gọn, thứ tự focus và bố cục ở desktop, tablet, điện thoại, zoom, sáng/tối và tiếng Việt/Anh bằng các bài kiểm tra workspace hiện có.
- [ ] 1.2 Giữ liên kết cũ đến chi tiết concert, xem trước, hạng vé, khách mời, lịch sử import, duyệt và vận hành. Kiểm tra Admin không có membership vẫn mở được khu vực đúng quyền. Kiểm tra Organizer thiếu `EVENTS`, hai tổ chức khác quyền, URL trực tiếp và Back/Forward với bộ lọc hoặc tab giữ nguyên. Cập nhật `performance-admin-navigation.mjs`, `organization-workspace.mjs` và `operations-appearance.mjs` theo yêu cầu thay đổi.

## 2. Hợp đồng đọc theo phạm vi

- [x] 2.1 Bổ sung các truy vấn đọc Catalog cho danh sách và chi tiết Admin, bộ đếm trạng thái và báo cáo vận hành theo quyền và phạm vi đã định nghĩa. Áp dụng bộ lọc trước phân trang. Dùng kiểm thử dịch vụ để xác nhận tổng, thứ tự, trang cuối, cận giờ, trạng thái bán bị tạm dừng, hồ sơ đã bị thay thế, concert cũ, concert nhiều suất và concert chưa có suất.
- [x] 2.2 Xác nhận quyền nền tảng, `EVENTS` và quyền sở hữu trước truy vấn qua các bài kiểm tra endpoint. Kiểm tra người dùng không được cấp quyền hoặc lọc bằng ID tổ chức và concert của bên khác. Ghi hợp đồng đọc mới và chạy `./mvnw -B -ntp -f services/catalog/pom.xml clean verify` cùng `python3 scripts/ci/verify-service-boundaries.py --service catalog`. Giữ các hợp đồng ghi và kiểm các fixture dữ liệu cũ khi chạy bộ kiểm thử.

## 3. Danh sách Concert và luồng tác nghiệp

- [ ] 3.1 Nối danh sách và chi tiết thống nhất trong Admin với dữ liệu Catalog. Đặt thông tin chủ sở hữu, duyệt, vận hành và các công cụ có sẵn trong đúng ngữ cảnh. Kiểm tra browser từ danh sách đến bản ghi mới và cũ, đến hàng chờ duyệt và đến xử lý sự cố của một suất mà URL vẫn ở `/admin`.
- [ ] 3.2 Nối các điểm vào tạo chính của Organizer tới luồng có hướng dẫn và dùng chung danh sách Concert cho bản ghi cũ và mới. Kiểm tra tạo nháp hai suất, mở lại để tiếp tục, mở concert cũ và đổi suất không mất ngữ cảnh. Kiểm tra Tạo sự kiện hộ trong Admin với tổ chức đã chọn và xác nhận bản nháp vẫn xuất hiện trong đúng tổ chức và theo chính sách duyệt hiện có. Mở rộng bài kiểm tra `performance-organizer.mjs` và `performance-admin-navigation.mjs`.

## 4. Trang Báo cáo chi tiết

- [x] 4.1 Dựng báo cáo Vận hành cho Admin và Organizer có `EVENTS`, với bộ lọc URL, tổng, bảng phân trang, mở chi tiết và quay về đúng concert hoặc suất. Kiểm tra hành trình từ concert, tải lại, kỳ sai, trạng thái trống, dữ liệu chưa đồng bộ và tổng khớp khi đi qua nhiều trang.
- [x] 4.2 Tích hợp Đối soát và Doanh thu hiện có theo quyền. Kiểm tên và mốc tính của từng chỉ số, phạm vi của bộ lọc ngày, mẫu CSV cùng bộ lọc Đối soát và nhãn phạm vi toàn concert cho CSV/PDF Doanh thu. Kiểm URL cũ, quyền xuất qua API trực tiếp và báo cáo tài chính sau khi đổi tổ chức.

## 5. Dashboard theo vai trò

- [x] 5.1 Dựng dashboard Admin với các chỉ số và hàng chờ trong design. Nối từng chỉ số với báo cáo hoặc danh sách theo cùng phạm vi và kỳ. Dùng dữ liệu vượt kích thước trang để kiểm tổng, mở đúng bản ghi và theo dõi dữ liệu tải một phần, lỗi, thử lại và tổng bằng 0.
- [x] 5.2 Dựng dashboard Organizer theo tổ chức và quyền, với nút Tạo concert và việc cần làm tiếp. Kiểm tra chỉ số, đích mở chi tiết, phản hồi khi chưa có dữ liệu, quyền `FINANCE` không kèm `EVENTS` và đổi tổ chức khi phản hồi cũ còn đang tải.

## 6. Nghiệm thu tích hợp

- [ ] 6.1 Chạy `npm --prefix frontend run lint` và `npm --prefix frontend run build`. Chạy các kịch bản workspace, giao diện, Organizer, vận hành Admin và báo cáo bằng Chromium trên stack cô lập. Xác nhận hai vai trò đi được trọn vòng tạo concert nhiều suất, yêu cầu sửa một suất, gửi lại và duyệt, rồi mở đúng báo cáo theo phạm vi. Chạy `openspec validate redesign-operations-workspaces --type change --strict` và ghi kết quả kiểm tra cùng các giới hạn còn lại.

## Commit triển khai

- Chia commit theo nhóm 1 đến 5. Có thể tách nhóm 4 thành báo cáo vận hành và tài chính nếu mỗi phần có đường vào và kiểm thử độc lập.
- Commit từng lát ngay sau khi chạy kiểm tra liên quan. Mỗi commit gồm thay đổi, kiểm thử và cập nhật tài liệu của phần đó. Ví dụ `feat(web): split concert navigation by workspace`, `feat(catalog): add scoped operations reporting reads`, `feat(web): add role-specific operations dashboards`.
- Mỗi commit giữ được bản build và các lối tác nghiệp đã có. Đưa hợp đồng đọc mới vào trước commit UI sử dụng. Nghiệm thu cuối là kiểm tra xuyên suốt, các sửa phát sinh được commit theo nguyên nhân riêng.

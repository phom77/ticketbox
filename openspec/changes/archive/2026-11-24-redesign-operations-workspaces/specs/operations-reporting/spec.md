# Spec Delta

## Purpose

Giúp Admin và Organizer nắm tình hình theo phạm vi được cấp và đi từ chỉ số tổng quan tới công việc hoặc bản ghi giải thích chỉ số đó.

## ADDED Requirements

### Requirement: Role-specific workspace dashboards

Hệ thống SHALL hiển thị dashboard theo vai trò và cung cấp đích mở chi tiết cho mỗi chỉ số hoặc việc cần xử lý.

#### Scenario: Admin opens the platform dashboard
- **WHEN** Admin mở dashboard
- **THEN** dashboard hiển thị số hồ sơ chờ duyệt, số suất đang mở bán, số suất trong bảy ngày tới và các nhóm đơn cần hỗ trợ
- **AND** các hồ sơ và vấn đề đang cần xử lý hiển thị đối tượng, trạng thái, thời hạn khi có và thao tác mở chi tiết trong Admin.

#### Scenario: Organizer opens the organization dashboard
- **WHEN** Organizer có quyền `EVENTS` mở dashboard
- **THEN** dashboard hiển thị concert đang chuẩn bị, hồ sơ cần sửa, suất đang mở bán và suất trong bảy ngày tới của tổ chức đang chọn
- **AND** Organizer có thể mở ngay bản nháp, yêu cầu chỉnh sửa hoặc suất liên quan, hoặc bắt đầu tạo concert.

#### Scenario: User opens a dashboard metric
- **WHEN** người dùng chọn một chỉ số tổng quan
- **THEN** ứng dụng mở danh sách hoặc báo cáo trong cùng workspace với đúng phạm vi, bộ lọc và kỳ tính của chỉ số đó
- **AND** số đếm phản ánh toàn bộ kết quả phù hợp, kể cả khi danh sách chia trang.

#### Scenario: One dashboard data source is unavailable
- **WHEN** một nhóm chỉ số tải lỗi hoặc đang tải
- **THEN** nhóm đó có trạng thái riêng với cách thử lại khi lỗi và các nhóm đã tải vẫn đọc được
- **AND** giá trị 0 chỉ hiện khi nguồn dữ liệu xác nhận kết quả bằng 0.

### Requirement: Detailed operational reports

Hệ thống SHALL cung cấp báo cáo vận hành có thể lọc, xem từng bản ghi và mở chi tiết trong workspace hiện tại.

#### Scenario: User filters the operational report
- **WHEN** Admin hoặc Organizer có quyền `EVENTS` mở báo cáo Vận hành và áp dụng bộ lọc
- **THEN** báo cáo hiển thị kỳ, múi giờ, tổng hợp và danh sách suất theo lịch diễn, trạng thái và concert đã chọn
- **AND** Admin có thể lọc thêm theo tổ chức, còn dữ liệu Organizer chỉ thuộc tổ chức đang chọn
- **AND** mỗi dòng cho thấy concert, suất, thời gian, trạng thái, tiến độ phát hành và trạng thái đồng bộ vé hoặc check-in khi nguồn có thông tin.

#### Scenario: User opens a report from a concert
- **WHEN** người dùng chọn Xem báo cáo trong ngữ cảnh concert hoặc suất
- **THEN** báo cáo mở với concert hoặc suất đã lọc sẵn và có lối quay lại ngữ cảnh ban đầu
- **AND** bộ lọc và trang kết quả có thể khôi phục khi tải lại hoặc dùng lịch sử trình duyệt.

#### Scenario: User submits an invalid or empty filter
- **WHEN** kỳ báo cáo bị đảo, vượt giới hạn của nguồn, hoặc bộ lọc không khớp bản ghi
- **THEN** kỳ không hợp lệ có lỗi cạnh bộ lọc, còn truy vấn hợp lệ không có kết quả hiển thị trạng thái trống
- **AND** người dùng có thể sửa bộ lọc và thử lại trên cùng trang.

### Requirement: Financial reports use authorized data

Hệ thống SHALL hiển thị từng báo cáo tài chính theo phạm vi và quyền hiện có, với tên chỉ số, kỳ và mốc tính phù hợp với dữ liệu nguồn.

#### Scenario: User reads reconciliation details
- **WHEN** Admin hoặc Organizer có quyền `FINANCE` mở báo cáo Đối soát
- **THEN** báo cáo hiển thị doanh số đơn đã thanh toán và tiền thu đã xác minh như hai chỉ số riêng, cùng số giao dịch, trạng thái đồng bộ và dòng hoàn tiền đã ghi nhận khi có
- **AND** người dùng chọn mốc khởi tạo hoặc mốc xác minh thu, lọc theo concert và kỳ, xem giao dịch phân trang hoặc xuất CSV theo cùng bộ lọc
- **AND** bộ lọc tổ chức và giao dịch chưa gắn tổ chức chỉ khả dụng cho Admin.

#### Scenario: Organizer views a supported revenue report
- **WHEN** Organizer có quyền `FINANCE` mở báo cáo Doanh thu cho concert hoàn thành có dữ liệu
- **THEN** báo cáo hiển thị doanh số vé, xu hướng và hiệu suất theo hạng vé khi nguồn hỗ trợ
- **AND** giao diện ghi rõ phạm vi áp dụng của bộ lọc kỳ và của tệp CSV hoặc PDF.

#### Scenario: User changes organization or loses a grant
- **WHEN** Organizer đổi tổ chức, mất quyền, hoặc mở một URL báo cáo dành cho quyền khác
- **THEN** màn hình bỏ dữ liệu và bộ lọc theo concert hoặc suất của tổ chức trước
- **AND** giao diện và API đọc hoặc xuất dữ liệu áp dụng quyền của tổ chức hiện tại, bao gồm khi mở URL trực tiếp
- **AND** nếu dữ liệu bị từ chối, người dùng thấy trạng thái quyền và một đường về khu vực họ được phép dùng.

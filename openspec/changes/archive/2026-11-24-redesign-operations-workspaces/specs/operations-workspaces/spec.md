# Spec Delta

## Purpose

Giúp nhân sự TicketBox điều hành concert của nền tảng và nhà tổ chức chuẩn bị, vận hành concert của tổ chức mình trong các workspace có phạm vi rõ ràng.

## ADDED Requirements

### Requirement: Two-level Concert navigation

Mỗi workspace SHALL gom công việc liên quan đến concert vào một mục Concert ở sidebar chính. Mục này SHALL mở một sidebar cấp hai chứa các đích được phép theo vai trò và ngữ cảnh.

#### Scenario: Admin opens Concert from the platform dashboard
- **GIVEN** một tài khoản Admin có quyền điều hành và chưa tham gia tổ chức nào
- **WHEN** Admin mở mục Concert
- **THEN** sidebar chính vẫn hiện và sidebar cấp hai mở bên cạnh trên desktop, với các đích Tất cả concert, Duyệt sự kiện và Vận hành suất diễn
- **AND** mỗi đích mở trang trong `/admin` và dùng phạm vi nền tảng.

#### Scenario: Organizer opens Concert
- **GIVEN** tổ chức đang chọn cấp quyền `EVENTS`
- **WHEN** Organizer mở mục Concert
- **THEN** sidebar cấp hai cho phép mở danh sách concert và tạo concert cho tổ chức đó
- **AND** khi mở concert, người dùng có thể chuyển giữa các phần được phép như tổng quan, thông tin và suất diễn, vé và sơ đồ, khách mời, check-in hoặc trạng thái duyệt mà vẫn thấy concert và suất đang chọn.

#### Scenario: User opens a concert-specific tool
- **WHEN** người dùng đã chọn concert hoặc suất có dữ liệu cho công cụ
- **THEN** các đích như hạng vé, khách mời, báo cáo theo concert và trạng thái duyệt được mở từ ngữ cảnh đó
- **AND** việc chuyển phần giữ lựa chọn concert và suất khi hợp lệ, đồng thời thay nội dung chính mà không thêm sidebar cấp ba.

#### Scenario: User has no event access
- **GIVEN** thành viên của tổ chức chỉ có `FINANCE` và thiếu `EVENTS`
- **WHEN** thành viên mở workspace hoặc truy cập trực tiếp đường dẫn Concert
- **THEN** điều hướng Concert được ẩn và URL không hiển thị dữ liệu Concert bị hạn chế
- **AND** trạng thái quyền có lối về dashboard hoặc Báo cáo tài chính được phép.

### Requirement: Concert navigation works across widths and input methods

Điều hướng hai cấp SHALL có thao tác bàn phím, trạng thái hiện tại rõ ràng và cách mở hoặc thu gọn phù hợp với kích thước màn hình.

#### Scenario: User operates both levels with the keyboard
- **WHEN** người dùng đến mục Concert bằng bàn phím và nhấn Enter hoặc Space
- **THEN** trạng thái mở được công bố, mục con truy cập được theo thứ tự và đích hiện tại có chỉ báo nhìn thấy được
- **AND** khi thu gọn, mục ẩn rời thứ tự focus và focus vẫn nằm ở điểm điều khiển có thể tiếp tục thao tác.

#### Scenario: User works in a narrow viewport
- **WHEN** người dùng mở Concert trên điện thoại, máy tính bảng hẹp hoặc ở mức zoom làm giảm vùng nội dung
- **THEN** hai cấp xuất hiện trong vùng điều hướng có nút mở hoặc quay lại rõ ràng
- **AND** khi đóng vùng điều hướng, focus trở về nút mở hoặc đến tiêu đề trang vừa chọn
- **AND** thao tác và chỉ báo focus vẫn đọc được ở giao diện sáng và tối, không cuộn ngang cả trang.

### Requirement: Concert routes preserve workspace and context

Các URL và lối vào hiện có SHALL tiếp tục mở bản ghi được phép trong workspace của vai trò tương ứng.

#### Scenario: User follows a saved concert URL
- **WHEN** người dùng mở, tải lại hoặc quay lại qua lịch sử trên đường dẫn chi tiết, vé, khách mời, xem trước hoặc duyệt đã lưu
- **THEN** ứng dụng mở đích được phép, đồng bộ hai cấp điều hướng với URL và giữ tham số concert, suất, tab hoặc đường trở về đang có tác dụng
- **AND** đường dẫn Admin tiếp tục nằm trong `/admin`.

#### Scenario: Organizer changes the working organization
- **WHEN** Organizer chuyển tổ chức khi đang mở chi tiết hoặc truy cập một concert thuộc tổ chức khác
- **THEN** giao diện bỏ ngữ cảnh cũ và điều hướng về một đích được phép hoặc hiển thị trạng thái truy cập phù hợp
- **AND** dữ liệu và hành động của tổ chức trước không xuất hiện trong tổ chức mới.

### Requirement: Consistent organizer concert creation

Các lối tạo concert chính của Organizer SHALL mở cùng một quy trình có hướng dẫn và giữ khả năng quản lý bản ghi cũ.

#### Scenario: Organizer starts or resumes concert preparation
- **WHEN** Organizer có `EVENTS` chọn Tạo concert từ Dashboard hoặc sidebar Concert
- **THEN** cả hai mở luồng thông tin, suất diễn, vé và sơ đồ, gửi duyệt trong phạm vi tổ chức hiện tại
- **AND** sau khi lưu và mở lại bản nháp, Organizer thấy phần đã lưu và việc cần làm tiếp.

#### Scenario: Organizer opens an existing legacy concert
- **WHEN** Organizer chọn một concert cũ từ danh sách hoặc URL đã lưu
- **THEN** bản ghi hiện có và các thao tác được cấp quyền vẫn mở được trong ngữ cảnh Concert của Organizer.

#### Scenario: Admin assists an organization with a concert
- **WHEN** Admin có quyền dùng chức năng tạo sự kiện hộ
- **THEN** Admin có thể mở luồng hiện có trong Admin, chọn tổ chức sở hữu rõ ràng và thấy chủ sở hữu sau khi lưu
- **AND** quy trình ghi nhận người thực hiện, duyệt và phát hành hiện có tiếp tục áp dụng.

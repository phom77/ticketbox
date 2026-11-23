# Design

## Context

Web hiện dùng `OperationsLayout` cho cả hai vai trò, với route riêng và bộ chọn tổ chức ở Organizer. Sidebar Admin trỏ Concert sang `/organizer/events`. Tạo concert chính ở Tổng quan Organizer mở form cũ, còn danh sách theo mô hình Event–Performance mở luồng có hướng dẫn. Catalog đã có liên kết và các view tương thích cho concert cũ. Ticketing cung cấp đối soát, doanh số Organizer cho concert đã hoàn thành và hàng chờ hỗ trợ theo loại. Xem [proposal](proposal.md), [route hiện có](../../../frontend/src/app/App.tsx) và [quyền hiện có](../govern-organizer-onboarding-and-publishing/design.md).

## Goals / Non-Goals

Giữ một khung giao diện với hệ thống thiết kế hiện có và hai cấu hình điều hướng độc lập. Người dùng đi từ dashboard đến hành động hoặc báo cáo mà vẫn giữ phạm vi làm việc. Mỗi dịch vụ giữ quyền sở hữu và kiểm tra phạm vi của dữ liệu nguồn. Phạm vi thiết kế giới hạn ở workspace, dữ liệu đọc phục vụ tổng quan và báo cáo. Các thao tác ghi tiếp tục qua luồng tạo, duyệt, phát hành và xử lý gián đoạn hiện có.

## Decisions

### Điều hướng, bố cục và URL

| | Admin | Organizer |
|---|---|---|
| Sidebar chính | Dashboard, Concert, Đơn hàng & hỗ trợ, Báo cáo, Tổ chức, Cài đặt | Dashboard, Concert, Báo cáo, Thành viên theo quyền |
| Sidebar Concert | Tất cả concert, Duyệt sự kiện, Vận hành suất diễn, Tạo sự kiện hộ | Tất cả concert, Tạo concert |
| Khi đã chọn concert | Ngữ cảnh tổ chức, tổng quan, duyệt và vận hành, vé hoặc khách mời theo chức năng sẵn có | Tổng quan, thông tin và suất, vé & sơ đồ, khách mời, check-in, trạng thái duyệt |
| Báo cáo riêng | `/admin/reports` với Vận hành và Đối soát | `/organizer/reports` với Vận hành theo `EVENTS`, Đối soát và Doanh thu theo `FINANCE` |

- Dùng mục Concert như nút đóng mở có tên và trạng thái. Trên desktop, sidebar cấp hai nằm cạnh sidebar chính và mở khi URL thuộc nhóm Concert. Nội dung dùng phần chiều rộng còn lại. Khi không đủ chỗ, dùng hai cấp trong cùng vùng điều hướng thu gọn có thao tác quay lại. Kiểm tra thứ tự focus, tương phản, nhãn hiện tại và bản dịch trên cả hai giao diện sáng và tối. Cách này giữ ngữ cảnh khi chuyển trang mà chỉ cần mở thêm sidebar ở nhóm có nhiều công việc liên quan.
- Thêm danh sách platform `/admin/events` và điểm vào chi tiết cho Event mới trong Admin, còn Duyệt sự kiện và Vận hành suất diễn có thể dùng tiếp route Admin hiện có. `/organizer/events` là danh sách duy nhất trên sidebar Organizer. Các nút chính vào `/organizer/events/new`. Danh sách hợp nhất nhận diện concert cũ qua liên kết Catalog và mở đúng trình quản lý tương ứng. Các URL cũ vẫn phân giải trong đúng workspace với tham số đang có tác dụng, bao gồm `show`, `tab`, `concertId`, `returnTo` và `create=1`. Giữ chức năng Tạo sự kiện hộ trong Admin, có thể mở từ hồ sơ tổ chức với tổ chức điền sẵn và hiển thị rõ chủ sở hữu trước khi lưu.
- Mục báo cáo riêng phục vụ dữ liệu nhiều concert. Liên kết **Xem báo cáo** trong sidebar cấp hai nạp sẵn bộ lọc concert hoặc suất. Đường trở về giữ bộ lọc danh sách và suất đã chọn, với đích trở về nội bộ cùng workspace. Đơn hàng toàn nền tảng nằm ở Đơn hàng & hỗ trợ. Đơn hàng của tổ chức đặt trong ngữ cảnh tài chính, với đường mở đơn liên quan từ concert theo quyền. Các công cụ hạng vé, khách mời và check-in chỉ xuất hiện trong ngữ cảnh phù hợp. Báo cáo và các trang chi tiết có trạng thái URL đủ để dùng liên kết đã lưu, tải lại và dùng Back/Forward.

### Dashboard và dữ liệu vận hành

| Chỉ số | Đơn vị và quy tắc | Đích mở chi tiết |
|---|---|---|
| Admin, chờ duyệt | Số hồ sơ đang chờ quyết định trên concert cũ và suất mới, mỗi hồ sơ đang có hiệu lực một lần | Duyệt sự kiện lọc chờ duyệt |
| Admin, đơn cần hỗ trợ | Số bản ghi trong từng loại hàng chờ đang mở. Một đơn có thể thuộc nhiều loại | Hàng chờ hỗ trợ đúng loại |
| Organizer, đang chuẩn bị | Số concert phân biệt có suất nháp, hoặc concert mới chưa có suất | Danh sách Concert lọc đang chuẩn bị |
| Organizer, cần chỉnh sửa | Số concert phân biệt có quyết định hiện hành yêu cầu chỉnh sửa | Danh sách Concert lọc cần chỉnh sửa, mở lý do và suất liên quan |
| Cả hai, đang mở bán | Số suất công khai, ở trạng thái mở bán, đang trong thời gian bán và chưa bị tạm dừng theo trạng thái Catalog | Báo cáo Vận hành lọc đang mở bán |
| Cả hai, bảy ngày tới | Số suất đã qua bản nháp, chưa hủy hoặc hoàn tất, có lịch bắt đầu từ thời điểm hiện tại đến cùng thời điểm sau bảy ngày theo giờ Việt Nam | Báo cáo Vận hành cùng kỳ và trạng thái |

- Dùng số tổng có phân trang của hàng chờ hỗ trợ theo loại. Hàng chờ duyệt, danh sách suất và danh sách concert đang có giới hạn hoặc phạm vi hẹp hơn dashboard. Bổ sung truy vấn đọc tại Catalog cho các bộ đếm, danh sách và báo cáo cần lọc chính xác. Kết quả phân trang và tổng hợp dùng cùng bộ lọc. Dùng các view Event–Performance tương thích bản ghi cũ và bảng trạng thái duyệt tương ứng, đếm một lần qua liên kết legacy. Dùng các dữ liệu người dùng được phép xem, với trạng thái nguồn và mốc thời gian nhất quán cho từng truy vấn. Ghi rõ mốc tính giờ Việt Nam trong UI. Khi dashboard mở báo cáo hoặc danh sách có bộ lọc theo thời điểm, truyền cùng khoảng thời gian hoặc bộ lọc để kiểm tra được ý nghĩa con số.
- Mỗi nhóm tải độc lập, có giới hạn số dòng ưu tiên và đường mở danh sách đầy đủ. Dashboard dùng mục sắp đến hạn hoặc cần hành động, lấy dữ liệu từ hàng chờ hiện có và các truy vấn đã phân quyền. Báo lỗi theo nhóm, giữ nhóm khác dùng được và cung cấp thử lại. Khi đổi tổ chức hoặc quyền, hủy các request cũ và làm mới ngữ cảnh, kể cả cache, đường dẫn và trạng thái panel.
- Báo cáo Vận hành dùng kỳ theo thời điểm bắt đầu suất, bộ lọc concert, suất khi được mở từ chi tiết, trạng thái và tổ chức đối với Admin. Hiện số kết quả, cột thời gian kèm múi giờ, tình trạng phát hành, vé và check-in theo dữ liệu đã có ở nguồn. Hiển thị tình trạng chưa có dữ liệu riêng với trạng thái chưa đồng bộ. Khoảng truy vấn dùng cận dưới bao gồm, cận trên loại trừ, được diễn giải rõ ở UI. Báo cáo và danh sách chi tiết giữ phân trang phía server.

### Báo cáo tài chính và quyền

- Đưa màn hình đối soát hiện có vào Báo cáo như một góc nhìn riêng, giữ route cũ hoạt động. Dùng báo cáo và CSV của Ticketing với cùng kỳ, múi giờ, mốc khởi tạo hoặc xác minh thu, bộ lọc concert và phạm vi. Hiển thị riêng doanh số đơn đã thanh toán, khoản thu xác minh, thời điểm đồng bộ và khoản hoàn đã ghi nhận trên từng giao dịch. Ở Admin, ghi rõ phạm vi các tổ chức đã gắn và cách chuyển sang giao dịch chưa gắn tổ chức. Các số liệu tài chính dùng định nghĩa của [spec đối soát](../vnpay-merchant-and-sales-reconciliation/specs/vnpay-merchant-reconciliation/spec.md).
- Giữ báo cáo Doanh thu hiện có cho concert đã hoàn thành mà dữ liệu nguồn hỗ trợ và có quyền `FINANCE`. Gắn nhãn bộ lọc ngày cho xu hướng theo ngày, gắn nhãn tổng và tệp CSV/PDF theo toàn concert. Khi đi từ một suất chưa có hợp đồng tài chính theo suất, giữ bộ lọc suất ở Vận hành. Chỉ mở sang Tài chính với ngữ cảnh concert nếu dữ liệu nguồn hỗ trợ và giao diện nói rõ phạm vi.
- `ADMIN` dùng quyền nền tảng cho truy vấn và xuất dữ liệu. Organizer dùng tổ chức đang chọn và quyền `EVENTS`, `FINANCE` hoặc `MEMBERS` theo đích. Cả endpoint mới lẫn endpoint được dùng lại phải thực thi quyền và phạm vi trước khi truy vấn. Hệ thống giữ các chính sách duyệt, công khai, thời gian mở bán, hoãn/hủy và kiểm tra quyền hiện có của từng thao tác ghi.

## Risks / Trade-offs

- **Hai mô hình concert có thể bị đếm trùng** → dùng liên kết Event–Performance, kiểm tra phân trang và tổng với dữ liệu thử gồm concert cũ, concert nhiều suất, concert chưa có suất và nhiều trạng thái trên cùng concert.
- **Tổng và chi tiết có thể lệch do nhãn kỳ hoặc trạng thái** → định nghĩa bộ lọc ở nguồn, dùng chung cho số tổng và drill-down, kiểm tra kỳ, múi giờ, hủy bán và làm mới dữ liệu.
- **Hai sidebar thu hẹp nội dung** → dùng trạng thái thu gọn theo bề rộng, giữ cuộn ngang trong vùng bảng cần thiết, kiểm bằng bàn phím trên desktop, tablet, điện thoại và khi zoom.

## Migration Plan

Triển khai theo lát có thể kiểm tra độc lập. Bắt đầu với điều hướng, tiếp theo là dữ liệu đọc, danh sách và chi tiết concert, báo cáo, rồi dashboard. Báo cáo và danh sách đã dùng được khi dashboard bắt đầu dẫn tới chúng. Triển khai dịch vụ sở hữu hợp đồng đọc mới trước giao diện phụ thuộc. Giữ route cũ và các hợp đồng ghi hiện có để có thể quay lui giao diện mà vẫn mở được bản ghi, chứng từ và hàng chờ. Các delta dùng chung capability `operations-workspaces` với change quản trị Organizer và bổ sung các yêu cầu riêng.

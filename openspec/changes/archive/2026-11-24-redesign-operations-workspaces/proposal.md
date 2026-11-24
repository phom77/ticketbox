# Proposal

## Why

Admin hiện có mục Concert dẫn sang workspace Organizer và gặp rào cản thành viên tổ chức. Organizer có hai điểm tạo concert dẫn đến hai luồng khác nhau, còn trang đầu của cả hai workspace chưa cho người dùng thấy rõ tình hình, việc cần làm tiếp và nơi xem số liệu chi tiết.

## What Changes

- Gom các công việc theo concert vào mục **Concert** ở sidebar chính của từng vai trò. Khi mở mục này trên desktop, sidebar thứ hai xuất hiện bên cạnh và hiển thị các đích theo vai trò, quyền và concert hoặc suất diễn đang chọn.
- Admin dùng Concert để tra cứu, duyệt và vận hành trên toàn nền tảng. Organizer dùng Concert để tạo và quản lý concert của tổ chức đang chọn, với một điểm vào thống nhất cho luồng tạo có hướng dẫn.
- Thiết kế lại **Dashboard** cho từng vai trò. Hiển thị tổng quan, việc cần chú ý và lối vào danh sách hoặc báo cáo đã lọc theo cùng ngữ cảnh.
- Tạo trang **Báo cáo** riêng trong từng workspace. Báo cáo vận hành trình bày dữ liệu theo kỳ và theo concert hoặc suất diễn. Các báo cáo tài chính hiện có được đưa vào đúng phạm vi và quyền, với bộ lọc, chi tiết và chức năng xuất hiện có.
- Giữ truy cập các concert cũ, chi tiết đã lưu, liên kết từ hàng chờ duyệt và luồng tạo sự kiện hộ hiện có. Giữ nguyên chính sách quyền theo tổ chức, duyệt, phát hành và xử lý gián đoạn.

## Capabilities

### New Capabilities

- `operations-reporting` bao gồm dashboard theo vai trò, báo cáo vận hành chi tiết và các góc nhìn tài chính theo quyền.
- `operations-workspaces` bổ sung điều hướng Concert hai cấp, đường dẫn trong cùng workspace và điểm vào tạo concert thống nhất. Dùng cùng đường dẫn capability với [delta đang triển khai](../govern-organizer-onboarding-and-publishing/specs/operations-workspaces/spec.md), hiện chưa được đồng bộ vào spec chính.

### Modified Capabilities

## Impact

- Web gồm khung điều hướng, route, dashboard, danh sách và chi tiết concert, trang báo cáo, bản dịch và các bài kiểm tra trình duyệt của hai vai trò.
- Danh sách và số liệu dùng các API hiện có khi đủ phạm vi và ý nghĩa. Chỉ bổ sung truy vấn đọc có phân quyền tại dịch vụ sở hữu dữ liệu cho số liệu chưa có hợp đồng tương ứng.
- Thiết kế kế thừa [quy định về quyền, duyệt và phát hành](../govern-organizer-onboarding-and-publishing/design.md), [luồng concert và sơ đồ](../redesign-concert-and-seating/proposal.md), [kế hoạch triển khai concert hiện có](../../../docs/superpowers/plans/2026-11-20-concert-and-seating.md) và [phản hồi UX](../../../docs/product/organizer-concert-ux-feedback.md).

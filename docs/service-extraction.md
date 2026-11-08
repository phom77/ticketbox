# Phase 2–4 — Identity, Catalog, Check-in và Ticketing

## Triển khai

Compose mặc định chạy sáu Spring Boot process, sáu PostgreSQL instance, gateway, Redis, RabbitMQ và SMTP sink. Identity sở hữu account/role/profile. Catalog sở hữu concert, ticket type và AI jobs. Ticketing sở hữu stock, holds, quota, Order event stream, payment workflow và phát hành vé. Check-in sở hữu admission ledger, guest list và CSV jobs. Payment và Notification giữ hợp đồng version 1.

Mỗi service sở hữu mã Java, test và tài nguyên Flyway trong `services/<name>/`. Compose build từng ứng dụng từ thư mục service tương ứng. Maven reactor ở gốc kiểm tra cả sáu service, còn `backend/` build và kiểm tra Core legacy riêng.

Các bảng concerts và ticket_types bên Ticketing/Check-in là projection của Catalog. Bảng tickets bên Check-in là projection phát hành kết hợp trạng thái sử dụng tại cổng. Các FK xuyên chủ sở hữu được thay bằng ID và luồng đồng bộ. Transaction tạo đơn, stock, Order event và phát hành vé ở Ticketing DB.

## Cấu hình bán và tồn kho

Catalog ghi metadata cùng sale_config_outbox trong một transaction. Một cấu hình chứa phiên bản, concert đầy đủ và danh sách hạng vé đầy đủ. Receiver áp dụng trong transaction, giữ khóa theo concert và ghi projection_versions. Phiên bản cũ hoặc đã xử lý được bỏ qua. Từng bên có ACK riêng trong outbox. Mất phản hồi được xử lý bằng cách gửi lại cùng phiên bản.

Sau khi transaction chỉnh cấu hình bán commit, API đợi Ticketing ACK trước khi trả thành công. Nếu liên lạc thất bại, cấu hình đã lưu vẫn được worker gửi lại. Người vận hành kiểm tra trạng thái đã lưu trước khi tạo lại một tài nguyên.

Giá, số lượng và việc thêm/xóa hạng vé được chỉnh ở trạng thái DRAFT. Bật/tắt hạng vé trong thời gian bán vẫn được hỗ trợ. Quy tắc này ngăn thay đổi cấu hình hàng đang có phân bổ qua hai database. Ticketing chỉ resize stock còn nguyên vẹn. Catalog phục vụ bản sao availability cập nhật định kỳ, với cache hiện có.

Ticketing ghi checkin_ticket_outbox cùng transaction phát hành hoặc cập nhật vé. Check-in ghi projection và version cùng transaction, rồi trả ACK. Gửi lại snapshot VALID không xóa một lượt đã được chấp nhận. Check-in phát admission outbox về Ticketing để cập nhật trạng thái vé cho các màn hình lịch sử. Quyền quyết định tại cổng thuộc Check-in.

## Soát vé trên LAN

Mỗi deployment có đúng một Check-in database có quyền quyết định cho vào cổng. Các máy quét cùng kết nối authority đó, trực tiếp trên LAN hoặc qua gateway. Khóa duy nhất trên checkin_logs.ticket_id, kết hợp conditional update, chỉ nhận một lượt cho mỗi vé.

EXPO_PUBLIC_ADMISSION_API_BASE_URL cho phép scanner dùng địa chỉ LAN riêng cho các API staff. JWT được lấy trước ca. Check-in dùng concert/ticket projection tại chỗ nên vẫn có thể quét khi Identity, Catalog hoặc Ticketing tạm thời mất kết nối. Chuẩn bị dữ liệu trước ca và theo dõi các bản cập nhật chưa đồng bộ.

Khi thiết bị mất cả kết nối đến authority, app lưu lượt quét PENDING và yêu cầu xác nhận trước khi cho vào. Batch offline gửi lại đúng staff, thiết bị, thời gian và nội dung cũ trả ACCEPTED cho lượt đã xử lý. Lượt từ máy khác trả SKIPPED. Giữ cùng authority khi mất WAN, vì hai database Check-in độc lập có thể cùng nhận một mã.

## Khởi chạy và kiểm tra

~~~sh
export E2E_PROJECT=ticketbox-e2e-split E2E_PORT=18096 APP_PORT=18096 CHECKIN_PORT=18097
docker compose -p "$E2E_PROJECT" up -d --build
python scripts/e2e/split.py
python scripts/e2e/split-restore.py
~~~

Các acceptance script chỉ chạy với project ticketbox-e2e-*. Ví dụ dùng E2E_PROJECT=ticketbox-e2e-split, E2E_PORT=18096, APP_PORT=18096 và CHECKIN_PORT=18097 khi khởi động Compose. Python 3 dùng thư viện chuẩn. CI Java có thêm reactor từ pom.xml gốc.

## Chuyển dữ liệu đã có

Quy trình cutover từ Core V34 nằm trong [runbook legacy](../legacy/core/README.md#chuyển-dữ-liệu-đã-có).

## Bằng chứng kiểm thử

Đợt Phase 2–4 được kiểm tra bằng 166 test backend, 3 test projection trên PostgreSQL thực, 13 test Payment và 4 test Notification. Scanner qua typecheck. Tám kịch bản E2E bao phủ JWT/RBAC, sale ACK, thanh toán, soát vé đồng thời, mất kết nối đến các service nguồn, replay, CSV và AI.

Bài cutover giữ được đơn đang chờ và payment attempt ID, khôi phục đơn bằng idempotency key và xử lý callback lặp với một vé. Startup fence của Core cũ và service đích chưa hoàn tất đã được kiểm tra. Sequence Spring Batch được chuyển với ID tiếp theo lớn hơn ID đã nhập.

Bài restore đối chiếu dữ liệu của cả sáu database rồi khởi động ứng dụng trên bản sao, kiểm tra đăng nhập, lịch sử đơn và notification, cùng xác nhận không gửi lại email lịch sử. Bằng chứng nằm tại .artifacts/verification/phase-2-4/summary.json.

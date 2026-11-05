# TicketBox phương án B — Implementation Plan

**Goal:** Chuyển dần từ Core + Payment + Notification sang sáu service có dữ liệu riêng, áp dụng event sourcing cho Order và thực hành PostgreSQL replication/partitioning.

**Architecture:** Order, stock, holds, quota và phát hành vé cùng thuộc Ticketing. PostgreSQL lưu order stream và outbox trong cùng transaction với thay đổi nghiệp vụ. Catalog và Ticketing có read replica trong profile lab.

**Tech Stack:** Java 21, Spring Boot, Spring Modulith, PostgreSQL 16, Flyway, Redis, RabbitMQ, Docker Compose, Testcontainers.

**Spec:** Phương án B và deployment view đã trao đổi trong chat. Kiến trúc gốc nằm trong `docs/architecture.md`, cấu hình triển khai gốc trong `compose.yaml`. Đây là roadmap cấp đợt. Mỗi đợt tách service cần kế hoạch triển khai chi tiết theo API và bảng đang tồn tại.

## Ràng buộc chung

- Bảo toàn API của web/scanner và các định danh nghiệp vụ khi di chuyển dữ liệu. Payment và Notification giữ database riêng và hợp đồng hiện hành cho đến khi có phiên bản thay thế đã kiểm chứng.
- Mỗi dữ liệu nghiệp vụ có một service sở hữu và một đường ghi có thẩm quyền. Service khác dùng API hoặc projection từ sự kiện.
- Flyway migration đã phát hành được giữ nguyên. Thử cutover và khôi phục trên dữ liệu sao chép trước.
- Các quyết định về stock, quota, tiền, trạng thái checkout mới nhất và vé đã dùng đi qua primary của service sở hữu.
- Mỗi đợt kết thúc bằng bản có thể demo. Chạy kiểm thử liên quan và lưu kết quả trước khi chuyển đợt.

## Đợt 0 — Chốt baseline và Blueprint

**Điểm chạm:** `docs/architecture.md`, `docs/api.md`, `compose.yaml`, `contracts/`, `scripts/ci/`, `scripts/e2e/`.

- [ ] Lập ma trận yêu cầu đề bài → service sở hữu → API/event → tiêu chí nghiệm thu. Ghi rõ kiểm thử mock, sandbox và tải thực nghiệm.
- [ ] Chốt C4 Context/Container, deployment view, bảng ownership và các ranh giới transaction. Kiểm kê FK, truy vấn báo cáo và các API nội bộ cần đổi khi tách.
- [ ] Chạy `pwsh -File scripts/ci/verify.ps1` và `pwsh -File scripts/e2e/run.ps1 -Build` trong môi trường có Docker. Lưu kết quả baseline, seed và quy trình restore.

**Qua đợt khi:** Có đường chuẩn để so sánh checkout, thanh toán đến muộn và scanner trước/sau từng cutover.

## Đợt 1 — Order Event Sourcing trong Core

**Điểm chạm:** `backend/src/main/java/com/ticketbox/module/ticket/`, `backend/src/main/resources/db/migration/`, các integration test của Ticketing và Payment.

- [ ] Thêm order stream append-only, khóa `(order_id, stream_version)`, phiên bản payload và API nội bộ append theo expected version. Khi hai lệnh cạnh tranh cùng version, chỉ một lần append được commit.
- [ ] Chuyển toàn bộ đường ghi Order, gồm tạo, thanh toán, hủy và hết hạn, sang append event. Ghi event, thay đổi stock/hold/quota, phát hành vé hoặc inbox/outbox liên quan trong một transaction theo từng nghiệp vụ. Bảng phục vụ truy vấn trở thành projection.
- [ ] Viết replay projection độc lập với worker phát side effect. Kiểm tra trùng, sai thứ tự, resume sau crash và rebuild trong bảng tạm trước khi chuyển read model.
- [ ] Thử migration trên bản sao. Với đơn cũ, dùng sự kiện khởi tạo từ snapshot tại cutover, ghi rõ phạm vi lịch sử bắt đầu từ mốc này. Khóa đường ghi cũ khi backfill/chuyển quyền và đối chiếu trạng thái, số tiền, stock, vé trước khi mở ghi lại.

**Qua đợt khi:** Cạnh tranh vé cuối/quota vẫn đúng. Callback trùng hoặc đến muộn giữ đúng hành vi. Rebuild ra cùng trạng thái và không tạo thêm vé, email hay lần gọi provider.

## Đợt 2 — Tách Identity và Catalog lần lượt

**Điểm chạm:** `backend/.../module/auth/`, `backend/.../module/concert/`, `backend/.../module/ai/`, `services/identity/`, `services/catalog/`, `infra/nginx/gateway.conf`.

- [ ] Tách Identity và PostgreSQL riêng. Di chuyển user, role, thông tin đăng nhập, giữ ID. Kiểm tra tương thích JWT và RBAC trên web, scanner, Payment và Notification trước khi đổi route.
- [ ] Tách Catalog và PostgreSQL riêng. Di chuyển concert, sơ đồ khu, AI jobs và các tệp theo quyền sở hữu. Catalog đọc stock projection, Ticketing giữ stock thật. Kiểm tra cache và khả năng browse khi Payment lỗi.
- [ ] Chốt hợp đồng cấu hình bán vé có phiên bản. Ticketing áp dụng cấu hình và xác nhận hiệu lực trước khi giao diện báo mở bán. Ticketing kiểm tra cửa sổ bán, giá và quota trên dữ liệu đã áp dụng tại thời điểm checkout.

**Qua đợt khi:** Có hai cutover độc lập. Đăng nhập/role và chỉnh sửa concert vẫn hoạt động. Checkout dùng giá và chính sách bán đúng phiên bản.

## Đợt 3 — Tách Check-in và hoàn thiện offline

**Điểm chạm:** `backend/.../module/checkin/`, phần guest list trong `backend/.../module/admin/`, `services/checkin/`, `mobile-scanner/`, `contracts/`.

- [ ] Tách Check-in và PostgreSQL riêng. Backfill danh sách vé hợp lệ và vé đã dùng. Bắt kịp sự kiện phát hành/hủy hiệu lực từ Ticketing rồi mới chuyển API scanner. Check-in sở hữu ledger với khóa duy nhất theo vé.
- [ ] Chuyển CSV worker và guest list cùng service. Kiểm tra file lỗi, file nhập lại và tác vụ đang chạy khi worker restart.
- [ ] Giải quyết chống vào cổng hai lần bằng một authority trên LAN tại sân khi mất Internet. Chốt quy tắc quyền quyết định giữa LAN và cloud trong ca soát vé. Khi mất luôn kết nối đến authority, app lưu lượt quét chờ xử lý và phân biệt rõ với lượt được phép vào.

**Qua đợt khi:** Hai máy quét cùng vé chỉ có một lượt được cấp quyền. Mất Internet, đồng bộ lại hoặc gửi lại batch vẫn giữ dữ liệu và không nhân đôi lượt.

## Đợt 4 — Đưa Ticketing ra khỏi Core

**Điểm chạm:** `backend/.../module/ticket/`, `backend/.../module/inventory/`, `backend/.../module/queue/`, `services/ticketing/`, `services/payment/`, `services/notification/`, `compose.yaml`, gateway và contracts.

- [ ] Đưa Order, inventory, hold, quota, admission và phát hành vé sang Ticketing với PostgreSQL riêng. Giữ Redis admission và chuyển luồng Payment intent/result/ACK sang endpoint mới.
- [ ] Đối chiếu và chuyển cả đơn đang chờ, hold chưa hết hạn, idempotency key, payment intent, inbox/outbox. Tạm khóa writer và job cũ, bắt kịp dữ liệu, chuyển route rồi mở writer mới. Thử callback đến đúng lúc cutover.
- [ ] Đổi luồng Notification lấy contact từ Identity và e-ticket từ Ticketing. Chuyển báo cáo sang API/read model của bên sở hữu. Gỡ Core khỏi topology mặc định sau khi kiểm kê route và job hoàn tất.
- [ ] Ghi quy trình rollback trước khi writer mới hoạt động. Sau khi phát sinh ghi ở DB mới, quy trình phục hồi phải đồng bộ dữ liệu hoặc khôi phục tiến về phía trước, thay vì đổi route về DB cũ.

**Qua đợt khi:** Sáu service sở hữu sáu DB. Luồng mua, trả tiền, phát hành, gửi thông báo, soát vé và báo cáo chạy xuyên hệ thống.

## Đợt 5 — Lab primary/read replica

**Điểm chạm:** Compose override dành cho lab, `infra/postgres/`, datasource Catalog/Ticketing và monitoring.

- [x] Thêm một hot standby cho Catalog, kiểm tra đọc công khai từ replica khi cache miss. Sau đó thêm standby cho Ticketing và route lịch sử/báo cáo có thể trễ.
- [x] Giữ ghi, checkout recovery và đọc cần thấy dữ liệu vừa ghi ở primary. Tạo replication lag có chủ đích và xác nhận các API quan trọng vẫn trả đúng dữ liệu.
- [x] Đo lag, diễn tập mất replica và promote thủ công trong lab. Chặn writer primary cũ trước khi mở ghi trên primary mới và ghi lại phần dữ liệu có thể mất với replication bất đồng bộ.

**Qua đợt khi:** Demo được read routing, stale reads và chuyển vai với một writer duy nhất.

## Đợt 6 — Lab partitioning

**Điểm chạm:** Flyway của Ticketing/Check-in, bộ tạo dữ liệu và kịch bản benchmark.

- [x] Thử hash partition `order_events` theo `order_id`. Giữ ràng buộc phiên bản stream và cách chống trùng request. So sánh bảng thường với bảng partition trên cùng dữ liệu và truy vấn.
- [x] Thử range partition theo tháng cho `scan_audit`. Giữ ledger quyết định vé đã dùng riêng. Kiểm tra truy vấn qua ranh giới tháng và thao tác lưu trữ dữ liệu cũ.
- [x] Đo bằng `EXPLAIN (ANALYZE, BUFFERS)`. Ghi số partition được quét, độ trễ đọc/ghi và chi phí vận hành. Dùng kết quả để quyết định cấu hình mặc định.

**Qua đợt khi:** Chứng minh được pruning và kiểm tra invariants trước/sau migration. Event store giữ đầy đủ lịch sử cần cho replay.

## Đợt 7 — Nghiệm thu đồ án

- [ ] Kiểm tra lại ma trận yêu cầu, gồm RBAC, AI, CSV, thanh toán, scanner, cache và seed concert. Khởi chạy từ checkout sạch bằng README.
- [ ] Chạy tải theo giả định công bố. Tách tốc độ truy cập công khai và lượng người được nhận vào checkout. Đo latency, lỗi, cache hit, queue depth, lag và kiểm tra invariant sau tải.
- [ ] Chuẩn bị Blueprint, runbook và video demo. Ưu tiên bốn cảnh: tranh vé cuối, callback đến muộn/trùng, replay projection, và đọc replica khi có lag.

**Thứ tự phụ thuộc:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. Đợt 2 có hai lần bàn giao riêng. Sau mỗi đợt, có thể dừng để demo hoặc tiếp tục trên baseline đã kiểm tra.

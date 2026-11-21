# Concert and Seating Implementation Plan

**Goal** Sell GA, zones and numbered seats for individual performances of an event.

**Architecture** Catalog owns event and layout snapshots. Ticketing accepts complete sale revisions and runs the purchase transaction. Check-in authorizes physical admission for a performance.

**Tech stack** Spring Boot, PostgreSQL 16, Flyway, Redis, React and TypeScript.

**Specs and tracking** [OpenSpec](../../../openspec/changes/redesign-concert-and-seating/tasks.md) · [Accepted design](../../../openspec/changes/redesign-concert-and-seating/design.md)

## Global constraints

Use the current service boundaries and preserve released migration checksums. Keep event identity, order identity, public URLs and QR history for v1. Preserve canonical primary writes, service authentication, publication replay and provider confirmation. Use focused test–implementation–verification cycles. The coordinator reviews the combined diff and makes ordered commits.

## Work ownership and interfaces

| Commit area | Owner | Interface and verification |
| --- | --- | --- |
| Decisions and contracts | Coordinator | `docs/adr/0003-event-performance-and-inventory.md`, owner glossaries, v2 JSON schemas, gateway routes. Validate examples and backward compatibility. |
| Catalog performances and layouts | Catalog agent | `services/catalog` performance capability. Public event detail and map section reads, organizer CRUD and publication, internal sale snapshot. Verify with real PostgreSQL and scoped requests. |
| Ticketing stock and settlement | Ticketing agent | `services/ticketing` version receiver, one-writer mode, holds, order creation and issuance. Verify contested GA and seats, version/recovery and payment callback behavior. |
| Scoped admission | Admission agent | Check-in and Identity authorization and performance projection, ticket snapshot scope, QR scan/sync and shared results. Verify cross-organization, revocation and duplicate scans. |
| Buyer and organizer web | Coordinator | `frontend/src/api/performances.ts` and new performance screens, extending existing routes and components. Browser fixtures exercise two performances, section-only requests, stale results and keyboard/list fallback. |
| Combined deployment and rehearsal | Coordinator | Gateway journey, Compose and full repo gates. Keep operational acceptance tied to measured and available environments. |

## Review focus

- Malformed input, stale layout and authorization must fail before writes. Check the receiver and each public or organizer mutation.
- A version retry after partial communication must load one complete configuration and leave existing stock alone.
- A hold across two inventory groups fails as one unit on conflict. A late callback leaves stock subsequently acquired by another buyer intact.
- Changing organization, performance or section must discard prior requests, and map failure leaves the accessible selection list usable.
- Review deployment and restore with pending orders and receipts. Report any merchant, device or load evidence still pending separately.

## Cập nhật ngày 21/11/2026 — công cụ chuẩn bị và vận hành concert

**Mục tiêu.** Người tổ chức có thể bắt đầu bằng cách muốn khách chọn vé, tạo hoặc tái sử dụng sơ đồ, điền thông tin ở nơi cần dùng và xác minh suất trước khi phát hành. Admin nền tảng tìm được suất bằng thông tin thực tế, xem ảnh hưởng, rồi mới ra quyết định vận hành.

| Nguồn tham khảo | Quan sát | Quyết định cho TicketBox |
|---|---|---|
| [Eventbrite, hướng dẫn reserved seating](https://support.eventbrite.com/hc/en-us/articles/34824976033938-Create-a-reserved-seating-event) | Có sơ đồ trống, mẫu, dùng lại cấu hình địa điểm, chia hạng và chọn hàng loạt. | Hỏi khách sẽ chọn vé thế nào, sau đó đưa người dùng tới sơ đồ hoặc thẳng tới hạng vé. Mỗi suất giữ tồn kho riêng. |
| [Eventbrite, cập nhật tháng 11/2026](https://www.eventbrite.com/blog/roadmap-update-november-2026/) | Đơn giản hóa điều hướng quản trị và xây lại reserved seating nằm trong lộ trình. | Đánh giá theo tác vụ thực tế và trạng thái đã lưu. Nội dung lộ trình là kế hoạch của nhà cung cấp. |
| [Seats.io, lịch sử phát hành](https://docs.seats.io/page/changelog/) và [cách vẽ sơ đồ](https://docs.seats.io/docs/tutorial/draw-a-floor-plan/) | Hỗ trợ thao tác trực tiếp, vẽ hàng và cải thiện hiệu năng với bản đồ lớn ngày 14/10. Bổ sung hỗ trợ bàn phím cho người mua ngày 16/11 và canh hàng theo bậc ngày 18/11/2026. | Vẽ và di chuyển trên canvas, dựng nhiều hàng trong một thao tác, phóng to theo nhu cầu. Cung cấp đường thao tác bằng nút và danh sách. |
| [draw.io, cách dùng trình biên tập](https://www.drawio.com/docs/getting-started/) và [nhân bản hình](https://www.drawio.com/docs/manual/shapes/shape-duplicate/) | Canvas, palette, thuộc tính của vật thể đang chọn, thu phóng, nhân bản và hoàn tác làm giảm công việc lặp. | Giữ canvas và bảng thuộc tính cạnh nhau. Tự đặt tên/mã ban đầu và giữ số khu/hàng/ghế trong giao diện. |
| [Carbon Data Table](https://v10.carbondesignsystem.com/components/data-table/usage/) và [GOV.UK Task List](https://design-system.service.gov.uk/components/task-list/) | Tìm kiếm và lọc gần danh sách. Trạng thái gắn trực tiếp với tác vụ. | Danh sách tìm theo tên, địa điểm và trạng thái. Tách chi tiết suất, ảnh hưởng đơn và xác nhận thao tác ra khỏi danh sách. |

**Thực hiện.** Giữ sơ đồ và tồn kho theo phiên bản đang có. Dùng validator của Catalog làm nguồn quyết định tại lúc lưu và xuất bản. Tạo thao tác mới như chỉnh kích thước và sinh ghế trên dữ liệu nháp với ID ghế ổn định cho chỉnh hình, ID mới cho nhân bản. Các quyền vận hành tiếp tục do platform admin sở hữu. Truy vấn danh sách vận hành đọc các suất native đã phát hành. Người tổ chức vẫn dùng workspace của tổ chức.

**Nghiệm thu.** Vẽ một khu đứng và một khu ghế bằng chuột, thêm một đối tượng bằng bàn phím, sinh nhiều hàng có lối đi, kéo và đổi kích thước, nhân bản và hoàn tác, lưu rồi mở lại và kiểm tra ID. Chạy bản đồ nhập SVG/CSV và mua ghế có nhiều giá. Kiểm tra tìm suất vận hành và từ chối quyền ngoài phạm vi. Đo và xem thực tế ở desktop, tablet và mobile. Tách đợt kiểm thử tải của sơ đồ cấp sân vận động khỏi kiểm thử hành trình này.

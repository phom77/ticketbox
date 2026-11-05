# Quyền sở hữu mã nguồn TicketBox

Bản đồ này dùng baseline `e19658119e6258878b0827dd076eab508761bdbf` (`codex/service-ownership-baseline`). Đích trong bảng là nơi triển khai cho cụm sáu service. Các lớp trong `backend/` tiếp tục phục vụ Core legacy và diễn tập cutover.

| Service | Entry point và đường đi |
|---|---|
| Identity | `IdentityApplication` quét `auth` (login, profile, quản lý user và repository). `IdentityInternalApi` thực hiện contact lookup. Tách cấu hình JWT, security và cutover từ `SplitCommon` theo Task 2. |
| Catalog | `CatalogApplication` quét `concert` và `ai`. `SaleActivation` và `CatalogPublisher` công bố cấu hình bán, `CatalogInventory` đọc availability cục bộ. Các thao tác ghi concert và hạng vé thuộc Catalog. |
| Check-in | `CheckinApplication` quét `checkin` và import các bean guest list/batch. `LocalTickets`, `ProjectionApi` và `AdmissionPublisher` dẫn tới projection, ledger và admission feedback. Tạo truy vấn concert cục bộ thay cho các adapter concert đang import. |
| Ticketing | `TicketingApplication` quét `ticket`, `queue`, `inventory` và import báo cáo, payment remote, reminder. `StockApi`, `TicketPublisher`, `AdmissionProjectionApi`, `IdentityContacts` và `Reminders` nối các chức năng này qua hợp đồng hiện có. Concert dùng cho checkout, reminder và báo cáo là projection Ticketing. |
| Payment | `PaymentApplication` → `PaymentApi` → `PaymentFacade`, `PaymentStore`, `PaymentWorkers` và `provider.*` của chính service. Gateway định tuyến webhook VNPay/MoMo thẳng tới Payment. |
| Notification | `NotificationApplication` nhận và gửi thông báo bằng mã trong `services/notification`. Ticketing sở hữu các publisher, reminder dispatcher và API nội bộ cung cấp dữ liệu đơn/nhắc lịch mà nó import hoặc quét. |

## Các lớp từ module admin

Tên lớp tương ứng với file Java dưới `backend/src/main/java/com/ticketbox/module/admin/`.

| Đích | Chuỗi từ entry point | Các lớp |
|---|---|---|
| Check-in | `StaffGuestListController` → `GuestListService` → guest list và kiểm tra quyền | `StaffGuestListController`, `GuestListService`, `GuestListAccessService`, `GuestList`, `GuestListRepository`, `GuestLookupResponse`, `GuestCheckinRequest` |
| Check-in | `GuestListAdminController` và `OrganizerGuestListController` → quản lý, import và trạng thái batch | `GuestListAdminController`, `OrganizerGuestListController`, `GuestListManagementService`, `GuestListImportService`, `BatchLogService`, `BatchLog`, `BatchLogRepository`, `BatchLogResponse`, `GuestListEntryResponse`, `GuestListImportResponse` |
| Check-in | Import service/scheduler → job runner → batch config, tasklet và lưu file CSV | `BatchTrackingListener`, `GuestListCsvSchema`, `GuestListFileStorage`, `GuestListImportBatchConfiguration`, `GuestListImportException`, `GuestListImportJobListener`, `GuestListImportProperties`, `GuestListImportScheduler`, `GuestListImportTasklet`, `GuestListJobRunner`, `GuestListProcessor`, `GuestListRow` |
| Ticketing | `OrganizerRevenueController` → số liệu đơn và export báo cáo, dùng concert projection | `OrganizerRevenueController`, `OrganizerRevenueService`, `RevenueReportExportService`, `RevenueReportExport`, `OrganizerConcertResponse`, `RevenueSummaryResponse`, `SalesTrendResponse`, `ZoneRevenueResponse` |
| Core legacy | Mô tả module Spring Modulith của Core | `package-info.java` |

## Các lớp từ module payment

Tên lớp tương ứng với file Java dưới `backend/src/main/java/com/ticketbox/module/payment/`.

| Đích | Chuỗi từ entry point | Các lớp |
|---|---|---|
| Ticketing | `PaymentController` nhận initiate/status, `MockPaymentController` cung cấp route demo → `PaymentOperations` → `RemotePaymentOperations` → `PaymentWorkflowPort` và `PaymentRemoteClient` | `PaymentController`, `MockPaymentController`, `PaymentOperations`, `RemotePaymentOperations`, `InitiatePaymentRequest`, `PaymentInitiationResponse`, `VnpayIpnResponse`. Nếu giữ các phương thức forward webhook hiện có, dùng DTO cục bộ tương thích payload và tiếp tục để Payment xác minh. |
| Ticketing | Kiểu dùng chung đang bị kéo vào qua chữ ký remote, cần tách khi chuyển | `PaymentLog.Provider` → enum cục bộ. `PaymentService.PaymentStatusResponse` và `PaymentService.WebhookHandleResult` → DTO cục bộ. `PaymentGatewayResolver.resolve` → kiểm tra provider được hỗ trợ và chặn MOCK với profile production. |
| Core legacy | `PaymentService` triển khai embedded → giao dịch, worker đối soát, repository và metrics | `PaymentService` (triển khai embedded), `PaymentAttemptMetrics`, `PaymentAttemptTransactions`, `PaymentGatewayExecutor`, `PaymentReconciliationWorker`, `PaymentAttempt`, `PaymentAttemptRepository`, `PaymentLog` (entity), `PaymentLogRepository` |
| Core legacy | Provider bean hiện bị Ticketing quét do remote dùng resolver. I/O provider của cụm split nằm ở bản triển khai riêng trong Payment. | `PaymentGateway`, `PaymentGatewayResolver` (registry gateway legacy), `GatewayNotSubmittedException`, `PaymentInitiationResult`, `PaymentQueryResult`, `PaymentWebhookResult`, `MockPaymentGateway`, `MomoPaymentGateway`, `MomoProperties`, `VnpayPaymentGateway`, `VnpayProperties` |
| Core legacy | Kiểu sự kiện cũ trong module và mô tả Spring Modulith | `com.ticketbox.module.payment.PaymentCompletedEvent`, `package-info.java` |

Ngoài module payment, `TicketingApplication` import `PaymentWorkflowController`, `PaymentRemoteClient`, `PaymentIntentDispatcher`, `RemoteReminderDispatcher`, `RemoteReminderListener` và `NotificationInternalController`. Ticketing cũng dùng `PaymentIntentWorkflow`, `PaymentCompletedListener` và `PaymentNotificationPublisher`. Kiểm chứng FQCN `com.ticketbox.shared.event.PaymentCompletedEvent` và listener ID của publication chờ khi thực hiện Task 5b. `PaymentCutoverConfiguration` thuộc Core legacy vì đọc marker và phân quyền trên bảng thanh toán embedded.

## Cổng build

Chạy `python3 scripts/ci/verify-service-boundaries.py --service <name>`. Cổng dùng Dockerfile và context riêng của service, một container Maven không dùng cache Maven của máy để lấy dependency tree, và JAR lấy từ image cuối. Kiểm tra class trong `BOOT-INF/classes` và các JAR con, kể cả khi JAR con đổi tên. Bật Payment và Notification trong `verify.ps1` ở Task 1. Bổ sung service khác sau lượt chuyển tương ứng.

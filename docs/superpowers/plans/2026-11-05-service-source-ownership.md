# Kế hoạch tách mã nguồn theo service cho TicketBox

**Mục tiêu** — Giữ sáu ứng dụng trong một monorepo. Mỗi ứng dụng sở hữu mã nghiệp vụ, test, cấu hình và migration của mình. Có thể build từng ứng dụng chỉ với thư mục của nó và các dependency Maven khai báo.

**Kiến trúc** — Chuyển lần lượt Identity → Catalog → Check-in → Ticketing. Mỗi lần chuyển tạo ra một service build và triển khai độc lập, chạy cùng các service cũ qua hợp đồng hiện hành. Core cũ được giữ để chạy legacy và diễn tập chuyển dữ liệu trong giai đoạn chuyển tiếp.

**Nền tảng** — Java 21, Spring Boot 3.3.5 cho bốn service đang tách, Maven, PostgreSQL 16, Flyway, Redis, RabbitMQ, Docker Compose và Testcontainers. Payment và Notification giữ phiên bản dependency hiện tại.

**Đặc tả** — Phần [Thiết kế đích](#thiết-kế-đích) bên dưới mô tả kết quả cần đạt. Hành vi hiện tại được ghi trong [chuyển service](../../service-extraction.md) và [runbook lab](../../lab-replication-partitioning.md).

## Thiết kế đích

```text
ticketbox/
├── services/
│   ├── identity/      tài khoản, JWT, vai trò, contact lookup
│   ├── catalog/       concert, hạng vé, cấu hình bán, AI, poster
│   ├── checkin/       soát vé, admission ledger, guest list, batch CSV
│   ├── ticketing/     queue, stock, hold, đơn hàng, phát hành, báo cáo doanh thu
│   ├── payment/       giao dịch với nhà cung cấp và xác minh callback
│   └── notification/  xử lý và gửi thông báo
├── backend/           Core legacy, migration legacy và test legacy
├── contracts/         HTTP payload và sự kiện có phiên bản
├── frontend/          ứng dụng web
├── mobile-scanner/    ứng dụng soát vé
├── infra/             gateway, PostgreSQL và cấu hình vận hành
└── scripts/           CI, E2E, chuyển dữ liệu và lab
```

Mỗi ứng dụng có `src/main/java`, `src/main/resources`, `src/test`, `pom.xml` và `Dockerfile`. Với bốn ứng dụng đang tách, giữ namespace hiện có `org.ticketbox.<service>` và tổ chức theo nhóm nghiệp vụ bên trong. Ví dụ, Ticketing có `order`, `inventory`, `queue`, `issuance` và `integration`. Lớp Spring Boot nằm ở root package của service và quét các package thuộc service đó.

| Nguồn có quyền quyết định | Bản sao hoặc adapter ở service khác |
|---|---|
| Identity quản lý tài khoản và cấp JWT | Các service xác minh JWT và dùng HTTP contact lookup khi cần email hoặc tên. |
| Catalog quản lý thông tin concert và cấu hình bán | Ticketing đọc bản sao dùng cho checkout và báo cáo. Check-in đọc bản sao dùng cho phân quyền và soát vé. Mỗi bên sở hữu kiểu dữ liệu và truy vấn cục bộ của mình. |
| Ticketing quản lý tồn vé, đơn và vé đã phát hành | Catalog dùng availability cục bộ từ `/internal/split/stock`. Check-in dùng ticket snapshot. |
| Check-in quyết định vé có được vào cổng | Ticketing nhận admission feedback. Một vé được chấp nhận tối đa một lần theo ledger Check-in. |
| Payment xác minh và quản lý giao dịch thanh toán | Ticketing nhận kết quả, xử lý lặp an toàn và tự đổi trạng thái đơn. |

Các phụ thuộc giữa service là hợp đồng HTTP và dữ liệu trên wire. Mỗi bên sở hữu DTO và phép chuyển đổi của mình. Các schema v1 hiện có giữ nguyên trong đợt này. Dữ liệu dự phòng để chạy khi service nguồn tạm mất kết nối tiếp tục nằm trong database của bên đọc. Giữ PostgreSQL schema hiện có cho các projection trong đợt này. Tách kiểu Java và truy vấn trước khi cân nhắc đổi tên hoặc cắt cột database.

**Quyết định triển khai.** Tách theo service thay vì đổi tên `backend/` và dùng lại nguyên JAR nghiệp vụ, vì cách sau giữ nguyên phụ thuộc hiện tại. Mỗi service có Docker build context riêng. Đợt đầu giữ các cấu hình kỹ thuật nhỏ cần thiết trong từng service, gồm cấu hình bảo mật, cutover callback và routing replica ở nơi có dùng. JWT và response envelope được kiểm chứng bằng test tương thích. Một thư viện kỹ thuật có thể được cân nhắc riêng khi có nhu cầu quản lý phiên bản chung. `services/runtime/` chỉ tồn tại trong giai đoạn chuyển tiếp.

## Ràng buộc toàn đợt

- Giữ nguyên endpoint, HTTP status và payload của luồng hiện tại, JWT `sub`, `email`, `role`, `fullName`, cơ chế `X-Service-Token`, tên queue/routing key, Redis key và schema v1. Các lớp Java nội bộ được đổi package.
- Giữ nguyên tên database, role, volume, biến môi trường, dữ liệu nghiệp vụ, phiên bản và checksum của migration đã phát hành. `db/lab` tiếp tục chỉ chạy trong profile lab.
- Checkout, tra cứu theo idempotency key, xử lý callback và thao tác ghi dùng primary Ticketing. Chỉ lịch sử đơn và các truy vấn public Catalog đã được đánh dấu có thể đọc replica.
- Dữ liệu cũ, đơn đang chờ và outbox chưa giao phải hoạt động khi đổi image. Giữ điều kiện ACK Catalog, thứ tự phiên bản projection và tính nguyên tử của giao dịch hiện tại.
- Bảo toàn Core legacy, công cụ chuyển dữ liệu và bài test legacy. Bỏ Core, đổi giao thức hoặc đổi cơ chế lưu trữ là công việc riêng.
- Workspace hiện có nhiều thay đổi phase 2–6. Khi bắt đầu triển khai, chốt baseline gồm cả file đang sửa và file chưa track, bảo toàn chúng trong checkout dùng để refactor. Một checkout từ `HEAD` hiện tại có thể thiếu các phase đã làm.

## Năm lỗi cần chặn khi review

| Rủi ro | Cổng kiểm chứng |
|---|---|
| Build xanh nhờ class cũ trong repo hoặc cache Maven | Task 1 và 6 build riêng từng thư mục, kiểm tra cả dependency gián tiếp và nội dung JAR. |
| Identity mới làm token cũ hoặc internal API mất tương thích | Task 2 xác minh token trước/sau, RBAC và service token qua endpoint thật. |
| Publisher mới khiến receiver cũ từ chối payload, hoặc ACK trước khi commit | Task 3 và 7 chạy phiên bản cũ/mới xen kẽ, kiểm tra lỗi và retry. |
| Snapshot gửi lại hoặc scan đồng thời ghi đè admission đã nhận | Task 4 kiểm thử trên PostgreSQL và qua API thật. |
| Di chuyển package làm mất aspect replica, migration lab, PDF font hoặc callback idempotency | Task 5 và 7 kiểm tra routing vật lý, Flyway trên volume có dữ liệu, báo cáo PDF và callback lặp. |

## Task 1 — Chốt baseline và dựng cổng build độc lập

**Điểm sửa dự kiến** — `scripts/ci/verify-service-boundaries.py` (mới), `scripts/ci/verify.ps1`, `.github/workflows/verify.yml`. Bước này chưa đổi dependency của service.

- [x] Ghi source manifest và kết quả baseline từ `pwsh -File scripts/ci/verify.ps1` trên môi trường CI, `scripts/e2e/split.py` trên Compose thử riêng, cùng artifact phase 5–6 đang có. Máy hiện tại có Docker nhưng chưa có `mvn` và `pwsh` trên `PATH`. Khi chạy Java ở máy này, dùng image `maven:3.9.9-eclipse-temurin-21` và cấu hình Testcontainers đang có trong `verify.ps1`. Ghi rõ test nào chạy mới và test nào là bằng chứng tham chiếu. Gắn tag `ticketbox-<service>:ownership-baseline` từ sáu image đã kiểm chứng để phục vụ test trộn phiên bản và rollback trên bản sao.
- [x] Định nghĩa `python3 scripts/ci/verify-service-boundaries.py --service <name>` nhận một trong sáu tên service, trả exit `0` khi qua cổng và exit khác `0` kèm nguyên nhân khi vi phạm. Script dùng thư mục service làm Docker build context, chạy build từ nguồn, kiểm tra dependency tree đã resolve và đọc `/app/app.jar` từ image cuối. Chặn dependency trực tiếp hoặc gián tiếp `com.ticketbox:service-runtime` và artifact ứng dụng của service khác. Kiểm tra `BOOT-INF/classes` và các JAR `com.ticketbox` đóng gói để phát hiện namespace Core hoặc namespace service khác. Danh sách prefix theo namespace đang dùng, gồm `com.ticketbox.payments` và `com.ticketbox.notifications` cho hai service đã độc lập.
- [x] Kiểm tra cổng trên Payment và Notification để có mẫu xanh. Chạy với Identity hiện tại để quan sát lỗi đúng lý do `service-runtime` hoặc Dockerfile yêu cầu context gốc. CI chỉ bật cổng cho những service đã chuyển, thêm từng service sau mỗi task.
- [x] Chốt quyền sở hữu các lớp theo entry point và chuỗi import. Ưu tiên `backend/src/main/java/com/ticketbox/module/admin` và `payment`, vì các package này hiện trộn nhiều chức năng. Ghi mỗi lớp được dùng vào service đích hoặc Core legacy, tránh lấy cả package theo tên.

Baseline nguồn nằm ở `feat/service-ownership-baseline`. Lần chạy mới dùng `verify.ps1` ở chế độ Docker trên máy hiện tại và `split.py` trên project `ticketbox-e2e-ownership-baseline`. Sáu tag baseline trỏ tới image hiện có đã chạy trong project này. Kết quả lab, switchover, sự cố replica và benchmark phase 5–6 là bằng chứng tham chiếu. Manifest, image ID và log nằm dưới `.artifacts/verification/service-source-ownership/`. [Bản đồ quyền sở hữu](2026-11-05-service-source-ownership-map.md).

**Nghiệm thu** — Có ảnh baseline dùng được, danh sách lớp theo chủ sở hữu và cổng build chứng minh được cả trường hợp pass lẫn fail.

## Task 2 — Identity sở hữu toàn bộ auth và profile

**Nguồn → đích** — `backend/src/main/java/com/ticketbox/module/auth/` → `services/identity/src/main/java/org/ticketbox/identity/` theo nhóm `account`, `auth`, `integration`. Sửa `IdentityApplication.java`, `IdentityInternalApi.java`, `services/identity/{pom.xml,Dockerfile}` và build context của `identity` trong `compose.yaml`.

- [x] Chuyển `AuthServiceTest`, `UserProfileServiceTest`, các test controller, security hardening và RBAC vào `services/identity/src/test/java/org/ticketbox/identity/`. Đổi fixture đang boot `TicketBoxApplication` sang `IdentityApplication`, dùng migration Identity và giữ số trường hợp kiểm tra.
- [x] Chuyển repository, entity, DTO, mapper, login/profile và contact lookup. Tách phần kỹ thuật từ `SplitCommon` cần dùng cho Identity thành config cục bộ. Giữ contract `GET /internal/split/users/{id}` và cấu hình security theo thứ tự filter hiện tại. Giữ test khởi động bị chặn khi marker cutover `ready=false`.
- [x] Khai báo dependency cần dùng trong POM service, gỡ runtime JAR, dùng context `./services/identity`. Giữ user ID, email, role, password hash, các điều kiện RBAC và token claims hiện có.
- [x] Chạy `mvn -B -ntp -f services/identity/pom.xml clean verify` và cổng Task 1. Trên Compose trộn image, token cấp trước đổi image vẫn dùng được. Token cấp bởi Identity mới được Catalog/Ticketing/Check-in hiện tại chấp nhận đúng vai trò. Internal contact lookup trả `401` với token sai, còn contact lookup hợp lệ giữ payload.

Identity chạy 47 test trên Maven/Java 21 và đã được bật trong cổng CI. Ba ca hardening của endpoint reservation tiếp tục chạy ở Core legacy. Phép thử `scripts/e2e/identity-swap.py` dùng image `ticketbox-identity:ownership-task-2` và các tag baseline của Task 1. Kết quả chạy mới nằm dưới `.artifacts/verification/service-source-ownership/task-2/`.

**Nghiệm thu** — Identity build riêng và thay image độc lập qua gateway với DB Identity đã có dữ liệu.

## Task 3 — Catalog sở hữu concert, AI và cấu hình bán

**Nguồn → đích** — `backend/src/main/java/com/ticketbox/module/{concert,ai}/` → `services/catalog/src/main/java/org/ticketbox/catalog/` theo nhóm `concert`, `sales`, `artistbio`. Giữ `CatalogPublisher`, `SaleActivation` và `CatalogInventory` trong Catalog, sửa app entry point, POM, Dockerfile và context Compose tương ứng.

- [x] Chuyển các test concert, poster và AI đang nằm ở Core. Giữ test duyệt/chỉnh concert, upload poster, worker AI, API public và cache. Bổ sung test publish tới receiver v1 đang chạy và ACK bị lỗi để bảo vệ tương thích khi triển khai lệch phiên bản.
- [x] Chuyển phần ghi concert, hạng vé, poster và AI. Đổi dependency `InventoryPort` trong mapper/`TicketTypeService` sang cổng đọc Catalog sở hữu, `CatalogAvailabilityReader.available(UUID ticketTypeId): int`. Giữ dữ liệu từ `catalog_availability`, hành vi khi thiếu dữ liệu và cơ chế cập nhật qua `/internal/split/stock`.
- [x] Cố định các trường snapshot v1 mà publisher phát ra theo fixture thực tế. `POST /internal/split/catalog` vẫn có `id`, `version`, `deleted`, `concert`, `types` và đầy đủ trường receiver cũ đang đọc. Giữ tombstone `concert=null`, `types=[]`, ACK riêng theo consumer và retry khi mất phản hồi. Thay phép lấy toàn bộ row ở producer bằng danh sách trường tương thích v1, không rút ngắn payload theo nhu cầu của một consumer.
- [x] Chuyển `ReplicaRead`, aspect, datasource và test routing cần dùng về Catalog. Giữ cache miss ở public read có thể đọc replica. Sale activation, worker và Flyway đọc/ghi primary. Giữ volume `/app/data` cho poster và tài liệu AI.
- [x] Chạy `mvn -B -ntp -f services/catalog/pom.xml clean verify`, cổng Task 1 và luồng Catalog trong `scripts/e2e/split.py`. Khi Ticketing chưa ACK, thao tác activation giữ hành vi lỗi/chờ hiện tại và outbox còn khả năng retry. Khi consumer nhận lại cùng phiên bản, dữ liệu không bị lùi.

Catalog chạy 25 test và đã được bật trong cổng CI. Cổng cho phép đúng lớp sự kiện AI có FQCN đã lưu trong `event_publication`, với fixture kiểm chứng phát lại từ baseline. `scripts/e2e/catalog-swap.py` kiểm chứng image `ticketbox-catalog:ownership-task-3` trên cụm baseline và replica vật lý. Log và kết quả nằm dưới `.artifacts/verification/service-source-ownership/task-3/`.

**Nghiệm thu** — Catalog build riêng, thay được image khi hai consumer vẫn ở baseline, và giữ hành vi đọc trễ của profile lab.

## Task 4 — Check-in sở hữu projection, ledger và batch CSV

**Nguồn → đích** — `backend/src/main/java/com/ticketbox/module/checkin/` và nhóm guest list, batch, log của `module/admin` → `services/checkin/src/main/java/org/ticketbox/checkin/`. Dùng `LocalTickets` và `AdmissionPublisher` hiện có làm điểm chuyển. Sửa `CheckinApplication.java`, POM, Dockerfile và Compose.

- [x] Chuyển test RBAC Check-in, CSV schema, import/scheduler và test admission trong `services/runtime/src/test/java/org/ticketbox/split/ProjectionReceiverIntegrationTest.java`. Tách test `monthlyAuditPreservesRowsBoundaryFallbackAndAdmissionUniqueness` từ `LabPartitionIntegrationTest` về Check-in, load `classpath:db/migration` và `classpath:db/lab` của chính service.
- [x] Chuyển API scan, offline sync, guest list và batch. Chuyển các phương thức `TicketCheckinPort` và view thực sự dùng vào package `admission` của Check-in và cho `LocalTickets` triển khai. Tạo adapter `integration.catalog.LocalConcertProjection` đọc metadata và quyền owner từ DB Check-in, dùng chung cho scan, guest list và batch. Thay `ConcertOrderAdapter`, `ConcertReportingAdapter`, `ConcertCheckinAdapter` import từ Core bằng các truy vấn cục bộ cần thiết.
- [x] Tạo receiver cục bộ tại `services/checkin/src/main/java/org/ticketbox/checkin/integration/CheckinProjectionReceiver.java` với `void catalog(JsonNode envelope)` và `void ticket(JsonNode envelope)`. Giữ `POST /internal/split/catalog` và `/internal/split/tickets`. Ánh xạ tường minh các cột đang dùng và các cột bắt buộc ở schema hiện tại. Giữ khóa theo aggregate, kiểm tra version, cập nhật dữ liệu và version trong cùng transaction. Giữ quyết định ledger khi nhận lại ticket snapshot `VALID` và quy tắc `CANCELLED`/`TRANSFERRED` hiện có.
- [x] Chuyển audit/ledger test sang PostgreSQL thực, giữ `REQUIRES_NEW` ở điểm xử lý từng entry sync hiện có và cơ chế trigger audit. Với hai scan đồng thời cùng vé, đúng một scan được nhận. Offline sync cùng staff, device, timestamp và nội dung trả lại kết quả cũ, không tạo lượt nhận thứ hai. Quét LAN vẫn xử lý khi các service nguồn dừng.
- [x] Gỡ runtime JAR, chạy `mvn -B -ntp -f services/checkin/pom.xml clean verify`, cổng Task 1 và E2E Check-in. Chạy publisher Catalog/Ticketing baseline với receiver mới, sau đó chạy cùng Catalog mới. Kiểm tra volume file batch `/app/data` và bảng audit lab còn nguyên.

Check-in chạy 15 test và đã được bật trong cổng CI. Luồng CSV dùng tasklet đang hoạt động. Các lớp chunk cũ `GuestListProcessor`, `GuestListRow` và `BatchTrackingListener` thuộc Core legacy. `scripts/e2e/checkin-swap.py` kiểm chứng image `ticketbox-checkin:ownership-task-4` với publisher baseline rồi Catalog Task 3. Log và kết quả nằm dưới `.artifacts/verification/service-source-ownership/task-4/`.

**Nghiệm thu** — Check-in build riêng, tiếp nhận snapshot v1 của publisher cũ, giữ quyền quyết định admission và hoàn tất CSV import.

## Task 5 — Ticketing sở hữu toàn bộ checkout, tồn và phát hành

**Nguồn → đích** — `backend/src/main/java/com/ticketbox/module/{ticket,inventory,queue}/`, nhóm báo cáo doanh thu từ `module/admin`, nhóm điều phối thanh toán remote và notification/reminder mà `TicketingApplication` import → `services/ticketing/src/main/java/org/ticketbox/ticketing/`. Sửa `TicketingApplication.java`, `IdentityContacts.java`, `TicketPublisher.java`, POM, Dockerfile và Compose. Tách thành ba lượt review nhỏ dưới đây, chỉ bật cổng build độc lập sau khi cả ba lượt hoàn tất.

### 5a — Projection, queue và inventory

- [x] Chuyển queue, inventory, hold và các test `WaitingRoomServiceIntegrationTest`, `QueueRealtimeServiceTest`, rate limit liên quan. Giữ Redis key, WebSocket/STOMP, access token, quota và SQL cập nhật tồn nguyên tử. Tách phần socket và filter chỉ Ticketing sử dụng vào config cục bộ.
- [x] Tạo `integration.catalog.TicketingCatalogProjection` sở hữu các thao tác hiện có của `ConcertOrderPort` mà order/report/reminder cần. Các view cục bộ giữ `UUID`, trạng thái bán, thời gian, tên và giá cần dùng. Adapter đọc bảng projection trong Ticketing, availability đọc inventory Ticketing. Loại `@EntityScan` và `@EnableJpaRepositories` của `com.ticketbox.module.concert.domain` khỏi app sau khi đổi các caller.
- [x] Tạo `integration.catalog.TicketingCatalogReceiver.catalog(JsonNode envelope): void` xử lý `POST /internal/split/catalog`. Di chuyển test `lateAndConcurrentConfigurationsCannotRegressAppliedVersion` và `failedInventoryResizeRollsBackMetadataAndVersionTogether` vào service. Thử config cũ, config đến đồng thời và resize stock đã phân bổ. Giữ việc cập nhật version cùng transaction với projection và tồn. Giữ khả năng đọc từ primary khi Catalog tạm mất kết nối.

### 5b — Đơn hàng, thanh toán và phát hành

- [x] Chuyển `OrderService`, `OrderAdapter`, `OrderEventStore`, `PaymentIntentWorkflow`, các controller và test liên quan sang `order`, `issuance` và `integration.payment` của Ticketing. Giữ entry point `createOrder(CreateOrderRequest, UUID, String, String): OrderResponse` và `getOrderByIdempotencyKey(String, UUID): OrderResponse` trong lượt chuyển. Các adapter gọi Payment/Identity và gửi notification nằm trong service này, với DTO cục bộ tương thích v1.
- [x] Giữ transaction stock/hold/quota/order/event và thứ tự xử lý callback. Chuyển các test `OrderConcurrencyIntegrationTest`, `OrderConcurrencyTest`, `OrderAdapterPaymentEligibilityTest`, `PaymentWorkflowControllerTest` và bảo vệ remote boundary. Với một vé còn lại và hai yêu cầu hợp lệ, chỉ một đơn giữ được vé. Với cùng idempotency key, phục hồi cùng order ID. Với callback lặp, trạng thái và vé phát hành giữ nguyên sau lần xử lý đầu.
- [x] Giữ HTTP contract Payment intent/result/ACK, các route mock đang dùng, publish ticket snapshot và nhận admission feedback. Kiểm tra ticket snapshot cũ/mới qua Check-in đã tách và qua receiver baseline. Các fixture outbox/inbox cũ phải đọc và giao tiếp được sau đổi image. Kiểm tra cả serialized event có sẵn trong bảng `event_publication` nếu thay FQCN hoặc listener ID, bằng bản sao DB chứa publication chưa hoàn thành. Giữ tên class/ID tương thích trong service-local package dành riêng cho dữ liệu cũ nếu cần, hoặc lập migration tương thích riêng trước khi đổi namespace đó. Không xóa publication đang chờ.

### 5c — Báo cáo, lab và đóng gói

- [x] Chuyển organizer revenue, e-ticket PDF, reminder và nội dung notification cần dùng vào Ticketing. Copy font đang được nạp từ `fonts/` vào `services/ticketing/src/main/resources/fonts/`. Test mở PDF có dữ liệu tiếng Việt và sử dụng đúng font đã đóng gói. Giữ API và quyền organizer/admin.
- [x] Chuyển routing replica về Ticketing. Bảo toàn test `onlyExplicitReadOnlyQueriesUseReplicaAndFailureDoesNotLeakRouting` cho cấu hình Ticketing, test hash partition từ `LabPartitionIntegrationTest`, và migration `V100__hash_order_events.sql` hiện có. Khi WAL replay bị pause, lịch sử có thể chưa thấy đơn vừa tạo, còn checkout, đọc chi tiết và tra idempotency key vẫn đọc primary. `replay_order` khớp projection theo quy tắc chuẩn hóa hiện có.
- [x] Chuyển các dependency cần thiết vào POM, gỡ `service-runtime`, dùng Docker context `./services/ticketing`. Chạy `mvn -B -ntp -f services/ticketing/pom.xml clean verify`, cổng Task 1, E2E mua vé qua gateway và lab trên volume thử riêng.

Ticketing chạy độc lập 62 test và đã được bật trong cổng CI. Ba record `PaymentCompletedEvent`, `RemoteNotificationRequested` và `UserLeftQueueEvent` giữ tên lớp và listener ID baseline để phát lại publication cũ. Kịch bản `scripts/e2e/ticketing-swap.py` xác nhận đổi image trên volume baseline, phát hành qua cả hai phiên bản Check-in, routing replica vật lý và hai PDF có tiếng Việt. Bằng chứng nằm dưới `.artifacts/verification/service-source-ownership/task-5/`.

**Nghiệm thu** — Ticketing build riêng, phát hành vé đúng một lần qua callback lặp, hoàn tất replay và đọc/ghi đúng node trong profile lab.

## Task 6 — Gỡ cầu nối build và cập nhật CI

**Điểm sửa dự kiến** — `pom.xml`, `services/runtime/`, `.github/workflows/verify.yml`, `scripts/ci/{verify.ps1,source-manifest.mjs}`, `README.md`, `docs/{development,architecture}.md`.

- [x] Đối chiếu từng test trong runtime với các test service-local đã chuyển. Test projection version và resize thuộc Ticketing, test admission replay thuộc Check-in, test routing thuộc Catalog/Ticketing và test partition thuộc Ticketing/Check-in. Mỗi service dùng tài nguyên từ classpath của chính mình. E2E liên service tiếp tục nằm trong `scripts/e2e/`.
- [x] Gỡ `services/runtime/` và khai báo module trong Maven gốc khi bốn service đã qua cổng độc lập. Dùng `mvn -B -ntp clean verify` ở gốc cho reactor sáu service. Giữ build/test riêng cho Core legacy, với manifest ghi rõ suite nào là legacy. CI thu report từ từng service và kiểm tra suite bắt buộc theo nhóm chức năng thay vì áp dụng tổng số test cũ cho kiến trúc mới. Kiểm tra `.dockerignore` cục bộ của bốn context mới để loại `target/`, `.env*` và dữ liệu local khỏi build context.
- [x] Bật cổng Task 1 cho cả sáu service. Với các lớp buộc giữ tên cũ để deserialize dữ liệu, dùng allowlist tên lớp cụ thể có fixture tương thích và giải thích. Cổng tiếp tục từ chối dependency runtime JAR và toàn bộ package nghiệp vụ của service khác.
- [x] Cập nhật README và tài liệu để hướng dẫn vị trí code, nguồn build, lệnh test, cấu hình mặc định và legacy. Thêm `pom.xml`, `compose.lab.yaml` và `compose.legacy.yaml` vào phạm vi source manifest nếu đang thiếu.

Reactor sáu service và Core legacy chạy riêng, mỗi lượt qua 166 test. CI kiểm tra các suite bắt buộc theo chức năng, cả sáu build context và ba cấu hình Compose. Bản đối chiếu test runtime và manifest của lần chạy đủ 18 bước nằm dưới `.artifacts/verification/service-source-ownership/task-6/`.

**Nghiệm thu** — Sáu service build được từ context riêng. Reactor gốc và test legacy đều chạy. Cấu hình Compose mặc định, lab và legacy đều hợp lệ.

## Task 6b — Chuẩn hóa kiến trúc bên trong từng service

Task 1–6 đã tách quyền sở hữu mã nguồn và build. Lượt tiếp theo tổ chức lại cả sáu service và kiểm tra chiều phụ thuộc trước khi chạy nghiệm thu Task 7. Quy ước cho các lần sửa sau được ghi trong `AGENTS.md` ở gốc repo.

### Thiết kế đích

Trong mỗi service, nhóm code theo năng lực nghiệp vụ, rồi chia `domain`, `application`, `infrastructure` và `web`. Service nhỏ chỉ có một năng lực có thể đặt các lớp này trực tiếp dưới namespace của service. `config` chứa cấu hình ghép nối Spring, security và lịch chạy worker.

`domain` chứa khái niệm và quy tắc nghiệp vụ, độc lập với Spring, JPA, Jackson và HTTP. `application` chứa use case cùng các port cho I/O. Adapter trong `infrastructure` triển khai các port và chuyển đổi dữ liệu. Controller, HTTP DTO và ánh xạ lỗi HTTP thuộc `web`. Các annotation Spring phục vụ orchestration và transaction có thể nằm ở use case. Giữ namespace service và các kiểu tương thích với publication cũ đã được kiểm thử.

### Mô hình nghiệp vụ hiện tại

Dự án đã có phân chia chủ sở hữu nghiệp vụ và dữ liệu giữa các service. Mô hình Java còn thiên về dữ liệu lưu trữ. `Order`, `OrderItem` và `Concert` là JPA entity có nhiều setter, còn nhiều quy tắc nằm trong application service hoặc SQL. Ranh giới aggregate, value object và hành vi trong domain chưa được thể hiện nhất quán.

JPA entity và domain entity có vai trò khác nhau. Payment và Notification hiện dùng JDBC. Các bảng event, inbox/outbox, tồn kho và projection cũng có đường đọc/ghi trực tiếp. Một aggregate có thể lưu ở nhiều bảng. Việc chọn aggregate cần dựa vào invariant và phạm vi nhất quán của thao tác ghi. Event sourcing của Order là một cơ chế hiện có cần bảo toàn trong lượt tổ chức này.

### Các bước thực hiện

- [ ] Đối chiếu từng class trong sáu service và ghi đích đến theo capability/layer. Cập nhật `docs/architecture.md` với thuật ngữ, chủ sở hữu, write model, read projection và invariant đang được bảo vệ. Xác định quan hệ Order–OrderItem và các ràng buộc stock/hold/quota theo hành vi thực tế trước khi chọn aggregate.
- [ ] Thêm `ArchitectureTest` vào package test `architecture` của từng service khi bắt đầu chuyển service đó. Kiểm tra domain độc lập framework, application độc lập transport và adapter, cùng chiều phụ thuộc giữa capability. Ghi các suite này vào `scripts/ci/java-suites.json` để CI phát hiện việc bỏ test.
- [ ] Chuẩn hóa Payment. Đưa `PaymentApi` vào `web`, use case từ `PaymentFacade` vào `application`, port `PaymentGateway` vào `application`, JDBC từ `PaymentStore` và provider client vào `infrastructure`, security và worker wiring vào `config`. Tách quy tắc chuyển trạng thái khỏi SQL và HTTP error mapping, giữ intent/result/ACK, lease, retry và callback idempotency đã có.
- [ ] Chuẩn hóa Notification. Phân định use case nhận lệnh/gửi thông báo, kiểm tra nội dung nghiệp vụ, JDBC inbox/store, Rabbit consumer, SMTP và HTTP client. Giữ transaction inbox cùng dữ liệu notification, lease gửi mail, cấu hình queue và retry.
- [ ] Chuẩn hóa Identity trong `auth` và `account`. Tách controller/HTTP DTO, use case, kiểu nghiệp vụ, JPA repository/entity, JWT adapter và security wiring. Giữ JWT claims, hash mật khẩu, quyền truy cập và internal contact contract.
- [ ] Chuẩn hóa Catalog trong `concert`, `sales` và `artistbio`. Chuyển JPA mapping và adapter ra khỏi domain, đưa port về use case sử dụng. Giữ sale ACK, version projection, cache, replica routing và replay publication AI.
- [ ] Chuẩn hóa Check-in trong `admission` và `guestlist`. Use case đọc concert/ticket projection qua port, adapter sở hữu SQL và Spring Batch. Giữ unique admission, `REQUIRES_NEW` khi sync từng entry, replay snapshot, quyền truy cập và CSV import.
- [ ] Chuẩn hóa Ticketing qua ba lượt kiểm tra riêng cho queue/inventory/hold, order/payment/issuance và reporting/reminder. Loại phụ thuộc từ `OrderService` vào `web.dto` và `order.infrastructure.OrderEventStore.Transition`. Đưa thao tác nghiệp vụ và kiểu transition về lớp sở hữu, truy cập event store, Redis và persistence qua port. Giữ transaction và thứ tự lock hiện có, callback lặp, primary/replica routing và PDF font.
- [ ] Với từng service, chạy `mvn -B -ntp -f services/<name>/pom.xml clean verify`, cổng build độc lập và các bài tương thích bị ảnh hưởng. Khi sáu service qua kiểm tra kiến trúc, chạy CI đầy đủ, đối chiếu manifest test, cập nhật tài liệu và lưu checkpoint trước Task 7.

**Nghiệm thu** — Mỗi service có trách nhiệm từng lớp rõ ràng, kiểm tra tự động chiều phụ thuộc và bằng chứng bảo toàn hành vi. Các quyết định aggregate/invariant được ghi theo nghiệp vụ. CI tiếp tục kiểm chứng build độc lập và dữ liệu tương thích.

## Task 7 — Nghiệm thu đổi image, cutover và rollback

**Điểm kiểm chứng** — `scripts/e2e/{split.py,split-restore.py,lab.py}`, `scripts/migrate-split.py`, `scripts/db/{verify-lab-ticketing.sql,verify-lab-checkin.sql}`, `docs/{service-extraction,lab-replication-partitioning}.md`.

- [ ] Dùng project test tên `ticketbox-e2e-source-ownership` với port riêng. Chạy `python3 scripts/e2e/split.py` và `python3 scripts/e2e/split-restore.py` với `E2E_PROJECT`, `E2E_PORT`, `APP_PORT`, `CHECKIN_PORT` trùng project đã khởi động. Mua vé, thanh toán lặp, nhận email, soát vé đồng thời, sync offline, CSV và AI đều thành công.
- [ ] Chạy thêm trên volume được tạo bởi image baseline. Tạo trước một order chờ thanh toán, một outbox chưa ACK và một vé đã nhận. Đổi lần lượt từng image, giữ các service còn lại ở baseline trong mỗi lượt kiểm thử. So sánh Flyway history, xử lý tiếp order/callback, thử resend snapshot và kiểm tra audit/ledger. Giữ nguyên business ID và số bản ghi theo các bất biến đã nêu.
- [ ] Tạo lab project riêng tên `ticketbox-e2e-lab-source-ownership` với cả hai file Compose và `--profile lab`. Chạy `python3 scripts/db/lab-benchmark.py --project ticketbox-e2e-lab-source-ownership` trước promote, sau đó `python3 scripts/e2e/lab.py --project ticketbox-e2e-lab-source-ownership --port <APP_PORT> --switchover`. Lưu evidence routing, constraint, partition pruning, mất replica, fence primary cũ và API sau promote. Mục tiêu là hành vi đúng và kế hoạch truy vấn có pruning, thời gian benchmark được ghi để so sánh.
- [ ] Diễn tập legacy cutover trên bản sao trước khi nghiệm thu. Dùng cùng project `ticketbox-e2e-ownership-cutover` cho Compose legacy và Compose mới để giữ Payment, Notification và Redis volume. Khởi tạo Core V34, tạo dữ liệu mẫu và khởi tạo schema đích ở trạng thái seed mà script chấp nhận. Chạy `python3 scripts/migrate-split.py --source-project ticketbox-e2e-ownership-cutover --target-project ticketbox-e2e-ownership-cutover` theo runbook. Xác nhận marker cutover, dữ liệu đối chiếu và startup fence vẫn hoạt động.
- [ ] Diễn tập quay lại image baseline trên volume sao chép. Nếu một service lỗi ở bước chuyển, giữ writer dừng ở bước cần thiết, quay lại image tương ứng và xác minh dữ liệu vừa ghi, contract và DB tương thích trước khi mở lại traffic. Nếu dữ liệu hoặc publication format đã thay đổi ngoài thiết kế, giữ DB hiện tại và dùng hướng phục hồi đã kiểm chứng. Core legacy tiếp tục tuân theo fence sau cutover.
- [ ] Lưu báo cáo test, version/hash image, manifest, kết quả cutover/restore và lab dưới `.artifacts/verification/service-source-ownership/`. Đánh dấu hoàn tất sau khi các cổng build, vận hành và tương thích đều có bằng chứng.

**Nghiệm thu** — Bản triển khai mới chạy trên database đã có dữ liệu, chạy cùng các image cũ trong quá trình đổi phiên bản, và hoàn tất diễn tập legacy cutover, restore và lab.

## Nhịp triển khai

Tạo checkpoint sau từng task đạt cổng nghiệm thu. Identity và Catalog là hai lượt đầu vì phạm vi thay đổi tương đối gọn. Check-in kiểm chứng cách tách projection và test database. Ticketing là phần có rủi ro cao nhất và được chia thành ba lượt review để cô lập lỗi. Sau Task 6, thực hiện Task 6b cho kiến trúc nội bộ, rồi Task 7 cho nghiệm thu vận hành. Giữ một commit dễ hoàn nguyên cho mỗi lượt khi bắt đầu thực hiện.

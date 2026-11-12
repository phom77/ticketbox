# Kế hoạch đưa TicketBox vào vận hành thực tế

> Theo dõi tiến độ bằng checklist. Với mỗi thay đổi lớn, lập proposal, design, spec và tasks riêng theo [quy trình OpenSpec](../../development.md#planning-changes). Review các tài liệu đó trước khi triển khai.

**Mục tiêu.** Đưa TicketBox từ bản demo sang nền tảng mà nhiều ban tổ chức có thể tự mở bán, hỗ trợ người mua và vận hành soát vé trên cùng một website.

**Kiến trúc dự kiến.** TicketBox vận hành website, duyệt đối tác và kiểm soát quyền truy cập. Ban tổ chức được duyệt tự làm các công việc hằng ngày của sự kiện mình. Một merchant VNPAY của doanh nghiệp vận hành TicketBox nhận tiền bán vé nếu VNPAY chấp thuận mô hình. Kế toán đối soát và chi trả cho từng đối tác ngoài ứng dụng theo hợp đồng.

**Nền tảng hiện có.** Java 21, Spring Boot, PostgreSQL, Redis, RabbitMQ, React/Vite và Expo/SQLite. Triển khai theo từng nhóm thay đổi trên sáu service hiện tại.

**Tài liệu nền.** [Kiến trúc hiện tại](../../architecture.md), [bản đồ nghiệp vụ](../../../GLOSSARY-MAP.md), [quyết định về domain model](../../adr/0001-service-domain-models.md), [kế hoạch tách source service](2026-11-05-service-source-ownership.md) và [kế hoạch Order event sourcing ban đầu](2026-11-03-ticketbox-phuong-an-b.md). Roadmap này là đầu vào cho các OpenSpec change. Schema, API và kế hoạch migration chi tiết thuộc từng change.

## Phạm vi và quyết định từ cuộc thảo luận

| Nội dung | Quyết định hoặc đề xuất |
| --- | --- |
| Mô hình sản phẩm | **Đã chọn.** Một website do TicketBox quản lý, nhiều ban tổ chức tự phục vụ sau khi được duyệt. Mỗi tổ chức có thành viên, sự kiện và phạm vi dữ liệu riêng. |
| Tiền vé | **Hướng đã chọn, còn điều kiện triển khai.** Một merchant VNPAY nhận tiền về tài khoản doanh nghiệp TicketBox. Xác nhận với VNPAY rằng hợp đồng cho phép bán vé của nhiều ban tổ chức trên cùng merchant trước khi nhận tiền thật. |
| Chi trả cho đối tác | **Đã chọn.** Hợp đồng, tính số phải trả, duyệt, chuyển khoản và chứng từ do kế toán xử lý bên ngoài ứng dụng. TicketBox cung cấp giao dịch và dữ liệu xuất để đối chiếu. Ví, số dư rút được, API chuyển tiền và lịch chi trả tự động nằm ngoài phạm vi bản đầu. |
| Hoàn tiền người mua | **Đề xuất cho pilot.** Người có quyền có thể thực hiện lệnh hoàn trên cổng rồi ghi nhận kết quả có mã tham chiếu vào TicketBox. Ứng dụng theo dõi yêu cầu, kết quả và hiệu lực vé. Phạm vi hoàn toàn phần, từng vé và xử lý hủy sự kiện phải được chốt trong spec. |
| Mục tiêu UX | **Đề xuất.** Tổ chức giao diện theo công việc của người mua, ban tổ chức, nhân viên cổng và vận hành TicketBox. Giữ workspace theo sự kiện và sửa các luồng cần dùng hằng ngày. |
| AI tiểu sử nghệ sĩ | **Đề xuất.** Bỏ khỏi menu và đường tải bắt buộc của workspace trong bản đầu. Đánh giá việc giữ hoặc gỡ pipeline và dữ liệu cũ riêng nếu cần. Đưa trở lại giao diện khi có nhu cầu từ đối tác. |
| Order event sourcing | **Hướng người dùng muốn xem xét.** Chuyển về trạng thái Order lưu trong `orders`, có quy tắc chuyển trạng thái và audit cùng transaction. Lập change riêng sau các việc chặn pilot. |
| Phạm vi pilot | **Đề xuất để nghiệm thu.** Hai tổ chức độc lập, một loại sự kiện chính, một cổng thanh toán. Dùng hai tổ chức ngay từ staging để kiểm tra cách ly dữ liệu. |
| Tham chiếu thị trường | Tickmi công bố luồng chuyển tiền theo kỳ sau xác nhận số liệu. Ticket99 và gói Token của Ve Vé là ví dụ tiền về thẳng ban tổ chức. Eventbrite công bố cả hai hướng. Đây là tham chiếu sản phẩm. Điều kiện merchant của dự án cần được xác nhận riêng. |

Nguồn đối chiếu thị trường: [Tickmi](https://tickmi.com/ban-ve-online), [Ticket99](https://ticket99.vn/quy-che-hoat-dong/), [Ve Vé](https://veve.com.vn/tenants), [Eventbrite](https://support.eventbrite.com/hc/en-us/articles/34865675721618-Get-started-with-event-payouts).

## Ràng buộc chung

- Bảo toàn API web/scanner và hợp đồng giữa service khi có thể. Thay đổi tương thích qua hợp đồng có phiên bản, thứ tự triển khai, kiểm thử bên gửi và bên nhận.
- Giữ nguyên các migration Flyway đã phát hành, khóa và thứ tự khóa liên quan đến stock/hold/quota/order, chống xử lý trùng, inbox/outbox, ID sự kiện và listener ID còn publication đang chờ.
- Xác minh quyền ở server theo chủ sở hữu và phạm vi thao tác, gồm API, tìm kiếm, báo cáo, export, file tải xuống, dataset và đồng bộ scanner. Điều hướng trên UI phản ánh cùng quy tắc.
- Dữ liệu thật, tài khoản demo và môi trường lab có vòng đời riêng. Diễn tập migration và phục hồi trên bản sao trước khi dùng dữ liệu thật.
- Các thay đổi quyền sở hữu dữ liệu, kiến trúc, bảo mật và hạ tầng cần được review theo [AGENTS.md](../../../AGENTS.md). Các phân công service dưới đây là đề xuất cho design review.

## Thứ tự triển khai

| Đợt | Nhóm việc | Điều kiện hoàn thành |
| --- | --- | --- |
| 0 | A0 · Chốt phạm vi pilot và làm việc với VNPAY | Có quyết định kinh doanh, bộ tình huống nghiệm thu và danh sách điều kiện mở bán thật. |
| 1 | A1 · Tổ chức và quyền truy cập | Hai tổ chức mới dùng chung hệ thống, kiểm thử truy cập chéo và thu hồi quyền pass. |
| 2 | A2 · Mở bán tự phục vụ, A3 · Thanh toán, A4 · Hỗ trợ và hoàn tiền, A5 · Trải nghiệm khách và soát vé | Ban tổ chức và người mua hoàn thành một vòng bán vé trên staging. Kế toán đối chiếu được từng giao dịch. |
| 3 | A6 · Vận hành và nghiệm thu pilot | Đạt điều kiện merchant, bảo mật, giao dịch, soát vé, phục hồi và tải đã thống nhất. |
| Sau pilot | A7 · Đơn giản hóa cách lưu Order, A8 · Đánh giá phần mở rộng | Mỗi thay đổi có phạm vi, lợi ích và kiểm thử riêng. |

A0, kiểm tra cấu hình vận hành và các chỉnh sửa UI nhỏ có thể bắt đầu sớm. A2 và phần dữ liệu tài chính theo tổ chức của A3 dựa vào A1. A4 dùng kết quả xác minh của A3. A5 phối hợp với A1 cho scanner và với A3–A4 cho trạng thái đơn, hỗ trợ và hoàn tiền.

## Tình huống phải có trong nghiệm thu

| Tình huống | Kết quả cần thấy | Nhóm việc |
| --- | --- | --- |
| Nhân viên A gửi ID sự kiện, đơn hoặc vé của B | Từ chối truy cập và không trả dữ liệu, kể cả export, quét và đồng bộ. | A1, A5 |
| Nhân viên bị thu hồi quyền khi còn token và dữ liệu offline | Lệnh online bị từ chối trong thời hạn đã chốt. Scanner xử lý dữ liệu và lượt quét chờ theo chính sách đã duyệt. | A1, A5 |
| VNPAY xác nhận trùng, trả kết quả muộn hoặc mất kết nối giữa các bước | Một giao dịch chỉ được ghi nhận một lần. Phát vé một lần khi đủ điều kiện. Tiền đến sau khi đơn hết hạn vào hàng chờ xử lý, tồn kho đã trả được bảo toàn. | A3, A4, A7 |
| Hoãn hoặc hủy sự kiện có đơn đã trả tiền | Xác định đúng đơn bị ảnh hưởng, chặn bán theo chính sách, thông báo khách và theo dõi hoàn tiền đến khi có kết quả. | A2, A4 |
| Dừng một service hoặc phục hồi từ backup | Tác vụ còn đủ dữ liệu vẫn sử dụng được. Sau restore đối chiếu được đơn, vé, giao dịch và lượt vào cổng. Các tác vụ đã hoàn tất không phát lại ngoài ý muốn. | A2, A6 |

## A0. Chốt phạm vi pilot và mô hình VNPAY

**Đầu mối.** Chủ sản phẩm, người vận hành, kế toán và đầu mối merchant. Tham khảo [Payment README](../../../services/payment/README.md), [điều khoản VNPAY](https://vnpay.vn/chinh-sach/dieu-khoan-dieu-kien-sddv-vnpay-bsddv.html) và [thông tin dịch vụ VNPAY](https://vnpay.vn/vnpay-cong-bo-thong-tin-theo-quy-dinh-ve-hoat-dong-cung-ung-dich-vu-trung-gian-thanh-toan-0q6bssvjstgd).

- [ ] Chọn hai đối tác độc lập, loại vé phù hợp, thời điểm mở bán và vận hành cổng. Chốt bên chịu trách nhiệm hỗ trợ khách, xuất chứng từ và phê duyệt hoàn tiền.
- [ ] Lấy xác nhận của VNPAY về một merchant của TicketBox dùng cho vé của nhiều ban tổ chức. Chốt tài khoản nhận, phạm vi hoàn tiền, đối chiếu sao kê và quy trình nghiệm thu tích hợp. Nếu cổng yêu cầu mô hình khác, đưa quyết định dòng tiền ra review trước khi bán thật.
- [ ] Chốt mẫu dữ liệu kế toán cần xuất, nguyên tắc đối chiếu và cách ghi nhận khoản chưa rõ hoặc hoàn sau khi đã chi trả. Các điều khoản phí và ngày chi trả nằm trong hợp đồng riêng.
- [ ] Chốt quy mô dự kiến, ngưỡng tải, thời gian chấp nhận gián đoạn, mức mất dữ liệu tối đa, thời hạn thu hồi quyền và thời gian giữ dataset scanner. Gắn từng ngưỡng với người duyệt và bài thử A6.

**Nghiệm thu.** Người vận hành và kế toán diễn tập trên dữ liệu mẫu từ tạo sự kiện tới đối chiếu, hoàn tiền và chi trả. Xác nhận merchant là điều kiện bắt buộc của bán vé thật.

## A1. Tổ chức, thành viên và quyền theo sự kiện

**OpenSpec.** [`organizer-identity-and-access`](../../../openspec/changes/organizer-identity-and-access/proposal.md). Phạm vi đã duyệt dùng tổ chức và sự kiện mới. Phân công theo ca, scanner mobile và soát vé offline chuyển sang đợt phát triển scanner.

**Điểm chạm.** [Identity account](../../../services/identity/src/main/java/org/ticketbox/identity/account), [Catalog organizer API](../../../services/catalog/src/main/java/org/ticketbox/catalog/concert/web/OrganizerConcertController.java), [Ticketing organizer order API](../../../services/ticketing/src/main/java/org/ticketbox/ticketing/order/web/OrganizerOrderController.java), [Check-in dataset và lịch sử](../../../services/checkin/src/main/java/org/ticketbox/checkin/admission/web/StaffCheckinDatasetController.java), [hợp đồng đồng bộ](../../../contracts/) và [route web](../../../frontend/src/app/App.tsx).

- [x] Chốt Identity sở hữu tổ chức, thành viên và quyền. Catalog sở hữu quan hệ sự kiện–tổ chức và công bố trường sở hữu cho Ticketing và Check-in.
- [x] Thêm luồng duyệt tổ chức, mời thành viên, chọn tổ chức và cập nhật quyền quản lý thành viên, quản lý sự kiện, xem số liệu tài chính. Ghi audit thao tác quản lý quyền và khóa tài khoản.
- [x] Kiểm tra phạm vi ở từng service cho catalog, đơn/vé, báo cáo/export, khách mời và kết quả import. Chặn các tuyến staff toàn cục tại Check-in trong thời gian dời scanner.
- [x] Kiểm tra thu hồi quyền khi token vẫn còn hạn, cùng xác minh dữ liệu và quyền trên stack hai tổ chức mới. Sự kiện chưa có tổ chức nằm ngoài truy cập organizer.

**Nghiệm thu.** Hai tổ chức mới có quyền tách biệt. Thành viên thuộc cả hai chỉ truy cập được trong phạm vi đã cấp ở mỗi nơi. Kiểm thử tích hợp chặn truy cập chéo, thu hồi quyền, checkout và báo cáo. Chạy Maven, kiểm tra build độc lập, kiểm tra hợp đồng và CI chung.

## A2. Workspace và mở bán tự phục vụ

**OpenSpec đề xuất.** `organizer-event-publishing`.

**Điểm chạm.** [Danh sách concert](../../../frontend/src/pages/admin/AdminConcertsPage.tsx), [workspace](../../../frontend/src/pages/admin/ConcertWorkspacePage.tsx), [quyền vào trang công khai](../../../frontend/src/features/auth/ProtectedRoute.tsx), [Catalog ConcertService](../../../services/catalog/src/main/java/org/ticketbox/catalog/concert/application/ConcertService.java) và [quy trình đồng bộ cấu hình bán](../../service-extraction.md).

- [x] Tổ chức luồng bản nháp → lịch, địa điểm và nội dung → hạng vé → xem trước → kiểm tra điều kiện → mở bán. Cho người dùng đăng nhập vai trò organizer xem trang công khai. Preview bản nháp chỉ dành cho người có quyền.
- [x] Kiểm tra điều kiện mở bán ở server, hiển thị nội dung cần sửa và trạng thái đồng bộ cấu hình tới Ticketing/Check-in. Phân biệt cấu hình chưa sẵn sàng với sự kiện đã mở bán. Pilot dùng loại vé đã chốt, có thể dùng vé theo hạng/khu vực nếu đối tác chưa cần sơ đồ ghế.
- [x] Chuyển tìm kiếm sự kiện và khách mời sang truy vấn phía server trước phân trang. Sửa các số tổng hợp theo đúng phạm vi bộ lọc. Thử bản ghi ở sau trang đầu và danh sách trên 100 khách.
- [x] Tải thông tin sự kiện độc lập, có lỗi và nút thử lại theo từng mục khách mời, đơn hàng và check-in. Bỏ AI khỏi điều hướng chính và đường tải mặc định. Sửa nội dung tiếng Việt lỗi và các trạng thái kỹ thuật hiển thị trực tiếp cho người dùng.
- [x] Hướng organizer đến bộ phận vận hành khi cần hoãn/hủy. Thao tác xác nhận, lý do, xem trước đơn bị ảnh hưởng và hoàn tiền thuộc A4.

**Nghiệm thu.** Người quản lý tổ chức được duyệt tự tạo, preview và mở bán một sự kiện đủ điều kiện. Đơn vị khác không xem được bản nháp. Sự cố API phụ không chặn sửa thông tin cơ bản. Kiểm tra trình duyệt desktop, tablet, điện thoại và bàn phím. Chạy lint/build và suite Catalog, Ticketing hoặc Check-in tương ứng.

## A3. Thanh toán tập trung và báo cáo giao dịch

**OpenSpec đề xuất.** `vnpay-merchant-and-sales-reconciliation`. Điều kiện của staging có thể dùng sandbox. Mở bán thật phụ thuộc xác nhận A0.

**Điểm chạm.** [VNPAY adapter](../../../services/payment/src/main/java/com/ticketbox/payments/infrastructure/provider/VnpayPaymentGateway.java), [PaymentStore](../../../services/payment/src/main/java/com/ticketbox/payments/infrastructure/persistence/PaymentStore.java), [Payment intent workflow](../../../services/ticketing/src/main/java/org/ticketbox/ticketing/payment/infrastructure/PaymentIntentWorkflow.java) và [truy vấn doanh số](../../../services/ticketing/src/main/java/org/ticketbox/ticketing/reporting/infrastructure/persistence/TicketSalesReportingRepository.java).

- [ ] Dùng một cấu hình VNPAY của TicketBox cho pilot. Lưu thông tin kết nối trong cấu hình bảo mật của deployment. Tách merchant và dữ liệu sandbox khỏi môi trường bán thật.
- [x] Gắn giao dịch với đơn và tổ chức sở hữu sự kiện. Chốt cách lưu chủ sở hữu tại thời điểm bán để các giao dịch lịch sử vẫn đối chiếu đúng sau thay đổi dữ liệu tổ chức.
- [x] Kiểm chứng cục bộ callback và truy vấn theo merchant, số tiền và mã đơn/giao dịch. Giữ cơ chế truy vấn lại khi mất phản hồi, nhận kết quả trùng, ACK bền vững và xử lý tiền đến muộn.
- [x] Tạo báo cáo và export phân quyền theo tổ chức, sự kiện và khoảng thời gian. Có mã đơn, mã giao dịch, ngày, số tiền đã thu, trạng thái, khoản đã hoàn và mã tham chiếu. Hiển thị riêng doanh số vé và khoản thu đã xác minh để kế toán đối chiếu sao kê.
- [ ] Đối chiếu báo cáo với dữ liệu của cổng trên bộ giao dịch có giao dịch thành công, thất bại, chưa rõ, tiền đến muộn và hoàn tiền. Với hoàn một phần, đối chiếu riêng từng khoản hoàn nếu nghiệp vụ này được duyệt.

Phí cần nguồn dữ liệu xác thực trước khi hiển thị. Kế toán tính số phải trả theo hợp đồng và thực hiện chuyển khoản theo quy trình riêng.

**Nghiệm thu.** Kế toán tìm được từng khoản từ báo cáo đến sao kê, phân tách được A và B dù dùng chung merchant và nhận diện được các dòng chưa khớp. Chạy suite Payment/Ticketing, E2E phân tán và kiểm thử merchant có bằng chứng riêng.

## A4. Hỗ trợ, hoàn tiền và vận hành TicketBox

**OpenSpec đề xuất.** `order-support-and-event-refunds`. Có thể chia màn hình tra cứu và luồng hoàn/hủy thành hai change khi review.

**Điểm chạm.** [Admin orders](../../../frontend/src/pages/admin/AdminOrdersPage.tsx), [admin overview](../../../frontend/src/pages/admin/AdminOverviewPage.tsx), [API review Payment](../../../services/ticketing/src/main/java/org/ticketbox/ticketing/web/internal/PaymentWorkflowController.java), [xử lý Payment](../../../services/payment/src/main/java/com/ticketbox/payments/infrastructure/persistence/PaymentStore.java), [OrderService](../../../services/ticketing/src/main/java/org/ticketbox/ticketing/order/application/OrderService.java) và Notification/Check-in.

- [ ] Thêm tìm kiếm có phân trang theo mã đơn, email và mã giao dịch. Mở một trang chi tiết có đơn, tiến độ thanh toán, vé, tình trạng gửi email và hồ sơ ngoại lệ. Phạm vi hỗ trợ của organizer giới hạn trong tổ chức.
- [ ] Đổi trang admin TicketBox thành danh sách việc cần xử lý như tiền chưa xác định, khách trả tiền nhưng chưa có vé, ca hoàn đang chờ và email lỗi. Dùng API review đã có cho các thao tác được hỗ trợ, thêm quyền và audit trước khi mở thao tác mới.
- [ ] Chốt ai được tạo, duyệt và xác nhận khoản hoàn, trường hợp hoàn từng vé hoặc toàn đơn, và cách xử lý vé đã soát. Cho phép ghi kết quả thực tế từ cổng bằng mã tham chiếu, số tiền, thời điểm và người thao tác. Chống ghi trùng và hoàn quá số đã thu.
- [ ] Nối kết quả hoàn với hiệu lực vé, đồng bộ tới Check-in, thông báo khách và báo cáo A3. Nếu hoãn/hủy, hiển thị danh sách bị ảnh hưởng, áp dụng quyết định theo chính sách và theo dõi các ca còn mở. Kiểm tra hủy/hoàn khi scanner đang dùng dataset cũ.
- [ ] Xử lý ca thu tiền đến muộn như một ngoại lệ cần giải quyết. Cho phép tra cứu và ghi nhận kết quả mà không tái cấp tồn kho hoặc phát thêm vé.

**Nghiệm thu.** Người hỗ trợ tìm được một ca mất phản hồi thanh toán, giải thích trạng thái và xử lý trên màn hình hoặc quy trình đã duyệt. Thử gửi lại hành động và kiểm tra đơn, tiền, vé, thông báo nhất quán. Chạy suite Payment, Ticketing, Notification, Check-in và regression trên trình duyệt cho luồng thay đổi.

## A5. Người mua và scanner

**OpenSpec đề xuất.** `buyer-recovery-and-support`. Phần quyết định cho vào cổng và scanner đã được chuyển sang đợt phát triển scanner riêng theo quyết định A1.

**Điểm chạm.** [Đăng nhập](../../../frontend/src/pages/public/LoginPage.tsx), [footer](../../../frontend/src/components/layout/PublicLayout.tsx), [checkout](../../../frontend/src/pages/customer/CheckoutPage.tsx), [kết quả thanh toán](../../../frontend/src/pages/customer/PaymentResultPage.tsx), [scanner](../../../mobile-scanner/src/screens/ScannerHomeScreen.tsx), [lưu trữ scanner](../../../mobile-scanner/src/database/database.ts) và [hướng dẫn scanner](../../../mobile-scanner/README.md).

- [ ] Hoàn thiện khôi phục mật khẩu, kênh hỗ trợ, điều kiện mua và hoàn vé. Gỡ các mục chỉ dẫn tới anchor hoặc form newsletter chưa hoạt động. Hiển thị rõ ban tổ chức và cách tìm lại vé/đơn.
- [ ] Kiểm tra luồng trên điện thoại từ chọn vé tới mở vé QR. Sau khi quay lại từ cổng, phân biệt đang xác nhận, thành công, thất bại và hết hạn. Giữ khả năng tìm lại đơn sau reload hoặc mất phản hồi. Cải thiện thao tác thử lại trong giới hạn an toàn hiện có. Thiết kế nhiều attempt cho một đơn nếu có nhu cầu và đã duyệt cách xử lý callback muộn.
- [ ] Sửa màn scanner để lượt chờ xác nhận có màu, nhãn và hướng dẫn khác lượt được phép vào. Chốt quy trình khi mất WAN nhưng còn LAN và khi thiết bị mất kết nối hoàn toàn. Chốt người có quyền quyết định ngoại lệ.
- [ ] Diễn tập với thiết bị thật tại địa điểm dự kiến. Kiểm tra hai máy cùng quét một vé, mất mạng, đồng bộ lại, vé bị hủy, thay ca và thiết bị bị mất. Kiểm tra thời hạn và xử lý dữ liệu cục bộ sau ca.

**Nghiệm thu.** Khách tìm lại được vé sau khi đóng trang hoặc mất phản hồi. Nhân viên biết khi nào được cho khách vào và nhìn rõ lượt đang chờ. Chạy frontend lint/build, scanner typecheck, checkout recovery trong Chromium và E2E soát vé. Lưu bằng chứng diễn tập thiết bị thật riêng.

## A6. Triển khai và điều kiện mở pilot

**OpenSpec đề xuất.** `production-pilot-operations`. Các quyết định hạ tầng cần review theo quy trình repo.

**Điểm chạm.** [Compose](../../../compose.yaml), [gateway](../../../infra/nginx/gateway.conf), [monitoring](../../../infra/monitoring/prometheus.yml), [workflow CI](../../../.github/workflows/verify.yml), [restore rehearsal](../../../scripts/e2e/split-restore.py) và [hướng dẫn verification](../../development.md#verification).

- [ ] Tách local, staging và production. Triển khai HTTPS, quản lý bí mật và quy trình thay khóa, phân quyền hệ thống, cô lập endpoint nội bộ, tránh dữ liệu demo trong production bằng thiết kế khởi tạo/migration tương thích.
- [ ] Cấu hình email vé gửi thật, kiểm tra gửi lại có kiểm soát và theo dõi mail lỗi. Chuẩn bị rollback hoặc phục hồi phù hợp với từng release, gồm phiên bản dữ liệu và hợp đồng.
- [ ] Mở rộng giám sát ngoài Ticketing. Cảnh báo khi tiền đã xác minh nhưng vé chưa phát, outbox/email tồn đọng, có ca đối soát chưa xử lý hoặc check-in lỗi. Giao người nhận và viết hướng dẫn xử lý theo loại sự cố.
- [ ] Thiết lập backup ngoài host và diễn tập phục hồi trên bản sao. Đo thời gian phục hồi và phạm vi mất dữ liệu, đối chiếu giao dịch/đơn/vé/check-in, kiểm tra tác vụ cũ không bị gửi lại sau restore.
- [ ] Chạy tải theo kịch bản mở bán của pilot. Ghi ngưỡng đã thử, lỗi, độ trễ và kết quả kiểm tra bất biến tồn kho. Chạy kiểm tra toàn bộ repo và E2E phân tán trước mở pilot.
- [ ] Dùng hai tổ chức độc lập nghiệm thu trên staging và mở pilot trong phạm vi đã chốt. Lưu bằng chứng truy cập chéo bị chặn, merchant được chấp thuận, thanh toán và hoàn tiền đã thử, số liệu đối chiếu, soát vé tại cổng, backup/restore và người trực hỗ trợ.

**Điều kiện bán thật.** Các hạng mục A1–A6 thuộc phạm vi pilot đạt nghiệm thu, có xác nhận merchant và có quy trình xử lý hoàn tiền, chi trả, sự cố. Công bố quy mô theo kết quả đã đo.

## A7. Chuyển Order sang lưu trạng thái và audit

**OpenSpec đề xuất.** `order-state-and-audit`. Xếp sau các việc chặn pilot. Chọn thời điểm cutover theo lịch bán vé và mức ổn định của dữ liệu.

**Điểm chạm.** [OrderService](../../../services/ticketing/src/main/java/org/ticketbox/ticketing/order/application/OrderService.java), [OrderAdapter](../../../services/ticketing/src/main/java/org/ticketbox/ticketing/order/infrastructure/OrderAdapter.java), [OrderEventStore](../../../services/ticketing/src/main/java/org/ticketbox/ticketing/order/infrastructure/OrderEventStore.java), [kiểm tra replay](../../../scripts/db/verify-order-replay.sql), [test cạnh tranh Order](../../../services/ticketing/src/test/java/org/ticketbox/ticketing/order/application/OrderConcurrencyIntegrationTest.java) và migration Ticketing.

- [ ] Lập bảng chuyển trạng thái và đường ghi hiện có, gồm tạo đơn, khởi tạo thanh toán, thanh toán thành công, hủy và hết hạn. Tách quy tắc nghiệp vụ khỏi cơ chế lưu trữ và xác định audit cần giữ cho hỗ trợ.
- [ ] Dùng replay để kiểm tra dữ liệu cũ trên bản sao trước khi đổi nguồn trạng thái. Đối chiếu order items, trạng thái, thông tin thanh toán và lịch sử. Giữ khả năng tra cứu stream cũ, bao gồm giới hạn của bản ghi `OrderImported`.
- [ ] Đổi đường xử lý lệnh sang `orders` dưới khóa hiện có và ghi audit cùng transaction. Kiểm tra cả scheduler và adapter nhận kết quả Payment. Giữ API, hợp đồng sự kiện, thứ tự khóa, stock/quota, inbox/outbox và phát hành vé.
- [ ] Diễn tập cutover và rollback có xét đến dữ liệu phát sinh sau cutover. Chặn việc khởi động lại writer cũ đọc stream đã ngừng cập nhật khi chưa có cách đồng bộ hợp lệ. Cập nhật script xác minh và hướng dẫn lab theo phạm vi lịch sử còn hỗ trợ.
- [ ] Kiểm thử đơn trước và sau cutover, tranh vé cuối, đụng quota, hủy/hết hạn cạnh tranh với thanh toán, callback lặp hoặc đến muộn, restart giữa giao dịch và tra cứu audit.

**Nghiệm thu.** Lệnh đổi trạng thái lấy nguồn từ `orders`. Có báo cáo đối chiếu trước cutover và thử nghiệm phục hồi. Suite Ticketing, kiểm tra build độc lập, CI và E2E phân tán xác nhận các bất biến vẫn đạt.

## A8. Đánh giá mở rộng sau pilot

- [ ] Dựa trên việc đối tác thực sự làm để quyết định khôi phục AI như trợ giúp soạn nội dung hoặc gỡ pipeline. Đo thời gian chuẩn bị nội dung và lỗi cần sửa nếu thử lại.
- [ ] Cân nhắc tự động hóa đối soát, hoàn tiền qua API hoặc chi trả nếu quy trình thủ công trở thành điểm nghẽn và hợp đồng cho phép. Tách từng quyết định thành change riêng.
- [ ] Ưu tiên theo dữ liệu sử dụng đối với hỗ trợ nhiều cổng, khuyến mãi, công cụ marketing, chuyển nhượng vé và sơ đồ ghế chi tiết. Đánh giá chi phí vận hành sáu service trước khi đề xuất thay đổi kiến trúc hoặc mở rộng quy mô.

## Tiến độ đến mốc nghiệm thu staging

### Review A1 và rà soát song song · 11/11/2026

- [x] Soạn [proposal A1](../../../openspec/changes/organizer-identity-and-access/proposal.md), [design](../../../openspec/changes/organizer-identity-and-access/design.md), [spec quyền tổ chức](../../../openspec/changes/organizer-identity-and-access/specs/organizer-access/spec.md), [spec quyền soát vé](../../../openspec/changes/organizer-identity-and-access/specs/scoped-admission-access/spec.md) và [tasks](../../../openspec/changes/organizer-identity-and-access/tasks.md). OpenSpec báo đủ 4/4 loại artifact. `openspec validate organizer-identity-and-access --type change --strict` pass.
- [x] Chủ dự án duyệt quyền sở hữu Identity/Catalog và yêu cầu triển khai A1. A1 dùng tổ chức và sự kiện mới, bỏ migration và tương thích phiên cũ. Dời scanner mobile, quyền scan theo ca, offline và quy trình tại cổng sang đợt phát triển scanner. Chặn tuyến staff toàn cục trong A1.
- [x] Rà VNPAY sandbox. Có test giao thức từ lần chạy 07/11 (PaymentGatewayProtocolTest 3/3, PaymentIntegrationTest 10/10, OrderConcurrencyIntegrationTest 14/14) và bằng chứng checkout phân tán qua MOCK từ lần chạy trước. Chưa thử merchant sandbox trong đợt này. [Cấu hình Payment](../../../compose.yaml#L30) · [Luồng checkout phân tán](../../../scripts/e2e/split.py#L195)
- [ ] Cấu hình merchant sandbox qua kho bí mật, URL trả về và IPN HTTPS, đăng ký IPN với VNPAY và cấu hình URL truy vấn. Thử callback, truy vấn khi mất IPN, callback lặp, tiền đến muộn và đối soát hai tổ chức. A0 vẫn cần xác nhận merchant cho bán thật.
- [x] Rà cấu hình vận hành. `docker compose -f compose.yaml config --quiet` và `docker compose -f compose.yaml -f compose.lab.yaml --profile lab config --quiet` đều pass. Báo cáo Task 7 từ lần chạy trước ghi nhận restore cục bộ 6 database trong 54,85 giây, khởi động ứng dụng và không gửi lại email lịch sử. Chưa đo RTO/RPO trên staging. Đợt này chỉ kiểm tra cú pháp Compose, chưa chạy Maven, lint/build, E2E hoặc restore mới. [Kịch bản restore](../../../scripts/e2e/split-restore.py#L56)
- [ ] Chốt môi trường staging, DNS/TLS, bí mật, đường truy cập Check-in LAN, SMTP, nơi backup ngoài host và đầu mối cảnh báo. Bổ sung đối chiếu thanh toán, vé và lượt vào cổng sau restore. Sửa cấu hình upload CI để loại dump và overlay trong `split-backups/` trước khi dùng fixture nhạy cảm. [Upload CI](../../../.github/workflows/verify.yml#L55) · [Đường dẫn backup](../../../scripts/e2e/split-restore.py#L20)
- [x] Rà UI độc lập với A1. Xác nhận nhãn và màu của lượt scan đang chờ, thông báo lỗi mã hóa ở workspace, liên kết hoặc form chưa hoạt động ở footer, và lỗi API phụ làm workspace mất khả năng chỉnh sửa. [Scanner](../../../mobile-scanner/src/screens/ScannerHomeScreen.tsx#L178) · [Workspace](../../../frontend/src/pages/admin/ConcertWorkspacePage.tsx#L150) · [Footer](../../../frontend/src/components/layout/PublicLayout.tsx#L270)
- [ ] Triển khai các sửa UI nhỏ qua quy trình review thường. Chạy lint/build cho web, typecheck cho scanner và kiểm tra trạng thái hiển thị, bàn phím, kích thước màn hình phù hợp. Nội dung hỗ trợ/hoàn vé, khôi phục mật khẩu và việc ẩn AI cần chốt theo phạm vi pilot hoặc change liên quan.

### Triển khai A1 · 11/11/2026

- [x] Ghi quyết định sở hữu và hợp đồng vào [ADR 0002](../../adr/0002-organization-ownership.md). Bổ sung migration cho quyền tổ chức và quan hệ sở hữu sự kiện. Identity xác minh phiên và quyền hiện tại. Catalog, Ticketing và Check-in áp dụng phạm vi trên tài nguyên mình sở hữu.
- [x] `scripts/e2e/run.ps1 -Build -Restore` pass trên Docker Compose cô lập. Kịch bản xác nhận quyền tách biệt của hai tổ chức, thu hồi quyền với cùng token, checkout MOCK, truy cập đơn phía người mua khi Identity gián đoạn và chặn staff qua gateway lẫn LAN. Khôi phục sáu database trong 56,03 giây và không gửi lại email lịch sử.
- [x] Chromium pass luồng duyệt tổ chức, tạo và nhận lời mời, đổi tổ chức và kiểm tra quyền ở 1440, 834 và 390 px. Bộ checkout recovery pass chín kịch bản. Frontend lint/build và scanner typecheck pass.
- [x] Bộ CI chuẩn pass ngày 12/11/2026 với Java 21 và Node 24. Maven pass 205 test, build độc lập pass cả sáu service và toàn bộ 16 bước đều có mã thoát 0. [Báo cáo CI](../../../.artifacts/verification/organizer-identity-and-access/verification.json)
- [ ] Triển khai và nghiệm thu trên môi trường staging dự kiến của dự án. Cần đích triển khai và dữ liệu thử được duyệt. Scanner và merchant thật thuộc các mốc riêng của roadmap.

### Review A2 và A3 · 12/11/2026

- [x] Soạn và chạy `openspec validate --strict` cho hai change tiếp theo. A2 và A3 có thể triển khai song song sau khi review và dùng chung hợp đồng tổ chức của A1.
- [x] Duyệt A2. Dùng vé theo hạng hoặc khu vực, chỉ công khai khi Ticketing xác nhận cấu hình, hiển thị đồng bộ Check-in riêng và đưa hoãn/hủy ảnh hưởng đến đơn sang A4. [OpenSpec A2](../../../openspec/changes/organizer-event-publishing/proposal.md)
- [x] Duyệt A3. Dùng một merchant VNPAY sandbox, lưu tổ chức tại thời điểm tạo đơn, đối soát theo mã giao dịch và theo kỳ đã chọn. Luồng hoàn tiền và tham chiếu hoàn tiền đến từ A4. [OpenSpec A3](../../../openspec/changes/vnpay-merchant-and-sales-reconciliation/proposal.md)
- [ ] Cung cấp đích staging HTTPS, quyền cấu hình merchant sandbox qua kho bí mật, đăng ký IPN và URL truy vấn. Những đầu vào này cần cho bài chạy với VNPAY sandbox. CI vẫn dùng MOCK.

### Triển khai A2 và A3 · 12/11/2026

- [x] E2E qua gateway kiểm tra preview riêng, lệnh mở bán lặp, Ticketing và Check-in phục hồi riêng, quyền mua vé, tìm kiếm sau trang đầu và danh sách 111 khách. Checkout MOCK lưu intent khi Payment dừng, xử lý đúng một lần sau khi khởi động lại, giữ mã tổ chức trên đơn và xuất CSV khớp báo cáo. [Kết quả E2E](../../../.artifacts/verification/organizer-publishing-reconciliation/split-journey.json)
- [x] Khôi phục cả sáu database, khởi động các ứng dụng trên bản sao và gửi lại snapshot đối soát. Báo cáo giữ nguyên giao dịch và số tiền, email lịch sử không phát lại. [Kết quả restore](../../../.artifacts/verification/organizer-publishing-reconciliation/split-restore.json)
- [x] Chromium kiểm tra preview bằng bàn phím, thử lại riêng mục đơn hàng và workspace ở 1440, 834, 390 px. Bộ checkout recovery pass 11 kịch bản, gồm return VNPAY đến trước kết quả xác minh. [Checkout](../../../.artifacts/verification/organizer-publishing-reconciliation/checkout-recovery.json) · [Workspace](../../../.artifacts/verification/organizer-publishing-reconciliation/browser-workspace.log)
- [x] Compose cô lập chạy profile `staging` với hai cấu hình. Thiếu cấu hình thì từ chối trước intent/attempt. Cấu hình HTTPS giả lập chỉ công bố VNPAY. [Kết quả kiểm tra cấu hình](../../../.artifacts/verification/organizer-publishing-reconciliation/staging-profile-fixture.json)
- [x] Chạy bộ CI chung trên cây nguồn cuối cùng. Cả 16 bước đều có mã thoát 0, gồm 211 test Java, build độc lập sáu service, frontend lint/build và scanner typecheck. OpenSpec strict pass cả ba change. [Kết quả CI](../../../.artifacts/verification/organizer-publishing-reconciliation/verification.json)
- [ ] Triển khai staging và đối soát hai tổ chức với bằng chứng VNPAY sandbox. Quyết định merchant bán thật ở A0.

### Review A4 và A5 · 12/11/2026

- [x] Soạn proposal, design, spec và checklist cho [A4](../../../openspec/changes/order-support-and-event-refunds/proposal.md) và [A5](../../../openspec/changes/buyer-recovery-and-support/proposal.md). OpenSpec strict pass cả năm change.
- [x] Sửa các liên kết và form footer chưa hoạt động. Điều hướng về đúng lịch sử đơn và dùng thông tin đơn đã xác nhận khi hiển thị kết quả. Frontend lint/build và 16 ca Chromium pass. [Kết quả Chromium](../../../.artifacts/verification/a5-buyer-ui/results.json)
- [x] Chromium qua gateway cục bộ ở 390 px chọn vé, thanh toán MOCK, tìm lại đơn và mở QR vé đã phát hành sau reload. [Kết quả gateway](../../../.artifacts/verification/a5-buyer-ui/gateway-browser.log)
- [ ] Review chính sách A4 cho pilot. Đề xuất hoàn toàn đơn trên merchant console, hai admin tham gia yêu cầu và duyệt, hồ sơ vé đã soát hoặc chuyển nhượng xử lý thủ công. Hoãn và hủy chặn bán cùng lượt vào cổng online sau khi hai service xác nhận. Đơn đã khởi tạo thanh toán tiếp tục theo hạn đã cấp. [Design A4](../../../openspec/changes/order-support-and-event-refunds/design.md)
- [ ] Review A5 cho đặt lại mật khẩu qua email và vô hiệu hóa phiên mua cũ trên HTTP lẫn hàng chờ riêng. Cần kênh hỗ trợ và URL điều kiện mua/hoàn đã duyệt cho staging. [Design A5](../../../openspec/changes/buyer-recovery-and-support/design.md)

## Kiểm tra trước khi đóng mỗi change

- Kiểm tra OpenSpec bằng `openspec validate <change-id> --type change --strict`. Đối chiếu yêu cầu, migration, quyền truy cập và kế hoạch phát hành với phạm vi đã review.
- Chạy Maven verification và kiểm tra build độc lập cho từng service bị ảnh hưởng. Với web chạy `npm run lint` và `npm run build` trong `frontend/`. Với scanner chạy `npm run typecheck` trong `mobile-scanner/`.
- Chạy `pwsh -File scripts/ci/verify.ps1` và các kịch bản liên quan theo [Development and testing](../../development.md#verification). Nghiệm thu toàn pilot chạy root reactor, E2E phân tán, trình duyệt và restore. Ghi riêng bằng chứng merchant, thử tải và diễn tập thiết bị tại địa điểm.
- Cập nhật tài liệu vận hành, glossary và ADR theo thay đổi đã chấp thuận. Review bằng [engineering checklist](../../engineering/review-checklist.md) trước khi archive change.

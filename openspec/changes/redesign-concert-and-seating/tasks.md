# Tasks

## 1. Quyết định và hợp đồng

- [x] 1.1 Review thiết kế, quyền sở hữu, quota trên toàn suất, thời hạn giữ giá, hoãn/hủy từng suất và phương án chuyển dữ liệu. Sau khi được duyệt, ghi ADR và bổ sung thuật ngữ vào glossary Catalog, Ticketing, Check-in. Đối chiếu mỗi quyết định với tình huống trong ba spec.
- [x] 1.2 Chốt hợp đồng đọc suất, cấu hình bán có version, trạng thái tồn kho theo khu, giữ/chốt đơn và snapshot vé. Viết schema v2 và test payload v1/v2, bản tin lặp, khác version, thiếu lô và xung đột ID. Ghi API dự kiến và lỗi cho đăng nhập, quyền, stale layout và mất chỗ trong tài liệu API.
- [x] 1.3 Chốt phạm vi nhân viên với change scanner/Identity, gồm quyền vào từng suất, thu hồi quyền, QR v1 và chế độ offline chờ xác nhận. Xác nhận hai tổ chức, hai suất và hai thiết bị là các trường hợp bắt buộc của kịch bản nghiệm thu cổng.

## 2. Nền dữ liệu và chạy song song

- [x] 2.1 Thêm Event, Performance, Venue/Space và ánh xạ Concert cũ trong Catalog. Dùng Flyway mới và chạy backfill hai lượt trên bản sao kiểm thử. So ID, URL, ownership, giờ địa phương, trạng thái và dữ liệu cũ chưa có tổ chức. Kiểm thử phân quyền draft, hai suất cùng Event và xuất bản/ACK độc lập.
- [x] 2.2 Thêm projection v2 và guard mode theo suất ở Ticketing. Dựng gate đầu nhận trước khi phát bản tin. Kiểm thử bằng PostgreSQL với rollout, restart, ACK trễ, worker hỗn hợp và v1/v2 tranh ghi vào cùng suất. Fixture cũ phải còn hoạt động qua v1, kể cả đơn chờ.
- [x] 2.3 Nối trang Event và workspace với lịch suất, lựa chọn đúng route mua/phòng chờ, hoãn/hủy theo từng suất và logic hiển thị bản nháp. Kiểm tra Chromium trên lịch hai đêm và truy cập trực tiếp URL cũ, cùng frontend lint/build.

## 3. Vé GA, khu và các hạng giá dùng chung tồn kho

- [x] 3.1 Thêm group GA, offer, sức chứa, cửa sổ bán và quota toàn suất. Kiểm tra hai hạng bán chỗ cuối chung pool, tài khoản đổi hạng, hold hết hạn, freeze suất, và giá cố định theo hold qua thay phiên bản sale. Dùng Postgres thật để đối chiếu tổng stock.
- [x] 3.2 Hoàn tất luồng GA không cần sơ đồ từ phòng chờ tới hold, thanh toán MOCK, phát vé và tìm lại đơn/vé. Xác nhận mất phản hồi, callback lặp hoặc đến muộn và resume không sai suất. Chạy journey gateway và browser với một live house có một hạng và một show bán nhiều zone.

## 4. Phiên bản sơ đồ và công cụ ban tổ chức

- [x] 4.1 Thêm template, layout revision, section/row/seat, liên kết group và bản chụp khi publish ở Catalog. Kiểm thử unique ghế, FK theo scope, chặn ghế ngoài khu, khóa bán, quyền dùng template và giữ nguyên snapshot đã bán khi sửa mẫu.
- [x] 4.2 Dựng editor tạo từ trắng hoặc sao mẫu, tải ảnh nền, vẽ khu/lối đi/sân khấu, sinh và đánh số hàng ghế, nhập CSV có kiểm tra từng dòng. Dùng fixture hybrid để tạo hai cấu hình cùng địa điểm, chạy preview và publish. Kiểm tra hai editor tranh lưu, CSV lỗi và từ chối truy cập từ tổ chức khác.
- [x] 4.3 Nhập SVG tương thích thành sơ đồ có thể sửa. Gán từng ghế vào hạng vé từ sơ đồ hoặc danh sách, giữ nguyên liên kết khi tải lại và xác nhận giữ hai ghế cùng hàng với hai mức giá qua gateway.

## 5. Ghế đánh số, sơ đồ người mua và Check-in

- [x] 5.1 Bổ sung ghế với giữ chỗ nguyên tử và dòng đơn theo ghế. Kiểm tra PostgreSQL với nhiều instance, hai khách tranh một ghế, giữ GA + ghế có một phần thất bại, vượt quota, khóa cạnh tranh với job hết hạn, callback đến sau khi ghế được chia lại và replay order sau phục hồi.
- [ ] 5.2 Tích hợp tổng quan theo khu, dữ liệu ghế tải khi mở khu, trạng thái chọn được xác nhận chung giữa sơ đồ và danh sách. Đo SVG/Canvas trên fixture sân lớn để chọn cách render lớp ghế. Chạy Chromium desktop, mobile, keyboard, kiểm tra thủ công với trình đọc màn hình, và thử sơ đồ lỗi, dữ liệu cũ hoặc đổi suất khi request còn chạy.
- [x] 5.3 Đưa thông tin suất/khu/ghế đến checkout, ví vé, email/PDF, báo cáo và snapshot Check-in. Diễn tập QR v1/v2, lặp phát vé, soát sai suất, hai máy quét cùng vé và offline sync. Đường staff mới chỉ mở sau khi nhận quyền theo phạm vi.

## 6. Nghiệm thu tích hợp và mở bán

- [x] 6.1 Chạy Maven verify cho Catalog, Ticketing, Check-in và root reactor, gate độc lập `scripts/ci/verify-service-boundaries.py`, `scripts/ci/verify.ps1`, frontend lint/build, scanner typecheck và OpenSpec strict. Chạy hành trình gateway cho GA và hybrid, hợp đồng v1/v2, quyền tổ chức, sự cố provider và các phiên mua đang hoạt động.
- [x] 6.2 Diễn tập backfill, chuyển mode, đóng bán v2, callback đang chờ và restore. So lịch sử, tồn kho, vé và log soát trước/sau. Kiểm tra worker xử lý v2 sau khi tắt cờ rollout. Giữ đối chiếu riêng cho dữ liệu seed chỉ minh họa.
- [ ] 6.3 Nghiệm thu sơ đồ sân lớn và tải đồng thời. Ghi kích thước dataset, mô hình người vào, phần cứng, p95 map/giữ/checkout, tỷ lệ xung đột/timeout, lock wait, tốc độ cấp lượt, backlog thanh toán và tốc độ xác nhận tại cổng. Chạy bài hotspot GA và tranh ghế, yêu cầu 0 ghế bán trùng và 0 pool âm. Chỉ xác nhận năng lực ở cấu hình và profile đã đo.
- [ ] 6.4 Diễn tập staging một show GA nhỏ rồi một show hybrid bằng merchant sandbox, phân quyền staff đã duyệt và thiết bị thật. Ghi ngưỡng go/no-go và cách ngừng nhận mua mới khi phát hiện sai lệch. Chỉ mở pilot bán thật theo cấu hình merchant đã duyệt. Chỉ mở bán lớn sau khi nghiệm thu profile tải và vận hành cổng tại địa điểm.

## Workflow follow-up

- `scripts/ci/verify.ps1` đã qua 16 bước trên cùng một mã nguồn. Maven chạy 256 bài kiểm thử. Hành trình gateway xác nhận GA một hạng, GA nhiều khu, hybrid, quyền tổ chức, replay thanh toán và QR.
- Fixture arena cục bộ chạy trên máy 16 CPU logic và khoảng 22,8 GiB RAM. Sơ đồ có 50.400 ghế đánh số, 49 khu và payload lưu khoảng 9,2 MB. Ở lượt cuối với hai worker Ticketing, sáu client tải song song. P95 của sơ đồ khu là 48,3 ms và của trạng thái ghế là 363,1 ms qua 60 mẫu mỗi API. P95 giữ chỗ là 96,0 ms qua 8 mẫu và checkout là 172,8 ms qua 3 mẫu. Kết quả là 1 đơn ghế, 2 đơn GA, 5 xung đột dự kiến, 0 ghế phân bổ trùng và 0 pool âm.
- Chromium tải riêng khu rồi render 500 ghế ở lần mở đầu. Trong phép đo dựng lớp ghế độc lập, SVG mất 2,1 ms ở p95 với 500 ghế và 5,0 ms với 1.050 ghế. Canvas mất 0,4 ms ở hai kích cỡ. Giao diện giữ SVG cho lớp tương tác theo khu và danh sách nút gốc cho bàn phím. Kiểm tra accessibility tree đã nhận đúng nhãn ghế, hàng và trạng thái chọn. Còn phép thử thủ công với trình đọc màn hình.
- Bản sao phục hồi đủ sáu cơ sở dữ liệu và xác minh replay đơn V1 và V2, phân bổ ghế, đối soát và log soát vé. Khi Catalog tắt rollout, thử nghiệm từ chối phát hành suất mới và vẫn xử lý một callback MOCK đang chờ của suất V2 đã mở.
- Diễn tập hai bản Ticketing dùng cùng cơ sở dữ liệu đã migrate. Cả hai đọc được đơn V1 đang chờ. Bản mới hiển thị tên hạng GA có sẵn, nhận callback và phát đúng một vé sau khi thay worker cũ. Khi V1 và V2 cùng yêu cầu giữ tại suất đã kích hoạt, chỉ V2 đổi tồn kho. Luồng tổ chức hiện phát hành V2 từ suất mới.
- Kết quả cục bộ chưa bao gồm tải staging theo cấu hình merchant, thông lượng queue và cổng, phân bố lock wait hoặc backlog ở tải cao. Hai lượt quét cạnh tranh dùng thiết bị mô phỏng. Danh sách bật phát hành ban đầu để trống mặc định và chỉ mở cho các tổ chức đã duyệt.

- Ưu tiên change riêng cho pass nhiều suất, vé miễn phí, bàn/box hoặc chọn ghế liền nhau sau khi có dữ liệu pilot.
- Lập kế hoạch ngừng v1 sau khi rà hết đơn, callback, liên kết cũ và vé còn hiệu lực.

## 7. Quy trình chuẩn bị concert trong workspace tổ chức

- [x] 7.1 Lưu và sửa thông tin sự kiện, lịch suất nháp theo phiên bản. Kiểm tra quyền tổ chức, trạng thái khóa sau yêu cầu phát hành và từ chối phát hành từ màn hình rà soát cũ.
- [x] 7.2 Dựng luồng thông tin → lịch và địa điểm → vé và sơ đồ → rà soát. Kiểm tra ngày giờ địa phương, giữ nháp khi tải lại, thay đổi lịch và lỗi tại trường liên quan. Dùng trình chọn giờ cho lịch từng hạng vé.
- [x] 7.3 Chạy Chromium qua gateway với GA không sơ đồ và hybrid có vé ghế, chạy lại luồng phân quyền, gán ghế, mua vé và hoàn tất kiểm tra giao diện ở ba kích thước màn hình.

## 8. Thiết kế quản trị concert và biên tập sơ đồ

- [x] 8.1 Đối chiếu nguồn sản phẩm và hệ thiết kế đến 21/11/2026. Áp dụng kiến trúc màn hình theo công việc: danh sách suất và trạng thái, kiểu bán, sơ đồ, giá và rà soát.
- [x] 8.2 Dựng canvas chọn, vẽ, di chuyển, chỉnh kích thước, thu phóng, nhân bản và hoàn tác. Sinh hàng loạt ghế, nhãn và lối đi, bảo toàn ID ghế khi sửa vị trí. Kiểm tra với sáu bước: vẽ khu, sinh ghế, nhân bản, hoàn tác, lưu, mở lại.
- [x] 8.3 Tìm suất vận hành qua tên và địa điểm. Hiện giờ địa phương, trạng thái và ảnh hưởng đơn trước thao tác. Kiểm tra quyền platform admin và từ chối organizer draft.
- [x] 8.4 Kiểm tra trình duyệt từ tạo concert và sơ đồ đến gán vé, rà soát và mua vé. Rà desktop, tablet, mobile và bàn phím. Chạy các kiểm tra đặc thù của Catalog và web.

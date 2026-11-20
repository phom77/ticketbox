# Tasks

## 1. Quyết định và hợp đồng

- [x] 1.1 Review thiết kế, quyền sở hữu, quota trên toàn suất, thời hạn giữ giá, hoãn/hủy từng suất và phương án chuyển dữ liệu. Sau khi được duyệt, ghi ADR và bổ sung thuật ngữ vào glossary Catalog, Ticketing, Check-in. Đối chiếu mỗi quyết định với tình huống trong ba spec.
- [ ] 1.2 Chốt hợp đồng đọc suất, cấu hình bán có version, trạng thái tồn kho theo khu, giữ/chốt đơn và snapshot vé. Viết schema v2 và test payload v1/v2, bản tin lặp, khác version, thiếu lô và xung đột ID. Ghi API dự kiến và lỗi cho đăng nhập, quyền, stale layout và mất chỗ trong tài liệu API.
- [ ] 1.3 Chốt phạm vi nhân viên với change scanner/Identity, gồm quyền vào từng suất, thu hồi quyền, QR v1 và chế độ offline chờ xác nhận. Xác nhận hai tổ chức, hai suất và hai thiết bị là các trường hợp bắt buộc của kịch bản nghiệm thu cổng.

## 2. Nền dữ liệu và chạy song song

- [ ] 2.1 Thêm Event, Performance, Venue/Space và ánh xạ Concert cũ trong Catalog. Dùng Flyway mới và chạy backfill hai lượt trên bản sao kiểm thử. So ID, URL, ownership, giờ địa phương, trạng thái và dữ liệu cũ chưa có tổ chức. Kiểm thử phân quyền draft, hai suất cùng Event và xuất bản/ACK độc lập.
- [ ] 2.2 Thêm projection v2 và guard mode theo suất ở Ticketing. Dựng gate đầu nhận trước khi phát bản tin. Kiểm thử bằng PostgreSQL với rollout, restart, ACK trễ, worker hỗn hợp và v1/v2 tranh ghi vào cùng suất. Fixture cũ phải còn hoạt động qua v1, kể cả đơn chờ.
- [ ] 2.3 Nối trang Event và workspace với lịch suất, lựa chọn đúng route mua/phòng chờ, hoãn/hủy theo từng suất và logic hiển thị bản nháp. Kiểm tra Chromium trên lịch hai đêm và truy cập trực tiếp URL cũ, cùng frontend lint/build.

## 3. Vé GA, khu và các hạng giá dùng chung tồn kho

- [ ] 3.1 Thêm group GA, offer, sức chứa, cửa sổ bán và quota toàn suất. Kiểm tra hai hạng bán chỗ cuối chung pool, tài khoản đổi hạng, hold hết hạn, freeze suất, và giá cố định theo hold qua thay phiên bản sale. Dùng Postgres thật để đối chiếu tổng stock.
- [ ] 3.2 Hoàn tất luồng GA không cần sơ đồ từ phòng chờ tới hold, thanh toán MOCK, phát vé và tìm lại đơn/vé. Xác nhận mất phản hồi, callback lặp hoặc đến muộn và resume không sai suất. Chạy journey gateway và browser với một live house có một hạng và một show bán nhiều zone.

## 4. Phiên bản sơ đồ và công cụ ban tổ chức

- [ ] 4.1 Thêm template, layout revision, section/row/seat, liên kết group và bản chụp khi publish ở Catalog. Kiểm thử unique ghế, FK theo scope, chặn ghế ngoài khu, khóa bán, quyền dùng template và giữ nguyên snapshot đã bán khi sửa mẫu.
- [ ] 4.2 Dựng editor tạo từ trắng hoặc sao mẫu, tải ảnh nền, vẽ khu/lối đi/sân khấu, sinh và đánh số hàng ghế, nhập CSV có kiểm tra từng dòng. Dùng fixture hybrid để tạo hai cấu hình cùng địa điểm, chạy preview và publish. Kiểm tra hai editor tranh lưu, CSV lỗi và từ chối truy cập từ tổ chức khác.

## 5. Ghế đánh số, sơ đồ người mua và Check-in

- [ ] 5.1 Bổ sung ghế với giữ chỗ nguyên tử và dòng đơn theo ghế. Kiểm tra PostgreSQL với nhiều instance, hai khách tranh một ghế, giữ GA + ghế có một phần thất bại, vượt quota, khóa cạnh tranh với job hết hạn, callback đến sau khi ghế được chia lại và replay order sau phục hồi.
- [ ] 5.2 Tích hợp tổng quan theo khu, dữ liệu ghế tải khi mở khu, trạng thái chọn được xác nhận chung giữa sơ đồ và danh sách. Đo SVG/Canvas trên fixture sân lớn để chọn cách render lớp ghế. Chạy Chromium desktop, mobile, keyboard, kiểm tra thủ công với trình đọc màn hình, và thử sơ đồ lỗi, dữ liệu cũ hoặc đổi suất khi request còn chạy.
- [ ] 5.3 Đưa thông tin suất/khu/ghế đến checkout, ví vé, email/PDF, báo cáo và snapshot Check-in. Diễn tập QR v1/v2, lặp phát vé, soát sai suất, hai máy quét cùng vé và offline sync. Đường staff mới chỉ mở sau khi nhận quyền theo phạm vi.

## 6. Nghiệm thu tích hợp và mở bán

- [ ] 6.1 Chạy Maven verify cho Catalog, Ticketing, Check-in và root reactor, gate độc lập `scripts/ci/verify-service-boundaries.py`, `scripts/ci/verify.ps1`, frontend lint/build, scanner typecheck và OpenSpec strict. Chạy hành trình gateway cho GA và hybrid, hợp đồng v1/v2, quyền tổ chức, sự cố provider và các phiên mua đang hoạt động.
- [ ] 6.2 Diễn tập backfill, chuyển mode, đóng bán v2, callback đang chờ và restore. So lịch sử, tồn kho, vé và log soát trước/sau. Kiểm tra worker xử lý v2 sau khi tắt cờ rollout. Giữ đối chiếu riêng cho dữ liệu seed chỉ minh họa.
- [ ] 6.3 Nghiệm thu sơ đồ sân lớn và tải đồng thời. Ghi kích thước dataset, mô hình người vào, phần cứng, p95 map/giữ/checkout, tỷ lệ xung đột/timeout, lock wait, tốc độ cấp lượt, backlog thanh toán và tốc độ xác nhận tại cổng. Chạy bài hotspot GA và tranh ghế, yêu cầu 0 ghế bán trùng và 0 pool âm. Chỉ xác nhận năng lực ở cấu hình và profile đã đo.
- [ ] 6.4 Diễn tập staging một show GA nhỏ rồi một show hybrid bằng merchant sandbox, phân quyền staff đã duyệt và thiết bị thật. Ghi ngưỡng go/no-go và cách ngừng nhận mua mới khi phát hiện sai lệch. Chỉ mở pilot bán thật theo cấu hình merchant đã duyệt. Chỉ mở bán lớn sau khi nghiệm thu profile tải và vận hành cổng tại địa điểm.

## Workflow follow-up

- Ưu tiên change riêng cho pass nhiều suất, vé miễn phí, bàn/box hoặc chọn ghế liền nhau sau khi có dữ liệu pilot.
- Lập kế hoạch ngừng v1 sau khi rà hết đơn, callback, liên kết cũ và vé còn hiệu lực.

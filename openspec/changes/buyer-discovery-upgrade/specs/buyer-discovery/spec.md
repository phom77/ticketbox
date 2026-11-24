## MODIFIED Requirements

### Requirement: Trang chủ dẫn tới sự kiện và danh sách

Trang chủ SHALL có hero với tìm kiếm ba phần dùng chung, các lối tắt (Tối nay, Cuối tuần này, Tháng này, cùng thành phố và thể loại đang có sự kiện), mosaic nổi bật gồm một sự kiện lớn và tối đa bốn sự kiện đang mở bán có poster, và các hàng "Diễn ra trong tuần này" (nhãn Hôm nay/Ngày mai), "Đang mở bán" và "Sắp mở bán" với lối sang `/events`. Mỗi hàng ngang SHALL cuộn được bằng cảm ứng, bàn phím và nút trước/sau. Thẻ SHALL có khối ngày giờ, tên, địa điểm · thành phố, "Từ ₫X" khi có giá, "N ngày diễn" khi có nhiều suất, nhãn tình trạng bán và hành động mở chi tiết.

#### Scenario: Sự kiện công khai có giờ bán trong tương lai

- **WHEN** Catalog công khai một sự kiện có giờ mở bán chưa đến
- **THEN** danh sách hiển thị sắp mở bán theo quy tắc của trang chi tiết và thẻ mở đúng sự kiện.

#### Scenario: Sự kiện nhiều ngày diễn

- **WHEN** một sự kiện có nhiều suất công khai
- **THEN** thẻ chỉ xuất hiện một lần, hiện "N ngày diễn" và giá thấp nhất trong các suất đó.

#### Scenario: Khách cuộn hàng sự kiện

- **WHEN** khách dùng phím mũi tên khi hàng đang focus hoặc bấm nút sau
- **THEN** hàng cuộn sang các thẻ tiếp theo và nút bị vô hiệu ở hai đầu.

### Requirement: Tìm kiếm và bộ lọc có thể quay lại

Danh sách SHALL cho khách tìm tên sự kiện, tên bản dịch và địa điểm bằng từ khóa có dấu hoặc không dấu, lọc theo thành phố, thể loại, khoảng giá thấp nhất, ngày diễn bằng mốc có sẵn hoặc khoảng ngày tùy chọn, lọc theo tình trạng bán và sắp xếp theo ngày diễn hoặc mốc mở bán, với bộ lọc do Catalog áp dụng trước khi phân trang. Thanh lọc SHALL dính khi cuộn và mở thành sheet dưới màn hình dưới 760px. Tiêu đề SHALL nêu "N kết quả cho '…'" khi có từ khóa, và khách SHALL chuyển được giữa dạng lưới và danh sách. URL SHALL biểu diễn các lựa chọn đã áp dụng và số trang đã tải (`page`). Đổi bộ lọc SHALL không dựng lại trang và đưa danh sách về trang đầu.

#### Scenario: Mở liên kết tìm kiếm cũ

- **WHEN** khách truy cập `/` với lựa chọn tìm kiếm hoặc bộ lọc hợp lệ
- **THEN** trang danh mục mở với cùng lựa chọn đã áp dụng.

#### Scenario: Áp dụng và gỡ lọc trên điện thoại

- **WHEN** khách mở bộ lọc, chọn thành phố, ngày hoặc tình trạng
- **THEN** danh sách hiện các mục khớp ngay, thể hiện bộ lọc đã chọn và có cách gỡ từng điều kiện hoặc xóa tất cả.

#### Scenario: Mở chi tiết rồi quay lại

- **WHEN** khách mở một thẻ rồi bấm Back, tải lại hoặc chia sẻ URL kết quả
- **THEN** danh sách khôi phục từ khóa, lựa chọn đã áp dụng và số trang đã tải. Back trở lại vùng kết quả khách đã xem.

#### Scenario: Kết quả khớp một suất của sự kiện nhiều suất

- **WHEN** khách mở thẻ của một sự kiện có nhiều suất
- **THEN** trang chi tiết chỉ rõ suất được hiển thị trên thẻ và vẫn cho khách xem các suất còn lại.

#### Scenario: Lọc theo thành phố và giá

- **WHEN** khách chọn một thành phố và khoảng giá
- **THEN** chỉ các sự kiện có địa điểm ở thành phố đó và giá thấp nhất trong khoảng giá được trả về, và tổng số phản ánh đúng bộ lọc.

## REMOVED Requirements

### Requirement: Preview bộ lọc cần dữ liệu mới

**Reason**: Tỉnh/thành, thể loại và giá nay là bộ lọc thật của Catalog nên không còn cần bản preview với dữ liệu minh họa.

**Migration**: Route `/discover-preview` bị gỡ; dùng `/events?city=…&category=…&price=…`.

# Khám phá sự kiện công khai

## Purpose

Giúp khách tìm sự kiện phù hợp, biết tình trạng bán và quay lại danh sách đã lọc sau khi xem chi tiết.

## ADDED Requirements

### Requirement: Trang chủ dẫn tới sự kiện và danh sách

Trang chủ SHALL giới thiệu sự kiện công khai nổi bật và một nhóm show sắp tới, có lối sang danh mục `/events`. Thẻ SHALL có tên, ngày giờ, địa điểm, tình trạng bán đã xác định và hành động mở chi tiết. Tìm kiếm SHALL dùng header chung.

#### Scenario: Sự kiện công khai có giờ bán trong tương lai

- **WHEN** Catalog công khai một sự kiện có giờ mở bán chưa đến
- **THEN** danh sách hiển thị sắp mở bán theo quy tắc của trang chi tiết và thẻ mở đúng sự kiện.

### Requirement: Tìm kiếm và bộ lọc có thể quay lại

Danh sách SHALL cho khách tìm tên sự kiện, tên bản dịch và địa điểm bằng từ khóa có dấu hoặc không dấu, lọc theo ngày diễn bằng mốc có sẵn hoặc khoảng ngày tùy chọn, lọc theo tình trạng bán và sắp xếp theo ngày diễn hoặc mốc mở bán. URL SHALL biểu diễn các lựa chọn đã áp dụng.

#### Scenario: Mở liên kết tìm kiếm cũ

- **WHEN** khách truy cập `/` với lựa chọn tìm kiếm hoặc bộ lọc hợp lệ
- **THEN** trang danh mục mở với cùng lựa chọn đã áp dụng.

#### Scenario: Áp dụng và gỡ lọc trên điện thoại

- **WHEN** khách chọn ngày hoặc tình trạng trong khung lọc và bấm áp dụng
- **THEN** danh sách hiện các mục khớp, thể hiện bộ lọc đã chọn và có cách gỡ từng điều kiện hoặc xóa tất cả.

#### Scenario: Mở chi tiết rồi quay lại

- **WHEN** khách mở một thẻ rồi bấm Back, tải lại hoặc chia sẻ URL kết quả
- **THEN** danh sách khôi phục từ khóa và lựa chọn đã áp dụng. Back trở lại vùng kết quả khách đã xem.

#### Scenario: Kết quả khớp một suất của sự kiện nhiều suất

- **WHEN** khách mở thẻ của một sự kiện có nhiều suất
- **THEN** trang chi tiết chỉ rõ suất được hiển thị trên thẻ và vẫn cho khách xem các suất còn lại.

### Requirement: Phân trang trung thực và có thể thử lại

Danh sách SHALL lọc toàn bộ sự kiện công khai và đếm theo sự kiện trước khi phân trang. Mỗi thẻ SHALL dùng một suất đáp ứng đồng thời từ khóa, ngày và trạng thái đã chọn. Danh sách SHALL phân biệt tổng số kết quả, không có kết quả và lỗi yêu cầu.

#### Scenario: Chỉ có mục khớp ngoài trang đầu chưa lọc

- **WHEN** sự kiện khớp nằm ngoài trang đầu của danh mục chưa lọc
- **THEN** kết quả đã lọc vẫn tìm được sự kiện và số đếm phản ánh toàn danh mục.

#### Scenario: Tải thêm thất bại

- **WHEN** một trang tiếp theo lỗi
- **THEN** các mục đã tải vẫn dùng được và khách có thao tác thử lại trang đó.

### Requirement: Preview bộ lọc cần dữ liệu mới

Bản preview phát triển SHALL cho thử tỉnh/thành, thể loại và giá với fixture có nhãn dữ liệu minh họa. Trang công khai SHALL dùng dữ liệu thật và chỉ cung cấp các bộ lọc có thể phản ánh dữ liệu đó.

#### Scenario: Nhà phát triển thử bộ lọc tương lai

- **WHEN** mở bản preview phát triển và kết hợp tỉnh/thành, thể loại hoặc khoảng giá
- **THEN** kết quả fixture, các chip đã chọn và thao tác xóa lọc phản ánh đúng lựa chọn.

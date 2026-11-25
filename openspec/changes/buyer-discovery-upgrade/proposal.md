## Why

Trang chủ và danh mục là nơi khách tìm sự kiện, nhưng thẻ chưa cho biết giá, thành phố hay số ngày diễn; bộ lọc tỉnh/thành, thể loại và giá chỉ tồn tại ở bản preview với dữ liệu giả; mỗi lần đổi bộ lọc trang bị dựng lại và URL không ghi độ sâu phân trang.

## What Changes

- Catalog (cộng thêm, chỉ đọc): thẻ khám phá có `minPrice`, `city`, `category`, `performanceCount`; `GET /api/v2/events/discovery` nhận thêm `city`, `category`, `minPrice`, `maxPrice`; thêm `GET /api/v2/events/discovery/facets` liệt kê thành phố và thể loại đang có sự kiện sắp tới. Thành phố được suy ra từ phần cuối của địa chỉ địa điểm (không có cột riêng).
- Web: bộ lọc thành phố, thể loại, giá thành tham số thật; trang danh mục giữ nguyên khi đổi bộ lọc, ghi `?page=` trong URL; thanh lọc dính (sheet dưới 760px), chuyển lưới/danh sách; thẻ có khối ngày, địa điểm · thành phố, "Từ ₫X", "N ngày diễn"; trang chủ có hero tìm kiếm ba phần, lối tắt, mosaic nổi bật và các hàng cuộn ngang.
- Gỡ route `/discover-preview` cùng mã chỉ phục vụ preview. Hàng duyệt nhanh trong header thêm thành phố và thể loại.

## Impact

Chỉ thay đổi cộng thêm trong Catalog; không có hợp đồng liên dịch vụ hoặc migration mới. Chưa có dữ liệu "sắp hết vé" nên thẻ chỉ có nhãn Hết vé.

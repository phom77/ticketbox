## Why

Vé, thông báo và tài khoản của khách còn rời rạc: vé mở trong hộp thoại, không có trang chi tiết hay bản sao ngoại tuyến, thông báo chưa gom nhóm hoặc đánh dấu đã đọc hàng loạt, và đơn hàng chỉ có thẻ tóm tắt. Thay đổi này hoàn thiện ví vé, hộp thư và trung tâm tài khoản (plan §4 S11/S12/S13).

## What Changes

- Vé của tôi có tab Sắp tới / Đã qua, thẻ sự kiện có ngày, địa điểm và số vé. Trạng thái là bộ lọc phụ.
- Trang vé `/my-tickets/:ticketId` thay hộp thoại: mã QR lớn, chế độ toàn màn hình, thêm vào lịch (.ics), bản sao ngoại tuyến theo tài khoản.
- Thông báo gom theo Hôm nay / Trước đó, có Đánh dấu tất cả đã đọc, liên kết tới vé, đơn hàng hoặc tùy chọn tài khoản.
- Trung tâm tài khoản `/account`: Hồ sơ, Đơn hàng, Bảo mật, Tùy chọn. `/profile` chuyển hướng về đây.
- Chi tiết đơn `/account/orders/:orderId` có dòng thời gian trạng thái và biên nhận in được.
- Không đổi backend. Identity chưa có API đổi mật khẩu nên Bảo mật dẫn tới luồng quên mật khẩu hiện có.

## Impact

Chỉ frontend (`pages/customer`, `features/ticket`, `features/account`, `PublicLayout`, i18n). Ngoài phạm vi: chuyển nhượng, bán lại, yêu cầu hoàn tiền, thẻ ví điện tử.

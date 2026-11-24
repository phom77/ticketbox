## ADDED Requirements

### Requirement: Trung tâm tài khoản

Khách SHALL có \`/account\` với Hồ sơ, Đơn hàng, Bảo mật và Tùy chọn; \`/profile\` SHALL chuyển hướng tới mục tương ứng.

#### Scenario: Mở liên kết cũ

- **WHEN** khách mở /profile?tab=orders
- **THEN** khách được chuyển tới /account/orders

### Requirement: Chi tiết đơn và biên nhận

Mỗi đơn SHALL có trang chi tiết với dòng hàng, tổng tiền gồm mọi khoản phí, phương thức thanh toán, dòng thời gian trạng thái và biên nhận in được.

#### Scenario: Đơn đã thanh toán

- **WHEN** khách mở chi tiết đơn
- **THEN** dòng thời gian hiện các mốc tạo đơn, thanh toán và phát vé

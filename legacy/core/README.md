# Core legacy archive

Core source, Flyway migrations and tests are in [backend/](../../backend/). This directory contains the manual deployment, fault and restore rehearsals, and offline cutover tool. Run the commands below from the repository root.

## Isolated local deployment

```sh
docker compose -f legacy/core/compose.yaml up -d --build
```

The default project is `ticketbox-core-legacy` and the gateway listens on port `18093`. Its locally built images and project volumes are separate from the default six-service deployment. The archived deployment builds the gateway, Payment and Notification from their respective source directories. For an existing historical deployment, select its original project explicitly with `-p <project>` to address its existing volumes. Set `APP_PORT` explicitly if the old deployment needs its original port.

## Manual verification

```sh
(cd backend && bash mvnw -B -ntp clean verify)
docker compose -f legacy/core/compose.yaml config --quiet
docker compose -p ticketbox-e2e-core-legacy -f legacy/core/compose.yaml up -d --build
node legacy/core/e2e/resilience.mjs
node legacy/core/e2e/restore.mjs
```

The Core Maven suite requires Java 21 and Docker for Testcontainers. The rehearsal scripts default to the isolated `ticketbox-e2e-core-legacy` project on port `18093`. They stop services and exercise recovery against test data. Their reports and backups live under `.artifacts/legacy-core/e2e/`.

## Chuyển dữ liệu đã có

Compose trong thư mục này giữ deployment Core trước khi tách. Source phải đã chạy V34. Build và khởi tạo schema các database đích trước, rồi thực hiện cutover trước khi phục vụ traffic vào deployment mới.

~~~sh
python3 legacy/core/migrate-split.py --source-project ticketbox --target-project ticketbox
docker compose up -d
~~~

Script dừng gateway và toàn bộ writer, kiểm tra fingerprint dữ liệu seed đích, sao lưu source cùng các DB đích, rồi xuất dữ liệu. Nó giữ UUID, account hash/role, deadline, hold, idempotency key, payment intent/inbox, Order events, lịch sử soát vé, guest list, AI và batch jobs. Publication log được chia theo listener. Cutover dùng cùng Compose project để giữ Payment, Notification và Redis volume hiện hành, bao gồm shopping token.

Mỗi DB được nhập trong một transaction. Trạng thái cutover chưa hoàn tất chặn service khởi động. Sau khi đối chiếu từng bảng và chuyển artifact volume, script fence writer Core và đánh dấu đích sẵn sàng. Manifest và backup ở .artifacts/legacy-core/migration/. Các service sau cutover cùng tiếp tục dùng Payment/Notification database đã tồn tại.

Nếu import thất bại, giữ writer dừng và xem manifest cùng backup. Khi một số DB đã nhập thành công, cần khôi phục các DB đích từ bản *-before.dump và kiểm tra các marker trước khi diễn tập lại. Sau khi deployment mới nhận ghi, phục hồi cần bảo toàn những ghi mới đó. Core có startup fence để tránh mở lại nguồn dữ liệu đã chuyển quyền.

Backup database có thể chứa thông tin cá nhân và dữ liệu thanh toán. Thư mục .artifacts/ đã được loại khỏi Git.

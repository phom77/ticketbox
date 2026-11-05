# Phase 5–6 — Primary/replica và partitioning

Lab dùng PostgreSQL 16, streaming replication bất đồng bộ cho Catalog rồi Ticketing. Profile Spring `lab` bật datasource routing và migration partition. Các service replica chỉ thuộc profile Compose `lab`. Cấu hình mặc định không bật replica hoặc chuyển bảng sang partition.

Chạy trên project riêng để tách volume và dữ liệu khỏi deployment hiện tại:

```sh
export APP_PORT=18106 CHECKIN_PORT=18107
export APP_PUBLIC_URL="http://localhost:$APP_PORT" APP_ALLOWED_ORIGINS="http://localhost:$APP_PORT"
export LAB_PROJECT=ticketbox-lab-demo
docker compose -p "$LAB_PROJECT" -f compose.yaml -f compose.lab.yaml --profile lab up -d --build
python3 scripts/e2e/lab.py --project "$LAB_PROJECT" --port "$APP_PORT"
python3 scripts/db/lab-benchmark.py --project "$LAB_PROJECT" --rows 120000 --repeats 3
```

`compose.lab.yaml` đặt tên mặc định `ticketbox-lab`; các script chỉ chấp nhận tên `ticketbox-lab[-...]` hoặc `ticketbox-e2e-lab[-...]`. Dùng project mới cho mỗi lần diễn tập sau khi chuyển vai. Không đưa lab override vào deployment có dữ liệu thật.

Nếu dùng lại một volume lab đã tồn tại từ trước khi có replication, khởi động hai DB primary trước và chạy `python3 scripts/lab.py --project "$LAB_PROJECT" prepare`, rồi khởi động replica và ứng dụng. Bootstrap dùng `pg_basebackup -R`, không xóa volume đã có; standby quá cũ và mất WAL cần được dựng lại từ primary. `wal_keep_size=256MB` là giới hạn lab, không bảo đảm giữ WAL vô hạn.

## Định tuyến và dữ liệu trễ

`@ReplicaRead` chỉ bật ý định đọc replica trước khi transaction mở. Router còn yêu cầu transaction thực sự read-only. Lazy datasource lấy connection sau khi transaction đã có thông tin routing. Một lời gọi lồng trong transaction đang mở giữ connection/consistency của transaction đó; exception không để sót trạng thái routing trên thread.

| Đường đọc/ghi | Nơi xử lý |
|---|---|
| Catalog public list/detail/seat map/ticket types | Replica khi cache miss |
| Ticketing `GET /api/orders/my` | Replica |
| Chi tiết đơn, tra idempotency key, retry payment | Primary |
| Checkout, stock/hold/quota, payment, outbox, worker | Primary |
| Flyway và thao tác quản trị | Primary |
| Check-in quyết định nhận vé | Check-in DB, không có replica routing |

Replica đọc trễ có chủ đích; màn hình danh sách có thể chưa thấy đơn vừa mua. Checkout không dựa vào màn hình đó. Redis/gateway cache có thể giữ giá trị cũ đến khi TTL hết sau khi replica đã bắt kịp. Bài demo xóa riêng cache public trên Redis của project lab để kiểm tra datasource, không nhầm độ trễ cache với độ trễ WAL.

```sh
python3 scripts/lab.py --project "$LAB_PROJECT" lag catalog
python3 scripts/lab.py --project "$LAB_PROJECT" lag ticketing
```

Demo pause replay, commit một marker vào primary, xác nhận primary có 1 dòng và replica có 0; resume, chờ LSN barrier và xác nhận replica có 1. Acceptance HTTP còn mua và thanh toán đơn trong khi Ticketing replica bị pause: lịch sử đơn chưa thấy đơn mới nhưng API chi tiết và recovery theo idempotency key thấy ngay. Khi replica lỗi, truy vấn được route đến nó báo lỗi; lab không tự promote hoặc tự retry transaction ghi.

## Chuyển vai thủ công

Đây là planned switchover có downtime. Chỉ chạy sau khi bài đọc trễ và benchmark hoàn tất:

```sh
python3 scripts/lab.py --project "$LAB_PROJECT" switchover catalog
python3 scripts/lab.py --project "$LAB_PROJECT" switchover ticketing
```

Hoặc chạy cả hai cùng kiểm tra HTTP sau từng lần:

```sh
python3 scripts/e2e/lab.py --project "$LAB_PROJECT" --port "$APP_PORT" --switchover
```

Script dừng gateway và mọi ứng dụng writer, lưu `default_transaction_read_only=on` trên primary cũ, đợi replica replay đến `pg_current_wal_lsn()`, chặn TCP trong pg_hba.conf của primary cũ, dừng primary cũ rồi gọi `pg_promote`. Nếu một bước thất bại, writer giữ trạng thái dừng để người vận hành kiểm tra; không tự mở lại primary cũ. Sau khi promote, script lưu endpoint mới vào `.artifacts/lab/<project>/roles.json` trước khi mở lại ứng dụng bằng `up -d --no-deps`.

Trong giai đoạn này cả primary và read endpoint đều trỏ đến node vừa promote. Primary cũ giữ trạng thái dừng/read-only và chặn TCP (file pg_hba.conf này không được stream sang node mới); chưa có standby mới. Không dùng lệnh Compose base để khởi động lại ứng dụng sau chuyển vai vì nó chứa endpoint cũ. Khi cần mở lại các ứng dụng, dùng đủ override:

```sh
docker compose -p "$LAB_PROJECT" -f compose.yaml -f compose.lab.yaml \
  -f ".artifacts/lab/$LAB_PROJECT/roles.json" --profile lab \
  up -d --no-deps identity catalog ticketing checkin payment notification gateway
```

Một primary cũ không thể trở thành standby chỉ bằng cách khởi động lại. Giữ bản sao volume cũ để kiểm tra; dựng standby mới bằng base backup từ primary mới (hoặc quy trình pg_rewind đã kiểm thử). Lab không tự xóa hoặc tái sử dụng volume cũ. Cách diễn tập lại đơn giản là dùng project lab mới. Có thể dừng toàn bộ project bằng `docker compose -p "$LAB_PROJECT" -f compose.yaml -f compose.lab.yaml --profile lab down`; lệnh này giữ volume.

## Migration partition và ràng buộc

Ticketing `db/lab/V100__hash_order_events.sql` tạo bốn partition hash theo `order_id`. PK `(order_id, stream_version)` bao gồm partition key nên vẫn chặn event trùng phiên bản trong stream. CHECK cho version/type/schema/payload được sao chép. Migration khóa bảng, copy dữ liệu và so sánh hai chiều bằng `EXCEPT ALL` trước khi đổi tên; toàn bộ chạy trong transaction Flyway. Hàm replay vẫn truy vấn tên `order_events`. Quyền UPDATE/DELETE/TRUNCATE bị thu hồi ở cả parent và child để default privileges không mở lối sửa lịch sử.

Check-in lab tạo `scan_audit` ở V99 và chuyển sang range tháng UTC ở V100. Đây là snapshot append-only của các lượt admission đã chấp nhận; không ghi những QR bị từ chối. Trigger trên `checkin_logs` ghi audit cùng transaction nhận vé. V99 backfill lịch sử có sẵn. `checkin_logs` và UNIQUE ticket admission/FK hiện có vẫn là authority. Audit lưu ID và thuộc tính dạng snapshot, không thêm FK làm cản trở lưu lịch sử.

PK audit là `(recorded_at,id)`, vì UNIQUE/PK của partitioned table phải chứa partition key. Nó không tuyên bố `id` duy nhất toàn bảng. Migration tạo tháng trước, tháng hiện tại và ba tháng tiếp theo; dữ liệu ngoài khoảng vào `scan_audit_default`, không bị mất. Mốc tháng tính UTC ngay cả khi session dùng múi giờ khác.

Tạo tháng mới bằng migration owner; hàm khóa parent, chuyển các dòng đã rơi vào default sang child trước khi attach, thu hồi quyền sửa/xóa trên child mới và có thể gọi lại:

```sql
SELECT ensure_scan_audit_month(DATE '2027-03-01');
```

Thực hiện trước tháng cần dùng và trong cửa sổ bảo trì vì có khóa ACCESS EXCLUSIVE. Không chạy bằng runtime role. Một DB đã áp dụng migration lab phải tiếp tục dùng profile lab; không đổi profile trên cùng volume để quay về bảng thường.

Các script SQL có thể chạy lại bằng migration owner:

```sh
docker compose -p "$LAB_PROJECT" -f compose.yaml -f compose.lab.yaml --profile lab \
  exec -T ticketing-db psql -U ticketing_owner -d ticketbox_ticketing < scripts/db/verify-lab-ticketing.sql
docker compose -p "$LAB_PROJECT" -f compose.yaml -f compose.lab.yaml --profile lab \
  exec -T checkin-db psql -U checkin_owner -d ticketbox_checkin < scripts/db/verify-lab-checkin.sql
```

Sau khi Ticketing chuyển vai, thay node `ticketing-db` bằng `ticketing-replica` và dùng `env PGHOST=127.0.0.1` trước `psql`.

## Đo và bằng chứng

Benchmark tạo schema riêng `lab_benchmark` trong lab DB, nạp cùng bộ dữ liệu và index vào bảng thường và partitioned, kiểm tra bằng nhau bằng `EXCEPT ALL`, ANALYZE, warm-up từng truy vấn rồi chạy ba lần đo. Kết quả gồm median execution/planning time, shared hit/read buffers, số dòng và danh sách relation đã truy cập. Schema benchmark được xóa trong `finally`; bảng nghiệp vụ không được nạp dữ liệu benchmark.

Dữ liệu gồm 120.000 event (30.000 stream, bốn event/stream) và 120.000 audit trên 12 tháng. Có cả truy vấn chứa partition key và truy vấn thiếu partition key để thấy chi phí fan-out. Các file `*.json` trong `.artifacts/verification/phase-5-6/` giữ toàn bộ `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` và tóm tắt. Số đo local không phải cam kết tốc độ production.

| Truy vấn | Bảng thường (ms) | Partition (ms) | Shared hit thường → partition | Partition được đọc |
|---|---:|---:|---:|---:|
| Event theo stream/order_id | 0.137 | 0.129 | 7 → 6 | 1/4 |
| Event theo thời gian, thiếu order_id | 11.688 | 12.566 | 3334 → 3335 | 4/4 |
| Ghi 1.000 event | 7.228 | 9.082 | 4130 → 3238 | — |
| Audit theo tháng | 2.807 | 1.891 | 524 → 126 | 1/12 |
| Audit qua ranh giới hai tháng | 1.625 | 1.219 | 340 → 255 | 2/12 |
| Audit theo id, thiếu thời gian | 10.322 | 9.203 | 1482 → 1484 | 12/12 |
| Ghi 1.000 audit | 11.718 | 8.479 | 6105 → 5114 | — |

Đây là median execution time của lần đo local đã lưu, warm cache (shared read = 0 cho các truy vấn đọc). Planning time nằm trong JSON và cao hơn ở bảng partition; nên xem cả planning + execution cho truy vấn ngắn. Ghi đo bằng EXPLAIN ANALYZE INSERT theo batch 1.000 dòng, không tính round-trip/COMMIT. Hash làm ghi event chậm hơn trong lần đo này; audit theo tháng giảm buffers rõ rệt. Truy vấn thiếu partition key vẫn fan-out dù thời gian local có thể dao động theo cache và parallel plan. Vì vậy cấu hình mặc định tiếp tục dùng bảng thường.

Kiểm tra Java có thêm trường hợp dữ liệu cũ nằm trong default được chuyển sang tháng cụ thể, truy vấn qua hai tháng, và detach/attach lại partition. Ledger admission giữ nguyên trong lúc archive audit. Khi archive thật, dùng migration owner trong cửa sổ bảo trì:

```sql
ALTER TABLE scan_audit DETACH PARTITION scan_audit_2026_10;
-- Dump bảng đã detach bằng pg_dump --table=public.scan_audit_2026_10 và kiểm tra backup.
-- Bảng vẫn tồn tại, nhưng không còn xuất hiện trong truy vấn qua parent.
ALTER TABLE scan_audit ATTACH PARTITION scan_audit_2026_10
  FOR VALUES FROM ('2026-10-01T00:00:00Z') TO ('2026-11-01T00:00:00Z');
```

Trước khi attach lại, kiểm tra có dữ liệu cùng khoảng tháng rơi vào default hay không và đối chiếu với archive. Không xóa ledger hay event stream để archive audit.

`lab.py lag` ghi cả WAL bytes chưa replay và thời điểm replay cuối. Acceptance có bước dừng Ticketing replica: lịch sử trả lỗi khả dụng, nhưng chi tiết đơn/recovery vẫn đọc primary; khởi động lại replica và đợi WAL barrier để lịch sử phục hồi. Có thể diễn tập riêng trước khi promote với `python3 scripts/e2e/lab.py --project "$LAB_PROJECT" --port "$APP_PORT" --replica-outage-only` khi đã có đơn audience.

Replication là bất đồng bộ: promote khi chưa bắt kịp có thể mất các commit chỉ nằm trên primary cũ. Bài switchover này dừng writer và đợi chính xác WAL barrier nên không bỏ lại commit nào trước barrier; đây không phải bảo đảm RPO=0 cho sự cố primary mất đột ngột. Test bổ sung đã khởi động lại primary cũ, xác nhận vẫn read-only và bị từ chối TCP, rồi dừng nó lại.

Tham khảo chính thức: [PostgreSQL 16 streaming standby](https://www.postgresql.org/docs/16/warm-standby.html), [manual failover](https://www.postgresql.org/docs/16/warm-standby-failover.html), [partition constraints](https://www.postgresql.org/docs/16/ddl-partitioning.html).

Bằng chứng nghiệm thu tổng hợp ở `.artifacts/verification/phase-5-6/summary.json`: 166 backend test và 23 reactor test đều pass, không fail/error/skip; acceptance HTTP, mất replica, hai lần promote và fence sau restart đều pass. Backend Surefire có cảnh báo timeout khi tắt fork JVM sau test; Maven verify vẫn exit 0. Lab diễn tập hiện tại là `ticketbox-e2e-lab-final`, đã promote cả hai standby; primary cũ đang dừng. Bắt đầu project mới theo ví dụ phía trên để có lại topology primary + standby ban đầu.

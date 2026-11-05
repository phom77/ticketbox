# Phase 5–6: PostgreSQL lab

User request: implement Catalog then Ticketing read replicas, demonstrate stale reads, primary checkout routing and manual role change; experiment with hash `order_events` and monthly range `scan_audit`, compare plans and validate migrated constraints.

## Approach

Use a separate Compose override with `lab` profile and separate project/volumes. PostgreSQL 16 physical streaming replicas preserve all service schema and roles. An opt-in method annotation plus a lazy transaction-aware datasource routes only approved read-only transactions to replicas. Unannotated reads, checkout/recovery, writes, Flyway and workers stay on primary. Default deployment remains unchanged.

Alternatives: routing every read-only transaction risks stale checkout/recovery; SQL/proxy classification obscures business consistency. Explicit method routing is the implementation choice. Replica failure is visible (no automatic failover); role change is a planned, fenced switchover requiring caught-up WAL, writer stop, old-primary stop, promotion and application restart. Old primary stays stopped until rebuilt.

Lab-only Flyway locations convert `order_events` to four hash partitions while preserving its `(order_id, stream_version)` key, checks, replay function and append-only grants. `scan_audit` is a new lab-only accepted-admission audit derived from `checkin_logs` (not a log of denied requests); a trigger records new admissions. Its key is `(recorded_at,id)` from inception; monthly UTC partitions plus a default partition preserve out-of-range history. Check-in authority and unique ticket admission ledger remain unchanged.

Benchmarks use disposable equal-data/index ordinary and partitioned tables, EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON), warm-up and repeated runs. Record actual numbers; do not assume partitioning is faster. Tests verify existing row equality, replay, uniqueness/checks, FK behavior and runtime permissions including direct child access. Artifacts go under ignored `.artifacts/verification/phase-5-6`.

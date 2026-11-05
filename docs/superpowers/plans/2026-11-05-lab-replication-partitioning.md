# Phase 5–6 Implementation Plan

**Goal:** Reproducible replication and partitioning lab with measured evidence.
**Architecture:** Opt-in lazy datasource routing; PostgreSQL 16 streaming standby; lab-only partition migrations.
**Tech Stack:** Spring Boot 3.3.5, Java 21, PostgreSQL 16, Docker Compose, Python 3.
**Spec:** docs/superpowers/specs/2026-11-05-lab-replication-partitioning-design.md

## Constraints and review focus

Preserve phase 2–4 work and default deployment. Do not route checkout or idempotency recovery to replicas. Fence old primary before promotion. Preserve append-only events, old rows and replay. Range boundaries use UTC and include a default partition; accepted ticket uniqueness stays in checkin_logs.

### Task 1: Explicit read routing
- [x] Add real-database tests for opted-in reads, ordinary reads/writes and transaction nesting.
- [x] Implement annotation/aspect, lazy router and conditional pool configuration in shared runtime; import from SplitCommon.
- [x] Opt in public Catalog reads and Ticketing order-history list only; test primary checkout recovery behavior.

### Task 2: Replica infrastructure and demos
- [x] Add compose.lab.yaml, standby bootstrap, repeatable primary preparation and bounded replication checks.
- [x] Demonstrate paused replay/stale read, primary recovery lookup, resume/catch-up for Catalog then Ticketing.
- [x] Provide planned switchover with stopped writers, WAL barrier, old-primary fence and saved endpoint override.

### Task 3: Partition migration and benchmark
- [x] Test seeded row preservation, constraints, permissions and replay on PostgreSQL before implementation.
- [x] Add ordinary scan_audit/trigger migration and lab-only hash/range migrations.
- [x] Compare equivalent ordinary/partitioned data and indexes, record JSON plans/timings/buffers/pruning.

### Task 4: Verification and documentation
- [x] Run Java reactor/backend suites, lab acceptance including actual role switch, and Compose validation.
- [x] Document commands, measured results, role-switch recovery and monthly partition maintenance.

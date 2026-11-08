# Persistence and consistency

- Persist business facts in the owning service. Use database constraints where
  they can enforce a critical invariant. A read-before-write check alone
  leaves a race when multiple requests can write concurrently.
- Identify which invariants must commit together. Preserve the documented
  [purchase transaction and lock ordering](../architecture.md#purchase-consistency).
  Keep external calls outside transactions where possible. Review deadlocks,
  retries and partial effects when changing locking or write order.
- Preserve physical replica routing for existing read paths. Checkout,
  idempotency recovery and writes use the primary. Identify stale-read
  tolerance when changing a read or cache path and verify the physical route
  when moving routing code.
- Keep released Flyway migrations intact. For new changes, consider mixed
  versions, table locks, volume, backfill, compatibility and rollback. Follow
  the [database workflow](../development.md#database-changes).
- Review query size, pagination, ordering, index use and N+1 risks. Measure on
  representative data before optimizing. Retain expected timestamp and money
  precision. Keep personal data out of fixtures and generated reports shared in Git.

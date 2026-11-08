# Observability and operations

- Correlate operations across service and async boundaries with safe request,
  job or message identifiers. Use structured logs with diagnostic context
  and keep payloads containing personal data, tickets or credentials private.
- For changed runtime paths, define signals for latency, errors, saturation,
  queue age, retries or terminal failures as appropriate. Check that a
  readiness signal reflects the dependency or operation it claims to cover.
- Verify the effective scrape targets before relying on metrics during a
  drill. The optional Compose monitoring configuration and its scope are
  documented in [Development and testing](../development.md#run-locally).
- Document rollout order, alerts and recovery for operational changes. Follow
  the [service cutover guide](../service-extraction.md) for split-service
  migration and the [lab guide](../lab-replication-partitioning.md) for
  replica routing and switchover evidence.

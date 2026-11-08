# Backend reliability and recovery

- Define timeouts and a bounded retry policy for external work. Distinguish
  temporary errors from permanent rejection. Retain original identities
  across uncertain outcomes, including a provider accepting an attempt before
  the response is lost.
- Preserve [messaging and recovery guarantees](../architecture.md#messaging-and-recovery),
  including durable publication, inbox deduplication, stable message IDs and
  pending-publication compatibility. Keep existing legacy event names and
  listener IDs where the repo requires them.
- For a new async path, specify ownership, duplicate and ordering behavior,
  what commits together, and when work can be retried, replayed or escalated
  for operator intervention. Preserve manual payment compensation semantics
  unless an approved change alters the contract.
- Set meaningful limits on work per batch, queue size, request size or
  concurrency where resource use warrants it. Consider shutdown and recovery
  for work in flight. Verify lost responses, worker restart, unavailable
  dependencies and retry exhaustion as relevant.

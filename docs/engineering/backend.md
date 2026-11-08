# Backend engineering

Start with the owning Java service and the conventions in
[AGENTS.md](../../AGENTS.md). Use the [architecture guide](../architecture.md)
to locate responsibilities and the [development guide](../development.md#verification)
to select its checks.

| Change | Read |
| --- | --- |
| Service boundaries, domain layers and design decisions | [Architecture policy](architecture-policy.md), [Engineering decisions](engineering-decisions.md) |
| HTTP, messaging or client-visible errors | [API and data](api-and-data.md), [Security](security.md) |
| Transaction, query, cache or schema work | [Persistence](backend-persistence.md) |
| Async work, provider integration, or recovery | [Reliability](backend-reliability.md), [Observability](observability-operations.md) |

# Service domain models and persistence mapping

## Decision

Each service owns its domain language, use cases and adapters. Domain source is independent of
Spring, JPA, Jackson and HTTP. Application use cases depend on domain types and I/O ports.
HTTP controllers, persistence, Redis, provider clients and messaging implement the outer adapters.
Spring transactions can remain on application orchestration classes.

Existing aggregate objects are persisted through external JPA mappings in each service's
`src/main/resources/META-INF/orm.xml`. Mapping metadata, generated identifiers and lifecycle
callbacks preserve the established database representation. Domain objects have no ORM annotations.
The Spring Data interfaces in infrastructure implement application repository ports.

Use-case input and output records belong to application. HTTP adapters reuse those records when
the wire shape already matches. Multipart transport objects are converted to an application upload
port at the web boundary. SQL read projections remain in infrastructure.

## Aggregate and consistency boundaries

| Context | Write model and protected rules |
| --- | --- |
| Identity | Account registration establishes an active audience role. Profile and administrator operations change the account through its domain methods. |
| Catalog | Concert owns its lifecycle and sale window. Ticket type configuration changes continue to acquire the owning concert lock. Artist biography jobs retain their existing state transitions. |
| Ticketing | Order owns the priced order items and payment deadline. Payment, cancellation and expiry are domain operations. Stock and hold changes retain their existing coordinated transaction with the order and event stream. |
| Check-in | Admission refers to one ticket and one concert. The accepted record is created after the conditional claim succeeds. The unique admission constraint is the concurrency authority. |
| Payment | Payment intent is immutable. Payment attempt classifies verified receipts, conflicting money and repeated transactions before the adapter records the result. |
| Notification | A notification command determines the content and stable per-channel message identity. The application commits inbox acceptance and both channel messages together. |

## Reasons and consequences

External ORM mapping keeps domain behavior and persistence configuration separate while retaining
managed object identity, dirty checking and pessimistic locks. Duplicating every aggregate into a
second persistence object would require translating managed state in the middle of the existing
checkout transaction. Retaining JPA annotations in domain would leave a dependency the architecture
checks are intended to prevent.

Some persisted models retain setters for reconstruction and compatibility fixtures. Application
commands use domain operations for the modeled lifecycle rules. The Order architecture check
rejects application calls to its status setter. Simple lookup, audit and projection records do not
require a behavior-rich aggregate.

The external mappings must be tested against real PostgreSQL with the existing service suites.
Changing an aggregate field requires reviewing its mapping. Released Flyway histories, wire schemas,
legacy publication types and listener IDs remain compatibility requirements.

Architecture tests enforce domain independence, application dependencies and controller boundaries.
They complement the transaction, concurrency, callback replay and mixed-version service tests.

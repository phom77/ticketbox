# Architecture and module boundaries

- Use the accepted ownership and dependency rules in
  [AGENTS.md](../../AGENTS.md), [Architecture](../architecture.md), and the
  [service domain model ADR](../adr/0001-service-domain-models.md).
  Read the [glossary map](../../GLOSSARY-MAP.md) and owning glossary when
  changing domain terminology or invariants.
- Keep each service's state under its owner. Use established HTTP and message
  contracts across services and exposed capability interfaces within a service.
  Keep business rules and effects testable at the owning boundary.
- Add ports at use-case I/O boundaries where the repository rules call for
  them. Preserve the accepted external ORM mapping and existing Spring
  orchestration allowances. Apply service layering to its documented scope.
- Keep persisted event compatibility covered in the owning service. For a
  change to service isolation, check independent image builds, package
  dependencies and cross-service behavior separately.
- Review changes to boundary rules before implementation and record which
  architecture checks or integration tests protect the decision.

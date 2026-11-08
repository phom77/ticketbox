# Engineering decisions

- Start with the affected invariant, owner, and operational constraint. Use
  the existing architecture and select the smallest design that meets the
  requirement. Keep simple reads and CRUD close to their owners.
- Use domain operations when they protect a real invariant. Define aggregate
  boundaries by consistency rules. Consider read projections when query needs
  justify them. Keep external I/O behind the existing ports where suitable.
- Propose an ADR for significant changes to service boundaries, public
  contracts, authentication, storage ownership, transaction guarantees,
  messaging, deployment or major dependencies.
- Include the context, options, decision, compatibility, failure modes,
  operating cost and verification evidence. Link accepted decisions in
  [docs/adr/](../adr/) and the relevant architecture or workflow documentation.
  Preserve prior decisions when recording a superseding choice.

# Core engineering rules

- Before editing, identify the affected behavior, its owner, callers, and
  observable acceptance criteria. Record assumptions when the requirements,
  stored data, or operating environment leave an outcome uncertain.
- Enforce invariants at the trusted boundary that owns them. Use explicit types
  or states when they clarify valid transitions. Report failures distinctly from
  successful results and keep diagnostic context free of sensitive data.
- Keep changes focused. Reuse existing modules and interfaces where they fit.
  Introduce a dependency, layer, cache, or abstraction to solve a concrete
  problem in the current change.
- Preserve accepted behavior and compatibility unless the approved change
  alters them. For a breaking change, specify affected consumers, deployment
  order, migration and rollback.
- Select checks by the affected boundary. Record results and unresolved gaps
  as described in [Quality gates](quality-gates.md).

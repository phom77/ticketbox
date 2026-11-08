# Requirements and change design

- Describe the user or operator, problem, scope, acceptance criteria and
  unresolved assumptions. Use the repository's glossary where a term carries
  business meaning.
- Specify observable scenarios for relevant success, invalid input, forbidden
  access, duplicate actions and failure recovery. State what data must be
  committed, visible, or recoverable after each case. Include performance or
  accessibility requirements when the change depends on them.
- In design, identify the affected ownership and interfaces, compare material
  alternatives, and explain transaction, compatibility, rollout and rollback
  implications where they apply.
- Follow the [OpenSpec workflow](../development.md#planning-changes) for
  substantial new behavior or contract changes. Link accepted requirements and
  decisions. If a requirement changes during implementation, review the spec
  change before proceeding on the new assumption.

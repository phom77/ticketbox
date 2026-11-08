# Delivery and maintenance

- Inspect the working tree and keep the diff within the approved scope.
  Preserve existing user work and separate unrelated refactors from feature
  changes.
- Use the [development guide](../development.md) for commands, and update the
  applicable architecture, API, ADR or workflow documents as accepted behavior
  changes. Keep historical plans and decisions accessible.
- Review build or dependency changes for compatibility and support burden.
  Get approval before introducing a new tool, hook, CI requirement or
  significant engineering policy.
- Before a release with operational impact, review compatibility, deployment
  order, data migration, failure detection and rollback. Use the project's
  existing [cutover and restore guidance](../service-extraction.md) where relevant.
- Report the checks that actually ran and relevant evidence. Review inherited
  failures separately from regressions introduced by the change.

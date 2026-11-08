# Verification and quality gates

| Scope | Evidence |
| --- | --- |
| Affected Java service | Maven verification, independent service build gate where required, and applicable contract or recovery tests |
| Full service architecture refactor | Reactor and shared CI checks. Report isolation, layer dependencies and operational acceptance separately. |
| Web or scanner | Existing lint, build or typecheck commands and applicable browser or device checks |
| HTTP, events, Flyway, security or operations | Compatibility, authorization, failure and rollout checks for the affected boundary |

Use the actual [repository commands](../development.md#verification) and
[CI workflow](../../.github/workflows/verify.yml). Record command, result, scope,
and reasons for checks that were skipped or blocked. Keep pre-existing failures
distinct from new regressions. Preserve checks and test expectations when fixing
failures. Use new gates only after the need and rollout have been reviewed.

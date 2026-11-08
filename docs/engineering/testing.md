# Testing strategy

- Verify observable requirements through existing entry points. Use unit tests
  for isolated rules and integration or contract tests where correctness
  depends on storage, services or clients.
- Use focused regressions for reproduced defects. Include invalid, unauthorized
  or boundary cases that matter, and exercise concurrency, replay, retries
  and partial failures for affected paths.
- Use deterministic fixtures and avoid dependence on ambient clocks, ordering
  or production data. Keep released migration and pending-publication
  compatibility covered by the relevant service suite.
- Select commands from [Development and testing](../development.md#verification).
  Use the [frontend quality guide](frontend-quality.md) for browser and scanner
  work. Record scope and limitations alongside automated results.

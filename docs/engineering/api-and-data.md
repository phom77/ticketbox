# API and data contracts

- Check the [API guide](../api.md) and [versioned contracts](../../contracts/)
  before changing request, response or message shapes. Specify validation,
  authorization, status and error semantics for each affected entry point.
  Preserve compatible consumers and distinguish business rejection from
  temporary unavailability.
- For list endpoints, define bounds, stable ordering, filtering and pagination
  semantics. Validate at the service boundary and derive trusted identity and
  ownership from authenticated context.
- Define identity, version and ownership for event and callback changes.
  Specify which repeated requests are safe and how duplicates, conflicting
  payloads, and out-of-order delivery are handled.
- Preserve stable machine-readable error behavior and review localized text
  separately when clients display it. Verify applicable invalid, unauthorized,
  concurrent, repeated and partially failed requests through real entry points.

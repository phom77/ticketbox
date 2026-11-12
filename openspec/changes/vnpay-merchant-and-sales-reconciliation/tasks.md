# Tasks

## 1. Sandbox and provider verification

- [x] 1.1 Add environment-specific provider selection in checkout, Ticketing and Payment. Verify valid VNPAY sandbox configuration, rejection of unsupported providers and missing settings, and MOCK checkout in CI.
- [x] 1.2 Verify signature, merchant, order reference, amount and transaction identity through callback and query fixtures. Exercise browser return before IPN, query recovery, repeated receipts and late money. Verify the existing Payment result and ACK contracts and that ticket and stock behavior is unchanged.

## 2. Attribution and reporting

- [x] 2.1 Store the organization at order creation without changing the Order event stream or transaction ordering. Verify persistence across replay and retries, preservation of released migrations, and platform-only reporting for unattributed orders.
- [x] 2.2 Add the versioned reconciliation snapshot, durable delivery and Ticketing receiver. Verify version ordering, retry after an unavailable receiver, duplicate delivery, unknown and failed attempts, and reconciliation after restore.
- [x] 2.3 Add scoped report and CSV endpoints and their finance workspace. Test exact period boundaries in the reporting timezone, export parity, stable pagination, independent organizations, freshness, recorded refunds and spreadsheet-safe text fields.

## 3. Integration and acceptance

- [ ] 3.1 Run strict OpenSpec validation, Payment and Ticketing Maven verification and independent builds, web lint/build and the shared CI checks. Reconcile two organizations against redacted VNPAY sandbox evidence after the staging HTTPS, merchant, IPN and query settings are available. Record evidence for success, failure, unknown, IPN-loss recovery and late money, and identify fixture-only cases. Record A0's live-merchant decision separately.

Local CI, browser checkout, MOCK checkout, reporting and restore passed. The staging profile was exercised locally with missing settings and with an HTTPS configuration fixture. The merchant sandbox checkout and settlement evidence remain pending the deployment target, merchant secret configuration, registered IPN and sandbox query endpoint.

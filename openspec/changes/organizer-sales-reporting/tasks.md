# Tasks

## 1. Decision

- [x] 1.1 Accept ADR 0005 (sales ledger and reporting dates).

## 2. Ticketing

- [x] 2.1 `V20__sales_ledger.sql` (table, indexes, `order_refunds.confirmed_at`) and the `SalesLedger` port with `JdbcSalesLedger`. Call it from `OrderService.handlePaymentSuccess` and `RefundOrderEffects.apply` in the existing transactions. Integration tests: paid, refunded, replayed result, compensation refund (no row), concurrent payment results, rollback leaves no row.
- [x] 2.2 `V21__sales_ledger_backfill.sql` with a test comparing ledger totals to the current revenue query for native, legacy, refunded and organization-less orders.
- [x] 2.3 Multi-grant `@OrganizerPermission` and caller grants request attribute. HTTP tests for EVENTS-only, FINANCE-only, both and neither.
- [x] 2.4 Sales query service and `/api/organizer/sales` summary, trend and breakdown with timezone, period validation, provisional flag, capacity and money-field omission. Tests per scope, bucket and grant, and another organization's ids.
- [x] 2.5 CSV and PDF export (UTF-8 BOM CSV, OpenPDF with Noto Sans). Extend `VietnamesePdfTest`.
- [x] 2.6 Reconciliation: organization filter before the join, `effective_at` column and index, keyset paging. Keep `JdbcReconciliationStoreTest` green and add it to `scripts/ci/java-suites.json` with a new `sales-ledger` group.
- [x] 2.7 Large-data timing test (one million ledger rows) recording p95 for summary and trend. Mark the old revenue endpoints deprecated. Update `docs/api.md` and the Ticketing glossary (sales ledger, provisional).

## 3. Web

- [x] 3.1 API client `api/sales.ts` with typed optional money fields.
- [x] 3.2 Extract `features/reporting/TrendChart.tsx` from `RevenueTrendChart` with a series switch and unit tests.
- [x] 3.3 Reports › Sales view: scope and period pickers in the URL, KPI tiles, trend, breakdown tables, exports, provisional note, loading, empty, error and permission states.
- [x] 3.4 Overview: sales strip, On sale now with sell-through, Next 7 days with check-in, each with its own state.
- [x] 3.5 Redirect `/organizer/revenue` and `?view=revenue`. Remove the revenue tab. en/vi catalogs. Component tests for grant-dependent rendering.

## 4. Verification

- [x] 4.1 Ticketing Maven verify and `verify-service-boundaries.py --service ticketing`; web lint, test and build.
- [ ] 4.2 Compose walk-through: buy tickets for two performances of one event, refund one order, then check that the Overview and Reports › Sales show gross, refunds, net and tickets per performance and per ticket type as FINANCE, and tickets only as EVENTS. Export CSV and PDF. Screenshots at 1440, 834 and 390.
- [x] 4.3 `openspec validate organizer-sales-reporting --type change --strict`.

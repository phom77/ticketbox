# Design

## Context

- **PAID:** an order becomes PAID only in `OrderService.handlePaymentSuccess` (`order/application/OrderService.java`). It runs in a transaction holding the `orders` row lock, records `OrderPaid`, saves the order and issues tickets. All payment paths (result inbox, completed listener, mock and webhooks) reach it.
- **REFUNDED:** an order becomes REFUNDED only in `RefundOrderEffects.apply`, under the same lock, after checking that the confirmed amount equals `orders.total_amount`. A replayed result returns early. Compensation refunds confirm money returned for orders that were never PAID.
- **Refund shape:** refunds are whole-order only. Transfers create a new ticket on the same order item and never change the order.
- **Order data:** `orders` carries `organization_id` (set by trigger, NULL for old seed rows), `concert_id` (the performance id for native orders), `performance_event_id`, `paid_at` and `payment_provider`. `order_items` carries the offer (`ticket_type_id`), `group_id`, `quantity`, `unit_price` and `subtotal`. A legacy concert's Catalog event id equals its concert id.
- **No refund time:** no refund timestamp is stored. Only `order_events.recorded_at` of `OrderRefunded` exists.
- **Current reporting:** the reports join `orders` and `order_items` on demand per concert, with `Asia/Ho_Chi_Minh` hard-coded. Exports use a hand-built CSV and OpenPDF.
- **Organizer permission:** `OrganizationAccess` enforces one `@OrganizerPermission` grant per handler.

## Decisions

### Sales ledger (ADR 0005)

`sales_ledger` columns:

| Column | Notes |
|---|---|
| `id` | |
| `order_id`, `order_item_id` | |
| `kind` | `SALE` or `REFUND` |
| `organization_id`, `event_id`, `performance_id` | |
| `offer_id`, `group_id` | `group_id` is null for legacy |
| `offer_name`, `section_label` | |
| `quantity` | positive |
| `amount` | `numeric(12,0)`, positive, whole VND |
| `provider` | |
| `occurred_at` | the business time |
| `recorded_at` | |

- `UNIQUE (order_item_id, kind)` makes writes idempotent (`ON CONFLICT DO NOTHING`).
- Indexes on `(organization_id, occurred_at)`, `(event_id, occurred_at)` and `(performance_id, occurred_at)`. Signs are applied in queries.
- A `SALE` row uses `occurred_at = paid_at`.
- A `REFUND` row uses `occurred_at` = the confirmed refund time from the result. `order_refunds.confirmed_at` is added and set at the same point.
- Compensation refunds create no rows, because the order never produced a sale.
- `event_id = COALESCE(orders.performance_event_id, orders.concert_id)`.
- `organization_id = COALESCE(orders.organization_id, concerts.organization_id)`.
- Writer: the `SalesLedger` port lives in `reporting/application/port` and `JdbcSalesLedger` in `reporting/infrastructure`. `OrderService` calls it right after saving the PAID order, and `RefundOrderEffects` right after recording `OrderRefunded`. Both are in the existing transaction, so the ledger cannot diverge from the order state. ArchitectureTest keeps application code free of JDBC.
- Backfill (`V21`, SQL only): `SALE` rows for every PAID or REFUNDED order item with `paid_at`, and `REFUND` rows for every REFUNDED order item, dated by the `OrderRefunded` event's `recorded_at`.
  - A verification query in the integration test compares ledger totals with the current on-demand revenue query on the same data.
- **No daily rollup table in this change.** Reports aggregate the ledger through its indexes. A rollup is added only if measurement shows a p95 above 500 ms for an organization with one million ledger rows. The large-data test records the timing.

### Reporting periods and timezone

- Periods are dates in the reporting timezone. In this change that is `Asia/Ho_Chi_Minh` for organization and event scopes, and the performance's own timezone for a single native performance scope (`performance_sales.timezone`). Legacy performances use `Asia/Ho_Chi_Minh`.
- Every response states its timezone and period bounds.
- Trend buckets: `hour` for ranges up to 7 days, `day` up to 366 days, `week` (ISO weeks) up to 3 years. Wider requests return 400 with the allowed range.
- A performance is **provisional** until it has ended. A scope containing any provisional performance is marked provisional.

### API

All endpoints live under `/api/organizer/sales` and take the `X-Organization-Id` header. Common parameters are `eventId` or `performanceId` (optional; organization scope when absent), `from` and `to` (dates).

| Endpoint | Returns |
|---|---|
| `GET /summary` | `ticketsSold`, `ticketsRefunded`, `netTickets`, `orders`, `capacity` and `sellThrough` (event or performance scope), `provisional`, plus `grossSales`, `refunds`, `netSales` when the caller has `FINANCE` |
| `GET /trend?groupBy=hour|day|week` | buckets with the same fields |
| `GET /breakdown?by=performance|offer` | rows with the same fields plus labels; `by=offer` needs an event or performance scope |
| `GET /export?format=csv|pdf` | summary, trend and breakdown (`FINANCE` only); filename names the scope and period |

- **Permission:** `@OrganizerPermission` accepts several grants with any-of semantics, and `OrganizationAccess` stores the caller's grants as a request attribute. Sales endpoints need `EVENTS` or `FINANCE`. Money fields are omitted, not zeroed, without `FINANCE`.
- **Validation:** an event or performance outside the organization returns 404. An invalid period returns 400 with a translated message.
- **Capacity** for sell-through comes from `performance_groups` (native) or `ticket_inventory` (legacy) through `TicketingCatalogProjection`.
- **Deprecation:** `OrganizerRevenueController` stays, marked deprecated, for one release, then is removed with its client.

### Reconciliation query

- `JdbcReconciliationStore` filters intents and orders by organization before the FULL JOIN.
- The attempt-date basis uses a stored `effective_at` column on `ticketing_payment_intents` (backfilled to `COALESCE(attempted_at, created_at)`, indexed with the organization).
- Paging uses `(effective_at, intent_id)` keys. The totals query uses the same filtered set.
- The existing `JdbcReconciliationStoreTest` guards the results and is added to the CI suites.

### Web

- **Reports › Sales** (`?view=sales`) is the first tab for members with `EVENTS` or `FINANCE`.
  - Scope: All events, one event (searchable through the event directory API), or one performance of that event.
  - Period presets: Today, Last 7 days, Last 30 days, This month and Custom, with dates validated next to the picker. Scope and period live in the URL.
  - KPI tiles, with money tiles only for `FINANCE`. A provisional note when relevant.
  - A trend chart and breakdown tables. Export buttons for `FINANCE`.
- **Trend chart:** extracted from `RevenueTrendChart` into `features/reporting/TrendChart.tsx`, keeping keyboard-focusable points and the live summary, and adding a tickets/revenue series switch.
- **Overview:** a sales strip for today and the last 7 days, *On sale now* with a sell-through bar per performance, and *Next 7 days* with check-in progress (`checkin-summary`, `EVENTS`). Each section has its own loading, error and retry state. A value of 0 appears only when the source confirms it.
- **Redirect:** `/organizer/revenue` and `?view=revenue` redirect to `?view=sales`. `OrganizerRevenuePage` and `api/organizerRevenue.ts` are removed once the backend endpoints are removed.

## Defaults to confirm in review

- Reporting timezone `Asia/Ho_Chi_Minh` for organization and event scopes, until organization settings (change F) add a choice.
- Sell-through = net tickets ÷ sellable capacity (blocked seats excluded).
- Complimentary (0 VND) orders count as tickets sold with no revenue.

## Risks

- **Ledger write failure aborts payment completion.** It runs in the same transaction by design. The insert is a single idempotent statement with no external call. The Ticketing order tests cover replay and concurrency.
- **Backfill refund dates are approximate.** They use the event store time, which can differ slightly from provider confirmation. ADR 0005 records this, and Payment reconciliation remains the source for money movement.
- **Old seed orders without an organization** are attributed through `concerts.organization_id`. Rows still unattributed appear only to platform reports.

## Rollout

1. Deploy `V20` with the writer, so new transitions are recorded.
2. Run the `V21` backfill, which skips rows that already exist.
3. Deploy the endpoints, then the web. Old revenue endpoints are removed in the following release.

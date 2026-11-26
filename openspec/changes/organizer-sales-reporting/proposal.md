# Proposal

## Why

Organizers cannot see how their events are selling. The only revenue report covers legacy concerts after they are COMPLETED (`OrganizerRevenueService` refuses anything else), so native performances and every event still on sale have no sales figures. Refunded orders silently drop out of totals, there is no total per event across its dates or for the whole organization, and the Overview shows no numbers. The product owner approved live sales reporting as roadmap change E ([audit](../../../docs/product/organizer-workflow-audit.md)).

## What Changes

- **Sales ledger in Ticketing.** An append-only reporting record of each order item sold and refunded, written in the same transaction as the order's PAID or REFUNDED transition and backfilled from history. Sales count on the payment date and refunds on the refund date (ADR 0005).
- **Live sales API.** `/api/organizer/sales` returns summary, trend (hour, day, week), breakdown by performance or ticket type, and CSV/PDF export for the whole organization, one event across its dates, or one performance, for any period. There is no COMPLETED gate; figures for performances that have not ended are marked provisional.
- **Permission-aware figures.** Members with `EVENTS` see tickets sold, refunded tickets, sell-through and check-ins. Gross sales, refunds and net amounts require `FINANCE`.
- **Reports › Sales.** A new default report view with scope and period pickers, KPI tiles, a trend chart, breakdown tables and exports. It replaces the completed-concert Revenue view; `/organizer/revenue` redirects to it.
- **Overview with numbers.** The organizer Overview gains a sales strip (today and last 7 days), on-sale performances with sell-through, and the next 7 days with check-in progress, each section loading and failing independently.
- **Reconciliation query.** Organization filtering is applied before the join, the date filter becomes indexable and paging uses a stable key.
- **Deprecation.** The `/api/organizer/concerts/*` revenue endpoints stay for one release, then are removed.

## Capabilities

### New Capabilities

- `organizer-sales-reporting`: live sales figures, trend, breakdowns and exports for an organization, event or performance.

### Modified Capabilities

- `operations-reporting`: the organizer dashboard shows sales and check-in figures; the revenue report is replaced by live sales.

## Impact

- **Ticketing:** `V20__sales_ledger.sql` and `V21__sales_ledger_backfill.sql`, a `SalesLedger` port called from `OrderService.handlePaymentSuccess` and `RefundOrderEffects.apply`, `order_refunds.confirmed_at`, sales endpoints, export, multi-grant organizer permission, reconciliation query changes, new CI suite group.
- **Check-in:** none. The Overview reads the existing `checkin-summary` endpoint (`EVENTS`).
- **Catalog, Payment, Notification, contracts:** none.
- **Web:** Reports › Sales, shared trend chart, Overview sales sections, redirect from the revenue page.
- **Decision:** ADR 0005 (sales ledger and reporting dates), accepted 2026-11-27.

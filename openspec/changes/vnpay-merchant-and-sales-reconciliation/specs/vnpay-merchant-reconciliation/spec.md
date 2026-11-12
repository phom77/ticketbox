# VNPAY merchant reconciliation

## Purpose

TicketBox can verify VNPAY sandbox payments and reconcile transactions for independent organizers using a shared merchant.

## ADDED Requirements

### Requirement: Payment provider selected by deployment

Staging SHALL expose and accept only its configured VNPAY sandbox provider. Sandbox and live credentials and payment data SHALL be separate. The browser return SHALL show the server-reported payment and order state.

#### Scenario: Unsupported provider or unready configuration

- **WHEN** a buyer submits a provider other than the staging provider, or required sandbox settings are unavailable
- **THEN** the server rejects initiation without creating a provider attempt, and checkout shows an actionable error.

### Requirement: Verified receipt and late payment handling

Payment SHALL verify merchant, signature, order reference, amount and provider transaction identity before treating an outcome as a receipt. Ticketing SHALL continue to acknowledge verified results durably and issue tickets once for an eligible order.

#### Scenario: Return arrives before IPN or query verification

- **WHEN** the buyer returns before a valid server receipt arrives
- **THEN** checkout remains pending and the server can recover the outcome by querying the provider without duplicating the order or attempt.

#### Scenario: Replay, mismatch or late success

- **WHEN** a receipt is repeated, mismatched, or verified after the order can no longer be settled
- **THEN** a replay creates no duplicate charge record or tickets, mismatched input never settles the order, and late verified money appears in compensation review without reclaiming released stock.

### Requirement: Historical organization attribution

Ticketing SHALL record the verified organization of the event on new orders at creation and use that attribution for transaction reporting. Historic orders lacking verified attribution SHALL be visible only in a platform exception scope.

#### Scenario: Event metadata changes after purchase

- **WHEN** a report includes a settled order whose event metadata changed after purchase
- **THEN** the order stays under the recorded organization and its reconciliation references remain stable.

### Requirement: Scoped transaction report and export

An authorized finance user SHALL see and export only its organization's transactions. Platform finance operations SHALL be able to filter by organization, event and date basis. The report SHALL distinguish verified collections, failed or unknown attempts, and late money requiring review.

#### Scenario: Two organizations share one merchant

- **WHEN** staff filter or export by organization, event and period
- **THEN** report rows, totals and CSV share the same scope and filters, and an unauthorized request cannot expose the other organization's transactions.

#### Scenario: Match accounting evidence

- **WHEN** a collection is verified or a related refund has been recorded by the approved workflow
- **THEN** accounting can match order ID, provider transaction reference, timestamps, VND amount, status and any recorded refund amount and reference. Unknown amounts and absent refund evidence are distinguishable from zero. Sales totals and verified collections are shown separately.

#### Scenario: Delayed reporting update

- **WHEN** reporting data is behind provider processing or a delivery is repeated
- **THEN** the report indicates its freshness and delivery retries cannot inflate its totals or reverse a newer status.

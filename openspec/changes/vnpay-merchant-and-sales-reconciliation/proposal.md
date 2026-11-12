# VNPAY merchant and sales reconciliation

## Why

TicketBox already handles verified VNPAY payment results and compensation cases. The two-organization pilot needs sandbox evidence and transaction-level records that accounting can match to a merchant statement.

## What Changes

- Use one configured VNPAY sandbox merchant for staging checkout and enforce the selected provider on the server. Continue using MOCK in isolated local and CI environments.
- Attribute a payment to its order and the organization at the time of sale. Preserve durable result delivery and the rules for duplicate and late payments.
- Give authorized operators and organization finance users a paginated transaction report and CSV export. Show provider evidence, order disposition and amounts with their source. Include references for recorded refunds when A4 supplies them.
- Reconcile both organizations using redacted sandbox evidence. Real sales require A0 merchant confirmation. Accounting continues to approve and pay partners outside the application.

## Capabilities

### New Capabilities

- `vnpay-merchant-reconciliation` covers provider selection, verified outcomes, historical organization attribution and scoped reports.

### Modified Capabilities

## Impact

Payment, Ticketing, checkout, finance workspace and staging configuration. [Roadmap A3](../../../docs/superpowers/plans/2026-11-11-ticketbox-production-roadmap.md) · [Payment service](../../../services/payment/README.md) · [A1 ownership ADR](../../../docs/adr/0002-organization-ownership.md)

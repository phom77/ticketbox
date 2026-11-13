# Proposal

## Why

The local six-service stack exercises purchase and recovery with fixtures. TicketBox needs a repeatable deployment and acceptance record for two organizations, the approved VNPAY merchant, real email delivery and recovery from failure before the pilot can open.

## What Changes

- Provide an isolated staging deployment contract for HTTPS, separate secrets, sandbox payment and a real SMTP relay. Make a fresh pilot database safe to initialize without active demo accounts, seeded events or demo orders.
- Document alerts and operator actions for payment, issuance, delivery, reconciliation and Check-in projections. Rehearse encrypted backup and restore without duplicate side effects.
- Run a bounded purchase load test and a two-organization staging rehearsal with recorded thresholds and evidence. Keep the approved scanner deferral in the acceptance checklist.

## Capabilities

### New Capabilities

- `pilot-operations` covers staging isolation, recovery and evidence for release approval.

### Modified Capabilities

None.

## Impact

The deployment configuration, service startup, monitoring, CI artifact upload and operational scripts are affected. The existing order, inventory, payment result and authorization contracts remain the basis for the rehearsal. The deployment target, sandbox merchant, SMTP relay, external backup location, support URLs and pilot targets come from the project owner. See the [roadmap](../../../docs/superpowers/plans/2026-11-11-ticketbox-production-roadmap.md), [A3](../vnpay-merchant-and-sales-reconciliation/design.md), [A4](../order-support-and-event-refunds/design.md) and [A5](../buyer-recovery-and-support/design.md).

# Proposal

## Why

TicketBox currently has a local environment. A repeatable local rehearsal can verify two-organization checkout, operational signals, stock under contention and recovery from a consistent database snapshot.

## What Changes

- Run the six services in an isolated Docker Compose project with loopback access, fixture accounts, MOCK payment and the local SMTP sink.
- Exercise operations signals, recovery and bounded checkout load. Publish a small set of safe CI reports.
- Record the observed limits and results in the roadmap. Staging and production rollout remain later milestones.

## Capabilities

### New Capabilities

- `pilot-operations` covers local operational rehearsal and its acceptance evidence.

### Modified Capabilities

None.

## Impact

The local rehearsal, monitoring, CI artifact selection and operational documentation are affected. The purchase and provider contracts continue to apply. See the [roadmap](../../../docs/superpowers/plans/2026-11-11-ticketbox-production-roadmap.md), [A3](../vnpay-merchant-and-sales-reconciliation/design.md), [A4](../order-support-and-event-refunds/design.md) and [A5](../buyer-recovery-and-support/design.md).

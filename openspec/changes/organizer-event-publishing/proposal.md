# Organizer event publishing

## Why

An approved organizer can already manage concerts in its organization. Staging needs an end-to-end workflow where the organizer can review the buyer experience, fix readiness issues and open sales without a platform administrator.

## What Changes

- Guide the organizer from draft and ticket types through private preview, validation and publication. Show Ticketing and Check-in synchronization separately.
- Make public event pages viewable from an organizer session. Keep buyer purchase permissions as defined by Identity and Ticketing.
- Filter concerts and guest lists on the server before pagination. Load the core workspace separately from optional data, give each failed section a retry action and remove AI from the default navigation and workspace load.
- Use tier or zone tickets for the first staging run. Handle organizer postponement and cancellation with the A4 order support and refund workflow. Preserve the platform emergency route in the meantime.

## Capabilities

### New Capabilities

- `organizer-event-publishing` covers scoped drafts, preview, publication readiness and workspace data.

### Modified Capabilities

## Impact

Catalog, Ticketing, Check-in, web and the existing Catalog sale snapshot. The scanner redesign follows the separate roadmap decision. [Roadmap A2](../../../docs/superpowers/plans/2026-11-11-ticketbox-production-roadmap.md) · [A1 ownership ADR](../../../docs/adr/0002-organization-ownership.md)

# Design

## Context

Catalog owns the event, sale window and ticket type configuration. Its outbox carries versioned snapshots with independent Ticketing and Check-in acknowledgments. Current workspace loading waits for the event, guests, orders, Check-in and AI together. Existing sale rules protect stock and quotas while selling. [Service extraction](../../../docs/service-extraction.md) · [Workspace](../../../frontend/src/pages/admin/ConcertWorkspacePage.tsx)

## Goals and scope

Deliver the staged organizer journey for tier and zone tickets, preserving existing purchase eligibility and independently observable consumer readiness. Assigned seats, replacement scanner behavior and the order disposition for postponement or cancellation have separate designs.

## Decisions for review

- **Publish readiness belongs to Catalog.** Share the readiness calculation between the UI-facing check and publish command. Lock the concert using the existing write path, validate its required content, sale dates and active ticket configuration, then commit the activation and its version using the sale outbox. Repeated publish requests return the persisted outcome for that version. This avoids relying on a browser checklist or a callback arriving in the HTTP request window.
- **Visibility follows Ticketing readiness.** Associate the activation version with the event and use the Ticketing acknowledgment of that version in public reads. A newer unrelated metadata snapshot can be pending while an already activated sale stays visible. Keep the existing Ticketing sale checks and invalidate Catalog caches when the activation becomes visible. Check-in readiness is displayed separately. Its delay does not close buyer sales during the scanner deferral.
- **Preview uses an authorized route.** Reuse the existing buyer-facing content components and obtain preview data through an organizer endpoint that checks the A1 scope. Keep preview responses private and show no active purchase controls in preview. Published pages retain their public data contract and can render for signed-in organizers.
- **Keep queries and section failures separate.** Apply A1 ownership and search filters in Catalog and Check-in queries before calculating totals or paging. Use deterministic ordering and the same predicate for rows and counts. Fetch the core event and authorized sections independently, abort or ignore stale work on a scope switch, and show unavailable metrics distinctly from a measured zero. Keep existing AI routes and stored content available to entitled operators through their direct entry points.
- **Hand off organizer cancellation and postponement.** Direct organizers to platform support while A4 defines affected-order preview, decisions and refunds. Keep the A1 platform route for emergency status changes. The staged event publishing path does not add organizer state transitions that can bypass the handoff.

## Risks and trade-offs

- An acknowledgment may be applied in Ticketing before Catalog observes it. The workspace shows pending until the durable acknowledgment is recorded and recoverable. Rollout tests exercise retries, old snapshots, mixed service startup and visibility through the public cache.
- Preview may use resources that also have public URLs. Only include draft data through the scoped API and check protected attachment access where the owner serves it. Verify the public catalogue, event detail and direct IDs together.

## Migration and rollout

Deploy Ticketing and Check-in with `X-Catalog-Consumer` on their acknowledgments before deploying Catalog. Catalog requires the expected identity before advancing that consumer's version. Deploy the additive Catalog state before using publication readiness in web. Seed new staged drafts in each organization. Existing acknowledged sale state stays readable while the new publish command applies the activation rule to new publications. Rehearse retry with each consumer unavailable and report how an operator can verify or resume an activation.

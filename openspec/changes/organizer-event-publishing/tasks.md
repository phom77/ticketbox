# Tasks

## 1. Publication and visibility

- [x] 1.1 Add Catalog readiness and idempotent publication using the existing concert lock and sale snapshot. Verify missing fields, invalid windows, absent active tiers, retries and immutable inventory effects.
- [x] 1.2 Track the activation version and consumer acknowledgments. Verify that a lost or delayed Ticketing acknowledgment keeps the public event hidden until recovery and that a delayed Check-in acknowledgment stays visible to the organizer. Check replica routing and public cache invalidation.
- [x] 1.3 Add the scoped draft preview and organizer public viewing. Verify access through direct links with two organizations, buyer eligibility and no draft response in public caches. Route organizer postponement and cancellation through the support handoff.

## 2. Organizer workspace

- [x] 2.1 Add scoped event search to Catalog and guest search to Check-in with stable sort and filtered totals. Verify matches beyond the first page, more than 100 guests, foreign IDs and empty results.
- [x] 2.2 Add publish readiness, preview and synchronization status to the workspace. Load optional sections independently and retry only the failed section. Remove default AI loading and navigation links, preserve direct entry points and fix affected Vietnamese labels. Verify keyboard interaction, stale-response handling and desktop, tablet and mobile layouts.

## 3. Integration and acceptance

- [x] 3.1 Run strict OpenSpec validation, Maven verification and independent builds for affected services, web lint/build and the shared CI checks. Exercise the two-organization draft-to-publish flow, public browse, purchase eligibility and receiver recovery through the local gateway.

Local CI passed all 16 steps, including 211 Java tests and six independent service builds. The gateway journey and browser workspace passed on isolated Docker Compose. The staging rehearsal remains in the roadmap and requires the deployment target.

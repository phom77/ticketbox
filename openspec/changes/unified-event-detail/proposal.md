# Proposal

## Why

Buyers see two different pages for the same thing. `/events/:eventId` (Event + Performance model) is a bare list of shows, while `/concerts/:id` (legacy) has the poster, facts and ticket types. Neither explains sale state well ("Sale closed" covers sold out, cancelled and paused), neither lets the buyer choose a quantity, and the new-model page drops venue address, doors time and per-account limits that Catalog already returns.

This change is U3 of the buyer UI/UX redesign plan.

## What Changes

- One event detail template at `/events/:eventId` for both models. `/concerts/:id` redirects to it; legacy ids keep working because Catalog maps a legacy concert to one Event and Performance with the same id (ADR 0003), with a legacy concert read as the fallback. The organizer preview renders the same template in preview mode.
- Hero with poster, category, title, venue and address with a map link, doors time, share (Web Share API, copy-link fallback) and a client-side Add to calendar `.ics` for the selected performance.
- Date cards with date, time, venue, from-price and a sale status (On sale, Sold out, Opens soon, Paused, Cancelled, Sale closed), grouped by month when there are many. Selection is kept in `?performance=`.
- A sticky Get tickets panel (bottom bar on mobile) with a quantity selector limited by the per-account limit, carried to the waiting room as `?qty=`, a status-aware call to action, role explanation and Sign in to buy for guests that returns to the purchase route.
- Ticket types with all-in price, availability, zone colour and limit; a read-only venue map preview with legend; collapsible About and artist bio; information block; related events from the discovery API.
- Frontend `Performance`/`EventDetails` types keep the fields Catalog already returns (venue address, space, doors time, max per account, category). No backend change.

## Impact

- Frontend only: `EventsPage` and `ConcertDetailPage` are replaced by `EventDetailPage`; purchase routes are unchanged (U4 unifies them).
- Deferred: event poster, organizer name and per-performance minimum price from the v2 API (needs additive Catalog fields); the page derives prices from availability instead.

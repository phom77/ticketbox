# API guide

The default gateway is `http://localhost:18091`. Most APIs return an envelope containing `code`, `message` and `data`; health and provider callback responses have their own formats. Protected user requests send `Authorization: Bearer <JWT>`. Organizer access is also scoped to owned concerts.

## Main endpoints

| Area | Method and path | Access |
| --- | --- | --- |
| Health | `GET /api/health` | Public |
| Register / login | `POST /api/auth/register`, `POST /api/auth/login` | Public |
| Current user | `GET /api/auth/me` | Authenticated |
| Profile | `GET`, `PATCH /api/users/me/profile` | Authenticated |
| Catalog | `GET /api/concerts`, `GET /api/concerts/{id}` | Public |
| Availability | `GET /api/concerts/{id}/availability` | Public |
| Queue | `POST /api/queue/concerts/{id}/join`, `GET .../status`, `POST .../leave` | Audience |
| Hold | `POST /api/reservations/concerts/{id}/ticket-types/{typeId}/reserve` | Audience + queue token |
| Release | `POST /api/reservations/concerts/{id}/ticket-types/{typeId}/release` | Audience + queue token |
| Current holds | `GET`, `DELETE /api/reservations/concerts/{id}/holds` | Audience + queue token |
| Create order | `POST /api/orders` | Audience + queue token + idempotency key |
| Recover order | `GET /api/orders/by-idempotency-key` | Audience + idempotency key |
| Orders | `GET /api/orders/my`, `GET /api/orders/{id}`, `DELETE /api/orders/{id}` | Owning audience |
| Initiate / status | `POST /api/payments/{orderId}/initiate`, `GET .../status` | Owning audience |
| Demo payment | `POST /api/mock-payments/{orderId}/success`, `POST .../fail` | Owning audience, dev only |
| Tickets | `GET /api/tickets`, `GET /api/tickets/{id}` | Owning audience |
| Notifications | `GET /api/notifications`, `GET .../unread-count`, `PATCH .../{id}/read` | Authenticated owner |
| Scan / sync | `POST /api/staff/checkins/scan`, `POST .../sync` | Staff |
| Offline dataset | `GET /api/staff/concerts/{id}/checkin-dataset` | Staff |
| Guest lookup / attendance | `/api/staff/guestlist/**` | Staff |
| Concert management | `/api/admin/concerts/**`, `/api/organizer/manage/concerts/**` | Admin / organizer |
| Revenue | `/api/organizer/concerts/{id}/revenue-summary`, `.../zone-revenue`, `.../sales-trend` | Owning organizer, completed concert |
| User management | `/api/admin/users/**` | Admin |
| Payment review | `/api/admin/payment-workflows/**` | Admin |

The controllers in each module's `web/` package define the full route and validation details. Service-level contracts are in [`contracts/`](../contracts/).

## Purchase requests

The hold body is `{ "quantity": 1 }`. Order creation snapshots server-side prices and accepts:

```json
{
  "concertId": "<concert UUID>",
  "items": [{ "ticketTypeId": "<ticket-type UUID>", "quantity": 1 }]
}
```

Send `Queue-Access-Token` on hold/order mutations and `Idempotency-Key` on order creation. Keep the same key when recovering a lost response. Duplicate creation can return 409; use the authenticated key lookup to find the committed order.

Initiation accepts `{ "provider": "MOCK" }` (or `MOMO` / `VNPAY`). Remote dispatch can return pending/202 before a payment URL exists; poll status until the attempt is ready or terminal. The frontend return URL is not proof of payment: provider verification and Core settlement determine whether tickets are issued.

## Realtime and callbacks

- STOMP/SockJS endpoint: `/ws`; send the JWT in CONNECT headers.
- Public queue snapshots: `/topic/queue/concerts/{id}`.
- Private admission updates: `/user/queue/concerts/{id}`.
- VNPAY callback: `GET /api/payments/webhooks/vnpay`.
- MoMo callback: `POST /api/payments/webhooks/momo`.
- Internal intent/result APIs require service tokens and are blocked at the public gateway.

401 means authentication is missing/invalid; 403 means the role or ownership check failed. Stock conflicts and duplicate commands can return 409. Rate/dependency failures can return 429/503 and a retry hint. Clients should preserve command identity during recovery instead of generating new payment requests.

## Concert translations

Public concert summaries and details can include a `translations` object keyed by language (`vi` or `en`). Each entry contains the organizer's title and description for that language. The existing `title` and `description` fields provide fallback values. Detail and management responses also expose `original` for text saved without a language.

Concert create and update requests accept optional `translations` and `original`. Supplying a language replaces its title and description. A null entry or two blank fields removes it. Omitted languages keep their stored values. Supply an `original` object with both fields blank to clear the unlabelled text. At least one title must remain and each title has a 500-character limit. Requests using the existing top-level fields update the original and preserve saved translations. Catalog keeps the usual concert access and publication rules.

## Performance purchase v2

| Method and path | Access |
| --- | --- |
| `GET /api/v2/events`, `GET /api/v2/events/{eventId}` | Public published schedule |
| `GET /api/v2/performances/{id}/layout`, `GET .../layout/sections/{sectionId}` | Public published geometry |
| `GET /api/v2/performances/{id}/availability`, `GET .../availability/sections/{sectionId}` | Public sellable groups and available seats |
| `PUT`, `GET`, `DELETE /api/v2/performances/{id}/hold` | Buyer with a queue token for that performance |
| `POST /api/v2/performances/{id}/orders` | Buyer with a queue token and idempotency key |
| `/api/organizer/manage/v2/events/**`, `.../venues/**`, `.../performances/**` | Organizer with matching grants and organization |
| `/api/v2/staff/performances/**` | Active staff with organization access and performance assignment |

Use the existing queue endpoints with the performance ID. The hold command replaces the basket and sends its last confirmed `holdVersion` and the map's `layoutVersion`. A basket can select GA quantity by offer ID and assigned seats by offer and seat IDs. Use the returned hold version to create the order. The resulting order ID works with existing payment, recovery and ticket endpoints. The API returns 401 for missing authentication, 403 for failed scope or shopping-session permission, and 409 for stale versions, an unavailable seat or a conflicting idempotency key. Reload availability and confirm the current hold after a conflict. Keep the order request key when recovering an ambiguous result.

Before publication, `PUT /api/organizer/manage/v2/events/{eventId}` updates the event details and `PUT /api/organizer/manage/v2/performances/{id}/schedule` updates an individual schedule. Each route takes the same fields as its create request and the last `draftVersion` as `expectedDraftVersion`. Publication also accepts `expectedEventDraftVersion` and `expectedScheduleDraftVersion` alongside the sale and layout versions. A stale version returns 409 so the organizer can review the newest saved data.

Platform administrators can search published native performances with `GET /api/admin/v2/performances`. The optional `query` matches the event title, venue, room or performance ID. Page numbers start at zero and page size ranges from 1 to 100. Active and future dates come first, sorted by start time. Historical dates follow from newest to oldest. `GET /api/admin/v2/performances/{id}` returns the current local schedule, sale status and service acknowledgments. Organizer drafts and legacy concerts are outside this directory. Both routes use the existing platform administrator role and responses are never cached.

Catalog publishes the [performance sale snapshot](../contracts/catalog.performance-sale-snapshot.v2.json) to authenticated Ticketing and Check-in receivers. A version must arrive whole before activation. Repeated equal versions are safe. An equal version with different content is rejected. Offer references and capacity invariants are checked by the receiver in addition to JSON shape. See also the [purchase command bodies](../contracts/ticketing.performance-purchase.v2.json) and [performance ticket snapshot](../contracts/ticketing.ticket-snapshot.v2.json).

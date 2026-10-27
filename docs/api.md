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

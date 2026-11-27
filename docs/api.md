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
| Performance admission | `/api/v2/staff/performances`, `/{id}/overview`, `/tickets`, `/checkins`, `/guests`, `/guests/{guestId}/check-in`, `/scan`, `/sync`, `/checkin-dataset` | `STAFF` account with `ADMISSION` and an active assignment to the performance; used by the scanner and the web staff app (the web app skips dataset and sync) |
| Performance check-in monitoring | `GET /api/organizer/manage/concerts/{id}/checkin-summary` (adds `gates[{gate, checkedIn, latestCheckedAt}]`, `guestsTotal`, `guestsCheckedIn`), `GET /api/organizer/manage/v2/performances/{id}/checkins?page&size` (size up to 50, newest first, no `qrCode` or `deviceId`) | Organizer `EVENTS` in the owning organization |
| Concert management | `/api/admin/concerts/**`, `/api/organizer/manage/concerts/**` | Admin / organizer |
| Sales | `/api/organizer/sales/summary`, `/trend`, `/breakdown`, `/on-sale`, `/upcoming`, `/export` | Organizer `EVENTS` or `FINANCE`; money fields and export need `FINANCE` |
| Organization profile | `GET/PUT /api/organizations/{id}/profile`, `PUT .../profile/statement-details`, `PUT/DELETE .../profile/logo`, `GET /api/admin/organizations/{id}/profile` | Active member reads; `MEMBERS` edits profile, logo and timezone; `MEMBERS` or `FINANCE` edits statement details |
| Settlement statements | `/api/organizer/statements` (`/eligible`, `/{id}`, `/{id}/download?format=pdf\|csv`) | Organizer `FINANCE` |
| Revenue (deprecated) | `/api/organizer/concerts/{id}/revenue-summary`, `.../zone-revenue`, `.../sales-trend` | Owning organizer, completed concert. Replaced by Sales, removed in the next release |
| User management | `/api/admin/users/**` | Admin |
| Payment review | `/api/admin/payment-workflows/**` | Admin |

The controllers in each module's `web/` package define the full route and validation details. Service-level contracts are in [`contracts/`](../contracts/).

## Organizer sales

`/api/organizer/sales/*` take the `X-Organization-Id` header and `from` / `to` dates (inclusive, in the reporting timezone). `eventId` or `performanceId` narrows the scope, and another organization's id returns 404. A period is at most 1096 days. `trend?groupBy=hour|day|week` allows up to 7, 366 and 1096 days (default by length). `breakdown?by=performance|offer`; `by=offer` needs an event or performance. Figures come from the sales ledger: sales count on the payment date and refunds on the refund confirmation date (ADR 0005). Responses state `timezone` and `provisional` (some performance has not ended). `grossSales`, `refunds` and `netSales` are present only for callers with `FINANCE`; `export?format=csv|pdf` requires `FINANCE`. `GET /on-sale` and `GET /upcoming?days=7` list performances with all-time net tickets, capacity and sell-through.

Reconciliation reports accept an optional `after` cursor (the previous page's `next`) to page by key instead of by offset.

## Organization profile and settlement statements

Identity owns the organization profile (ADR 0007). `GET /api/organizations/{id}/profile` returns the display name (read-only), contacts, statement details, logo URL, `reportingTimezone`, `version` and the caller's `canEditProfile` and `canEditStatementDetails`; another organization's id returns 404. Writes send the `version` they read and answer 409 with the current profile when it is stale; the logo goes up as multipart `file` plus `version` (JPEG, PNG or WebP, at most 2 MB, at least 128 by 128 pixels; 503 when image storage is not configured). Other services read `GET /internal/split/v1/organizations/{id}/profile` (`identity.organization-profile.v1`), and `identity.organization-access.v1` carries an optional `reportingTimezone` that Ticketing uses for organization and event scoped sales reports (fallback `Asia/Ho_Chi_Minh`; a single native performance keeps its own timezone).

Ticketing issues settlement statements for final performances and events. `GET /api/organizer/statements/eligible` lists scopes ready for a statement; `POST /api/organizer/statements` with `{scopeType, scopeId, expectedRevision}` issues or re-issues (0 for the first issue; a stale revision or an up-to-date statement returns 409 with the current statement; 409 `error.statement.not-ended` or `refunds-pending` when the scope is not final; 503 when Identity cannot be read). A statement is numbered `TBS-yyyy-nnnnnn` (`-R2`, `-R3` for revisions), immutable, and reported `outOfDate` when its scope's ledger rows or verified reconciliation records differ from the fingerprint stored at issue (rows that commit later always count), and `detailsChanged` when the organization's statement details differ from the snapshot; either allows a re-issue. `GET /api/organizer/reconciliation` accepts `eventId` to show the orders of every performance of one event. `GET .../{id}/download?format=pdf|csv` serves the stored PDF or a CSV of the stored rows. Statements show net sales with a platform fee of 0 VND and are not invoices or payouts.

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

## Order and ticket references

Ticketing responses include a persisted `referenceCode` for each order (`DH-…`) and issued ticket (`VE-…`). Use this code in customer-visible text. Keep using `id` for existing route and API parameters, payment recovery, and admission data.

`GET /api/admin/orders/support` and `GET /api/organizer/manage/orders/support` accept one exact `referenceCode`, matched case-insensitively. Existing searches by `orderId`, `buyerEmail`, and `transactionRef` remain available. Organizer search continues to require FINANCE and applies the organization scope before pagination.

Notification commands can carry `orderReference`. Ticket snapshots can carry `reference_code` and `ticket_type_name`, exposed as `referenceCode` and `ticketTypeName` to staff clients when available. These display fields are optional when reading older messages or scanner data. Scan and offline sync continue to validate the existing QR payload.

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

New events require publication review. Submit a draft to `POST /api/organizer/manage/concerts/{id}/publication` or the corresponding Admin route with an explicit offset-aware `publishAt`. TicketBox displays both the release and sale times in ICT. Platform Admin reviews the current revision under `/api/admin/concerts/{id}/publication/decision` and can place a hold under `/api/admin/concerts/{id}/publication/hold`. Admin lists the review queue at `/api/admin/concerts/publication-queue`. Review and technical readiness are observable from the concert publication endpoint. If Ticketing is unavailable at the scheduled time, Catalog retries while the approved window is still eligible. A missed schedule needs resubmission. Keep the current paid-order disruption and support flows for an active sale.

Admin creates partner application links under `/api/admin/organizations/applications`. Identity provisions an Organizer after approval, and Notification emails the activation link to the work email. Organization managers invite one or more employees under `/api/organizations/{id}/invitations/email`. Migrate existing buyer-role grants from the organization's Admin detail by inviting a verified work address. The buyer account and its order history stay attached to the original identity.

`GET /api/organizations/{id}/admission-staff` requires EVENTS in the selected organization. It returns account ID, name and email for active staff with ADMISSION in that organization. Use the name and email as picker labels. The account ID remains the input to the existing performance assignment API.

Platform admins can recover an organization without an active manager via `PUT /api/admin/organizations/{id}/manager` with the replacement organizer's `email`. Integrations may continue to send `accountId`. Send exactly one of the two fields.

## Performance purchase v2

| Method and path | Access |
| --- | --- |
| `GET /api/v2/events`, `GET /api/v2/events/{eventId}` | Public published schedule |
| `GET /api/v2/events/discovery` | Public event cards across legacy and native listings |
| `GET /api/v2/performances/{id}/layout`, `GET .../layout/sections/{sectionId}` | Public published geometry |
| `GET /api/v2/performances/{id}/availability`, `GET .../availability/sections/{sectionId}` | Public sellable groups and available seats |
| `PUT`, `GET`, `DELETE /api/v2/performances/{id}/hold` | Buyer with a queue token for that performance |
| `POST /api/v2/performances/{id}/orders` | Buyer with a queue token and idempotency key |
| `/api/organizer/manage/v2/events/**`, `.../venues/**`, `.../performances/**` | Organizer with matching grants and organization |
| `/api/v2/staff/performances/**` | Active staff with organization access and performance assignment |

Discovery accepts `q` (up to 160 characters after trimming), `date` (`today`, `weekend`, `next-30`, or `custom`), `status` (`on-sale`, `upcoming`, `sold-out`, or `closed`), and `sort` (`sale-start`, otherwise event date when omitted). With `date=custom`, either or both of `from` and `to` may be supplied as inclusive `YYYY-MM-DD` dates. Date filters use `Asia/Ho_Chi_Minh`. Search matches the event title, translated titles and venue with or without Vietnamese accents. With no keyword, date or status filter, discovery lists future events. Pagination starts at `page=0` and defaults to `size=24`, bounded to 1–100. Invalid filters return HTTP 400.

The response counts matching public events before paging and returns one card per event. The card uses a performance that matches all filters and comes first in the selected order. For legacy concerts `id` identifies the concert and `eventId` is null. For native events `id` identifies the performance and `eventId` identifies its event. The card returns the raw sale `status`, `salesSuspended`, `title`, `venueName`, `eventDate`, `saleStartAt`, `saleEndAt`, `posterUrl`, and available `translations`.

Availability returns each offer with `id`, `name`, `price`, `active` and, when the organizer set them, `description` (up to 500 characters) and `minPerOrder` (1 to 100, 1 when absent). A hold update that gives an offer a positive quantity, or number of seats, below its `minPerOrder` returns 400 `error.performance.offer-min-quantity` before any stock change and leaves the previous hold as it was. Removing the offer (quantity 0) is always allowed, and a hold that already exists keeps its lines after the organizer raises the minimum until the buyer changes that offer. Organizers set both fields on a sale offer in `PUT /api/organizer/manage/v2/performances/{id}/sale`; a minimum above the performance's per-account limit or the capacity of a general-admission pool returns 400. Catalog publishes them in the sale snapshot as optional `offer.description` and `offer.minPerOrder`.

Use the existing queue endpoints with the performance ID. The hold command replaces the basket and sends its last confirmed `holdVersion` and the map's `layoutVersion`. A basket can select GA quantity by offer ID and assigned seats by offer and seat IDs. Use the returned hold version to create the order. The resulting order ID works with existing payment, recovery and ticket endpoints. The API returns 401 for missing authentication, 403 for failed scope or shopping-session permission, and 409 for stale versions, an unavailable seat or a conflicting idempotency key. Reload availability and confirm the current hold after a conflict. Keep the order request key when recovering an ambiguous result.

Before publication, `PUT /api/organizer/manage/v2/events/{eventId}` updates the event details and `PUT /api/organizer/manage/v2/performances/{id}/schedule` updates an individual schedule. Each route takes the same fields as its create request and the last `draftVersion` as `expectedDraftVersion`. The organizer submits `POST /api/organizer/manage/v2/performances/{id}/publication` with `expectedEventDraftVersion`, `expectedScheduleDraftVersion`, `expectedSaleVersion`, `expectedLayoutVersion` and an explicit `publishAt` at or before the performance sale start. A stale version returns 409. Platform Admin reads the submitted version and its offer terms at `GET /api/admin/v2/performance-reviews` and decides at `POST /api/admin/v2/performance-reviews/{id}` with the revision ID and action. Approval schedules release. Catalog issues the activation snapshot at the approved time. The matching Ticketing acknowledgment makes the performance discoverable when its listing is public.

## Event content, revisions and drafts

Native events carry buyer content: `posterUrl`, `translations` (`vi` and `en` title and description), `artistBio`, `ageRating` (`ALL`, `13+`, `16+`, `18+`) and `refundPolicy` (up to 2,000 characters). `GET /api/v2/events/{eventId}`, discovery cards and the organizer event reads return them, falling back to the legacy concert's poster, translations and bio for legacy-linked events (an event value wins when set).

| Method and path | Access |
| --- | --- |
| `POST /api/organizer/manage/v2/events`, `PUT .../events/{id}` | Organizer `EVENTS`. Accept the content fields. `PUT` works until a performance is released, with `expectedContentVersion` (the event's `contentVersion`). |
| `PUT`, `DELETE .../events/{id}/poster` | Organizer `EVENTS`. Multipart `file` (JPEG, PNG or WebP). Writes the draft directly, or stages the poster once a performance is released. `expectedVersion` (the event's `contentVersion`) is required while no performance is released; `expectedRevision` (the server revision, unchanged after an approval) when staging. |
| `GET .../events/{id}/content` | The event and its pending revision, if any |
| `PUT .../events/{id}/content-revision` | Stage content of a released event. Body: content fields and `expectedRevision` (0 for none). A stale value returns 409. |
| `POST .../events/{id}/content-revision/submit`, `.../withdraw`, `DELETE .../content-revision` | Submit with `expectedRevision`, take back a submitted revision, or discard a revision that is not in review |
| `GET .../events/{id}/preview?revision=true` | Private buyer-shaped detail with draft performances and the staged revision. `Cache-Control: no-store`. Another organization receives 404. |
| `POST .../events/{id}/artist-bio-jobs` | Multipart PDF. Poll and apply with the existing `/api/organizer/manage/artist-bio-jobs/{jobId}` routes. |
| `DELETE .../performances/{id}`, `DELETE .../events/{id}` | Delete a draft performance, or an event whose performances are all drafts, with `expectedDraftVersion`. Refused (400) when a performance is in review, scheduled, released or legacy-linked. |
| `GET /api/admin/v2/event-content-revisions?state=SUBMITTED` | Platform queue of content revisions |
| `GET /api/admin/v2/event-content-revisions/{eventId}` | Live and proposed content side by side |
| `POST /api/admin/v2/event-content-revisions/{eventId}/decision` | Body `action` (`APPROVE`, `REQUEST_CHANGES`, `REJECT`), `reason` (required unless approving) and the `revision` number. A stale revision returns 409. Repeating a completed decision returns the recorded outcome. |
| `GET /api/admin/v2/events/{id}/preview` | Platform preview of any event |

A revision has the states `DRAFTING`, `SUBMITTED`, `CHANGES_REQUESTED`, `REJECTED` and `APPROVED`. Approval applies the content to the event and bumps its `contentVersion`, never its `draftVersion`, so it never supersedes a performance publication review. When the title changes, every released performance gets a new publication version with the new title. A pending revision does not block releasing another performance.

Organizers cannot create or change legacy concerts: `POST/PUT/DELETE /api/organizer/manage/concerts/**`, ticket type writes, `.../category`, `.../poster` and legacy artist bio writes return 403 `error.concert.organizer-legacy-read-only`. Reads and guest import still work, and Admin routes are unchanged. Set `TICKETBOX_ORGANIZER_LEGACY_READ_ONLY=false` on Catalog to roll back.

The organizer concert directory `status` accepts `DRAFT`, `IN_REVIEW`, `CHANGES_REQUESTED`, `SCHEDULED`, `ON_SALE`, `SOLD_OUT`, `PAST` and `CANCELLED`. An event matches when any performance has that status. `PREPARING` remains an alias for draft, in review or changes requested. Rows add `status` (the most urgent: changes requested, in review, on sale, scheduled, sold out, draft, past, cancelled), `posterUrl` and `contentChangeInReview`.

Platform administrators can search published native performances with `GET /api/admin/v2/performances`. The optional `query` matches the event title, venue, room or performance ID. Page numbers start at zero and page size ranges from 1 to 100. Active and future dates come first, sorted by start time. Historical dates follow from newest to oldest. `GET /api/admin/v2/performances/{id}` returns the current local schedule, sale status and service acknowledgments. Organizer drafts and legacy concerts are outside this directory. Both routes use the existing platform administrator role and responses are never cached.

Catalog publishes the [performance sale snapshot](../contracts/catalog.performance-sale-snapshot.v2.json) to authenticated Ticketing and Check-in receivers. A version must arrive whole before activation. Repeated equal versions are safe. An equal version with different content is rejected. Offer references and capacity invariants are checked by the receiver in addition to JSON shape. See also the [purchase command bodies](../contracts/ticketing.performance-purchase.v2.json) and [performance ticket snapshot](../contracts/ticketing.ticket-snapshot.v2.json).

## Operations workspace reads

| Read | Admin GET | Organizer GET |
| --- | --- | --- |
| Concert directory | `/api/admin/v2/events` | `/api/organizer/manage/v2/event-directory` |
| Concert detail | `/api/admin/v2/events/{eventId}` | `/api/organizer/manage/v2/events/{eventId}` (existing contract) |
| Operational report | `/api/admin/v2/operations-report` | `/api/organizer/manage/v2/operations-report` |
| Review directory | `/api/admin/v2/review-directory` | |
| Native review detail | `/api/admin/v2/performance-reviews/{performanceId}` | |

Catalog checks platform Admin access or the Organizer's `EVENTS` grant for the `X-Organization-Id` header before reading. Admin can filter by `organizationId`. Organizer scope always comes from the authorized header. A conflicting `organizationId` returns 403. An event, performance or legacy concert filter outside that scope returns an empty page. An unavailable Admin detail returns 404. The new responses are private and use `Cache-Control: no-store`.

List responses return `data.content`, `totalElements`, `totalPages`, `number` and `size`. Pagination starts at zero with a default size of 20 and a range of 1–100. `totalElements` counts the full filtered result, including on pages beyond the last result. Dashboards use the same lists with smaller page sizes.

- The concert directory accepts a trimmed `query` of up to 200 characters for a case-insensitive title substring or exact event ID. Optional `status` is `PREPARING` for an event with a draft performance or no performance, or `CHANGES_REQUESTED` for an event with a current decision requesting changes. Each event is counted once and appears in descending creation order, then by ID. `legacyConcertId` links the compatible event to its original concert. Rows include `performanceCount`, `preparing`, `changesRequested`, `nextStartsAt`, `actionPerformanceId` and `changeReason`. Admin detail adds all performances in report row format.
- The operational report accepts `eventId`, `performanceId` and `concertId` (legacy only). Offset-aware ISO timestamps `from` and `to` filter performance starts using an inclusive lower bound and exclusive upper bound. When both bounds are present, the elapsed period must be positive and at most 366 days. An invalid filter returns 400. Rows sort by start time, then ID. They include the event and performance IDs, owner, venue, schedule, timezone, sale status, current publication review state, and each service's acknowledgment of its current snapshot. A null acknowledgment means there is no applicable snapshot. A false acknowledgment means a snapshot exists and is awaiting that service.
- The report's `status` accepts `DRAFT`, `ON_SALE`, `SOLD_OUT`, `CANCELLED` and `COMPLETED`. `ON_SALE_NOW` selects public, discoverable, unsuspended performances in state `ON_SALE` for which the sale window contains `asOf`. The default `asOf` is the query time. `UPCOMING` excludes drafts, cancellations and completed performances. With both bounds omitted, it uses `asOf` through the same local time seven days later in `Asia/Ho_Chi_Minh`. Use explicit bounds or the same `asOf` when opening the report from a dashboard count.
- The review directory uses the current record per legacy concert or native performance and excludes superseded revisions. It accepts the report's ID filters and the same `query` as the concert directory. Use `status=ALL` or one of `SUBMITTED` (default), `SCHEDULED`, `CHANGES_REQUESTED`, `REJECTED`, `HELD`, `RELEASED` and `MISSED`. Rows sort by `publishAt`, then revision ID. They expose the revision, model (`LEGACY` or `PERFORMANCE`), linked IDs, title, status, submission time, scheduled release and reason. Use the native review detail above or `/api/admin/concerts/{id}/publication` for decision details.

### Event classification

- `GET /api/v2/classifications` (anonymous, `Cache-Control: public, max-age=3600`): `{segments:[{id, sort, genres:[{id, sort, popular}]}]}` for active rows.
- Organizer event writes (`POST/PUT /api/organizer/manage/v2/events`) and content revisions (`PUT .../events/{id}/content-revision`) accept `segment`, `primaryGenre` and `genres` (up to 3, any segment). Leaving all three out keeps the current classification; blank values clear it on a draft. The deprecated `category` (an old id) is mapped when no classification field is sent. In a revision, `content.classification` is `{segment, primaryGenre, secondaryGenres}`.
- Submitting a performance for release needs a segment and a primary genre (`error.performance.classification-missing`). The check runs at submission only: approval and scheduled release accept the reviewed versions, and released events are not blocked. A revision cannot remove the primary genre of a released event (`error.classification.primary-genre-required`).
- `PUT /api/admin/events/{id}/classification` (platform admin) takes `{segment, primaryGenre, genres, expectedContentVersion}`, works for native and legacy-linked events, is audited, is refused with 409 `error.classification.revision-in-review` while a content revision of the event is SUBMITTED, and re-issues the sale snapshots of released performances when the segment or primary genre changes. `PUT /api/admin/concerts/{id}/category` still maps an old category id or a segment id.
- Event, card and workspace rows carry `segment`, `primaryGenre` and (events) `genres`; `category` is deprecated and echoes the segment.
- `GET /api/v2/events/discovery` accepts `segment` and `genre` (primary or tag; unknown ids return 400 `error.performance.invalid-discovery-query`); `category` is a deprecated alias. `/facets` returns `{cities, segments:[{id,count}], genres:[{id,segmentId,count}], categories}` counted per event with an upcoming discoverable performance. `/facets?segment=` limits the genre counts to the events of that segment (primary genre or tag, so tags from other segments are included); an unknown segment returns 400.
- `catalog.performance-sale-snapshot.v2` gains optional nullable `segment`, `primaryGenre` and `city`.

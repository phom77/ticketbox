# Organizer workflow audit and redesign plan

Audited and approved by the product owner on 26 November 2026. Each roadmap item becomes its own OpenSpec change; this document records the audit and the agreed direction.

## Context

The product owner wants the Organizer workflow production-ready: creating and managing events, scheduling multiple dates, authoring seat maps, configuring event information and tracking revenue. Product feedback is in docs/product/organizer-concert-ux-feedback.md, and Ticketmaster's taxonomy is the benchmark. This plan covers the audit (UX, screens, schema) and a phased OpenSpec roadmap. Nothing is implemented until the proposals are approved.

**Main finding:** the organizer area runs **two event systems side by side**:
- **Native:** event → performances, used at /organizer/events/*, backend /api/organizer/manage/v2. It has a real map editor and pricing per performance.
- **Legacy:** concert = one date, at /organizer/concerts/*, /ticket-types, /guests, /artist-bio. It is not in the sidebar.

Features are split between the two:
- Poster, translations, artist bio, guest lists, preview and in-workspace revenue exist only in legacy.
- The map editor, multiple performances and timezone handling exist only in native.
- **Revenue reports only work for COMPLETED legacy concerts** (OrganizerRevenueService.java:140). There are no live sales figures anywhere.

## 1. Audit summary

### Journey friction (against the feedback doc's review questions)

| Stage | Today | Problems |
|---|---|---|
| Onboarding | Token link → apply → admin approval → land on /organizer | No welcome or setup checklist. No organization profile (logo, contacts, payout details). A user with no membership hits a screen whose only action is log out. |
| Create | Two "create concert" paths (native wizard, legacy dialog) | They disagree on timezone and on which fields they have. |
| Event info | Title, category (one of 6), plain description | Native events go live **without a poster**. No translations, bio, lineup, age rating or policy text. The form locks entirely after the first publish, so even a typo can't be fixed. |
| Schedule | 5 raw datetime-local inputs, a list of every IANA zone, one performance at a time | No bulk dates or duplicating a performance with its map and prices. Venues can't be edited and have only one space. Drafts can't be deleted. |
| Map and tickets | Strong SVG editor (tools, seat generator, undo, templates) plus seat-to-price assignment | Prices are raw numbers with no VND formatting. The internal "group vs offer" model is shown to users. Raw datetime inputs for each offer's sale window. No sample CSV/SVG files. Lazy loading for large maps is unfinished (task 5.2). |
| Publish | List of blocking issues, raw "publish at" fixed to +07:00, admin review | No "publish now". No buyer preview for native events. Organizers can't pause, cancel or postpone. |
| Operations | Staff can be assigned to a performance | **The /staff check-in app is not routed**, so assigned staff have nothing to use. Guest lists work for legacy concerts only. No live check-in view. |
| Revenue | Revenue page lists completed legacy concerts only. Reconciliation is a payment ledger. | No live sales, event or organization totals, gross/refund/net split, payouts or statements. Some English strings read as machine-translated. |

### UI inconsistencies
- Three visual systems are in use: admin-*, performance-* and workspace-records-*.
- Feedback is mixed: toasts on some pages, inline status text on others.
- Concert pickers load only the first 100–200 items.
- The Overview dashboard shows no numbers at all.
- The directory status filter offers only 3 values, and published rows show "—" as their status.

### Schema assessment

| Need | Supported? | Gap |
|---|---|---|
| Several dates per event | **Yes, structurally.** Catalog events → performances (V12–V15) each have their own schedule, venue space, layout, sale groups and offers. | No duplicate or bulk-date use cases. Ticketing knows only performances (concerts.id = performance id), so it has no rollup per event. The bio and poster live on legacy concerts only. Venues lack city and capacity. |
| Categories and genres | **No.** events.category is one text column holding 6 ids, checked only by the Java enum EventCategory. | No genre or sub-genre level, no secondary tags and no artist entity. The category isn't in the Catalog→Ticketing snapshot. |
| Revenue and reporting | **Partly.** Reports are built on demand from orders and order_items, per concert, PAID orders only. | Reports are gated to COMPLETED. Refunds just drop out of totals. No event or organization rollups. Trend is by day only. orders.performance_event_id has no index. Reconciliation filters on a coalesce() that no index can use and pages with OFFSET. |
| Payouts | **No.** | No fee, statement, balance or payout tables. TicketBox charges no fees, and "settlement" in the code means confirming a provider payment. |

## 2. Ticketmaster benchmark → TicketBox adaptation

Ticketmaster's model:
- **Classification:** Segment → Genre → SubGenre, for example Music › Rock › Alternative, or Arts & Theatre › Comedy.
- **Attractions:** artists and teams are their own entities.
- **Dates:** each date is a separate event grouped under a series or attraction.
- **Navigation:** the top menu shows segments (Concerts, Sports, Arts/Theater & Comedy, Family). Each segment page has popular genres plus a "Discover more" genre list.

TicketBox adaptation, sized for its Vietnamese audience:
- **Two levels, Segment → Genre.** Sub-genres are deferred. Popular genres are curated for Vietnam (V-Pop, Indie, Rap/Hip-Hop, EDM, Rock, Bolero/Trữ tình, Jazz, Classical; Kịch/Theater, Stand-up, Musical, Dance; Football, Esports…).
- **Segments:** concerts, sports, arts-theater-comedy, family, plus festivals and other (confirmed).
- **Classification per event:** one primary genre plus up to 3 secondary genres used as tags for discovery.
- **Dates:** keep TicketBox's event → performances model. It is better than Ticketmaster's separate events per date, because buyers choose a date on a single event page.
- **Attractions/artists entity:** deferred to a later change. The bio moves onto the event for now.

## 3. Screen and feature inventory

| Screen (route) | Decision | Changes |
|---|---|---|
| Overview /organizer | **Redesign** | Setup checklist for new organizations. Sales KPIs: gross, net, tickets sold, sell-through and check-in for the next 7 days and for on-sale events. Action queue (changes requested, drafts, refund requests). Each section loads and fails on its own, per the operations-reporting spec. |
| Event directory /organizer/events | **Redesign** | Full status filter (Draft, In review, Changes requested, Scheduled, On sale, Sold out, Past, Cancelled). Poster thumbnail, next date, sold/capacity bar and row actions (open, duplicate, report). Searchable and paged. |
| Event wizard /organizer/events/:id | **Redesign** | Steps: Event info → Dates & venue → Seating & tickets → Review & publish, with saved progress. Details below. |
| · Event info step | Redesign | Poster and banner upload with crop preview. Segment and genre picker plus tags. Vietnamese/English title and description (reuse the legacy translations editor). Artist bio, including the AI-from-PDF flow moved here. Age rating, refund policy text. Edits after publish go through publication review instead of a hard lock. |
| · Dates & venue step | Redesign | Calendar date picker plus time picker that shows the venue timezone. Smart defaults (doors 30 min before, 2 h duration). "Add dates" in bulk: pick several days on a calendar plus a time. "Duplicate performance" copies venue, map, groups, offers and window. Venue library with edit, city, capacity and several spaces. Delete a draft performance. |
| · Seating & tickets step | Keep editor, polish | Keep PerformanceLayoutEditor and PerformanceMapCanvas. Show "Ticket type" (offer) and "Stock pool" (group) with inline help. VND money input with separators. Sale-window presets. Sample CSV/SVG downloads. Finish task 5.2 (large-map lazy loading). "Apply pricing to other dates". |
| · Review & publish step | Redesign | Publish now or schedule in the venue timezone. Buyer preview for native events (a v2 version of EventDetailPage). Clear review states. |
| Performance operations (new tab) | **Add** | Organizer can pause or resume sales and request cancel or postpone, which goes to admin. Reuses EventDisruptionPanel logic within organizer scope. Live check-in counter. |
| Legacy concert list and workspace /organizer/concerts* | **Remove** after migration | Its features move into the event model. Old URLs redirect to /organizer/events/:eventId. |
| Ticket types /organizer/ticket-types | **Remove** | Replaced by the Seating & tickets step. |
| Guest lists /organizer/guests | **Merge** into event (Guests tab per performance) | Make it work for native performances. Downloadable CSV template. Manual add of single guests. |
| Artist bio /organizer/artist-bio | **Merge** into the Event info step | — |
| Reports hub /organizer/reports | **Redesign** | Default to a **Sales** view (live, event or performance scope, any period). Keep the Operations sync view as a secondary tab. |
| Revenue /organizer/revenue | **Merge** into Reports › Sales | Live and completed figures. Gross / refunds / net. Trend by hour, day or week. Breakdown by performance and by ticket type. Shared chart component extracted from the current hand-built SVG. CSV/PDF export. |
| Reconciliation | Keep | Fix the query performance. Add a link to the matching sales view. |
| Orders /organizer/orders | Keep, polish | Filter by event or performance. CSV export (orders and attendees). Add to the sidebar. |
| Refund requests | Keep | Show the refund's effect on net revenue. |
| Members | Keep, polish | Remove the leftover "account ID" strings. Deactivate as well as remove. |
| Organization settings (new) | **Add** | Profile (name, logo, contacts). Statement details (no payouts). |
| Staff check-in /staff/* | **Add the routing** (follow-on change) | Route the existing Staff*Page components for native performances. This depends on redesign-staff-scanner-mobile. |

Cross-cutting UI work:
- Use one workspace visual system (workspace-records-* and operations.css tokens).
- Use toasts for outcomes and inline text for validation.
- Build a generic searchable picker: either generalise ConcertPicker or add search to WorkspaceSelect.
- Fix the machine-translated strings in the en catalog.

## 4. Data and contract changes

### Catalog (the owning service; new migrations from V21, released ones untouched)
- **Taxonomy.** classification_segments(id slug PK, sort, active) and classification_genres(id slug PK, segment_id FK, sort, popular, active), seeded by migration. Labels stay in the web i18n catalogs (shared:segment_*, shared:genre_*), following the event-categories decision.
  - events gains segment_id and primary_genre_id.
  - New table event_genres(event_id, genre_id) for up to 3 secondary genres.
  - The old category values are mapped to segment_id. The category column stays readable until the API is cut over.
  - The EventCategory enum becomes a lookup against the DB-backed reference data.
- **Event metadata.** events gains localized_content jsonb, artist_bio, age_rating, refund_policy, poster_image and banner_image, using the existing poster storage approach.
  - artist_pdf_jobs gains event_id, so a bio can be applied to an event.
- **Venues.** venues gains city, latitude/longitude (optional) and capacity hint. Allow several venue_spaces per venue, plus edit use cases.
- **Use cases.** DuplicatePerformance (copies the layout draft, groups, offers and window, shifting dates relative to the new start). BulkCreatePerformances. DeleteDraftPerformance / DeleteDraftEvent. Edit published event info through a publication review revision.
- **Legacy migration.** Legacy concerts already map one-to-one to events and performances through the link_legacy_concert_to_event trigger. Copy poster, localized content and bio onto events. Turn the legacy write endpoints into redirects, then remove them.
- **Discovery.** /events/discovery and its facets gain segment and genre filters. categories.ts becomes segments plus genres.

### Contracts
- catalog.performance-sale-snapshot.v2: add optional segment, primaryGenre and city fields. The change is additive, and Ticketing must tolerate the fields being absent. This lets Ticketing report by category without calling Catalog.

### Ticketing (reporting read model)
- **sales_ledger.** An append-only projection with columns id, order_id, order_item_id, organization_id, event_id, performance_id, group_id, offer_id, kind (SALE or REFUND), quantity, amount (NUMERIC(12,0)), occurred_at and provider.
  - Rows are written in the same transaction that projects OrderPaid and OrderRefunded.
  - A backfill migration builds it from orders, order_items and order_refunds.
  - Indexes: (organization_id, occurred_at), (event_id, occurred_at), (performance_id, occurred_at).
- **No daily rollup table yet.** Reports aggregate the ledger through its indexes; a rollup is added only if a measured p95 exceeds 500 ms (see organizer-sales-reporting design).
- **New endpoints** under /api/organizer/sales (FINANCE grant), each scoped by eventId, performanceId or the whole organization plus a period: summary (gross, refunds, net, tickets, orders, sell-through), trend?groupBy=hour|day|week, by-performance, by-offer, and export (CSV/PDF).
  - There is **no COMPLETED gate**. Figures before the event ends are labelled provisional.
  - The old /api/organizer/concerts/* revenue routes stay for one release and are then removed.
- **Fixes.** Index orders.performance_event_id. In reconciliation, give a stored or indexed effective timestamp to replace coalesce(), and switch to keyset paging.
- **Dashboard check-in data.** The check-in rate per performance comes from Check-in's existing summary endpoint, called by the web app, not by joining across services.

### Settlement statements
- A statement read model in Ticketing per completed performance or event (gross, refunds, net, transaction counts, provider breakdown from payment_reconciliation). Exported as PDF/CSV. No money moves.
- An actual payout ledger, with bank accounts and transfer batches, is a new ownership decision. It needs an ADR first and should not be part of this initiative.

## 5. Prioritised roadmap (OpenSpec changes under integration branch feat/organizer-workflow)

**Prerequisites:** finish or close the open tasks in redesign-concert-and-seating (5.2, 6.3, 6.4) and govern-organizer-onboarding-and-publishing (1.4, 4.3) first, or fold 5.2 into change D.

0. **Direct fixes on main** (small, no OpenSpec):
   - Correct the machine-translated revenue strings.
   - Publish-at uses the performance timezone instead of +07:00.
   - Full directory status filter.
   - VND formatting for price inputs.
   - Add Orders to the sidebar.
1. **A organizer-event-consolidation.** Event metadata on events (poster, translations, bio, age rating, policy). Migrate legacy concerts onto it. Guest lists and AI bio for native events. Native buyer preview. Retire legacy organizer routes with redirects. Delete draft events and performances. One visual system. *This unblocks everything else.*
2. **B event-classification.** Segment → genre reference tables, event genres, picker in the wizard, discovery filters and facets, snapshot fields. Includes an ADR because it replaces the event-categories decision.
3. **C guided-scheduling-and-multi-date.**
   - Calendar and time picker components, which change DESIGN_SYSTEM's "keep native date fields" rule.
   - Venue library and editing.
   - Duplicate performance, bulk dates and "apply pricing to other dates".
   - Publish now or scheduled.
   - Organizer pause/resume sales and cancel/postpone requests.
4. **D seating-and-ticket-authoring-polish.** Rename the user-facing concepts with inline help. Money input. Sale-window presets. Sample import files. Large-map lazy loading (task 5.2). Guided first-run template picker.
5. **E organizer-sales-reporting.** The Ticketing sales_ledger table plus backfill, the /api/organizer/sales endpoints, the redesigned Overview KPIs, the Reports › Sales view with a shared chart component, order and attendee CSV exports, and the reconciliation query fixes. This change can run in parallel with B through D after A.
6. **F organizer-settings-and-statements.** Organization profile settings, and settlement statements.
7. **G staff check-in for native performances** (coordinate with redesign-staff-scanner-mobile). Route the staff app and add a live check-in view for the organizer.

Each change is one reviewed PR into the integration branch (Sonnet builds, Opus reviews) and then one final PR into main for the product owner to test.

## Key files
- **Frontend:**
  - Organizer pages: frontend/src/pages/organizer/PerformanceEventsPage.tsx, PerformanceScheduleForm.tsx, PerformanceWorkspace.tsx, PerformanceLayoutEditor.tsx, PerformanceSaleEditor.tsx, OrganizerOverviewPage.tsx, OrganizerRevenuePage.tsx.
  - Reports: frontend/src/pages/operations/OperationsReportsPage.tsx, ConcertDirectoryPage.tsx.
  - Shell, routing and categories: components/layout/OperationsLayout.tsx, app/App.tsx, features/discovery/categories.ts.
  - Legacy pages to retire: pages/admin/ConcertWorkspacePage.tsx, AdminConcertsPage.tsx, AdminTicketTypesPage.tsx, AdminGuestImportsPage.tsx, AdminArtistBioPage.tsx.
- **Catalog:** services/catalog/.../performance/domain/EventCategory.java, PerformanceCatalog (validateEvent), infrastructure/JdbcPerformanceStore.java, artistbio/*.
- **Ticketing:** services/ticketing/.../reporting/application/OrganizerRevenueService.java, reporting/infrastructure/persistence/TicketSalesReportingRepository.java, JdbcReconciliationStore.java, order/infrastructure/OrderEventStore.java (the hook for ledger writes).
- **Contracts and docs:** contracts/catalog.performance-sale-snapshot.v2.json, docs/api.md, the service GLOSSARY.md files, and the operations-reporting and organizer-event-publishing specs.

## Verification (per change)
- **Backend:**
  - scripts/mvnw-docker.sh -B -ntp -f services/<svc>/pom.xml verify.
  - python3 scripts/ci/verify-service-boundaries.py --service <svc>.
  - Update ArchitectureTest when packages move.
  - Backfill tests: ledger totals must equal the current revenue queries on the seed data.
- **Frontend:** npm --prefix frontend run lint, test and build. Vitest for the new components (date picker, money input, classification picker, charts).
- **End to end:** docker compose up -d --build, then node scripts/smoke.mjs. Walk the whole organizer route once per change: create an event with 3 dates, map and prices, publish, buy as a buyer, then see live sales and a refund reflected in net.
- **Screenshots:** 1440, 834 and 390 px widths, light theme, keyboard path through the wizard. Re-check against the feedback doc's 6 review questions.
- openspec validate <id> --type change --strict for each proposal.

## Decisions (confirmed by product owner, 2026-11-26)
1. **Retire the legacy concert workspace.** Change A migrates legacy concerts onto events and performances, and old URLs redirect.
2. **Taxonomy is Segment → Genre plus tags.** Segments: Concerts, Sports, Arts/Theater & Comedy, Family, Festivals, Other. Each event has 1 primary genre and up to 3 tag genres. Reference tables are seeded by migration and labels come from i18n. Recorded in an ADR in change B.
3. **Finance scope is live sales reports plus settlement statements.** No payout ledger, bank accounts or money movement. That stays a future ADR.
4. **Add a custom accessible calendar and time picker.** It shows the venue timezone and supports multi-date selection. DESIGN_SYSTEM.md is updated in change C.


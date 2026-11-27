# Design

## Context

- Catalog owns events. `events.category` (V12) holds one of six ids (`concerts`, `festivals`, `sports`, `arts-theater`, `comedy`, `family`) or null, normalised by `V20__event_categories.sql` and validated by `performance.domain.EventCategory` in `PerformanceCatalog.validateEvent` and `EventContentService.category`. Legacy concerts are classified through their mapped event (`LegacyConcertCategoryController`, `/organizer/manage/concerts/{id}/category` and `/admin/concerts/{id}/category`); the organizer variant is refused by `OrganizerLegacyGuard` since organizer-event-consolidation.
- Discovery (`JdbcPerformanceStore.DISCOVERY`) filters `lower(category) = lower(:category)`; `FACETS` returns distinct cities (parsed from the last part of `venue_address`) and categories of upcoming discoverable performances. `DiscoveryFacets(cities, categories)` is the response.
- Content of a released event changes only through `event_content_revisions` (V21). Approving a title change re-issues the sale publication (`sale_version + 1`) for released performances; Ticketing (`JdbcPerformanceCatalog.apply`) and Check-in (`CheckinProjectionReceiver`) accept a newer version and ignore older ones.
- The sale snapshot is built in `PerformanceCatalog.snapshot` as `PerformanceViews.SaleSnapshot` and validated by `contracts/catalog.performance-sale-snapshot.v2.json`, which does not forbid extra properties. Ticketing deserialises it into `performance.domain.PerformanceSale` with the Spring Boot `ObjectMapper` (unknown properties ignored).
- Web: `features/discovery/categories.ts` lists the six ids with `shared:category_*` labels; `PublicLayout` builds header links from it; `DiscoveryFilterPanel` and `EventDetailsStep` use `WorkspaceSelect` (finite options, typeahead, no filter field).
- Venues have no city column yet; change C (guided-scheduling-and-multi-date) adds one.
- Latest migrations: Catalog V21, Ticketing V22.
- The event-categories change is complete but not archived, so its requirements are not yet in `openspec/specs/`. It must be archived before this change; the spec deltas here rename and modify its two requirements.

## Decisions

### Reference data

- `classification_segments(id text PK, sort int, active boolean)` and `classification_genres(id text PK, segment_id text FK, sort int, popular boolean, active boolean, UNIQUE(segment_id, id))`. Ids are lowercase slugs (`^[a-z0-9]+(-[a-z0-9]+)*$`) and unique across all genres, so a genre id alone identifies it in URLs and tags.
- Seeded by the Catalog migration. Adding, reordering or retiring a genre is a later migration plus the matching en/vi catalog keys; there is no admin editor in this change.
- Retiring sets `active = false`. Pickers and `GET /api/v2/classifications` hide inactive rows; events that already use one keep it and still display it; Catalog refuses new assignments of an inactive id but accepts an unchanged one on save.
- Labels are web i18n keys `shared:segment_<camelId>` and `shared:genre_<camelId>`, following the event-categories decision. An unknown id renders as the id with dashes replaced by spaces.
- `GET /api/v2/classifications` (anonymous) returns `{segments:[{id, sort, genres:[{id, sort, popular}]}]}` for active rows, with `Cache-Control: public, max-age=3600`.

### Curated list

Segments in display order: Concerts, Festivals, Sports, Arts/Theater & Comedy, Family, Other. ★ marks genres flagged `popular` (shown first on segment pages).

| Segment | Genres (id: English / Vietnamese) |
|---|---|
| `concerts` | ★`vpop`: V-Pop / V-Pop · ★`indie`: Indie / Indie · ★`rap-hip-hop`: Rap & Hip-Hop / Rap & Hip-Hop · ★`edm`: EDM & Electronic / EDM & Điện tử · ★`rock`: Rock / Rock · ★`bolero`: Bolero & Trữ tình / Bolero & Trữ tình · `ballad`: Ballad / Ballad · `jazz`: Jazz / Jazz · `classical`: Classical & Orchestra / Cổ điển & Giao hưởng · `kpop`: K-Pop / K-Pop · `international-pop`: International Pop / Pop quốc tế · `rnb-soul`: R&B & Soul / R&B & Soul · `acoustic`: Acoustic / Acoustic · `traditional-music`: Vietnamese Traditional / Nhạc dân tộc · `music-other`: Other music / Âm nhạc khác |
| `festivals` | ★`music-festival`: Music festival / Lễ hội âm nhạc · ★`cultural-festival`: Cultural festival / Lễ hội văn hóa · ★`food-festival`: Food & drink / Ẩm thực · `film-festival`: Film festival / Liên hoan phim · `art-festival`: Art & design festival / Lễ hội nghệ thuật · `festival-other`: Other festival / Lễ hội khác |
| `sports` | ★`football`: Football / Bóng đá · ★`esports`: Esports / Thể thao điện tử · ★`running`: Running & Marathon / Chạy bộ & Marathon · ★`combat-sports`: Boxing & Martial arts / Quyền anh & Võ thuật · `basketball`: Basketball / Bóng rổ · `volleyball`: Volleyball / Bóng chuyền · `tennis-badminton`: Tennis & Badminton / Quần vợt & Cầu lông · `motorsport`: Motorsport / Đua xe · `sports-other`: Other sports / Thể thao khác |
| `arts-theater-comedy` | ★`theater`: Theater / Kịch nói · ★`stand-up`: Stand-up comedy / Hài độc thoại · ★`musical`: Musical / Nhạc kịch · ★`dance`: Dance & Ballet / Múa & Ballet · ★`cai-luong`: Cải lương / Cải lương · `cheo-tuong`: Chèo & Tuồng / Chèo & Tuồng · `water-puppetry`: Water puppetry / Múa rối nước · `opera`: Opera / Opera · `comedy-show`: Comedy show / Tiểu phẩm hài · `exhibition`: Exhibition / Triển lãm · `arts-other`: Other arts / Nghệ thuật khác |
| `family` | ★`kids-show`: Kids' show / Chương trình thiếu nhi · ★`circus-magic`: Circus & Magic / Xiếc & Ảo thuật · ★`family-concert`: Family concert / Hòa nhạc gia đình · `workshop-kids`: Workshops for kids / Workshop cho bé · `family-other`: Other family / Gia đình khác |
| `other` | ★`talk-conference`: Talk & Conference / Hội thảo & Talkshow · ★`workshop`: Workshop / Workshop · `meetup`: Fan meeting & Community / Fan meeting & Cộng đồng · `other`: Other / Khác |

### Event classification

- `events` gains `segment_id text REFERENCES classification_segments` and `primary_genre_id text`, with `FOREIGN KEY (segment_id, primary_genre_id) REFERENCES classification_genres(segment_id, id)` so the primary genre always belongs to the segment, and `CHECK (primary_genre_id IS NULL OR segment_id IS NOT NULL)`.
- `event_genres(event_id uuid REFERENCES events ON DELETE CASCADE, genre_id text REFERENCES classification_genres, sort smallint, PRIMARY KEY(event_id, genre_id))` holds secondary genres. Index on `(genre_id, event_id)` for discovery.
- Domain value `EventClassification(segment, primaryGenre, secondaryGenres)` in a new `classification` domain package of Catalog replaces `EventCategory`. Its factory checks against a `ClassificationReference` snapshot (loaded through the `ClassificationStore` port and cached in memory; reference data changes only by migration): known segment, primary genre in that segment, at most 3 distinct secondary genres, none equal to the primary, every new id active. Secondary genres may come from any segment. Errors: `error.classification.unknown-segment`, `unknown-genre`, `genre-outside-segment`, `too-many-tags`, `inactive-genre` (HTTP 400, translated).
- A draft may be saved with no classification, a segment only, or a full classification. Release readiness (`PerformancePublicationReview` blocking issues) adds `classification-missing` when the event has no segment or no primary genre. Events already released keep selling; their workspace shows a *Classify this event* prompt.
- Writes: the organizer event create/update body and the content revision details gain `segment`, `primaryGenre` and `genres` (array). Before the first release a change bumps `content_version` and `draft_version`, as other reviewed content does. After release it is staged in the content revision; approval applies it under the event lock.
- Re-sync: when an approved revision (or an Admin correction) changes the segment or primary genre of an event with released performances, Catalog re-issues the publication for each released performance, using the title re-sync path from organizer-event-consolidation. Tag changes do not re-issue.
- Admin corrections: `PUT /api/admin/events/{id}/classification` (platform admin) writes directly, with `expectedContentVersion`, audited. It also serves legacy-linked events and replaces `/admin/concerts/{id}/category`.
- Reads: organizer and public event responses gain `segment`, `primaryGenre` and `genres`. Discovery cards gain `segment` and `primaryGenre`.

### Transition from categories

- Backfill in the migration: `concerts` → `concerts`, `festivals` → `festivals`, `sports` → `sports`, `arts-theater` → `arts-theater-comedy`, `comedy` → `arts-theater-comedy` with primary genre `stand-up`, `family` → `family`, null → null. Demo seed events also get a primary genre by id. The migration logs counts per mapping.
- `events.category` stays (not dropped, not written) for one release so a rollback of the application keeps working; a later migration drops it. Responses keep a deprecated `category` field that echoes the segment id.
- Input compatibility for one release: a request carrying only `category` (an old id) is mapped as above; a request carrying both prefers `segment`. `/admin/concerts/{id}/category` maps the same way.
- Discovery accepts `category` as an alias: an old id is mapped to `segment` (and `comedy` to `segment=arts-theater-comedy&genre=stand-up`). The web rewrites old links to the new parameters.

### Discovery

- New query parameters: `segment` (one id) and `genre` (one id, matching the primary genre or a tag). Unknown ids return HTTP 400 `error.performance.invalid-discovery-query`. Both combine with the existing filters.
- `/facets` returns `{cities, segments:[{id, count}], genres:[{id, segmentId, count}], categories}`. Counts are distinct events with an upcoming discoverable performance; genres count primary and tag use. `categories` (segment ids) stays for one release.
- Header links: Concerts, Festivals, Sports, Arts/Theater & Comedy, Family. *Other* is reachable from the filter panel. `/events?segment=<id>` shows a segment heading, the popular genres with events as chips, and *More genres* listing every genre with events. The filter panel offers Segment and Genre (genre options narrowed to the chosen segment and searchable).
- Cards and event detail show the translated primary genre, falling back to the segment; event detail also lists tags.

### Snapshot

- `catalog.performance-sale-snapshot.v2` gains optional `segment`, `primaryGenre` and `city`, each `{"type": ["string","null"]}` (slug pattern for the first two, at most 120 characters for `city`). No new required field, no version bump.
- `city` is the venue city: the existing address-derived city until change C adds `venues.city`, then that column.
- Ticketing adds nullable `segment`, `primaryGenre` and `city` to `PerformanceSale` so the stored projection keeps them; absent fields read as null. Nothing in Ticketing uses them yet. Check-in keeps ignoring them. Contract tests in both services receive a snapshot with and without the fields.

### Web

- `features/discovery/classification.ts` replaces `categories.ts`: segment and genre ids with label keys, `classificationText`, and the old-category alias map. A Vitest test pins the ids to a fixture shared in spirit with the Catalog migration test (both list the same ids); `check-translations.mjs` enforces en/vi keys.
- `ClassificationPicker` (organizer and Admin): segment as a radio group of six labelled options; primary genre as a combobox with a filter field over the segment's genres (popular first); tags as a multi-select combobox over all active genres with removable chips and a *3 of 3* limit message. ARIA combobox pattern, full keyboard route, visible focus, both workspace themes. DESIGN_SYSTEM.md gains a line on it.
- The Event details step shows the picker after the title. Readiness links *Classify the event* to it. The Admin content-change comparison shows classification before and after.

### Capability boundaries

Classification reference data is its own Catalog capability package (`classification`) with domain, application (`ClassificationStore` port, `ClassificationQuery`) and infrastructure; `performance` depends on its application interface, not its JDBC. ArchitectureTest gains the package.

## Defaults to confirm in review

- Segment display order and header links as above (*Other* only in filters).
- Genre ids are slugs unique across segments; labels only in web catalogs.
- A draft may be saved unclassified; tags are optional.
- Tag changes after release go through the content revision but do not re-issue sale snapshots.
- `events.category`, the deprecated `category` response field, the `category` discovery alias and `/admin/concerts/{id}/category` are kept for one release, then removed in a follow-up.
- Ticketing stores the snapshot fields but adds no reporting in this change.

## Risks

- **Unclassified live events.** Arts and theater events lose precision (no genre after backfill) and concerts get no genre. Facet counts for genres start low; the workspace prompt and readiness rule fill them over time. Admin can correct directly.
- **Old links and clients.** Mitigated by the one-release alias for `category` in requests and discovery.
- **Taxonomy drift.** A genre needs a migration and two catalog keys. A Catalog test and a web test pin the ids so they cannot diverge silently.
- **Snapshot re-issue load.** Only segment or primary-genre changes on released events re-issue, through the existing outbox; volume is small.

## Rollout

1. Catalog migration, classification capability, writes, readiness, discovery and facets, snapshot fields; contract file updated. Ticketing tolerance and projection fields in the same PR (Ticketing ignores the fields until deployed).
2. Web: classification module, picker, discovery and header, labels.
3. After one release: drop `events.category` and the compatibility aliases (separate change).

## Open questions

1. **Is a segment and primary genre required before release?** Recommended: yes for submitting a performance for release; drafts and already released events are not blocked. Reason: genre filters and facets only work if new events are classified, and live sales are never interrupted.
2. **Do classification changes after release need Admin approval?** Recommended: yes, as part of the existing content revision, with Admin able to correct directly. Reason: classification decides public discovery placement, and Wave 1 already reviews all public content.
3. **May secondary genres come from other segments?** Recommended: yes, any active genre. Reason: festivals and family events often mix (a music festival tagged EDM and Indie), and tags exist for discovery.
4. **Is the curated genre list above approved for launch?** Recommended: approve as written; later additions are a small migration plus catalog keys. Reason: it covers the Vietnamese genres named in the audit, keeps each segment under 16 entries, and every segment has an "Other" fallback.

## Decisions confirmed by the product owner (2026-11-27)

The product owner accepted the recommended answer to every open question:

- Segment and primary genre are required to submit a performance for release. Drafts and already released events are not blocked.
- Classification changes after release go through the content revision. Admin can correct directly.
- Tag genres may come from any segment.
- The curated genre list in this design is approved for launch.
- Migration number: Catalog `V22`.

# Event classification

## ADDED Requirements

### Requirement: Segment and genre reference data

Catalog SHALL keep a two-level classification of six segments (Concerts, Festivals, Sports, Arts/Theater & Comedy, Family, Other) and a curated list of genres, each genre belonging to exactly one segment. Anyone SHALL be able to read the active list, and the web app SHALL show segment and genre names in the selected language.

#### Scenario: Client reads the classification list

- **WHEN** an anonymous client requests the classification list
- **THEN** Catalog returns the active segments in display order, each with its active genres in order and the popular genres marked
- **AND** the response is cacheable

#### Scenario: Buyer views genres in Vietnamese

- **WHEN** a buyer with Vietnamese selected sees the genre `bolero`
- **THEN** the page shows "Bolero & Trữ tình", and an id with no translation shows as readable words instead of a raw key

#### Scenario: A genre is retired

- **WHEN** a genre is marked inactive by a later migration
- **THEN** it disappears from the classification list and pickers, events that already use it keep and display it, and Catalog refuses to assign it to another event

### Requirement: Classify an event

An organizer with the `EVENTS` grant SHALL classify an event of the selected organization with one segment, one primary genre from that segment and up to 3 secondary genres from any segment. Catalog SHALL reject any other combination and SHALL require a segment and primary genre before a performance of the event can be submitted for release.

#### Scenario: Organizer classifies a draft event

- **WHEN** the organizer chooses Concerts, primary genre V-Pop and tags Indie and Acoustic in the Event details step and saves
- **THEN** the draft shows that classification after reload, and the preview shows the V-Pop label

#### Scenario: Organizer finds a genre with the keyboard

- **WHEN** the organizer focuses the primary genre field, types "bol" and presses Enter
- **THEN** Bolero & Trữ tình is selected, and every step of the picker is operable without a pointer with visible focus and announced selection

#### Scenario: Invalid classification is sent

- **WHEN** a client sends a primary genre outside the chosen segment, an unknown or inactive id, a tag equal to the primary genre, or more than 3 tags
- **THEN** Catalog rejects the request with a specific translated validation error and stores nothing

#### Scenario: Organizer adds a fourth tag

- **WHEN** the organizer already has 3 tags and tries to add another
- **THEN** the picker does not add it and explains that an event can have at most 3 tags

#### Scenario: Release without classification

- **WHEN** the organizer submits a performance of an event that has no segment or no primary genre
- **THEN** the readiness list shows *Classify the event* as a blocking issue with a link to the picker, and nothing is submitted

#### Scenario: Caller without access

- **WHEN** a caller without the `EVENTS` grant, from another organization, or not signed in changes an event's classification
- **THEN** Catalog refuses the request (403 without the grant, 404 for another organization's event, 401 anonymous) and the classification is unchanged

### Requirement: Classification changes after release are reviewed

After any performance of an event is released, an organizer's classification change SHALL be staged in the event's content revision and SHALL take effect only after a platform reviewer approves it. A platform admin SHALL be able to correct a classification directly.

#### Scenario: Organizer changes the genre of a released event

- **WHEN** the organizer changes the primary genre of a released event and submits the revision
- **THEN** buyers keep seeing the current genre, and the reviewer sees the classification before and after in the content-change comparison

#### Scenario: Reviewer approves a segment or primary genre change

- **WHEN** the reviewer approves the revision
- **THEN** discovery and the buyer page show the new classification, and Catalog re-issues the sale snapshot of each released performance with the new values

#### Scenario: Admin corrects a classification

- **WHEN** a platform admin sets the classification of a native or legacy-linked event with the current content version
- **THEN** it is applied at once and audited, and a stale version is refused with a conflict and no change

### Requirement: Existing categories become segments

The upgrade SHALL classify every event that had a category, with no event losing its place in buyer browsing.

#### Scenario: Events with old categories are upgraded

- **WHEN** the Catalog migration runs
- **THEN** `concerts`, `festivals`, `sports` and `family` keep the same segment, `arts-theater` becomes Arts/Theater & Comedy, `comedy` becomes Arts/Theater & Comedy with primary genre Stand-up comedy, and events with no category stay unclassified

#### Scenario: An old client sends a category

- **WHEN** a client sends only the old `category` value `comedy` during the transition release
- **THEN** Catalog stores segment Arts/Theater & Comedy with primary genre Stand-up comedy

### Requirement: Classification in the sale snapshot

Catalog SHALL include the event's segment, primary genre and venue city in each performance sale snapshot as optional fields. Ticketing and Check-in SHALL accept snapshots with or without them.

#### Scenario: Performance is released

- **WHEN** a classified performance is released
- **THEN** its sale snapshot validates against `catalog.performance-sale-snapshot.v2` and carries `segment`, `primaryGenre` and `city`, and Ticketing keeps them on its performance projection

#### Scenario: Snapshot without classification

- **WHEN** Ticketing or Check-in receives a snapshot with the fields absent or null, such as one published before this change
- **THEN** it applies the snapshot as before, and stock, holds, quotas and orders behave unchanged

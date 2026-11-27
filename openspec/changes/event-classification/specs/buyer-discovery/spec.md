## RENAMED Requirements

- FROM: `### Requirement: Category browsing shows categorised events`
- TO: `### Requirement: Segment and genre browsing`

## MODIFIED Requirements

### Requirement: Segment and genre browsing

The header segment links SHALL list public events in that segment. Discovery SHALL filter by segment and by genre (primary or tag), facets SHALL return the segments and genres that have upcoming events with their counts, and cards and event detail SHALL show the translated genre. Old category links SHALL lead to the matching segment.

#### Scenario: Buyer opens Concerts

- **WHEN** a buyer selects Concerts in the header
- **THEN** the catalogue lists events in the segment `concerts`, shows the Concerts heading in the selected language, and offers the popular concert genres that have upcoming events as chips plus a *More genres* list

#### Scenario: Buyer narrows by genre

- **WHEN** the buyer selects the V-Pop chip on the Concerts page
- **THEN** the URL holds `segment=concerts&genre=vpop`, the list shows events whose primary genre or a tag is V-Pop with the total from Catalog, and reloading or sharing the URL restores the same results

#### Scenario: Genre with no upcoming events

- **WHEN** a genre has no upcoming public events
- **THEN** it is not offered as a chip or filter option, and opening its URL directly shows the filtered-empty state with a way to clear the genre

#### Scenario: Invalid segment or genre in the URL

- **WHEN** the discovery request carries an unknown segment or genre id
- **THEN** Catalog returns a validation error and the page shows the failed-filter state with a way to reset filters

#### Scenario: Old category link

- **WHEN** a buyer opens `/events?category=comedy` from an old link
- **THEN** the page shows Arts/Theater & Comedy filtered to Stand-up comedy, and the URL is rewritten to the new parameters

#### Scenario: Facets unavailable

- **WHEN** the facets request fails
- **THEN** the event list still loads, the segment and genre options fall back to the reference list without counts, and no error blocks browsing

## RENAMED Requirements

- FROM: `### Requirement: Event category from a fixed list`
- TO: `### Requirement: Event classification from the reference list`

## MODIFIED Requirements

### Requirement: Event classification from the reference list

Organizers SHALL classify an event by choosing a segment (Concerts, Festivals, Sports, Arts/Theater & Comedy, Family or Other), a primary genre in that segment and up to 3 secondary genres from the active reference list, or leave a draft unclassified. Catalog SHALL reject any other value. During the transition release, Catalog SHALL map an old category id sent alone to its segment.

#### Scenario: Organizer picks a category

- **WHEN** an organizer saves an event with the segment Sports and primary genre Football
- **THEN** Catalog stores segment `sports` and genre `football`, and the event appears under Sports and under Football in buyer discovery

#### Scenario: Unknown category is sent

- **WHEN** a client sends the segment or category `opera-gala`
- **THEN** Catalog rejects the request with a translated validation error and stores nothing

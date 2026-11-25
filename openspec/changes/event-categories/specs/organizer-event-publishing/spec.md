## ADDED Requirements

### Requirement: Event category from a fixed list

Organizers SHALL choose an event's category from Concerts, Festivals, Sports, Arts & Theater, Comedy and Family, or leave it empty. Catalog SHALL reject any other value.

#### Scenario: Organizer picks a category

- **WHEN** an organizer saves an event with the category Sports
- **THEN** Catalog stores `sports` and the event appears under Sports in buyer discovery

#### Scenario: Unknown category is sent

- **WHEN** a client sends the category `opera-gala`
- **THEN** Catalog rejects the request with a translated validation error and stores nothing

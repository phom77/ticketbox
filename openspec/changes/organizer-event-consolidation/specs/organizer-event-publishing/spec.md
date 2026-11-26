# Organizer event publishing delta

## MODIFIED Requirements

### Requirement: Scoped draft and preview

Catalog SHALL allow an organizer with the event management grant to prepare and preview any native or legacy event owned by the selected organization, including draft performances and a staged content revision. Organizer sessions SHALL be able to view published public pages under the same visibility rules as guests.

#### Scenario: Preview is private

- **WHEN** an organizer of A opens the preview of an A event
- **THEN** the organizer sees the buyer-facing content and a preview indicator, while unauthenticated users and users scoped to B receive no draft or staged content.

#### Scenario: Preview a native event before release

- **WHEN** an organizer opens Preview from the native event workspace before any performance is released
- **THEN** the buyer page shows the event content and its draft performances with their schedule and prices.

#### Scenario: View a published event as an organizer

- **WHEN** an organizer visits a published public event page
- **THEN** the page is visible and purchase actions reflect the existing buyer eligibility rules.

## ADDED Requirements

### Requirement: Unified ticket selection

The buyer SHALL choose tickets on one page for both catalog models at `/events/:eventId/performances/:id/tickets` or, for a legacy concert, `/events/:id/tickets`. The earlier `/seats` routes SHALL redirect, and the waiting room SHALL navigate to the new route on admission.

#### Scenario: Old link

- **WHEN** a buyer opens `/concerts/:id/seats`
- **THEN** the browser lands on `/events/:id/tickets` and the queue admission is still required.

### Requirement: Accessible map and list

The page SHALL show a map beside an equivalent list on desktop and as Map and List tabs on mobile. Map sections SHALL be keyboard-focusable buttons with accessible names, show availability shading with a legend, support zoom and pan, and open their seats on click or Enter. Filters SHALL cover quantity, price range, ticket type and accessible seats, and the list SHALL sort by lowest price or best seats.

#### Scenario: Keyboard only

- **WHEN** a buyer tabs to a section and presses Enter
- **THEN** its seats or quantity stepper open and every action is also available from the list.

### Requirement: Hold summary and expiry

The summary SHALL list held items with section, row, seat, ticket type and price, an all-in total and a hold timer that warns two minutes before expiry. On expiry the buyer SHALL return to the waiting room with a message. Leaving SHALL release the hold.

#### Scenario: Hold expires

- **WHEN** the hold timer reaches zero
- **THEN** the buyer is sent to the waiting room and told the hold expired.

### Requirement: Readable hold errors

Quota, sold-out, version-conflict and rate-limit responses SHALL be shown as translated messages with a next action, never as raw server text.

#### Scenario: Version conflict

- **WHEN** the server answers 409 to a hold change
- **THEN** availability is refreshed and the buyer is told the seats changed.

### Requirement: Informative waiting room

The waiting room SHALL show the event, people ahead with a progress bar, an estimated wait range, the last update time, one-tab guidance, a pre-sale checklist and the room and queue counts. It SHALL warn about a second tab and offer opt-in sound and browser notification on admission.

#### Scenario: Second tab

- **WHEN** the same show is open in another tab
- **THEN** the waiting room warns that only one tab per show should stay open.

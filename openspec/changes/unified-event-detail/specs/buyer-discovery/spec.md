## ADDED Requirements

### Requirement: Unified event detail

The buyer SHALL see one event detail page at `/events/:eventId` for events in both the legacy Concert and the Event + Performance model. `/concerts/:id` SHALL redirect to it and the organizer preview SHALL render the same template.

#### Scenario: Legacy link

- **WHEN** a buyer opens `/concerts/:id`
- **THEN** the browser lands on `/events/:id` with the same event, dates and tickets, and the purchase routes are unchanged.

### Requirement: Date selection and sale status

The page SHALL list each performance as a date card with date, time, venue, from-price and one of On sale, Sold out, Opens soon, Paused, Cancelled or Sale closed. Selecting a card SHALL set `?performance=`.

#### Scenario: Sold-out date

- **WHEN** every ticket of a performance has no availability
- **THEN** its card and the Get tickets panel say Sold out, not Sale closed, and offer no purchase action.

### Requirement: Get tickets panel

The panel SHALL offer a quantity from 1 to the per-account limit, carry it as `?qty=` to the waiting room, and show a call to action matching the sale status. Guests SHALL see Sign in to buy and return to the purchase route after sign-in. Organizer and staff accounts SHALL see why they cannot buy.

#### Scenario: Quantity carried

- **WHEN** a buyer chooses 3 tickets and joins the waiting room
- **THEN** the waiting room path carries `qty=3`.

### Requirement: Share and calendar

The page SHALL let the buyer share the event link (copying it when the Web Share API is unavailable) and download an `.ics` file for the selected performance.

#### Scenario: Add to calendar

- **WHEN** the buyer chooses Add to calendar
- **THEN** a calendar file with the event title, start, end and venue address downloads.

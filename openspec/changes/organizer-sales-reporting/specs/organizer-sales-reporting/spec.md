# Organizer sales reporting

## ADDED Requirements

### Requirement: Live sales figures

Ticketing SHALL report sales for the selected organization, one event across all its performances, or one performance, for any valid period, including performances still on sale. Sales SHALL count on the payment date and refunds on the refund confirmation date.

#### Scenario: Organizer reads sales while an event is on sale

- **WHEN** an organizer opens sales for an event with paid orders whose performances have not ended
- **THEN** the report shows tickets sold, refunded tickets, net tickets, orders and sell-through, marked provisional.

#### Scenario: A refund after the sale

- **WHEN** an order paid on 1 December is refunded on 5 December
- **THEN** the report for 1 December still shows the sale, the report for 5 December shows the refund, and the net for 1–5 December excludes the order.

#### Scenario: Event across several dates

- **WHEN** the organizer selects an event with three performances
- **THEN** the totals equal the sum of the three performances and the breakdown lists each performance.

#### Scenario: Invalid scope or period

- **WHEN** the period is reversed, exceeds the allowed range for the bucket, or the event or performance belongs to another organization
- **THEN** no figures are returned, the period error appears next to the picker, and another organization's ids are treated as not found.

### Requirement: Money figures require the finance grant

Members with `EVENTS` or `FINANCE` SHALL see ticket figures. Gross sales, refunds and net sales SHALL be shown and exported only to members with `FINANCE`.

#### Scenario: Events-only member

- **WHEN** a member with `EVENTS` and without `FINANCE` opens the Overview or Reports › Sales
- **THEN** ticket figures and sell-through are shown, money figures and exports are absent, and the API response contains no money fields.

#### Scenario: Member without either grant

- **WHEN** a member with neither grant requests sales figures
- **THEN** the request is refused and the workspace shows the required permission and a route back to an allowed area.

### Requirement: Sales trend, breakdown and export

Reports › Sales SHALL show a trend by hour, day or week, breakdowns by performance and by ticket type, and CSV or PDF exports that match the selected scope and period.

#### Scenario: Export matches the screen

- **WHEN** a `FINANCE` member exports the selected scope and period as CSV or PDF
- **THEN** the file contains the same totals, trend and breakdown as the screen, names its scope, period and timezone, and renders Vietnamese text correctly.

### Requirement: Ledger consistency

Every PAID or REFUNDED transition SHALL be reflected in sales figures exactly once, including after retries and replays, and historical orders SHALL be included.

#### Scenario: Payment result is delivered twice

- **WHEN** the same payment success or refund result is processed again
- **THEN** sales figures do not change.

#### Scenario: Historical orders

- **WHEN** reporting starts on an existing database
- **THEN** paid and refunded orders from before the change appear in the figures for their original dates.

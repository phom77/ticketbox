# Venue layouts delta

## ADDED Requirements

### Requirement: Guided start for a new map

A performance that needs a map and has none SHALL offer, in order, the organization's saved templates for its venue space, starter layouts (Standing floor + seated stands, Numbered theatre, Arena) with a few size questions, a General admission without a map option and a blank canvas. A starter layout SHALL be generated into the unsaved draft and remain fully editable.

#### Scenario: Organizer starts from Numbered theatre

- **WHEN** an organizer with `EVENTS` chooses Numbered theatre with 15 rows, 24 seats per row and a centre aisle
- **THEN** the draft shows a stage and a stalls zone with rows A to O and 360 numbered seats split at the aisle, and the picker shows the seat total before inserting
- **AND** nothing is stored until the organizer saves the layout.

#### Scenario: Starter would exceed the seat limit

- **WHEN** the chosen sizes would create more than 100,000 seats
- **THEN** the starter is not generated and the picker names the size to reduce.

#### Scenario: Organizer chooses General admission without a map

- **WHEN** the organizer chooses General admission without a map
- **THEN** the performance switches to the admission selling model and shows the ticket type form with no map.

#### Scenario: Save conflicts after a starter

- **WHEN** another editor saved the layout after the draft was opened and the organizer saves a starter layout
- **THEN** the save is refused with a conflict, the generated draft stays on screen and the organizer can reload or discard it.

### Requirement: Sample import files

The seat CSV import and the interactive SVG import SHALL each offer a downloadable sample file and an explanation of the expected columns or attributes, coordinate units and limits. A sample imported unchanged SHALL succeed, and an invalid file SHALL leave the draft unchanged with an error naming the line and column or the problem.

#### Scenario: Organizer imports the CSV sample

- **WHEN** the organizer downloads the sample CSV and imports it unchanged
- **THEN** the draft gains the sample's sections, rows and seats and a status line reports how many seats were imported.

#### Scenario: CSV has a bad value

- **WHEN** line 14 of an imported CSV has a non-numeric x value
- **THEN** no seats are imported and the message reads that line 14, column x needs a number.

#### Scenario: SVG sample shows seat flags

- **WHEN** the organizer imports the sample SVG unchanged
- **THEN** the draft shows its stage, general-admission zone and seated zone, including the accessible, restricted-view and blocked seats it marks.

### Requirement: Large maps stay usable

Large maps SHALL open as a zone overview for buyers and organizers, load and render seats one zone or one viewport at a time with SVG, offer an equivalent list route, and ignore responses that no longer match the chosen performance or zone.

#### Scenario: Organizer edits a 50,000-seat arena

- **WHEN** an organizer opens a draft map with more seats than the render budget
- **THEN** the canvas shows zones with their seat counts, a Zones list shows each zone's kind, seats and seats without a pool, and choosing a zone zooms to it and shows its seats
- **AND** when seats are hidden, the canvas says to zoom in or choose a zone.

#### Scenario: Buyer switches zone while it loads

- **WHEN** a buyer opens zone A and then zone B before zone A's seats arrive
- **THEN** only zone B's seats and status are shown, and the late zone A response is ignored.

#### Scenario: Map geometry fails to load

- **WHEN** the zone overview or a zone's geometry cannot be loaded
- **THEN** the buyer sees that the map is unavailable and can choose zones, seats and quantities from the list, with retry for the map.

#### Scenario: Keyboard and screen reader

- **WHEN** a buyer or organizer uses only the keyboard or a screen reader on a large map
- **THEN** zones and seats can be reached and chosen through the overview and lists, and each announces its label, row, availability and selected state.

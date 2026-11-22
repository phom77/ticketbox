# Operations workspaces

## Purpose

TicketBox operators supervise partner activity and resolve operational issues. Organizers prepare and run their own events in an organization-scoped workspace.

## ADDED Requirements

### Requirement: Platform operations navigation

The Admin workspace SHALL expose operational tasks according to the operator's current permissions.

#### Scenario: Platform operator opens the workspace

- **WHEN** an authorized platform operator opens Admin
- **THEN** the navigation shows the available operations overview, partner applications and organizations, event review and monitoring, order and ticket support, reconciliation, operational notifications and internal accounts.
- **AND** ticket types and guests are accessible in the relevant event context.

#### Scenario: Operator manages internal or partner accounts

- **WHEN** an authorized operator opens the internal accounts directory or a partner's organization
- **THEN** the directory contains TicketBox personnel while the organization view contains members and pending invitations for that organization.
- **AND** the server applies the account scope before pagination and the old all-accounts directory cannot bypass that scope.

#### Scenario: Buyer requests order support

- **WHEN** an authorized operator searches for a buyer's order
- **THEN** order support accepts the existing exact order ID, buyer email or transaction reference searches and returns the authorized support data for matching orders.

### Requirement: Organization operations navigation

The Organizer workspace SHALL scope data and actions to the active organization and current grants.

#### Scenario: Organizer opens the workspace

- **WHEN** an organizer selects an authorized organization
- **THEN** navigation exposes only the work allowed by the organizer's grants, including events and their review states, order and finance views, or organization members.
- **AND** ticket types and guests appear in event context, and platform review, other organizations' data and the buyer directory are inaccessible.

### Requirement: TicketBox-assisted event operations

An authorized TicketBox operator SHALL be able to prepare an event for an explicitly selected organization.

#### Scenario: Operator prepares an event for a partner

- **WHEN** an authorized operator saves a new assisted event
- **THEN** the selected organization owns the event, the action records the operator, and authorized members can manage it under their existing grants.
- **AND** the event follows the same review and release requirements as an organizer-created event.

### Requirement: Full-width operations layout

Admin and Organizer workspace content SHALL use the available width below the workspace header and beside the sidebar with consistent page gutters.

#### Scenario: Operator opens a dense list on desktop

- **WHEN** a user opens an operations list such as ticket types, review, orders, organizations or users
- **THEN** a compact title and relevant actions precede the filters and full-width table, and the layout keeps any event context close to its filters and actions.

#### Scenario: Workspace is narrow or zoomed

- **WHEN** the content area narrows on a tablet, phone or zoomed desktop
- **THEN** controls wrap or stack in keyboard order, the sidebar adapts, and a table that requires horizontal space scrolls within its own region.
- **AND** users can reach actions, focus indicators and filters without horizontal scrolling of the page.

### Requirement: Web layout and control readability

TicketBox web SHALL use responsive page widths and consistent, legible dropdowns and text. Content SHALL keep actionable guidance, accessible names and status feedback.

#### Scenario: Buyer discovers events on a wide screen

- **WHEN** a buyer opens Home on a wide screen
- **THEN** the header and discovery content align, and the grid fits additional event columns while keeping comfortable gutters and readable cards.

#### Scenario: User opens a dropdown or scans a workspace

- **WHEN** a user filters, sorts or edits through a web dropdown or scans a management list
- **THEN** the dropdown has readable text and clear focus, selection and disabled states, labels and data have stronger legibility, and redundant explanatory copy does not interrupt the task.
- **AND** keyboard operation, form values and required feedback remain available.

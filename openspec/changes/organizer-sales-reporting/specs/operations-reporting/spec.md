# Operations reporting delta

## MODIFIED Requirements

### Requirement: Role-specific workspace dashboards

The system SHALL show a dashboard for each role and give every metric or task a destination with its details.

#### Scenario: Admin opens the platform dashboard

- **WHEN** an Admin opens the dashboard
- **THEN** it shows pending reviews, performances on sale, performances in the next seven days and order groups needing support
- **AND** each pending item shows its subject, status, deadline when there is one, and an action to open it in Admin.

#### Scenario: Organizer opens the organization dashboard

- **WHEN** an organizer with `EVENTS` opens the dashboard
- **THEN** it shows events in preparation, changes requested, tickets sold today and in the last seven days, performances on sale with their sell-through, and performances in the next seven days with check-in progress for the selected organization
- **AND** a member with `FINANCE` also sees gross and net sales for the same periods
- **AND** the organizer can open the draft, change request, performance or sales report behind each item, or start creating a concert.

#### Scenario: User opens a dashboard metric

- **WHEN** a user selects an overview metric
- **THEN** the list or report opens in the same workspace with the metric's scope, filters and period
- **AND** counts reflect every matching result, including when the list is paginated.

#### Scenario: One dashboard data source is unavailable

- **WHEN** one group of metrics is loading or fails
- **THEN** that group has its own state with a retry on error and the other groups stay readable
- **AND** a value of 0 appears only when the source confirms a zero result.

### Requirement: Financial reports use authorized data

The system SHALL show each financial report within the caller's scope and grants, with metric names, periods and reference times that match the source data.

#### Scenario: User reads reconciliation details

- **WHEN** an Admin or an organizer with `FINANCE` opens the Reconciliation report
- **THEN** it shows paid order sales and verified collections as separate metrics, with transaction counts, synchronization status and recorded refunds
- **AND** the user chooses the attempt or verified-collection basis, filters by concert and period, pages through transactions or exports CSV with the same filters
- **AND** organization filters and transactions without an organization are available only to Admin.

#### Scenario: Organizer views a supported revenue report

- **WHEN** an organizer with `EVENTS` or `FINANCE` opens Reports › Sales for the organization, an event or a performance
- **THEN** the report shows figures for performances on sale and completed alike, with the period, timezone and provisional state stated
- **AND** money figures and exports are available only with `FINANCE`.

#### Scenario: User changes organization or loses a grant

- **WHEN** an organizer switches organization, loses a grant, or opens a report URL meant for another grant
- **THEN** the screen discards the previous organization's data and event or performance filters
- **AND** the interface and API apply the current organization's grants to reads and exports, including direct URLs
- **AND** when data is refused, the user sees the permission state and a route to an allowed area.

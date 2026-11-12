# Order support

## Purpose

Let authorized operators locate an order, see authoritative information and recover failed actions within their scope.

## ADDED Requirements

### Requirement: Paginated support search

The support workspace SHALL search by exact order ID, normalized buyer email or provider transaction reference and apply authorization before pagination. Results SHALL use a stable sort and expose only data needed for support.

#### Scenario: An organizer searches across two organizations

- **WHEN** an organizer with FINANCE searches by buyer email or transaction reference
- **THEN** only orders attributed to the selected organization appear, including when the buyer purchased from both organizations.
- **AND** a direct link to a foreign order returns no data.

#### Scenario: Email lookup is unavailable

- **WHEN** Identity cannot resolve the email search
- **THEN** the workspace identifies the unavailable search and allows other search methods.

### Requirement: Support order detail

Support detail SHALL display order, payment, issued ticket, delivery and exception information with source-specific availability. Organizers SHALL receive only data for their organization and read-only delivery summaries.

#### Scenario: Notification is temporarily unavailable

- **WHEN** Notification cannot supply delivery status
- **THEN** the order and available sections remain usable, and delivery status is shown as unavailable with an independent retry.

### Requirement: Platform exception queue

Platform admins SHALL see paginated cases for uncertain payment, verified money without tickets, pending refunds and failed order emails. Actions SHALL require current platform authorization and preserve source-owned audit.

#### Scenario: Retry a verified case

- **WHEN** an authorized admin requests a supported payment query redrive or retries a failed email using the same command identity
- **THEN** the source service resumes eligible work and repeated actions do not create another payment attempt or schedule another email retry for the same action.

#### Scenario: Payment is awaiting compensation

- **WHEN** a verified payment arrives after the order can no longer settle
- **THEN** it is visible as a compensation case and support actions cannot restore stock or issue tickets.

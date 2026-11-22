# Organizer access delta

## MODIFIED Requirements

### Requirement: Approved organization onboarding

TicketBox SHALL accept partner applications through a private entry link. A platform administrator SHALL review each application. Approval SHALL provision an organization and a dedicated pending manager account. The manager SHALL activate the account through a single-use link delivered to their work email before obtaining operational access.

#### Scenario: Platform approval

- **WHEN** an authorized platform administrator approves an application containing the organization, manager work email and initial event details
- **THEN** TicketBox records the decision and provisions the organization and manager exactly once.
- **AND** the manager receives an expiring link, sets their own password and gains Organizer access after activation.
- **AND** the first event remains subject to event review and scheduled release.

#### Scenario: Repeat or unauthorized approval

- **WHEN** an identical approval is retried or an organizer attempts platform approval
- **THEN** a retry creates no duplicate organization or manager grant, and an unauthorized attempt makes no changes.

#### Scenario: Application is incomplete or the email belongs to a buyer

- **WHEN** a submission is incomplete or a manager work email already belongs to a buyer or internal account
- **THEN** the application requires correction before provisioning and the existing account is left as issued.

#### Scenario: Activation delivery or link fails

- **WHEN** delivery fails, the link expires, or a manager requests a new activation link
- **THEN** an authorized operator can retry delivery or reissue activation for the same pending account, and only the current valid link can activate it.

### Requirement: Membership invitations and grants

An authorized organization manager SHALL invite team members by work email and manage grants within that organization. Invitations SHALL be single-use, expiring and restricted to the intended email identity. The organization SHALL retain an active manager while enabled for operations.

#### Scenario: Invite and accept

- **WHEN** an organization manager invites one work email or a batch with shared grants
- **THEN** TicketBox creates individual invitations with per-recipient results and sends each recipient a link.
- **AND** a new recipient can activate a dedicated account and accept the membership, and an existing organizer can accept using the matching signed-in account without receiving a duplicate membership.

#### Scenario: Invalid invitation or delegation

- **WHEN** another account presents an invitation, a token has expired or been replaced, or a manager attempts to grant permissions in a different organization
- **THEN** access is denied and no membership or grant is created.

#### Scenario: Batch partly fails or is repeated

- **WHEN** a batch includes invalid, conflicting or already-processed emails
- **THEN** valid invitations can be processed, failures are reported per recipient, and a retry creates no duplicate accounts or active invitations.

#### Scenario: Last manager or account lock

- **WHEN** a change would remove the last active manager
- **THEN** an active replacement is required before removal. A platform account lock can take effect immediately and an authorized platform administrator can recover management for an organization with no eligible manager.

## ADDED Requirements

### Requirement: Dedicated Organizer entry

Only activated dedicated organizer accounts with current membership SHALL enter the Organizer workspace. Public buyer navigation and registration SHALL omit Organizer entry points.

#### Scenario: Buyer opens a workspace URL

- **WHEN** a buyer account attempts to open an Organizer URL or invokes an Organizer API
- **THEN** the UI does not reveal the workspace or invite form, and the service denies access to protected data and actions.

#### Scenario: Organizer finishes an event

- **WHEN** the organizer's event ends
- **THEN** the organizer can still access organization history and prepare further private drafts within their grants.
- **AND** each further event needs its own publication review and schedule.

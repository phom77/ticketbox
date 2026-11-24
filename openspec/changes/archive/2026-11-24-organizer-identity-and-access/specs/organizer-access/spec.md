# Organizer access

## Purpose

Approved organizers can share event operations across a team while TicketBox keeps organization data and privileges isolated.

## ADDED Requirements

### Requirement: Approved organization onboarding

TicketBox SHALL let an authorized platform administrator approve an organization and designate its initial manager. The organization SHALL gain operational access only after approval and initial manager provisioning.

#### Scenario: Platform approval

- **WHEN** a platform administrator approves an organization with a valid initial manager account
- **THEN** the organization becomes available to that manager and the platform audit records the actor, organization, initial manager, time and outcome.

#### Scenario: Repeat or unauthorized approval

- **WHEN** an identical approval is retried or an organizer attempts platform approval
- **THEN** the retry creates no duplicate organization or manager grant, and the organizer attempt is denied without changing organization state.

### Requirement: Membership invitations and grants

An authorized organization manager SHALL invite members and manage grants for their organization. Invitations SHALL expire, be single-use and be accepted only by the intended account. The organization SHALL retain an active manager while enabled for pilot operations.

#### Scenario: Invite and accept

- **WHEN** the intended account accepts a valid invitation while authenticated
- **THEN** the account can select the organization and use the invited grants, with no duplicate membership on retry or concurrent acceptance.

#### Scenario: Invalid invitation or delegation

- **WHEN** another account presents the invitation, an expired invitation is presented, or a manager attempts to grant permissions in a different organization
- **THEN** access is denied and no membership or grant is created.

#### Scenario: Last manager or account lock

- **WHEN** a change would remove the last active manager
- **THEN** the system requires an active replacement before a manager can leave or be demoted, while a platform account lock can take effect immediately and places the organization in a recovery state until a platform administrator provisions a replacement.

### Requirement: Scoped event operations

The owning service SHALL authorize protected actions by current account, selected organization, active membership, operation and the resource's actual event owner. Organization management, event management and finance SHALL be separate organization-wide grants for A1. Resources addressed by indirect IDs SHALL inherit the scope of their owning event.

#### Scenario: One account with grants in two organizations

- **WHEN** a member with event management in organization A and finance in organization B selects A
- **THEN** permitted A event actions succeed, A finance actions are denied and B resources require selecting B and holding the appropriate grant there.

#### Scenario: Cross-organization request by direct or indirect ID

- **WHEN** a member of A requests B's concert, ticket type, order, ticket, guest import result, protected file, or report using a direct or nested identifier
- **THEN** the owning service returns a denial without exposing B's existence or contents and makes no protected change.

#### Scenario: Scope search, pages and exports

- **WHEN** an authorized caller searches, paginates or exports results that include eligible and ineligible events in the data store
- **THEN** rows, totals and exports reflect eligible events only, and filtering precedes pagination.

#### Scenario: Create a concert

- **WHEN** a member with creation permission creates a concert in their selected organization
- **THEN** the concert is owned by that organization and subsequent work can be performed by other members holding the appropriate grant.

### Requirement: Current account and permission enforcement

Organizer and platform actions SHALL use current authorization. A locked account or removed grant SHALL be denied on the next protected request made after the change commits. The service SHALL fail closed when it cannot determine authorization.

#### Scenario: Account or permission changed while a token remains valid

- **WHEN** a user presents an unexpired token after account lock, membership removal or a permission downgrade
- **THEN** the affected action is denied, unaffected active grants remain usable after a grant change, and reactivating a locked account requires a fresh privileged sign-in.

#### Scenario: Authorization dependency unavailable

- **WHEN** a service cannot verify current authorization for an organizer or platform action
- **THEN** it reports a retryable availability failure and returns no protected data or protected side effect.

#### Scenario: Privileged platform action

- **WHEN** an authorized platform administrator performs a privileged action in A1 scope across organization boundaries
- **THEN** the action requires platform authorization and its audit record identifies the actor, action, affected scope, time and outcome without storing invitation tokens or credentials.

### Requirement: Scope for new organizations
Existing events without organization ownership SHALL stay outside organizer access. New organization work SHALL use current authentication and grants.

#### Scenario: Event has no organization owner
- **WHEN** an organizer lists events or requests an event created without organization ownership
- **THEN** the event is excluded from the organizer's list and direct access is denied without disclosure.

# Organizer event content

## ADDED Requirements

### Requirement: Event content on native events

Catalog SHALL let an organizer with the `EVENTS` grant set a poster, Vietnamese and English title and description, an artist bio, an age rating and refund-policy text on an event of the selected organization. Buyer pages and discovery SHALL show this content for native and legacy events alike.

#### Scenario: Organizer completes event details before release

- **WHEN** the organizer uploads a JPEG, PNG or WebP poster, enters translations, an age rating and a refund policy, and saves a draft event
- **THEN** the draft shows the saved content after reload, and the preview shows it as buyers will see it.

#### Scenario: Poster upload fails or is invalid

- **WHEN** the file is not a supported image, exceeds the size limit, or storage is unavailable
- **THEN** the organizer sees a specific message, the previous poster stays and no orphaned asset remains.

#### Scenario: Buyer opens a native event

- **WHEN** a buyer opens a released native event or sees it in discovery
- **THEN** the poster, the title and description in the buyer's language (falling back to the original), the artist bio, the age rating and the refund policy are shown when set.

#### Scenario: Organizer generates an artist bio from a PDF

- **WHEN** the organizer uploads a PDF in the event details step and applies the generated bio
- **THEN** the bio is saved on the event, or staged in the content revision when the event is released.

### Requirement: Reviewed content revisions

After any performance of an event is released, changes to its content SHALL be staged as one pending revision and SHALL take effect only after a platform reviewer approves that revision.

#### Scenario: Organizer edits a released event

- **WHEN** the organizer changes the description of a released event and submits the revision
- **THEN** buyers keep seeing the current description, and the organizer sees the revision as In review.

#### Scenario: Reviewer approves

- **WHEN** a platform reviewer approves the submitted revision
- **THEN** buyers see the new content after the next page load, and the decision, reviewer and time are recorded.

#### Scenario: Reviewer requests changes or rejects

- **WHEN** the reviewer requests changes or rejects with a reason
- **THEN** the live content is unchanged, the organizer sees the reason, and can edit and resubmit or discard the revision.

#### Scenario: Stale or repeated decision

- **WHEN** a decision targets a revision that was edited after submission, or repeats a completed decision
- **THEN** the stale decision is refused without change, and the repeated decision returns the recorded outcome.

#### Scenario: Content revision and performance release overlap

- **WHEN** a content revision is in review while another performance of the event is scheduled for release
- **THEN** the performance releases with the approved live content, and the revision proceeds independently.

### Requirement: Private buyer preview

Organizers with `EVENTS` and platform operators SHALL be able to preview the buyer page of any event of their scope, including draft performances and a staged content revision.

#### Scenario: Preview a draft or staged revision

- **WHEN** the organizer opens Preview on a draft event or chooses to preview a staged revision
- **THEN** the buyer page renders with a preview banner and a route back to the workspace.

#### Scenario: Preview is private

- **WHEN** an anonymous user or a member of another organization requests the preview
- **THEN** no draft or staged content is returned.

# Concert translations

## Purpose

Let organizers publish concert information in available languages and let buyers read it in their preferred web language when a translation exists.

## ADDED Requirements

### Requirement: Optional bilingual concert content

Authorized organizers and administrators SHALL be able to create and edit Vietnamese and English concert titles and descriptions using existing concert management access. At least one nonblank title SHALL be available. Each description and the second language SHALL be optional.

#### Scenario: Organizer enters only one language

- **WHEN** an authorized organizer saves a concert with only an English title and description or only a Vietnamese title and description
- **THEN** the save succeeds if other concert rules pass and the editor preserves the other language as empty.

#### Scenario: Organizer edits or removes one translation

- **WHEN** an authorized organizer adds, updates or explicitly removes a translation while a valid title remains
- **THEN** reopening the editor shows the saved authored values and the remaining translations are retained.

#### Scenario: Invalid title is rejected

- **WHEN** an edit would leave a concert without a nonblank title or supplies a title over the existing limit
- **THEN** the request returns a validation error and the previous concert content remains available.

#### Scenario: Organizer lacks access to a concert

- **WHEN** an organizer without the required grant or concert scope requests a management read, edit or draft preview
- **THEN** access is denied under the existing rules and no draft text is disclosed or changed.

### Requirement: Field-level concert language fallback

The web app SHALL select available authored concert text for the active language in the public catalog and buyer-facing concert views, including private organizer preview. When a requested field is missing, it SHALL display the available original or alternate value for that field.

#### Scenario: Both language variants exist

- **WHEN** someone switches from Vietnamese to English while viewing a published concert or its authorized preview
- **THEN** the corresponding English title and description appear where available without a page reload.

#### Scenario: Each field has a different language available

- **WHEN** a concert has an English title and a Vietnamese description, with no other localized text for either field
- **THEN** both interfaces display the English title and Vietnamese description.

#### Scenario: Existing concert has only original text

- **WHEN** a concert created before localization has a title and description with no language metadata
- **THEN** both interfaces display its original text and the owner can add translations without re-entering it.

### Requirement: Concert API compatibility

Catalog SHALL preserve existing concert permissions, visibility, publication and service contract behavior. Localized concert fields SHALL be additive to existing web-facing responses, and existing management requests SHALL remain valid without translation fields.

#### Scenario: Existing management client submits an update

- **WHEN** an existing client submits a valid concert update without translation fields
- **THEN** the original fields are processed with the existing semantics and saved translations are preserved.

#### Scenario: A downstream service reads a concert snapshot

- **WHEN** an internal service reads or consumes concert data after the user changes the web interface language
- **THEN** it receives the established contract and the UI language does not affect its values or business rules.

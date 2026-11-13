# Proposal

## Why

TicketBox web users need to choose Vietnamese or English while browsing events and managing their accounts or workspaces. Organizers need to publish a concert with the text they have and add a second language when available.

## What Changes

- Add a Vietnamese and English selector to the web app. Apply the selection in place and remember it on the current browser.
- Move TicketBox interface copy into translation resources grouped by feature. Use the selected language for human-readable HTTP messages displayed on the web.
- Let authorized organizers and admins enter concert titles and descriptions in either or both languages. Display the available text for each field when the requested version is missing.
- Preserve existing concert text and service contracts. Scope the change to the web app and the Catalog data it needs. Mobile apps, email, generated documents and provider integrations remain outside this release.

## Capabilities

### New Capabilities

- `web-language-preference` covers selecting and applying a language across the TicketBox web app.
- `concert-translations` covers editing, previewing and displaying localized concert titles and descriptions.

### Modified Capabilities

## Impact

The React web app adds message catalogs and locale-aware formatting. Catalog adds an owned migration and compatible public and management API fields. Existing service message bundles and HTTP negotiation provide the backend foundation. [Backend i18n plan](../../../docs/superpowers/plans/2026-11-07-backend-i18n.md) · [Organizer publishing requirements](../organizer-event-publishing/specs/organizer-event-publishing/spec.md) · [Organization ownership](../../../docs/adr/0002-organization-ownership.md)

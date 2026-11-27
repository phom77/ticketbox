# Proposal

## Why

The buyer header now browses by category (Concerts, Festivals, Sports, Arts & Theater, Comedy, Family), and Catalog already filters discovery by `events.category`. No event has a usable category yet: organizers type free text, legacy concerts have none, and the category pages are empty.

## What Changes

- Catalog accepts only the fixed category ids `concerts`, `festivals`, `sports`, `arts-theater`, `comedy` and `family` (or none) when an event is created or edited. Unknown values are rejected with a translated error.
- The organizer event form replaces the free-text field with a styled category select that uses the same translated labels as the buyer header. Legacy concert editing gets the same control, writing to the mapped event.
- A new migration normalises existing values (case and common synonyms such as "concert", "music", "theatre") to the fixed ids, clears the rest, and assigns categories to the demo seed events.
- Buyer cards, event detail and the catalogue chip show the translated category.

## Capabilities

### Modified Capabilities

- `organizer-event-publishing` — category is chosen from a fixed list.
- `buyer-discovery` — category browsing returns categorised events.

## Impact

Catalog only (validation, migration, organizer endpoints already carry `category`). Web organizer form and buyer labels. No contract change: discovery already exposes and filters `category`.

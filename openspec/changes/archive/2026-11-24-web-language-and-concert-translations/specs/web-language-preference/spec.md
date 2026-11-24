# Web language preference

## Purpose

Let people use TicketBox web in their preferred language across public, buyer and operations screens.

## ADDED Requirements

### Requirement: Web language selection

TicketBox web SHALL offer Vietnamese and English on public, authentication, buyer and operations screens. An explicit selection SHALL apply in place and persist in the current browser when browser storage is available.

#### Scenario: Visitor chooses English during checkout

- **WHEN** a buyer changes the language to English with an open checkout
- **THEN** the interface changes language and retains the current order or hold, route and entered values.

#### Scenario: Explicit preference survives a new session

- **WHEN** a visitor previously selected Vietnamese and opens TicketBox again in the same browser with English browser settings
- **THEN** the app opens in Vietnamese before and after signing in.

#### Scenario: First visit uses browser preference

- **WHEN** the visitor has no saved selection and the browser prefers `en-US` among its supported choices
- **THEN** the app uses English.

#### Scenario: Browser languages are unsupported

- **WHEN** the visitor has no saved selection and the browser offers no supported language
- **THEN** the app uses Vietnamese and offers the same language selector.

#### Scenario: Browser storage is unavailable

- **WHEN** the browser blocks preference storage and a visitor changes language
- **THEN** the selected language applies for the current app session and the interface remains usable.

### Requirement: Localized web presentation

TicketBox web SHALL render interface copy, accessibility labels, validation, and current human-readable HTTP feedback in the selected language. Date, number and money display SHALL use locale-aware formatting and preserve the value, currency and applicable business time zone.

#### Scenario: Interface and errors use the current language

- **WHEN** a visitor switches to English and submits a form that receives a localizable API error
- **THEN** the document language, controls and new error text use English, and the same business rejection and field details apply as in Vietnamese.

#### Scenario: Visitor changes language while feedback is in flight

- **WHEN** an outstanding request finishes after a language switch
- **THEN** its previous-language display text does not replace current-language feedback, and a completed action is still reflected without repeating the request.

#### Scenario: Existing currency displayed in English

- **WHEN** a Vietnamese-dong ticket is displayed in English
- **THEN** the value is formatted for English and is still denominated in VND.

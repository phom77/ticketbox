# Buyer recovery

## Purpose

Let buyers recover access and reach their actual orders, tickets and support from mobile and desktop.

## ADDED Requirements

### Requirement: Buyer recovery navigation

Public and buyer pages SHALL use working routes for catalog, account, order history and tickets. A confirmation view SHALL require verified order information or direct the buyer to a recovery route. The web app SHALL omit inactive controls.

#### Scenario: Confirmation opened without verified state

- **WHEN** a buyer opens a confirmation URL directly or reloads without confirmed order data
- **THEN** the app directs them to order history and renders no sample success or ticket.

#### Scenario: Buyer follows the order history link

- **WHEN** a buyer chooses order history from checkout or recovery
- **THEN** the existing orders view opens and offers the next action for the selected order.

### Requirement: Approved buyer information

Published event and purchase pages SHALL identify the organizer where available and display working TicketBox support and purchase or refund terms links when the approved information is configured.

#### Scenario: Support destination has not been configured

- **WHEN** an environment lacks an approved contact or policy URL
- **THEN** the app omits the corresponding link and buyers retain access to their own orders and tickets.

### Requirement: Email password recovery

An eligible buyer SHALL be able to request an email reset link and set a new password with a short-lived single-use token. Request responses SHALL avoid account disclosure and be rate-limited. After a reset, sessions issued before the password change SHALL no longer grant access to protected buyer data or actions.

#### Scenario: Known and unknown account requests

- **WHEN** someone requests recovery for an existing, missing, inactive or ineligible account
- **THEN** the public response is indistinguishable and only an eligible account receives a usable link.

#### Scenario: Two requests try to consume a token

- **WHEN** two concurrent submissions use the same token or a submission uses an expired or superseded token
- **THEN** at most one valid submission changes the password, and rejected submissions leave it unchanged.

#### Scenario: Old session accesses a private route

- **WHEN** a session from before the reset attempts to read orders, tickets or notifications or initiate payment
- **THEN** the request requires a new login and exposes no private data.

#### Scenario: Old socket remains connected

- **WHEN** a browser stays subscribed to private queue updates after its session is invalidated by a reset
- **THEN** the old session receives no subsequent private queue data.

### Requirement: Payment and ticket recovery

Mobile checkout and order history SHALL derive status and next actions from verified server state. A lost response or reload SHALL preserve the existing order identity, and retry SHALL follow the current one-attempt policy.

#### Scenario: Browser returns before server confirmation

- **WHEN** the buyer returns from the payment provider with an order still awaiting confirmation
- **THEN** the page stays pending until the server reports success, failure or expiry.
- **AND** a paid order remains recoverable from order history and the buyer can open its issued QR ticket after a reload.

# TicketBox business contexts

## Contexts

- [Identity](services/identity/GLOSSARY.md) owns accounts and roles.
- [Catalog](services/catalog/GLOSSARY.md) owns concert information and sale configuration.
- [Ticketing](services/ticketing/GLOSSARY.md) owns shopping sessions, stock, orders and issued tickets.
- [Check-in](services/checkin/GLOSSARY.md) owns admission decisions.
- [Payment](services/payment/GLOSSARY.md) owns payment attempts and verified provider receipts.
- [Notification](services/notification/GLOSSARY.md) owns audience messages and delivery.

## Relationships

Catalog supplies sale configuration to Ticketing and concert information to Check-in.
Ticketing supplies issued ticket snapshots to Check-in and payment intents to Payment.
Payment supplies verified results to Ticketing. Check-in supplies admission feedback to Ticketing.
Ticketing requests confirmation and reminder messages from Notification. Identity supplies contact details.
Each receiving context interprets the supplied data in its own model.

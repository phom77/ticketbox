# Design

## Context

Payment owns attempts, receipt verification and durable delivery. Ticketing owns the order, stock, tickets and compensation decision. The existing result contract carries verified money to Ticketing, while current sales reports summarize paid orders. The VNPAY adapter uses the browser return URL and a configured query URL. The merchant must register the IPN route separately. [Payment service](../../../services/payment/README.md) · [Payment result contract](../../../contracts/payment-result-v1.schema.json)

## Goals and scope

Run one staging sandbox merchant and produce a two-organization reconciliation export. A4 supplies actual refund decisions and references. A0 governs merchant agreement and production credentials. Partner payout, fees without provider evidence and other providers have separate workflows.

## Decisions for review

- **Validate configuration and provider at both boundaries.** Publish configured checkout capabilities from Ticketing and validate the provider policy before creating an intent. Staging also rechecks sandbox readiness at this point. Payment validates its environment and provider before creating an attempt. Use the existing secret store and separate environment data. Require reachable sandbox HTTPS return and registered IPN plus the configured sandbox query endpoint for acceptance. Keep MOCK and durable intent creation during Payment outages in the isolated CI profile.
- **Capture historical ownership in Ticketing.** Write the authoritative local Catalog organization with the new order in the existing create-order transaction. Treat the snapshot as reporting metadata and preserve it during updates and replay. A verified old mapping can be loaded later by an approved operation. Until then, show rows without attribution only to platform operators as exceptions. Payment continues to reference the immutable order and intent IDs.
- **Project reconciliation facts separately from settlement.** Extend the existing durable delivery approach with a versioned reporting snapshot for the Payment attempt and verified receipt, including failed and unknown dispositions. Ticketing applies it idempotently by intent and revision and joins it to the immutable organization attribution. Read and export from that local projection so provider outages do not block existing reporting. Keep the existing settlement result and ACK paths intact. Repeated receipts, queries and projection deliveries must leave collections and ticket issuance unchanged after the first applied result.
- **Make the accounting basis explicit.** Provide date filters by attempt start and verified collection, use a half-open period in the configured reporting timezone, and include both timestamps and a provider transaction reference when available. Use the same scoped query for the report, aggregates and CSV. Export verified VND amounts as integers, protect spreadsheet text fields, and omit raw provider payloads and customer identifiers. Include refund amount and reference only when A4 has recorded them, and label unavailable evidence. Show ticket sales, verified collection and statement reconciliation as separate facts.

## Risks and trade-offs

- **Unmatched or delayed facts.** Expose freshness and unresolved cases. Retry delivery with the same identity, and surface unmatched orders for platform review. The report does not interpret provider outages as failed payments.
- **Concurrent money and order expiry.** Preserve existing transaction boundaries, stock release, unique transaction identity and compensation review behavior. Verify duplicate and out-of-order provider results through both service entry points.

## Migration and rollout

Apply additive Ticketing attribution and projection storage. Deploy the compatible reporting receiver before enabling the Payment sender. Keep existing order and payment state intact during rollout and rollback. Rehearse with redacted sandbox receipts from two organizations, an IPN-loss query recovery case and local fixtures for late money. Record live-merchant approval separately as A0 evidence.

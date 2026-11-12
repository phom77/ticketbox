# Payment

## Language

**Payment intent**

An immutable request to collect a specified amount for one order using one provider and request identity.

**Payment attempt**

The provider-facing progress and attributed transaction for a payment intent.

**Verified receipt**

Provider evidence whose signature and reported result have been checked.

**Reconciliation snapshot**

The versioned reporting facts for a payment attempt, including verified collection and recorded refund evidence when available. Ticketing receives it through a separate outbox.

**Compensation review**

An operator case for money that cannot settle the intended order.

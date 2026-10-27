-- Dedup ledger; durable delivery is provided by the Modulith publication registry in the same transaction.
CREATE TABLE remote_reminder_dispatches(event_id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now());

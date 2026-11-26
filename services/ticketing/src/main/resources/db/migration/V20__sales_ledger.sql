-- ADR 0005: append-only sales ledger for organizer sales reporting.
CREATE TABLE sales_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('SALE', 'REFUND')),
    organization_id uuid,
    event_id uuid NOT NULL,
    performance_id uuid NOT NULL,
    offer_id uuid NOT NULL,
    group_id uuid,
    offer_name text NOT NULL,
    section_label text,
    quantity integer NOT NULL CHECK (quantity > 0),
    amount numeric(12,0) NOT NULL CHECK (amount >= 0),
    provider varchar(20),
    occurred_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (order_item_id, kind)
);

CREATE INDEX sales_ledger_organization_idx ON sales_ledger(organization_id, occurred_at);
CREATE INDEX sales_ledger_event_idx ON sales_ledger(event_id, occurred_at);
CREATE INDEX sales_ledger_performance_idx ON sales_ledger(performance_id, occurred_at);

DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='ticketing_runtime') THEN
  REVOKE UPDATE,DELETE,TRUNCATE ON sales_ledger FROM ticketing_runtime;
 END IF;
END $$;

-- Confirmation time of the refund result, used as the REFUND row's business time.
ALTER TABLE order_refunds ADD COLUMN confirmed_at timestamptz;

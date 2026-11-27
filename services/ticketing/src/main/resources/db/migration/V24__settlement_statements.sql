-- ADR 0007: issued, numbered, immutable settlement statements (superseded by later revisions, never altered).
CREATE SEQUENCE settlement_statement_number_seq AS bigint START WITH 1;

CREATE TABLE settlement_statements (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL,
    scope_type text NOT NULL CHECK (scope_type IN ('PERFORMANCE', 'EVENT')),
    scope_id uuid NOT NULL,
    event_id uuid NOT NULL,
    number text NOT NULL UNIQUE,
    revision integer NOT NULL CHECK (revision > 0),
    supersedes_id uuid REFERENCES settlement_statements(id),
    status text NOT NULL CHECK (status IN ('CURRENT', 'SUPERSEDED')),
    timezone text NOT NULL,
    cutoff_at timestamptz NOT NULL,
    issued_at timestamptz NOT NULL,
    issued_by uuid NOT NULL,
    organization_snapshot jsonb NOT NULL,
    scope_snapshot jsonb NOT NULL,
    gross_sales numeric(12,0) NOT NULL,
    refunds numeric(12,0) NOT NULL,
    net_sales numeric(12,0) NOT NULL,
    sale_orders integer NOT NULL,
    refund_orders integer NOT NULL,
    tickets_sold integer NOT NULL,
    tickets_refunded integer NOT NULL,
    verified_collected numeric(12,0) NOT NULL,
    verified_refunded numeric(12,0) NOT NULL,
    unreconciled_orders integer NOT NULL,
    pdf bytea NOT NULL,
    pdf_sha256 text NOT NULL,
    UNIQUE (organization_id, scope_type, scope_id, revision)
);

CREATE UNIQUE INDEX one_current_statement
    ON settlement_statements(organization_id, scope_type, scope_id) WHERE status = 'CURRENT';
CREATE INDEX settlement_statements_event_idx ON settlement_statements(organization_id, event_id, issued_at DESC);

CREATE TABLE settlement_statement_lines (
    statement_id uuid NOT NULL REFERENCES settlement_statements(id),
    kind text NOT NULL CHECK (kind IN ('PERFORMANCE', 'OFFER', 'PROVIDER')),
    sort integer NOT NULL,
    label text NOT NULL,
    key uuid,
    provider text,
    tickets_sold integer NOT NULL,
    tickets_refunded integer NOT NULL,
    gross_sales numeric(12,0) NOT NULL,
    refunds numeric(12,0) NOT NULL,
    net_sales numeric(12,0) NOT NULL,
    verified_collected numeric(12,0) NOT NULL,
    verified_refunded numeric(12,0) NOT NULL,
    sale_orders integer NOT NULL,
    refund_orders integer NOT NULL,
    PRIMARY KEY (statement_id, kind, sort)
);

-- Statement figures join reconciliation records by order.
CREATE INDEX payment_reconciliation_order_idx ON payment_reconciliation(order_id) WHERE verified_at IS NOT NULL;

-- Insert-only like sales_ledger. The only permitted change is the status column, which supersedes a statement.
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='ticketing_runtime') THEN
  REVOKE UPDATE,DELETE,TRUNCATE ON settlement_statements FROM ticketing_runtime;
  GRANT UPDATE (status) ON settlement_statements TO ticketing_runtime;
  REVOKE UPDATE,DELETE,TRUNCATE ON settlement_statement_lines FROM ticketing_runtime;
 END IF;
END $$;

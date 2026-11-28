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
    cutoff_at timestamptz NOT NULL, -- display metadata: when the figures were computed, not a data filter
    -- Scope ledger row count and verified reconciliation count and sums seen by the statement's figures query.
    -- A statement is out of date when the same query now yields a different value.
    fingerprint text NOT NULL,
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
CREATE INDEX settlement_statements_org_idx ON settlement_statements(organization_id, issued_at DESC, id);
CREATE INDEX settlement_statements_supersedes_idx ON settlement_statements(supersedes_id);

-- A superseded statement never becomes current again; a newer revision is issued instead.
CREATE FUNCTION settlement_statement_status_guard() RETURNS trigger AS $$
BEGIN
    IF OLD.status = 'SUPERSEDED' AND NEW.status <> 'SUPERSEDED' THEN
        RAISE EXCEPTION 'settlement statement % is superseded and cannot become %', OLD.id, NEW.status;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER settlement_statement_status_guard BEFORE UPDATE OF status ON settlement_statements
    FOR EACH ROW EXECUTE FUNCTION settlement_statement_status_guard();

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

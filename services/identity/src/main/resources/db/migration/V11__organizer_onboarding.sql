CREATE TABLE organizer_applications (
    id uuid PRIMARY KEY,
    expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '7 days'),
    organization_name varchar(160),
    manager_name varchar(160),
    email varchar(254),
    first_event varchar(1000),
    submitted_at timestamptz,
    organization_id uuid REFERENCES organizations(id),
    manager_id uuid REFERENCES users(id),
    reviewed_by uuid REFERENCES users(id),
    reviewed_at timestamptz
);

CREATE TABLE organizer_account_links (
    id uuid PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id),
    manager_id uuid REFERENCES users(id),
    email varchar(254) NOT NULL,
    grants text[] NOT NULL CHECK (cardinality(grants) > 0 AND grants <@ ARRAY['MEMBERS','EVENTS','FINANCE','ADMISSION']),
    created_by uuid NOT NULL REFERENCES users(id),
    expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '2 days'),
    consumed_at timestamptz,
    next_attempt_at timestamptz,
    lease_id uuid
);

CREATE INDEX organizer_account_link_email ON organizer_account_links(organization_id,email);
CREATE INDEX organizer_account_link_delivery ON organizer_account_links(next_attempt_at)
    WHERE consumed_at IS NULL AND next_attempt_at IS NOT NULL;

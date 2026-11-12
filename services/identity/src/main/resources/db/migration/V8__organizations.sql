ALTER TABLE users ADD COLUMN session_version bigint NOT NULL DEFAULT 0;

CREATE TABLE account_access_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id uuid NOT NULL,
    target_id uuid NOT NULL,
    action text NOT NULL,
    value text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
    id uuid PRIMARY KEY,
    name text NOT NULL UNIQUE,
    initial_manager_id uuid NOT NULL REFERENCES users(id)
);

CREATE TABLE organization_members (
    organization_id uuid NOT NULL REFERENCES organizations(id),
    account_id uuid NOT NULL REFERENCES users(id),
    grants text[] NOT NULL CHECK (cardinality(grants) > 0 AND grants <@ ARRAY['MEMBERS','EVENTS','FINANCE']),
    PRIMARY KEY (organization_id, account_id)
);

CREATE INDEX organization_members_account_idx ON organization_members(account_id);

CREATE TABLE organization_invitations (
    code_hash text PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id),
    account_id uuid NOT NULL REFERENCES users(id),
    grants text[] NOT NULL CHECK (cardinality(grants) > 0 AND grants <@ ARRAY['MEMBERS','EVENTS','FINANCE']),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz
);

CREATE TABLE organization_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id),
    actor_id uuid NOT NULL,
    target_id uuid NOT NULL,
    action text NOT NULL,
    grants text[] NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

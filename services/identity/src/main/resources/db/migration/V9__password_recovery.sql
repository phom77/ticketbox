CREATE INDEX users_normalized_email_idx ON users (lower(email));

CREATE TABLE password_resets (
    account_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    id UUID NOT NULL UNIQUE,
    session_version BIGINT NOT NULL,
    token_digest BYTEA NOT NULL UNIQUE,
    encrypted_token BYTEA,
    expires_at TIMESTAMPTZ NOT NULL,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    lease_id UUID
);

CREATE INDEX password_resets_delivery_idx ON password_resets (next_attempt_at, id)
    WHERE encrypted_token IS NOT NULL;

CREATE TABLE password_reset_budgets (
    kind VARCHAR(12) NOT NULL,
    key_digest BYTEA NOT NULL,
    bucket BIGINT NOT NULL,
    requests INTEGER NOT NULL,
    PRIMARY KEY (kind, key_digest, bucket)
);

CREATE TABLE organization_profiles (
    organization_id uuid PRIMARY KEY REFERENCES organizations(id),
    logo_url text,
    logo_public_id text,
    contact_email varchar(254),
    contact_phone varchar(32),
    website varchar(2048),
    legal_name varchar(200),
    tax_code varchar(20),
    billing_address varchar(500),
    reporting_timezone varchar(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    version bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid,
    CONSTRAINT organization_profile_logo_pair CHECK ((logo_url IS NULL) = (logo_public_id IS NULL)),
    CONSTRAINT organization_profile_website_https CHECK (website IS NULL OR website LIKE 'https://%'),
    CONSTRAINT organization_profile_tax_code_shape CHECK (tax_code IS NULL OR tax_code ~ '^[0-9]{10}(-[0-9]{3})?$')
);

-- Field names changed by a profile write. Values are never stored.
ALTER TABLE organization_audit ADD COLUMN changed_fields text[];

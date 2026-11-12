ALTER TABLE concerts ADD COLUMN organization_id uuid;
CREATE INDEX concerts_organization_id_idx ON concerts(organization_id);

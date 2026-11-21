ALTER TABLE organization_members DROP CONSTRAINT organization_members_grants_check;
ALTER TABLE organization_members ADD CONSTRAINT organization_members_grants_check
    CHECK (cardinality(grants) > 0 AND grants <@ ARRAY['MEMBERS','EVENTS','FINANCE','ADMISSION']);

ALTER TABLE organization_invitations DROP CONSTRAINT organization_invitations_grants_check;
ALTER TABLE organization_invitations ADD CONSTRAINT organization_invitations_grants_check
    CHECK (cardinality(grants) > 0 AND grants <@ ARRAY['MEMBERS','EVENTS','FINANCE','ADMISSION']);

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='core_runtime') THEN
   REVOKE SELECT,INSERT,UPDATE,DELETE ON notifications FROM core_runtime;
   -- Metadata visibility for the retained, disabled legacy entity; no data access.
   GRANT REFERENCES ON notifications TO core_runtime;
 END IF;
END $$;

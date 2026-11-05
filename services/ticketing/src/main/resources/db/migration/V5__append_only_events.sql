DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='ticketing_runtime') THEN
  REVOKE UPDATE,DELETE,TRUNCATE ON order_events FROM ticketing_runtime;
 END IF;
END $$;

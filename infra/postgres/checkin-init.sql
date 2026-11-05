
CREATE USER checkin_runtime PASSWORD 'checkin-runtime-local-only';
GRANT CONNECT ON DATABASE ticketbox_checkin TO checkin_runtime;
GRANT USAGE ON SCHEMA public TO checkin_runtime;
GRANT CREATE ON SCHEMA public TO checkin_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE checkin_owner IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO checkin_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE checkin_owner IN SCHEMA public GRANT USAGE,SELECT,UPDATE ON SEQUENCES TO checkin_runtime;

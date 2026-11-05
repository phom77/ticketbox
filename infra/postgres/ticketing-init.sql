
CREATE USER ticketing_runtime PASSWORD 'ticketing-runtime-local-only';
GRANT CONNECT ON DATABASE ticketbox_ticketing TO ticketing_runtime;
GRANT USAGE ON SCHEMA public TO ticketing_runtime;
GRANT CREATE ON SCHEMA public TO ticketing_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE ticketing_owner IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ticketing_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE ticketing_owner IN SCHEMA public GRANT USAGE,SELECT,UPDATE ON SEQUENCES TO ticketing_runtime;

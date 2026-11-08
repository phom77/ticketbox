CREATE USER core_runtime PASSWORD 'core-runtime-local-only';
GRANT CONNECT ON DATABASE ticketbox_core TO core_runtime;
GRANT USAGE ON SCHEMA public TO core_runtime;
-- Local fixture only: Spring Batch initializes its own metadata on first boot.
GRANT CREATE ON SCHEMA public TO core_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE core_owner IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO core_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE core_owner IN SCHEMA public GRANT USAGE,SELECT,UPDATE ON SEQUENCES TO core_runtime;

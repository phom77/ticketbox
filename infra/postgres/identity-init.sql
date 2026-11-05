
CREATE USER identity_runtime PASSWORD 'identity-runtime-local-only';
GRANT CONNECT ON DATABASE ticketbox_identity TO identity_runtime;
GRANT USAGE ON SCHEMA public TO identity_runtime;
GRANT CREATE ON SCHEMA public TO identity_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE identity_owner IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO identity_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE identity_owner IN SCHEMA public GRANT USAGE,SELECT,UPDATE ON SEQUENCES TO identity_runtime;

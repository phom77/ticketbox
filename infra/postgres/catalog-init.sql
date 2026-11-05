
CREATE USER catalog_runtime PASSWORD 'catalog-runtime-local-only';
GRANT CONNECT ON DATABASE ticketbox_catalog TO catalog_runtime;
GRANT USAGE ON SCHEMA public TO catalog_runtime;
GRANT CREATE ON SCHEMA public TO catalog_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE catalog_owner IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO catalog_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE catalog_owner IN SCHEMA public GRANT USAGE,SELECT,UPDATE ON SEQUENCES TO catalog_runtime;

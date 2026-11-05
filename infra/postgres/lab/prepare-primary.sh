#!/bin/sh
set -eu
# Lab-only credentials; may also be run explicitly against an existing lab volume.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='lab_replicator') THEN
  CREATE ROLE lab_replicator WITH LOGIN REPLICATION PASSWORD 'lab-replication-local-only';
 END IF;
END $$;
SQL
rule='host replication lab_replicator all scram-sha-256'
if ! grep -qF "$rule" "$PGDATA/pg_hba.conf"; then
 printf '\n%s\n' "$rule" >> "$PGDATA/pg_hba.conf"
fi
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c 'SELECT pg_reload_conf()'

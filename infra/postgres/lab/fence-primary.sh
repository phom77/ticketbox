#!/bin/sh
set -eu
# This file is changed AFTER the base backup; pg_hba.conf is not streamed in WAL.
# Local Unix-socket owner access remains available for manual recovery.
rule='host all all all reject # lab-old-primary-fenced'
if ! grep -qF 'lab-old-primary-fenced' "$PGDATA/pg_hba.conf"; then
 temporary="$PGDATA/pg_hba.lab.tmp"
 printf '%s\n' "$rule" > "$temporary"
 cat "$PGDATA/pg_hba.conf" >> "$temporary"
 chown postgres:postgres "$temporary"
 chmod 600 "$temporary"
 mv "$temporary" "$PGDATA/pg_hba.conf"
fi
psql -X -v ON_ERROR_STOP=1 --host=/var/run/postgresql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c 'SELECT pg_reload_conf()'

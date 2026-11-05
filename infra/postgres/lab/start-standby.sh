#!/bin/sh
set -eu
mkdir -p "$PGDATA"
chown postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"
if [ ! -s "$PGDATA/PG_VERSION" ]; then
 attempts=0
 until gosu postgres pg_isready -q; do
  attempts=$((attempts + 1))
  [ "$attempts" -lt 120 ] || { echo 'Primary unavailable' >&2; exit 1; }
  sleep 1
 done
 gosu postgres pg_basebackup --pgdata="$PGDATA" --wal-method=stream --write-recovery-conf --checkpoint=fast
fi
# PGHOST/PGUSER are for the initial base backup, not local health checks.
unset PGHOST PGUSER PGPASSWORD
exec docker-entrypoint.sh postgres -c hot_standby=on

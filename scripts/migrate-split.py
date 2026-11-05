"""Offline migration from the Core deployment to the six-service deployment.

Run after building and initializing the split databases, before serving split traffic.
All source/target writers remain stopped if validation fails. Database backups are
kept under .artifacts. The project names select existing Compose volumes explicitly.
"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
TABLES = json.loads((ROOT / "scripts/db/split-tables.json").read_text())
WRITERS = ["gateway", "identity", "catalog", "ticketing", "checkin", "payment", "notification"]


def command(args, **kwargs):
    return subprocess.check_output(args, cwd=ROOT, **kwargs)


def compose(project, file, *args, **kwargs):
    return command(["docker", "compose", "-p", project, "-f", file, *args], **kwargs)


def sql(project, service, database, query, source=False):
    file = "compose.legacy.yaml" if source else "compose.yaml"
    owner = "core_owner" if source else service + "_owner"
    return compose(project, file, "exec", "-T", service + "-db", "psql", "-X", "-At",
                   "-v", "ON_ERROR_STOP=1", "-U", owner, "-d", database, "-c", query).decode().strip()


def batch_sequence_restore(project):
    rows = sql(project, "core", "ticketbox_core",
               "SELECT sequencename||'|'||last_value FROM pg_sequences WHERE schemaname='public' "
               "AND sequencename LIKE 'batch_%' AND last_value IS NOT NULL ORDER BY sequencename", source=True)
    result = b""
    for row in rows.splitlines():
        name, value = row.split("|")
        if not re.fullmatch(r"batch_[a-z0-9_]+", name):
            raise ValueError("Invalid batch sequence")
        result += f"SELECT setval('public.{name}',{int(value)},true);\n".encode()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-project", default="ticketbox")
    parser.add_argument("--target-project", default="ticketbox")
    args = parser.parse_args()
    for name in [args.source_project, args.target_project]:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]+", name):
            raise ValueError("Invalid Compose project name")
    source = args.source_project
    target = args.target_project
    if source != target:
        raise ValueError("Use the same Compose project so existing Payment, Notification and Redis volumes remain authoritative")
    directory = ROOT / ".artifacts/migration" / dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    directory.mkdir(parents=True)
    # Stop entrypoints and domain writers first. These commands retain all volumes.
    compose(target, "compose.yaml", "stop", *WRITERS)
    compose(source, "compose.legacy.yaml", "stop", "gateway", "core", "payment", "notification")
    compose(source, "compose.legacy.yaml", "up", "-d", "core-db")
    for service in TABLES:
        compose(target, "compose.yaml", "up", "-d", service + "-db")

    require = sql(source, "core", "ticketbox_core",
                  "SELECT to_regclass('public.order_events') IS NOT NULL", source=True)
    if require != "t":
        raise RuntimeError("Apply Core V34 before migrating. Source writers remain stopped.")
    # Target fingerprints are captured during the split database's first Flyway boot.
    for service in TABLES:
        database = "ticketbox_" + service
        marker = sql(target, service, database, "SELECT count(*) FROM split_cutover_marker")
        if marker != "0":
            raise RuntimeError(f"{service} already has a completed cutover. Inspect the stored migration manifest.")
        rows = sql(target, service, database, "SELECT table_name||'|'||fingerprint FROM split_seed_fingerprints ORDER BY table_name")
        for row in rows.splitlines():
            table, expected = row.split("|")
            if table not in TABLES[service]:
                raise RuntimeError("Unexpected preflight table")
            row_expression = "(to_jsonb(t)-'updated_at')" if table == "ticket_inventory" else "to_jsonb(t)"
            actual = sql(target, service, database,
                         f"SELECT md5(COALESCE(string_agg({row_expression}::text,E'\\n' ORDER BY {row_expression}::text),'')) FROM {table} t")
            if actual != expected:
                raise RuntimeError(f"{service}.{table} already has split writes. Refusing to overwrite it.")

    source_dump = compose(source, "compose.legacy.yaml", "exec", "-T", "core-db", "pg_dump",
                          "-U", "core_owner", "-d", "ticketbox_core", "-Fc")
    (directory / "core.dump").write_bytes(source_dump)
    digest = hashlib.sha256(source_dump).hexdigest()
    manifest = {"sourceProject": source, "targetProject": target, "sourceSha256": digest, "services": {}, "complete": False}
    manifest_path = directory / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    sql(source, "core", "ticketbox_core", f"""
        CREATE TABLE IF NOT EXISTS split_cutover_lock(id INT PRIMARY KEY CHECK(id=1), source_digest TEXT NOT NULL);
        INSERT INTO split_cutover_lock(id,source_digest) VALUES(1,'{digest}');
        """, source=True)
    for service in TABLES:
        sql(target, service, "ticketbox_" + service,
            f"INSERT INTO split_cutover_marker(id,source_digest,ready) VALUES(1,'{digest}',false)")
    # Materialize every source export before changing any target database.
    exports = {}
    for service, tables in TABLES.items():
        exported = []
        for table in tables:
            exists = sql(source, "core", "ticketbox_core", f"SELECT to_regclass('public.{table}') IS NOT NULL", source=True)
            if exists != "t" and table.startswith(("batch_job_", "batch_step_")):
                continue
            if exists != "t":
                raise RuntimeError(f"Required source table {table} is missing")
            predicate = ""
            if table == "event_publication":
                predicate = " WHERE listener_id LIKE '%module.ai.%'" if service == "catalog" else " WHERE listener_id NOT LIKE '%module.ai.%'"
            query = f"COPY (SELECT * FROM public.{table}{predicate}) TO STDOUT WITH CSV"
            data = compose(source, "compose.legacy.yaml", "exec", "-T", "core-db", "psql",
                           "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "core_owner", "-d", "ticketbox_core", "-c", query)
            exported.append((table, data))
        exports[service] = exported

    for service, exported in exports.items():
        database = "ticketbox_" + service
        backup = compose(target, "compose.yaml", "exec", "-T", service + "-db", "pg_dump",
                         "-U", service + "_owner", "-d", database, "-Fc")
        (directory / (service + "-before.dump")).write_bytes(backup)
        tables = [table for table, _ in exported]
        extra = ["sale_config_outbox", "catalog_availability"] if service == "catalog" else (
            ["checkin_ticket_outbox", "projection_versions"] if service == "ticketing" else (
                ["projection_versions", "admission_outbox"] if service == "checkin" else []))
        statements = ["BEGIN;", "SET LOCAL search_path=public;"]
        for table in tables:
            statements.append(f"ALTER TABLE {table} DISABLE TRIGGER USER;")
        statements.append("TRUNCATE " + ",".join(tables + extra) + " CASCADE;")
        body = ("\n".join(statements) + "\n").encode()
        counts = {}
        for table, data in exported:
            body += f"COPY public.{table} FROM STDIN WITH CSV;\n".encode() + data + b"\\.\n"

        for table in tables:
            body += f"ALTER TABLE {table} ENABLE TRIGGER USER;\n".encode()
        if service == "catalog":
            body += b"INSERT INTO sale_config_outbox(concert_id) SELECT id FROM concerts;\n"
        if service == "ticketing":
            body += b"INSERT INTO checkin_ticket_outbox(ticket_id) SELECT id FROM tickets;\n"
        if service == "checkin":
            body += b"INSERT INTO admission_outbox(ticket_id) SELECT ticket_id FROM checkin_logs;\n"
        # Restore sequence positions after COPY, including Spring Batch metadata.
        body += b"""
DO $$ DECLARE r record; highest bigint;
BEGIN
 FOR r IN SELECT table_name,column_name FROM information_schema.columns
          WHERE table_schema='public' AND column_default LIKE 'nextval(%'
 LOOP
  EXECUTE format('SELECT max(%I) FROM %I',r.column_name,r.table_name) INTO highest;
  IF highest IS NOT NULL THEN
   PERFORM setval(pg_get_serial_sequence(r.table_name,r.column_name),highest,true);
  END IF;
 END LOOP;
END $$;
"""
        if service == "checkin":
            body += batch_sequence_restore(source)
        body += b"COMMIT;\n"
        compose(target, "compose.yaml", "exec", "-T", service + "-db", "psql", "-X",
                "-v", "ON_ERROR_STOP=1", "-U", service + "_owner", "-d", database, input=body)
        # Exact row comparison covers UUIDs, deadlines, idempotency keys and order stream payloads.
        for table, data in exported:
            # Exported row order is unspecified. Use a canonical PostgreSQL digest instead of CSV line sorting.
            predicate = ""
            if table == "event_publication":
                predicate = " WHERE listener_id LIKE '%module.ai.%'" if service == "catalog" else " WHERE listener_id NOT LIKE '%module.ai.%'"
            fingerprint = f"SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM public.{table} t"
            expected = sql(source, "core", "ticketbox_core", fingerprint + predicate, source=True)
            actual = sql(target, service, database, fingerprint)
            if actual != expected:
                raise RuntimeError(f"Imported data differs in {service}.{table}. Writers remain stopped.")
            counts[table] = sql(target, service, database, f"SELECT count(*) FROM public.{table}")
        manifest["services"][service] = {"tables": counts}
        manifest_path.write_text(json.dumps(manifest, indent=2))

    compose(source, "compose.legacy.yaml", "stop", "redis")
    # Preserve artifact paths used by in-flight AI and CSV jobs.
    for service in ("catalog", "checkin"):
        compose(target, "compose.yaml", "create", "--no-build", service)
        command(["docker", "run", "--rm", "-v", source + "_core_artifacts:/source:ro",
                 "-v", target + "_" + service + "_artifacts:/target", "alpine:3.20",
                 "sh", "-c", "cp -a /source/. /target/"])
    frozen = ",".join(sorted(set(table for values in exports.values() for table, _ in values)))
    sql(source, "core", "ticketbox_core", f"""
        CREATE TABLE IF NOT EXISTS split_cutover_control(id INT PRIMARY KEY CHECK(id=1), completed_at timestamptz NOT NULL DEFAULT now());
        INSERT INTO split_cutover_control(id) VALUES(1) ON CONFLICT DO NOTHING;
        REVOKE INSERT,UPDATE,DELETE ON {frozen} FROM core_runtime;
        """, source=True)
    for service in TABLES:
        sql(target, service, "ticketbox_" + service, "UPDATE split_cutover_marker SET ready=true WHERE id=1")
    manifest["complete"] = True
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"Verified cutover manifest: {manifest_path}")
    print("Start the six-service deployment with docker compose up -d. Old Core writers are fenced.")


if __name__ == "__main__":
    main()

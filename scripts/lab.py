#!/usr/bin/env python3
"""Phase 5/6 lab operations. Refuses ordinary deployment project names."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]


class Lab:
    def __init__(self, project):
        if not re.fullmatch(r"ticketbox-(?:e2e-)?lab(?:-[a-z0-9-]+)?", project):
            raise ValueError("Use a separate ticketbox-lab-* or ticketbox-e2e-lab project")
        self.project = project
        self.output = ROOT / ".artifacts" / "lab" / project
        self.output.mkdir(parents=True, exist_ok=True)
        self.roles = self.output / "roles.json"

    def compose(self, *args):
        command = ["docker", "compose", "-p", self.project,
                   "-f", str(ROOT / "compose.yaml"), "-f", str(ROOT / "compose.lab.yaml")]
        if self.roles.exists():
            command += ["-f", str(self.roles)]
        return subprocess.check_output(command + ["--profile", "lab", *args],
                                       cwd=ROOT, text=True, timeout=240)

    def sql(self, service, query, replica=False, runtime=False):
        node = service + ("-replica" if replica else "-db")
        if self.roles.exists() and service in json.loads(self.roles.read_text()).get("services", {}):
            if not replica:
                node = service + "-replica"
        user = service + ("_runtime" if runtime else "_owner")
        # Explicit localhost: bootstrap PGHOST on a standby points at its old upstream.
        env = ["env", "PGHOST=127.0.0.1", "PGPASSWORD=" + service + ("-runtime-local-only" if runtime else "-owner-local-only")]
        return self.compose("exec", "-T", node, *env, "psql", "-X", "-U", user,
                            "-d", "ticketbox_" + service, "-At", "-v", "ON_ERROR_STOP=1", "-c", query).strip()

    def wait(self, condition, seconds=90):
        deadline = time.monotonic() + seconds
        last = None
        while time.monotonic() < deadline:
            try:
                if condition():
                    return
            except (subprocess.CalledProcessError, OSError) as error:
                last = error
            time.sleep(.5)
        raise TimeoutError(f"Lab condition did not become true: {last}")

    def caught_up(self, service):
        lsn = self.sql(service, "SELECT pg_current_wal_lsn()")
        self.wait(lambda: self.sql(service, f"SELECT coalesce(pg_last_wal_replay_lsn()>='{lsn}'::pg_lsn,false)", replica=True) == "t")
        return lsn

    def prepare(self):
        for service in ("catalog", "ticketing"):
            self.compose("exec", "-T", service + "-db", "sh", "/docker-entrypoint-initdb.d/20-replication.sh")

    def lag(self, service):
        if self.roles.exists() and service in json.loads(self.roles.read_text()).get("services", {}):
            raise ValueError("This service has already switched roles; rebuild a standby first")
        self.caught_up(service)
        self.sql(service, "CREATE TABLE IF NOT EXISTS lab_replication_probe(id text PRIMARY KEY,value text NOT NULL)")
        self.caught_up(service)
        marker = dt.datetime.now(dt.timezone.utc).isoformat()
        self.sql(service, "SELECT pg_wal_replay_pause()", replica=True)
        self.wait(lambda: self.sql(service, "SELECT pg_is_wal_replay_paused()", replica=True) == "t")
        try:
            self.sql(service, f"INSERT INTO lab_replication_probe VALUES('{marker}','committed')")
            primary = self.sql(service, f"SELECT count(*) FROM lab_replication_probe WHERE id='{marker}'")
            stale = self.sql(service, f"SELECT count(*) FROM lab_replication_probe WHERE id='{marker}'", replica=True)
            barrier = self.sql(service, "SELECT pg_current_wal_lsn()")
            lag = json.loads(self.sql(service, f"SELECT jsonb_build_object('bytesBehindBarrier',pg_wal_lsn_diff('{barrier}',pg_last_wal_replay_lsn()),'replayPaused',pg_is_wal_replay_paused(),'lastReplayAt',pg_last_xact_replay_timestamp())", replica=True))
            if (primary, stale) != ("1", "0"):
                raise AssertionError((primary, stale))
        finally:
            self.sql(service, "SELECT pg_wal_replay_resume()", replica=True)
        self.caught_up(service)
        fresh = self.sql(service, f"SELECT count(*) FROM lab_replication_probe WHERE id='{marker}'", replica=True)
        assert fresh == "1"
        return {"service": service, "primary": primary, "pausedReplica": stale, "resumedReplica": fresh, "pausedLag": lag}

    def switchover(self, service):
        roles = json.loads(self.roles.read_text()) if self.roles.exists() else {"services": {}}
        if service in roles["services"]:
            raise ValueError("Service already switched; old primary remains fenced")
        assert self.sql(service, "SELECT pg_is_in_recovery()", replica=True) == "t"
        writers = ["gateway", "identity", "catalog", "ticketing", "checkin", "payment", "notification"]
        self.compose("stop", *writers)
        # Persist a fence even if somebody later restarts the old primary container.
        self.sql(service, "ALTER SYSTEM SET default_transaction_read_only=on")
        self.sql(service, "SELECT pg_reload_conf()")
        lsn = self.caught_up(service)
        self.compose("exec", "-T", service + "-db", "sh", "/lab/fence-primary.sh")
        self.compose("stop", service + "-db")
        assert self.sql(service, "SELECT pg_promote(true,60)", replica=True) == "t"
        assert self.sql(service, "SELECT pg_is_in_recovery()", replica=True) == "f"
        host = service + "-replica"
        url = f"jdbc:postgresql://{host}:5432/ticketbox_{service}"
        roles["services"][service] = {"environment": {"DATABASE_URL": url, "LAB_REPLICA_URL": url}}
        # Save before restarting: the exact role endpoints survive interrupted scripts.
        pending = self.roles.with_suffix(".tmp")
        pending.write_text(json.dumps(roles, indent=2) + "\n")
        pending.replace(self.roles)
        self.compose("up", "-d", "--no-deps", *writers)
        proof = {"service": service, "barrier": lsn, "primary": host,
                 "oldPrimaryStoppedAndReadOnly": True, "oldPrimaryTcpFenced": True, "rolesFile": str(self.roles)}
        (self.output / f"{service}-switchover.json").write_text(json.dumps(proof, indent=2) + "\n")
        return proof


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default=os.environ.get("LAB_PROJECT", "ticketbox-e2e-lab"))
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("prepare")
    for action in ("lag", "switchover"):
        command = sub.add_parser(action)
        command.add_argument("service", choices=("catalog", "ticketing"))
    args = parser.parse_args()
    lab = Lab(args.project)
    result = lab.prepare() if args.action == "prepare" else getattr(lab, args.action)(args.service)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

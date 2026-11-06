"""Swap Catalog into an isolated baseline cluster and check v1 receivers and lab reads."""

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import uuid

os.environ.setdefault("E2E_PROJECT", "ticketbox-e2e-catalog-" + uuid.uuid4().hex[:8])
os.environ.setdefault("E2E_PORT", "18216")

import split
from split import BASE, PORT, PROJECT, ROOT, login, press_kit, request, sql, until, upload

SERVICES = ("identity", "catalog", "ticketing", "checkin", "payment", "notification")


def compose(overlay, *args):
    return subprocess.check_output(
        ["docker", "compose", "-p", PROJECT, "-f", str(ROOT / "compose.yaml"),
         "-f", str(ROOT / "compose.lab.yaml"), "-f", str(overlay), "--profile", "lab", *args],
        cwd=ROOT, text=True, timeout=240,
        env={**os.environ, "APP_PORT": PORT, "APP_PUBLIC_URL": BASE, "APP_ALLOWED_ORIGINS": BASE,
             "CHECKIN_PORT": os.environ.get("CHECKIN_PORT", str(int(PORT) + 1))},
    ).strip()


def write_overlay(path, catalog_image):
    images = {service: f"ticketbox-{service}:ownership-baseline" for service in SERVICES}
    images["catalog"] = catalog_image
    path.write_text(json.dumps({"services": {service: {"image": image} for service, image in images.items()}}))


def replica_sql(overlay, query):
    return compose(overlay, "exec", "-T", "catalog-replica",
                   "env", "PGHOST=127.0.0.1", "PGPASSWORD=catalog-owner-local-only",
                   "psql", "-X", "-U", "catalog_owner", "-d", "ticketbox_catalog",
                   "-At", "-v", "ON_ERROR_STOP=1", "-c", query)


def wait_for_replay(overlay):
    lsn = sql("catalog", "SELECT pg_current_wal_lsn()")
    until(lambda: replica_sql(overlay, f"SELECT pg_last_wal_replay_lsn()>='{lsn}'::pg_lsn") == "t")


def verify_retry(overlay, admin, concert, ticket_type):
    outbox = f"FROM sale_config_outbox WHERE concert_id='{concert}'"
    version = lambda: sql("catalog", f"SELECT version {outbox}")
    acknowledged = lambda: sql("catalog", f"SELECT version=ticketing_version AND version=checkin_version {outbox}") == "t"
    status_route = f"/api/admin/concerts/{concert}/status"
    compose(overlay, "stop", "-t", "3", "ticketing")
    try:
        request("PATCH", status_route, admin, {"status": "ON_SALE"}, expected=(500,))
        assert sql("catalog", f"SELECT version>ticketing_version {outbox}") == "t"
        until(lambda: sql("catalog", f"SELECT version=checkin_version {outbox}") == "t")
        assert sql("checkin", f"SELECT status FROM concerts WHERE id='{concert}'") == "ON_SALE"
    finally:
        compose(overlay, "start", "ticketing")
    until(acknowledged)
    assert sql("ticketing", f"SELECT status FROM concerts WHERE id='{concert}'") == "ON_SALE"
    expected_version = version()

    inventory = f"SELECT md5(to_jsonb(i)::text) FROM ticket_inventory i WHERE ticket_type_id='{ticket_type}'"
    before = sql("ticketing", inventory)
    sql("catalog", f"""
        UPDATE sale_config_outbox SET ticketing_version=version-1, checkin_version=version-1
        WHERE concert_id='{concert}'
        """)
    until(acknowledged)
    for consumer in ("ticketing", "checkin"):
        assert sql(consumer, f"SELECT version FROM projection_versions WHERE kind='catalog' AND id='{concert}'") == expected_version
    assert version() == expected_version and sql("ticketing", inventory) == before


def verify_replica(overlay, admin, concert, details):
    public = f"/api/concerts/{concert}"
    admin_path = f"/api/admin/concerts/{concert}"
    wait_for_replay(overlay)
    original = details["title"]
    changed = "Catalog updated while replay paused"
    replica_sql(overlay, "SELECT pg_wal_replay_pause()")
    try:
        until(lambda: replica_sql(overlay, "SELECT pg_is_wal_replay_paused()") == "t")
        request("PUT", admin_path, admin, {**details, "title": changed})
        assert request("GET", admin_path, admin)["title"] == changed
        compose(overlay, "exec", "-T", "redis", "redis-cli", "DEL", f"cache:concert:{concert}")
        assert request("GET", public)["title"] == original
    finally:
        replica_sql(overlay, "SELECT pg_wal_replay_resume()")
    wait_for_replay(overlay)
    compose(overlay, "exec", "-T", "redis", "redis-cli", "DEL", f"cache:concert:{concert}")
    assert request("GET", public)["title"] == changed


def check_swap(overlay, candidate, proof):
    admin = until(lambda: login("admin"))
    until(lambda: request("GET", "/api/concerts"))
    audience = login("audience")
    until(lambda: request("GET", "/api/orders/my", audience) is not None)

    now = dt.datetime.now(dt.timezone.utc)
    fixture = {
        "title": "Catalog baseline " + uuid.uuid4().hex, "venueName": "Lab Arena", "venueAddress": "Test fixture",
        "eventDate": (now + dt.timedelta(days=7)).isoformat(),
        "saleStartAt": (now - dt.timedelta(minutes=1)).isoformat(),
        "saleEndAt": (now + dt.timedelta(days=1)).isoformat(),
    }
    concert = str(uuid.UUID(request("POST", "/api/admin/concerts", admin, fixture, expected=(201,))["id"]))
    ticket_type = str(uuid.UUID(request("POST", f"/api/admin/concerts/{concert}/ticket-types", admin, {
        "name": "GA", "price": 100000, "totalQuantity": 20, "maxPerAccount": 4,
    }, expected=(201,))["id"]))
    job = upload(f"/api/admin/concerts/{concert}/artist-bio-jobs", admin, "baseline.pdf", press_kit(), "application/pdf")
    job_id = str(uuid.UUID(job["jobId"]))
    job_route = f"/api/admin/artist-bio-jobs/{job_id}"
    until(lambda: request("GET", job_route, admin)["status"] == "DONE")
    stored_pdf = sql("catalog", f"SELECT file_url FROM artist_pdf_jobs WHERE id='{job_id}'")

    history_query = "SELECT version, checksum, success FROM flyway_schema_history ORDER BY installed_rank"
    history = sql("catalog", history_query)
    containers = {service: compose(overlay, "ps", "-q", service)
                  for service in (*SERVICES, "catalog-db", "catalog-replica", "gateway")}
    assert all(containers.values())
    write_overlay(overlay, candidate)
    compose(overlay, "up", "-d", "--no-deps", "--no-build", "--pull", "never", "catalog")
    container = compose(overlay, "ps", "-q", "catalog")
    assert container and container != containers.pop("catalog")
    image = subprocess.check_output(["docker", "inspect", "--format", "{{.Image}}", container], text=True).strip()
    assert image == subprocess.check_output(["docker", "image", "inspect", "--format", "{{.Id}}", candidate], text=True).strip()
    assert all(compose(overlay, "ps", "-q", service) == previous for service, previous in containers.items())

    assert until(lambda: request("GET", f"/api/admin/concerts/{concert}", admin))["title"] == fixture["title"]
    assert request("GET", job_route, admin)["status"] == "DONE"
    assert sql("catalog", history_query) == history
    compose(overlay, "exec", "-T", "catalog", "test", "-s", stored_pdf)
    proof["candidateImage"] = image
    proof["checks"].append("Only Catalog changed images; its existing DB, Flyway history and PDF volume survived")

    verify_retry(overlay, admin, concert, ticket_type)
    proof["checks"].append("Activation failed without Ticketing ACK; both baseline receivers recovered and replay was idempotent")

    split.main()
    proof["split"] = split.PROOF

    verify_replica(overlay, admin, concert, fixture)
    proof["checks"].append("Public cache miss read a stale physical standby while admin writes and reads used primary")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog-image", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    for command in (("ps", "--all"), ("volume", "ls")):
        existing = subprocess.check_output(
            ["docker", *command, "--quiet", "--filter", f"label=com.docker.compose.project={PROJECT}"], text=True,
        )
        if existing.strip():
            parser.error(f"Compose project {PROJECT} already has resources")
    proof = {"passed": False, "project": PROJECT, "gatewayPort": PORT, "checks": []}
    with TemporaryDirectory() as directory:
        overlay = Path(directory) / "images.json"
        write_overlay(overlay, "ticketbox-catalog:ownership-baseline")
        try:
            compose(overlay, "up", "-d", "--no-build", "--pull", "never", "gateway", "smtp")
            check_swap(overlay, args.catalog_image, proof)
            proof["passed"] = True
        finally:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(proof, indent=2) + "\n")
            compose(overlay, "down", "--volumes")


if __name__ == "__main__":
    main()

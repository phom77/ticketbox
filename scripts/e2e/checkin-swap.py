"""Verify Check-in against both generations of Catalog on an existing lab database."""

import argparse
import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import uuid

os.environ.setdefault("E2E_PROJECT", "ticketbox-e2e-checkin-" + uuid.uuid4().hex[:8])
os.environ.setdefault("E2E_PORT", "18226")

import split
from split import BASE, CHECKIN_BASE, CHECKIN_PORT, PORT, PROJECT, ROOT, request, sql, until

SERVICES = ("identity", "catalog", "ticketing", "checkin", "payment", "notification")
HISTORY = "SELECT version, checksum, success FROM flyway_schema_history ORDER BY installed_rank"


def compose(overlay, *args):
    return subprocess.check_output(
        ["docker", "compose", "-p", PROJECT, "-f", str(ROOT / "compose.yaml"),
         "-f", str(ROOT / "compose.lab.yaml"), "-f", str(overlay), "--profile", "lab", *args],
        cwd=ROOT, text=True, timeout=240,
        env={**os.environ, "APP_PORT": PORT, "APP_PUBLIC_URL": BASE, "APP_ALLOWED_ORIGINS": BASE,
             "CHECKIN_PORT": CHECKIN_PORT},
    ).strip()


def write_overlay(path, images):
    path.write_text(json.dumps({"services": {name: {"image": image} for name, image in images.items()}}))


def swap(overlay, images, service, candidate):
    unchanged = tuple(name for name in (*SERVICES, "checkin-db", "gateway") if name != service)
    previous = compose(overlay, "ps", "-q", service)
    peers = {name: compose(overlay, "ps", "-q", name) for name in unchanged}
    assert previous and all(peers.values())
    images[service] = candidate
    write_overlay(overlay, images)
    compose(overlay, "up", "-d", "--no-deps", "--no-build", "--pull", "never", service)
    current = compose(overlay, "ps", "-q", service)
    assert current and current != previous
    assert all(compose(overlay, "ps", "-q", name) == container for name, container in peers.items())
    image = subprocess.check_output(["docker", "inspect", "--format", "{{.Image}}", current], text=True).strip()
    assert image == subprocess.check_output(["docker", "image", "inspect", "--format", "{{.Id}}", candidate], text=True).strip()
    return image


def journey():
    split.PROOF = {"passed": False, "checks": []}
    split.main()
    assert split.PROOF["passed"]
    return split.PROOF


def audit(concert):
    return sql("checkin", f"""
        SELECT count(*) || ':' || md5(string_agg(to_jsonb(a)::text, '' ORDER BY a.id))
        FROM scan_audit a WHERE concert_id='{concert}'
        """)


def assert_admissions(result):
    concert = str(uuid.UUID(result["concertId"]))
    assert audit(concert).startswith("2:")
    assert sql("checkin", f"SELECT count(*) FROM checkin_logs WHERE concert_id='{concert}'") == "2"
    return concert


def check_swap(overlay, images, args, proof):
    proof["baseline"] = journey()
    existing = assert_admissions(proof["baseline"])
    audit_before = audit(existing)
    history = sql("checkin", HISTORY)
    archive = until(lambda: sql("checkin", f"""
        SELECT file_path FROM batch_logs WHERE concert_id='{existing}'
        AND status='SUCCESS' AND file_path LIKE '/app/data/%/archive/%' ORDER BY started_at LIMIT 1
        """))
    digest = compose(overlay, "exec", "-T", "checkin", "sha256sum", archive)

    proof["checkinImage"] = swap(overlay, images, "checkin", args.checkin_image)
    until(lambda: request("GET", "/api/health", base=CHECKIN_BASE))
    request("POST", "/internal/split/catalog", body={}, headers={"X-Service-Token": "invalid"},
            expected=(401,), base=CHECKIN_BASE)
    assert compose(overlay, "exec", "-T", "checkin", "sha256sum", archive) == digest
    assert sql("checkin", HISTORY) == history and audit(existing) == audit_before
    assert sql("checkin", "SELECT relkind FROM pg_class WHERE oid='scan_audit'::regclass") == "p"
    proof["checks"].append("Check-in replaced alone with its existing audit partition, migration history and CSV archive")

    proof["baselinePublishers"] = journey()
    assert_admissions(proof["baselinePublishers"])
    proof["checks"].append("New Check-in accepted baseline Catalog and Ticketing payloads")

    proof["catalogImage"] = swap(overlay, images, "catalog", args.catalog_image)
    until(lambda: request("GET", "/api/concerts"))
    proof["newCatalog"] = journey()
    assert_admissions(proof["newCatalog"])
    assert audit(existing) == audit_before and sql("checkin", HISTORY) == history
    assert compose(overlay, "exec", "-T", "checkin", "sha256sum", archive) == digest
    proof["checks"].append("New Catalog and baseline Ticketing still feed the same Check-in DB and audit ledger")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkin-image", required=True)
    parser.add_argument("--catalog-image", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    for command in (("ps", "--all"), ("volume", "ls")):
        existing = subprocess.check_output(
            ["docker", *command, "--quiet", "--filter", f"label=com.docker.compose.project={PROJECT}"], text=True,
        )
        if existing.strip():
            parser.error(f"Compose project {PROJECT} already has resources")
    proof = {"passed": False, "project": PROJECT, "gatewayPort": PORT, "checkinPort": CHECKIN_PORT, "checks": []}
    with TemporaryDirectory() as directory:
        overlay = Path(directory) / "images.json"
        images = {service: f"ticketbox-{service}:ownership-baseline" for service in SERVICES}
        write_overlay(overlay, images)
        try:
            compose(overlay, "up", "-d", "--no-build", "--pull", "never", "gateway", "smtp")
            check_swap(overlay, images, args, proof)
            proof["passed"] = True
        finally:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(proof, indent=2) + "\n")
            try:
                if not proof["passed"]:
                    args.output.with_suffix(".compose.log").write_text(
                        compose(overlay, "logs", "--no-color", "--tail", "120"))
            finally:
                compose(overlay, "down", "--volumes")


if __name__ == "__main__":
    main()

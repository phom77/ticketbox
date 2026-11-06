"""Verify Ticketing image replacement, durable work, mixed receivers and lab routing."""

import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import urllib.request
import uuid

os.environ.setdefault("E2E_PROJECT", "ticketbox-e2e-lab-ticketing-" + uuid.uuid4().hex[:8])
os.environ.setdefault("E2E_PORT", "18236")

import split
from split import BASE, CHECKIN_PORT, PORT, PROJECT, ROOT, login, request, sql, until

SERVICES = ("identity", "catalog", "ticketing", "checkin", "payment", "notification")
AUDIENCE_ID = "00000000-0000-0000-0000-000000000003"
NOTIFICATION_TOKEN = "ticketing-swap-fixture-notification-token"
TITLE = "Đêm nhạc Ánh Dương"
HISTORY = "SELECT version, checksum, success FROM flyway_schema_history ORDER BY installed_rank"


def environment():
    return {**os.environ, "APP_PORT": PORT, "APP_PUBLIC_URL": BASE, "APP_ALLOWED_ORIGINS": BASE,
            "CHECKIN_PORT": CHECKIN_PORT, "NOTIFICATION_SERVICE_TOKEN": NOTIFICATION_TOKEN}


def compose(overlay, *args):
    return subprocess.check_output(
        ["docker", "compose", "-p", PROJECT, "-f", str(ROOT / "compose.yaml"),
         "-f", str(ROOT / "compose.lab.yaml"), "-f", str(overlay), "--profile", "lab", *args],
        cwd=ROOT, text=True, timeout=240, env=environment(),
    ).strip()


def write_overlay(path, images):
    path.write_text(json.dumps({"services": {name: {"image": image} for name, image in images.items()}}))


def swap(overlay, images, service, candidate):
    peers = {name: compose(overlay, "ps", "--all", "--quiet", name)
             for name in (*SERVICES, "ticketing-db", "gateway") if name != service}
    previous = compose(overlay, "ps", "--all", "--quiet", service)
    assert previous and all(peers.values())
    images[service] = candidate
    write_overlay(overlay, images)
    compose(overlay, "up", "-d", "--no-deps", "--no-build", "--pull", "never", service)
    current = compose(overlay, "ps", "-q", service)
    assert current and current != previous
    assert all(compose(overlay, "ps", "--all", "--quiet", name) == container for name, container in peers.items())
    image = subprocess.check_output(["docker", "inspect", "--format", "{{.Image}}", current], text=True).strip()
    assert image == subprocess.check_output(["docker", "image", "inspect", "--format", "{{.Id}}", candidate], text=True).strip()
    return image


def reset_payment_budget(overlay):
    # Each journey uses the same seeded account. Keep throttling within each journey.
    compose(overlay, "exec", "-T", "redis", "redis-cli", "DEL", f"rate-limit:user:{AUDIENCE_ID}:payment")


def journey(overlay):
    reset_payment_budget(overlay)
    split.PROOF = {"passed": False, "checks": []}
    # Keep peer addresses stable across the image swap. split.py runs the LAN outage separately.
    split.main(source_outage=False)
    assert split.PROOF["passed"]
    return split.PROOF


def checkout(overlay, concert, admin, audience):
    details = request("GET", f"/api/admin/concerts/{concert}", admin)
    request("PUT", f"/api/admin/concerts/{concert}", admin, {**details, "title": TITLE})
    ticket_type = sql("ticketing", f"SELECT id FROM ticket_types WHERE concert_id='{concert}'")
    request("POST", f"/api/queue/concerts/{concert}/join", audience)
    access = until(lambda: request("GET", f"/api/queue/concerts/{concert}/status", audience).get("queueAccessToken"))
    key = str(uuid.uuid4())
    headers = {"Idempotency-Key": key, "Queue-Access-Token": access}
    request("POST", f"/api/reservations/concerts/{concert}/ticket-types/{ticket_type}/reserve",
            audience, {"quantity": 1}, headers=headers)
    order = request("POST", "/api/orders", audience,
                    {"concertId": concert, "items": [{"ticketTypeId": ticket_type, "quantity": 1}]},
                    expected=(201,), headers=headers)
    order_id = str(uuid.UUID(order["id"]))
    compose(overlay, "stop", "-t", "3", "payment")
    request("POST", f"/api/payments/{order_id}/initiate", audience, {"provider": "MOCK"}, expected=(202,))
    intent = sql("ticketing", f"SELECT intent_id FROM ticketing_payment_intents WHERE order_id='{order_id}'")
    return order_id, str(uuid.UUID(intent)), key


def baseline_publication(concert, audience):
    user = str(uuid.UUID(request("GET", "/api/auth/me", audience)["id"]))
    request("POST", f"/api/queue/concerts/{concert}/leave", audience)
    publication = until(lambda: sql("ticketing", f"""
        SELECT id FROM event_publication
        WHERE event_type='com.ticketbox.shared.event.UserLeftQueueEvent'
          AND serialized_event::jsonb->>'concertId'='{concert}'
          AND serialized_event::jsonb->>'userId'='{user}'
          AND completion_date IS NOT NULL
        ORDER BY publication_date DESC LIMIT 1
        """))
    return str(uuid.UUID(publication))


def seed_pending_work(publication, baseline_order):
    # Keep the baseline serializer output and listener ID exactly as persisted.
    sql("ticketing", f"""
        UPDATE event_publication SET completion_date=NULL,publication_date=now()-interval '2 minutes'
        WHERE id='{publication}'
        """)
    outbox = f"""
        FROM checkin_ticket_outbox o JOIN tickets t ON t.id=o.ticket_id
        JOIN order_items i ON i.id=t.order_item_id
        WHERE i.order_id='{baseline_order}' AND o.delivered_version<o.version
        """
    sql("ticketing", f"""
        UPDATE checkin_ticket_outbox SET delivered_version=0
        WHERE ticket_id IN (SELECT t.id FROM tickets t JOIN order_items i ON i.id=t.order_item_id
                            WHERE i.order_id='{baseline_order}')
        """)
    assert sql("ticketing", "SELECT count(*) " + outbox) == "2"
    return outbox


def assert_settlement(overlay, order, intent, key, audience):
    path = f"/api/payments/{order}/status"
    until(lambda: request("GET", path, audience))
    assert request("GET", "/api/orders/by-idempotency-key", audience, headers={"Idempotency-Key": key})["id"] == order
    assert sql("ticketing", f"SELECT intent_id FROM ticketing_payment_intents WHERE order_id='{order}'") == intent
    compose(overlay, "start", "payment")
    until(lambda: request("GET", path, audience).get("attemptState") == "READY")
    request("POST", f"/api/mock-payments/{order}/success", audience)
    until(lambda: request("GET", path, audience).get("orderStatus") == "PAID")
    request("POST", f"/api/mock-payments/{order}/success", audience)
    assert sql("ticketing", f"SELECT count(*) FROM ticketing_payment_inbox WHERE intent_id='{intent}'") == "1"
    assert sql("ticketing", f"""
        SELECT count(*) FROM tickets t JOIN order_items i ON t.order_item_id=i.id WHERE i.order_id='{order}'
        """) == "1"
    stream = sql("ticketing", f"""
        SELECT string_agg(event_type,',' ORDER BY stream_version) FROM order_events WHERE order_id='{order}'
        """)
    assert stream == "OrderCreated,OrderPaymentInitiated,OrderPaid", stream
    assert sql("ticketing", f"SELECT replay_order('{order}')->>'status'") == "PAID"


def save_ticket_pdf(overlay, order, output):
    js = """
    const [id, token] = process.argv.slice(1);
    const res = await fetch('http://ticketing:8080/internal/notifications/orders/' + id + '/document',
                            {headers: {'X-Service-Token': token}});
    if (!res.ok || res.headers.get('content-type') !== 'application/pdf') throw new Error('PDF HTTP ' + res.status);
    console.log(Buffer.from(await res.arrayBuffer()).toString('base64'));
    """
    data = compose(overlay, "exec", "-T", "smtp", "node", "--input-type=module", "-e", js, order, NOTIFICATION_TOKEN)
    output.write_bytes(base64.b64decode(data, validate=True))


def save_report_pdf(concert, audience, output):
    organizer = login("organizer")
    owner = str(uuid.UUID(request("GET", "/api/auth/me", organizer)["id"]))
    # Install a completed-concert fixture after checkout and lab tests have finished.
    sql("catalog", f"UPDATE concerts SET created_by='{owner}',status='COMPLETED' WHERE id='{concert}'")
    until(lambda: sql("ticketing", f"SELECT status FROM concerts WHERE id='{concert}'") == "COMPLETED")
    path = f"/api/organizer/concerts/{concert}/revenue-report/export?format=pdf"
    request("GET", path, audience, expected=(403,))
    req = urllib.request.Request(BASE + path, headers={"Authorization": "Bearer " + organizer})
    with urllib.request.urlopen(req, timeout=20) as response:
        assert response.status == 200 and response.headers.get_content_type() == "application/pdf"
        output.write_bytes(response.read())


def check_swap(overlay, images, args, proof):
    proof["baseline"] = journey(overlay)
    concert = str(uuid.UUID(proof["baseline"]["concertId"]))
    baseline_order = str(uuid.UUID(proof["baseline"]["orderId"]))
    inbox = f"""
        SELECT md5(string_agg(to_jsonb(i)::text,'' ORDER BY i.event_id))
        FROM ticketing_payment_inbox i JOIN ticketing_payment_intents p USING(intent_id)
        WHERE p.order_id='{baseline_order}'
        """
    before_inbox = sql("ticketing", inbox)
    history = sql("ticketing", HISTORY)
    assert before_inbox and history
    admin, audience = login("admin"), login("audience")
    order, intent, key = checkout(overlay, concert, admin, audience)
    publication = baseline_publication(concert, audience)
    compose(overlay, "stop", "-t", "3", "ticketing")
    outbox = seed_pending_work(publication, baseline_order)
    proof["ticketingImage"] = swap(overlay, images, "ticketing", args.ticketing_image)

    assert_settlement(overlay, order, intent, key, audience)
    until(lambda: sql("ticketing", "SELECT count(*) " + outbox) == "0")
    until(lambda: sql("ticketing", f"SELECT completion_date IS NOT NULL FROM event_publication WHERE id='{publication}'") == "t")
    assert sql("ticketing", HISTORY) == history and sql("ticketing", inbox) == before_inbox
    proof["checks"].append("Old order, intent, inbox, outbox and publication survived Ticketing replacement and settled once")

    compose(overlay, "stop", "-t", "3", "catalog")
    try:
        assert request("GET", f"/api/orders/{order}", audience)["id"] == order
        save_ticket_pdf(overlay, order, args.output.parent / "ticket.pdf")
    finally:
        compose(overlay, "start", "catalog")
    until(lambda: request("GET", f"/api/admin/concerts/{concert}", admin))
    proof["checks"].append("Order detail and the e-ticket use local data while Catalog is stopped")

    proof["baselineCheckin"] = journey(overlay)

    proof["checkinImage"] = swap(overlay, images, "checkin", args.checkin_image)
    proof["catalogImage"] = swap(overlay, images, "catalog", args.catalog_image)
    proof["newCheckin"] = journey(overlay)
    proof["checks"].append("New Ticketing issues snapshots accepted by baseline and standalone Check-in")

    reset_payment_budget(overlay)
    subprocess.run(["python3", "-B", str(ROOT / "scripts/e2e/lab.py"), "--project", PROJECT, "--port", PORT,
                    "--output", str(args.output.parent)], cwd=ROOT, env=environment(), check=True)
    proof["lab"] = json.loads((args.output.parent / "lab-e2e.json").read_text())
    assert proof["lab"]["passed"]
    save_report_pdf(concert, audience, args.output.parent / "revenue.pdf")
    proof["checks"].append("Replica routing and replay passed the lab; organizer and notification APIs delivered PDFs")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ticketing-image", required=True)
    parser.add_argument("--checkin-image", required=True)
    parser.add_argument("--catalog-image", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output = args.output.resolve()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for command in (("ps", "--all"), ("volume", "ls")):
        existing = subprocess.check_output(
            ["docker", *command, "--quiet", "--filter", f"label=com.docker.compose.project={PROJECT}"], text=True)
        if existing.strip():
            parser.error(f"Compose project {PROJECT} already has resources")
    proof = {"passed": False, "project": PROJECT, "checks": []}
    with TemporaryDirectory() as directory:
        overlay = Path(directory) / "images.json"
        images = {service: f"ticketbox-{service}:ownership-baseline" for service in SERVICES}
        write_overlay(overlay, images)
        try:
            compose(overlay, "up", "-d", "--no-build", "--pull", "never", "gateway", "smtp")
            check_swap(overlay, images, args, proof)
            proof["passed"] = True
        finally:
            args.output.write_text(json.dumps(proof, indent=2) + "\n")
            try:
                if not proof["passed"]:
                    args.output.with_suffix(".compose.log").write_text(
                        compose(overlay, "logs", "--no-color", "--tail", "120"))
            finally:
                compose(overlay, "down", "--volumes")


if __name__ == "__main__":
    main()

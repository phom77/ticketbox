"""Acceptance checks for the six-service deployment, using isolated Compose data."""
import argparse
import csv
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
from threading import Barrier
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
PROJECT = os.environ.get("E2E_PROJECT", "ticketbox-e2e-split")
PORT = os.environ.get("E2E_PORT", "18096")
assert re.fullmatch(r"ticketbox-e2e(?:-[a-z0-9-]+)?", PROJECT)
BASE = "http://localhost:" + PORT
CHECKIN_PORT = os.environ.get("CHECKIN_PORT", str(int(PORT) + 1))
CHECKIN_BASE = "http://localhost:" + CHECKIN_PORT
PROOF = {"passed": False, "checks": []}
LOCAL_ACCEPTANCE = os.environ.get("TICKETBOX_LOCAL_ACCEPTANCE") == "1"
REPORT_DIRECTORY = ROOT / os.environ.get("E2E_REPORT_DIRECTORY", ".artifacts/e2e")


def compose(*args):
    return subprocess.check_output(
        ["docker", "compose", "-p", PROJECT, "-f", str(ROOT / "compose.yaml"), *args],
        cwd=ROOT, text=True, env={**os.environ, "APP_PORT": PORT,
            "APP_PUBLIC_URL": BASE, "APP_ALLOWED_ORIGINS": BASE,
            "CHECKIN_PORT": CHECKIN_PORT},
    )


def sql(service, query):
    return compose("exec", "-T", service + "-db", "psql", "-U", service + "_owner",
                   "-d", {"notification": "ticketbox_notifications", "payment": "ticketbox_payments"}.get(service, "ticketbox_" + service), "-At", "-v", "ON_ERROR_STOP=1", "-c", query).strip()


def request(method, path, token=None, body=None, expected=(200,), headers=None, *, base=BASE):
    supplied = {"Content-Type": "application/json", **(headers or {})}
    if token:
        supplied["Authorization"] = "Bearer " + token
    data = json.dumps(body).encode() if body is not None else None
    try:
        response = urllib.request.urlopen(
            urllib.request.Request(base + path, data=data, headers=supplied, method=method), timeout=20)
    except urllib.error.HTTPError as error:
        assert error.code in expected, (method, path, error.code, error.read().decode()[:500])
        return None
    raw = response.read()
    payload = json.loads(raw) if raw else {}
    assert response.status in expected, (path, response.status, payload)
    return payload.get("data", payload)


def until(check, seconds=120):
    deadline = time.monotonic() + seconds
    failure = None
    while time.monotonic() < deadline:
        try:
            result = check()
            if result:
                return result
        except Exception as error:
            failure = error
        time.sleep(1)
    raise AssertionError(f"Timed out: {failure}")


def login(role):
    return request("POST", "/api/auth/login",
                   body={"email": role + "@ticketbox.com", "password": "password123"})["accessToken"]


def verify_localized_responses():
    for language, expected_locale, message in (
        (None, "vi", "Vui lòng đăng nhập để tiếp tục"),
        ("vi-VN", "vi", "Vui lòng đăng nhập để tiếp tục"),
        ("en-US", "en", "Please sign in to continue"),
    ):
        headers = {} if language is None else {"Accept-Language": language}
        req = urllib.request.Request(BASE + "/api/auth/me", headers=headers)
        try:
            urllib.request.urlopen(req, timeout=20)
        except urllib.error.HTTPError as error:
            assert error.code == 401, error.code
            assert error.headers["Content-Language"] == expected_locale
            vary = ",".join(error.headers.get_all("Vary", [])).lower()
            assert "accept-language" in vary, vary
            payload = json.load(error)
            assert payload["code"] == 401 and payload["message"] == message, payload
        else:
            raise AssertionError("Anonymous authentication request unexpectedly succeeded")

    for language, message in (("en", "Success"), ("vi", "Thành công")):
        req = urllib.request.Request(
            BASE + "/api/concerts", headers={"Accept-Language": language}
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            assert response.headers["Content-Language"] == language
            vary = ",".join(response.headers.get_all("Vary", [])).lower()
            assert "accept-language" in vary, vary
            assert json.load(response)["message"] == message

    def callback(language):
        req = urllib.request.Request(
            BASE + "/api/payments/webhooks/vnpay", headers={"Accept-Language": language}
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    status, payload = callback("vi")
    assert (status, payload) == callback("en")
    if status == 200:
        assert {"RspCode", "Message"} <= payload.keys(), payload
    else:
        assert status == 503 and "message" in payload, (status, payload)


def upload(path, token, filename, content, media):
    boundary="ticketbox-"+uuid.uuid4().hex
    body=(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
          f"Content-Type: {media}\r\n\r\n").encode()+content+f"\r\n--{boundary}--\r\n".encode()
    headers={"Authorization":"Bearer "+token,"Content-Type":"multipart/form-data; boundary="+boundary}
    with urllib.request.urlopen(urllib.request.Request(BASE+path,data=body,headers=headers),timeout=30) as response:
        assert response.status==202
        return json.load(response)["data"]


def press_kit():
    text=("Nguyen Anh is a Vietnamese singer and songwriter performing acoustic pop music. "
          "The upcoming concert celebrates ten years of musical performances and collaborations. ")*4
    stream=("BT /F1 12 Tf 40 750 Td ("+text+") Tj ET").encode()
    objects=[b"<< /Type /Catalog /Pages 2 0 R >>",b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length "+str(len(stream)).encode()+b" >>\nstream\n"+stream+b"\nendstream"]
    data=b"%PDF-1.4\n";offsets=[]
    for index,obj in enumerate(objects,1):
        offsets.append(len(data));data+=str(index).encode()+b" 0 obj\n"+obj+b"\nendobj\n"
    xref=len(data)
    data+=b"xref\n0 6\n0000000000 65535 f \n"
    for offset in offsets:data+=f"{offset:010d} 00000 n \n".encode()
    return data+b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"+str(xref).encode()+b"\n%%EOF\n"


def check(name):
    PROOF["checks"].append(name)
    print(name, flush=True)


def operations_snapshot():
    return {
        "ticketing": {
            "paidOrdersWithMissingTickets": int(sql("ticketing", """
                SELECT count(*) FROM orders o WHERE o.status='PAID'
                AND (SELECT count(*) FROM tickets t JOIN order_items i ON i.id=t.order_item_id WHERE i.order_id=o.id)
                < (SELECT sum(quantity) FROM order_items i WHERE i.order_id=o.id)
                """)),
            "pendingTicketProjections": int(sql("ticketing", "SELECT count(*) FROM checkin_ticket_outbox WHERE version>delivered_version")),
        },
        "payment": {
            "pendingSettlementResults": int(sql("payment", "SELECT count(*) FROM payment_result_outbox WHERE completed_at IS NULL")),
            "pendingReconciliation": int(sql("payment", "SELECT count(*) FROM payment_reconciliation_outbox WHERE revision>delivered_revision")),
            "openPaymentReviews": int(sql("payment", "SELECT count(*) FROM payment_attempts WHERE state IN ('UNKNOWN','REVIEW_REQUIRED')")),
            "openRefundCases": int(sql("payment", "SELECT count(*) FROM refund_reviews WHERE state IN ('REVIEW_REQUIRED','REQUESTED','HOLD_PENDING','APPROVED')")),
        },
        "notification": {
            "pendingEmail": int(sql("notification", "SELECT count(*) FROM notifications WHERE channel='EMAIL' AND status='PENDING'")),
            "failedEmail": int(sql("notification", "SELECT count(*) FROM notifications WHERE channel='EMAIL' AND status='FAILED'")),
        },
        "checkin": {
            "pendingAdmissionFeedback": int(sql("checkin", "SELECT count(*) FROM admission_outbox WHERE NOT delivered")),
        },
    }


def verify_local_load(run_id, manager, scope, event):
    management = "/api/organizer/manage/concerts"
    concert = request("POST", management, manager, {**event, "title": f"Local capacity {run_id}"},
                      expected=(201,), headers=scope)["id"]
    shoppers, capacity = 8, 3
    tiers = [request("POST", f"{management}/{concert}/ticket-types", manager, {
        "name": name, "price": 100000, "totalQuantity": stock, "maxPerAccount": 1, "zoneColor": "#123456",
    }, expected=(201,), headers=scope)["id"] for name, stock in (("Race", capacity), ("Expiry", 2))]
    request("POST", f"{management}/{concert}/publication", manager, headers=scope)
    until(lambda: request("GET", f"/api/concerts/{concert}")["id"] == concert)

    def client(index):
        credentials = {"email": f"load-{index}-{run_id}@example.test", "password": "fixture-load-pass"}
        account = request("POST", "/api/auth/register", body={**credentials, "fullName": "Local Load"}, expected=(201,))
        buyer = request("POST", "/api/auth/login", body=credentials)["accessToken"]
        queue = f"/api/queue/concerts/{concert}"
        request("POST", queue + "/join", buyer)
        access = until(lambda: request("GET", queue + "/status", buyer).get("queueAccessToken"))
        return account["id"], buyer, {"Queue-Access-Token": access, "Idempotency-Key": str(uuid.uuid4())}

    def reserve(tier, shopper):
        _, buyer, headers = shopper
        return request("POST", f"/api/reservations/concerts/{concert}/ticket-types/{tier}/reserve",
                       buyer, {"quantity": 1}, expected=(200, 409), headers=headers)

    def stock(tier):
        return int(sql("ticketing", f"SELECT available_qty FROM ticket_inventory WHERE ticket_type_id='{tier}'"))

    clients = [client(index) for index in range(shoppers)]
    expiry = tiers[1]
    assert reserve(expiry, clients[0]) is not None and stock(expiry) == 1
    assert reserve(expiry, clients[0]) is None and stock(expiry) == 1
    sql("ticketing", f"UPDATE ticket_holds SET expires_at=clock_timestamp()-interval '1 second' WHERE ticket_type_id='{expiry}'")
    until(lambda: stock(expiry) == 2)

    start = Barrier(shoppers, timeout=20)
    race = tiers[0]

    def purchase(shopper):
        start.wait()
        began = time.monotonic()
        reserved = reserve(race, shopper) is not None
        if reserved:
            _, buyer, headers = shopper
            request("POST", "/api/orders", buyer, {"concertId": concert, "items": [{"ticketTypeId": race, "quantity": 1}]},
                    expected=(201,), headers=headers)
        return reserved, round((time.monotonic() - began) * 1000)

    with ThreadPoolExecutor(max_workers=shoppers) as pool:
        outcomes = list(pool.map(purchase, clients))
    accepted = sum(reserved for reserved, _ in outcomes)
    latency = sorted(elapsed for _, elapsed in outcomes)
    assert accepted == capacity and stock(race) == 0 and latency[-1] < 20000
    assert int(sql("ticketing", f"SELECT count(*) FROM orders WHERE concert_id='{concert}'")) == capacity
    PROOF["localLoad"] = {"shoppers": shoppers, "capacity": capacity, "orders": accepted, "reserveConflicts": shoppers - accepted,
                          "unexpectedResponses": 0, "durationMsByShopper": latency, "availableAfterRace": stock(race),
                          "quotaRejected": True, "expiryRestoredStock": True}
    check("Bounded checkout load preserves the last tickets, per-account quota and expiring holds")


def verify_password_recovery(run_id):
    email = f"recovery-{run_id}@example.test"
    old_password = "fixture-old-pass"
    new_password = "fixture-new-pass"
    account = request("POST", "/api/auth/register", body={
        "email": email, "fullName": "Recovery Fixture", "password": old_password,
    }, expected=(201,))
    login_body = {"email": email, "password": old_password}
    old_token = request("POST", "/api/auth/login", body=login_body)["accessToken"]
    path = "/api/auth/password-reset"
    compose("stop", "notification")
    try:
        assert request("POST", path, body={"email": email}, expected=(202,)) == {}
        assert request("POST", path, body={"email": f"missing-{run_id}@example.test"}, expected=(202,)) == {}
        token = os.environ.get("SPLIT_SERVICE_TOKEN", "ticketbox-local-split-service-token-change-before-deploy")
        claim = json.loads(compose("exec", "-T", "smtp", "node", "-e", """
            fetch('http://identity:8080/internal/split/password-reset/mail/claim', {
                method: 'POST', headers: {'X-Service-Token': process.argv[1]}
            }).then(response => response.json()).then(result => process.stdout.write(JSON.stringify(result)))
            """, token))
        assert claim["email"] == email
        confirm = {"token": claim["token"], "password": new_password}
        request("POST", path + "/confirm", body=confirm, expected=(204,))
        request("POST", path + "/confirm", body=confirm, expected=(400,))
        request("POST", "/api/auth/login", body=login_body, expected=(401,))
        for resource in ("/api/auth/me", "/api/users/me/profile", "/api/orders/my", "/api/tickets/my", "/api/payments/providers"):
            request("GET", resource, old_token, expected=(401,))
        new_token = request("POST", "/api/auth/login", body={**login_body, "password": new_password})["accessToken"]
        assert request("GET", "/api/orders/my", new_token) == []
    finally:
        compose("start", "notification")
    until(lambda: request("GET", "/api/notifications", new_token) is not None)
    request("GET", "/api/notifications", old_token, expected=(401,))
    user_id = str(uuid.UUID(account["id"]))
    compose("stop", "smtp")
    try:
        request("POST", path, body={"email": email}, expected=(202,))
        assert until(lambda: sql("identity", f"SELECT encrypted_token IS NOT NULL AND lease_id IS NULL "
                                 f"AND next_attempt_at>clock_timestamp() FROM password_resets WHERE account_id='{user_id}'") == "t")
    finally:
        compose("start", "smtp")
    assert until(lambda: sql("identity", f"SELECT encrypted_token IS NULL FROM password_resets WHERE account_id='{user_id}'") == "t")
    assert request("GET", "/api/notifications", new_token)["content"] == []
    check("Password reset is single-use, revokes the old buyer session and retries a failed SMTP delivery outside notification feeds")


def verify_order_refund(run_id, admin, organizer, order, ticket_type, organization, period):
    email = f"refund-approver-{run_id}@example.test"
    password = "fixture-admin-pass"
    account = request("POST", "/api/auth/register", body={"email": email, "fullName": "Refund Approver", "password": password}, expected=(201,))
    request("PUT", f"/api/admin/users/{account['id']}/role", admin, {"role": "ADMIN"})
    approver = request("POST", "/api/auth/login", body={"email": email, "password": password})["accessToken"]
    path = f"/api/admin/orders/{order}/refunds"
    def action(kind, **fields):
        return {"actionId": str(uuid.uuid4()), "action": kind, "detail": "Isolated refund fixture", **fields}

    requested = action("REQUEST")
    request("POST", path, organizer, requested, expected=(403,))
    case = request("POST", path, admin, requested)
    case_id = str(uuid.UUID(case["id"]))
    assert case["state"] == "REQUESTED"
    assert request("POST", path, admin, requested)["id"] == case_id
    pending = request("GET", "/api/admin/orders/support/queue?kind=PENDING_REFUND", admin)
    assert any(item["sourceId"] == case_id for item in pending["content"])
    approval = action("APPROVE", caseId=case_id)
    request("POST", path, admin, approval, expected=(409,))
    compose("stop", "checkin")
    try:
        request("POST", path, approver, approval, expected=(503,))
        assert sql("payment", f"SELECT state FROM refund_reviews WHERE request_id='{case_id}'") == "HOLD_PENDING"
    finally:
        compose("start", "checkin")
    assert until(lambda: request("POST", path, approver, approval)["state"] == "APPROVED")
    assert sql("checkin", f"SELECT count(*) FROM tickets WHERE refund_case_id='{case_id}' AND status='VALID'") == "2"
    inventory_query = f"SELECT available_qty FROM ticket_inventory WHERE ticket_type_id='{ticket_type}'"
    stock = sql("ticketing", inventory_query)
    confirmation = action("CONFIRM", caseId=case_id, amount=case["amount"], externalReference=f"FIXTURE-{run_id}",
                          occurredAt=dt.datetime.now(dt.timezone.utc).isoformat())
    request("POST", path, approver, {**confirmation, "amount": case["amount"] + 1}, expected=(400,))
    assert request("POST", path, approver, confirmation)["state"] == "RESOLVED_MANUALLY"
    assert request("POST", path, approver, confirmation)["state"] == "RESOLVED_MANUALLY"
    request("POST", path, approver, action("ABORT", caseId=case_id), expected=(409,))
    until(lambda: sql("ticketing", f"SELECT replay_order('{order}')->>'status'") == "REFUNDED")
    until(lambda: sql("checkin", f"SELECT count(*) FROM tickets WHERE refund_case_id='{case_id}' AND status='CANCELLED'") == "2")
    until(lambda: sql("notification", f"SELECT count(*) FROM notifications WHERE reference_id='{order}' AND event_type='ORDER_REFUNDED' AND channel='EMAIL' AND status='SENT'") == "1")
    assert sql("ticketing", inventory_query) == stock
    report = f"/api/admin/reconciliation?{period}&organizationId={organization}"
    assert until(lambda: request("GET", report, admin)["content"][0]["refundReference"] == confirmation["externalReference"])
    assert sql("ticketing", f"SELECT count(*) FROM order_events WHERE order_id='{order}' AND event_type='OrderRefunded'") == "1"
    PROOF["refundCaseId"] = case_id
    check("Two admins approve a full refund, held tickets are revoked, and replay preserves stock and sends one notice")


def verify_event_disruption(run_id, admin, manager, scope, concert):
    management = f"/api/organizer/manage/concerts/{concert}"
    public = f"/api/concerts/{concert}"
    admin_concert = f"/api/admin/concerts/{concert}"
    path = admin_concert + "/disruption"
    tier = request("POST", management + "/ticket-types", manager, {
        "name": "GA", "price": 100000, "totalQuantity": 12, "maxPerAccount": 4, "zoneColor": "#123456",
    }, expected=(201,), headers=scope)["id"]
    request("POST", management + "/publication", manager, headers=scope)
    until(lambda: request("GET", public)["id"] == concert)

    def buyer_session(suffix):
        login_data = {"email": f"disruption-{suffix}-{run_id}@example.test", "password": "fixture-buyer-pass"}
        account = request("POST", "/api/auth/register", body={**login_data, "fullName": "Disruption Fixture"}, expected=(201,))
        buyer = request("POST", "/api/auth/login", body=login_data)["accessToken"]
        queue = f"/api/queue/concerts/{concert}"
        request("POST", queue + "/join", buyer)
        token = until(lambda: request("GET", queue + "/status", buyer).get("queueAccessToken"))
        return account["id"], buyer, {"Queue-Access-Token": token, "Idempotency-Key": str(uuid.uuid4())}

    order_data = {"concertId": concert, "items": [{"ticketTypeId": tier, "quantity": 1}]}
    reserve = f"/api/reservations/concerts/{concert}/ticket-types/{tier}/reserve"

    def order_for(suffix, *, initiate=True):
        account, buyer, headers = buyer_session(suffix)
        request("POST", reserve, buyer, {"quantity": 1}, headers=headers)
        order = request("POST", "/api/orders", buyer, order_data, headers=headers, expected=(201,))["id"]
        if initiate:
            request("POST", f"/api/payments/{order}/initiate", buyer, {"provider": "MOCK"}, expected=(200, 202))
            until(lambda: request("GET", f"/api/payments/{order}/status", buyer)["attemptState"] == "READY")
        return account, buyer, order

    def settle(buyer, order):
        request("POST", f"/api/mock-payments/{order}/success", buyer)
        until(lambda: request("GET", f"/api/payments/{order}/status", buyer)["orderStatus"] == "PAID")

    def email_sent(account, event):
        return sql("notification", f"SELECT count(*) FROM notifications WHERE user_id='{account}' AND event_type='{event}'"
                   " AND channel='EMAIL' AND status='SENT'") == "1"

    account, buyer, order = order_for("first")
    settle(buyer, order)
    assert request("GET", path + "/impact?size=1", admin)["content"][0]["orderId"] == order
    request("GET", path + "/impact", manager, expected=(403,))
    now = dt.datetime.now(dt.timezone.utc)
    existing = request("GET", management, manager, headers=scope)
    metadata = {key: existing.get(key) for key in ("title", "venueName", "venueAddress", "eventDate",
                "doorsOpenAt", "saleStartAt", "saleEndAt")}
    request("PUT", management, manager, {**metadata, "description": "Updated metadata"}, headers=scope)
    rescheduled = {**metadata, "eventDate": (now + dt.timedelta(days=8)).isoformat()}
    request("PUT", management, manager, rescheduled, headers=scope, expected=(400,))
    request("PUT", admin_concert, admin, rescheduled, expected=(400,))
    postpone = {"actionId": str(uuid.uuid4()), "kind": "POSTPONE", "reason": "Isolated postponement fixture",
                "eventDate": (now + dt.timedelta(days=8)).isoformat(), "saleStartAt": (now - dt.timedelta(minutes=1)).isoformat(),
                "saleEndAt": (now + dt.timedelta(days=1)).isoformat()}
    request("POST", path, manager, postpone, expected=(403,))
    assert request("POST", path, admin, postpone)["id"] == postpone["actionId"]
    assert request("POST", path, admin, postpone)["id"] == postpone["actionId"]
    until(lambda: request("GET", path, admin)["state"] == "PAUSED")
    request("GET", public, expected=(404,))
    assert sql("checkin", f"SELECT sales_suspended FROM concerts WHERE id='{concert}'") == "t"
    assert sql("checkin", f"SELECT status FROM tickets WHERE concert_id='{concert}' AND user_id='{account}'") == "VALID"
    until(lambda: email_sent(account, "EVENT_POSTPONED"))
    resume = path + "/" + postpone["actionId"] + "/resume"
    assert request("POST", resume, admin)["id"] == postpone["actionId"]
    assert request("POST", resume, admin)["id"] == postpone["actionId"]
    until(lambda: request("GET", path, admin)["state"] == "RESUMED")
    assert request("GET", public)["id"] == concert
    assert sql("checkin", f"SELECT NOT sales_suspended AND resumed_admission_at>now() FROM concerts WHERE id='{concert}'") == "t"

    second_account, second_buyer, second_order = order_for("second")
    _, third_buyer, third_order = order_for("third", initiate=False)
    _, queued_buyer, queued_headers = buyer_session("queued")
    request("PATCH", admin_concert + "/status", admin, {"status": "CANCELLED"}, expected=(400,))
    cancel = {"actionId": str(uuid.uuid4()), "kind": "CANCEL", "reason": "Isolated cancellation fixture"}
    assert request("POST", path, admin, cancel)["id"] == cancel["actionId"]
    assert request("POST", path, admin, cancel)["id"] == cancel["actionId"]
    until(lambda: request("GET", path, admin)["state"] == "CANCELLED")
    request("GET", public, expected=(404,))
    request("POST", reserve, queued_buyer, {"quantity": 1}, headers=queued_headers, expected=(400,))
    request("POST", "/api/orders", queued_buyer, order_data, headers=queued_headers, expected=(400,))
    request("POST", f"/api/payments/{third_order}/initiate", third_buyer, {"provider": "MOCK"}, expected=(400,))
    settle(second_buyer, second_order)
    for order_id in (order, second_order):
        until(lambda: sql("payment", f"SELECT count(*) FROM refund_reviews WHERE order_id='{order_id}' AND state='REQUESTED'") == "1")
    until(lambda: {item["orderId"] for item in request("GET", path + "/impact", admin)["content"] if item["casePrepared"]}
          == {order, second_order})
    until(lambda: email_sent(account, "EVENT_CANCELLED") and email_sent(second_account, "EVENT_CANCELLED"))
    check("Postponement preserves valid tickets, cancellation blocks holds, orders and new intents, and an existing intent settles into its own refund case")


def main(*, source_outage=True):
    until(lambda: request("GET", "/api/health"))
    admin = until(lambda: login("admin"))
    staff = login("staff")
    organizer = login("organizer")
    audience = login("audience")
    until(lambda: request("GET", "/api/concerts"))
    request("POST", "/api/admin/concerts", audience, {}, expected=(403,))
    request("GET", "/internal/split/stock", expected=(404,))
    if LOCAL_ACCEPTANCE:
        assert compose("port", "gateway", "80").strip() == f"127.0.0.1:{PORT}"
        assert compose("port", "checkin", "8080").strip() == f"127.0.0.1:{CHECKIN_PORT}"
        request("GET", "/actuator/prometheus", expected=(404,))
        assert request("GET", "/api/payments/providers", audience) == ["MOCK"]
        check("Local gateway and Check-in bind to loopback; gateway blocks management routes and exposes MOCK payment only")
    check("Identity JWT and RBAC work across service boundaries")
    verify_localized_responses()
    check("Gateway preserves API language negotiation and provider callback acknowledgements")

    organizer_id = request("GET", "/api/auth/me", organizer)["id"]
    audience_id = request("GET", "/api/auth/me", audience)["id"]
    run_id = uuid.uuid4().hex
    first_org = request("POST", "/api/admin/organizations", admin, {
        "name": f"First {run_id}", "initialManagerId": organizer_id,
    }, expected=(201,))["id"]
    second_org = request("POST", "/api/admin/organizations", admin, {
        "name": f"Second {run_id}", "initialManagerId": audience_id,
    }, expected=(201,))["id"]
    first_scope = {"X-Organization-Id": first_org}
    second_scope = {"X-Organization-Id": second_org}
    invitation = request("POST", f"/api/organizations/{second_org}/invitations", audience, {
        "accountId": organizer_id, "grants": ["FINANCE"],
    }, expected=(201,))
    request("POST", "/api/organizations/invitations/accept", organizer, {"code": invitation["code"]})
    assert {item["id"] for item in request("GET", "/api/organizations", organizer)} >= {first_org, second_org}

    now = dt.datetime.now(dt.timezone.utc)
    event = {
        "title": f"First concert {run_id}", "venueName": "Test arena",
        "venueAddress": "Test fixture", "eventDate": (now + dt.timedelta(days=7)).isoformat(),
        "saleStartAt": (now - dt.timedelta(minutes=1)).isoformat(),
        "saleEndAt": (now + dt.timedelta(days=1)).isoformat(),
    }
    concerts = "/api/organizer/manage/concerts"
    concert_id = request("POST", concerts, organizer, event, expected=(201,), headers=first_scope)["id"]
    second_concert = request("POST", concerts, audience, {
        **event, "title": f"Second concert {run_id}",
    }, expected=(201,), headers=second_scope)["id"]
    for service in ("ticketing", "checkin"):
        assert until(lambda: sql(service, f"SELECT organization_id FROM concerts WHERE id='{concert_id}'") == first_org)
        assert until(lambda: sql(service, f"SELECT organization_id FROM concerts WHERE id='{second_concert}'") == second_org)
    first_list = request("GET", concerts, organizer, headers=first_scope)
    second_list = request("GET", concerts, organizer, headers=second_scope)
    assert first_list["totalElements"] == second_list["totalElements"] == 1
    assert [item["id"] for item in first_list["content"]] == [concert_id]
    assert [item["id"] for item in second_list["content"]] == [second_concert]
    request("GET", f"{concerts}/{second_concert}", organizer, expected=(404,), headers=first_scope)
    request("GET", f"{concerts}/{second_concert}", organizer, expected=(403,), headers=second_scope)
    request("GET", f"{concerts}/{concert_id}", audience, expected=(403,), headers=first_scope)
    request("GET", "/api/admin/concerts", organizer, expected=(403,))
    check("Catalog and its projections isolate two organizations and validate operation grants")

    assert request("GET", concerts + "?query=Second&size=1", organizer, headers=first_scope)["totalElements"] == 0
    assert request("GET", concerts + "?query=Second&size=1", organizer, headers=second_scope)["totalElements"] == 1
    newer = request("POST", concerts, organizer, {**event, "title": f"Newer draft {run_id}"},
                    expected=(201,), headers=first_scope)["id"]
    assert request("GET", concerts + "?size=1", organizer, headers=first_scope)["content"][0]["id"] == newer
    matched = request("GET", concerts + "?query=First&size=1", organizer, headers=first_scope)
    assert matched["totalElements"] == 1 and matched["content"][0]["id"] == concert_id
    preview = f"{concerts}/{concert_id}/preview"
    req = urllib.request.Request(BASE + preview, headers={**first_scope, "Authorization": "Bearer " + organizer})
    with urllib.request.urlopen(req, timeout=20) as response:
        assert "no-store" in response.headers["Cache-Control"]
        assert json.load(response)["data"]["id"] == concert_id
    request("GET", preview, audience, headers=second_scope, expected=(404,))
    public = f"/api/concerts/{concert_id}"
    request("GET", public, expected=(404,))
    publication = f"{concerts}/{concert_id}/publication"
    readiness = request("GET", publication, organizer, headers=first_scope)
    assert readiness["status"] == "DRAFT" and readiness["issues"], readiness
    request("POST", publication, organizer, headers=first_scope, expected=(422,))
    ticket_type = request("POST", f"{concerts}/{concert_id}/ticket-types", organizer, {
        "name": "GA", "price": 100000, "totalQuantity": 20, "maxPerAccount": 4, "zoneColor": "#123456",
    }, expected=(201,), headers=first_scope)
    type_id = ticket_type["id"]
    request("PATCH", f"{concerts}/{concert_id}/status", organizer, {"status": "ON_SALE"},
            headers=first_scope, expected=(400, 409))
    if source_outage:
        compose("stop", "ticketing", "checkin")
    try:
        published = request("POST", publication, organizer, headers=first_scope)
        activation = published["versions"]["activationVersion"]
        assert activation and published["issues"] == [], published
        assert request("POST", publication, organizer, headers=first_scope)["versions"]["activationVersion"] == activation
        if source_outage:
            assert published["versions"]["ticketingVersion"] < activation
            request("GET", public, expected=(404,))
    finally:
        if source_outage:
            compose("start", "ticketing")
    try:
        assert until(lambda: request("GET", public)["id"] == concert_id)
        versions = request("GET", publication, organizer, headers=first_scope)["versions"]
        assert versions["ticketingVersion"] >= activation
        if source_outage:
            assert versions["checkinVersion"] < activation, versions
    finally:
        if source_outage:
            compose("start", "checkin")
    assert until(lambda: request("GET", publication, organizer, headers=first_scope)["versions"]["checkinVersion"] >= activation)
    request("GET", public, organizer)
    assert request("GET", public)["organizationName"] == f"First {run_id}"
    request("POST", f"/api/queue/concerts/{concert_id}/join", organizer, expected=(403,))
    assert sql("ticketing", f"SELECT status FROM concerts WHERE id='{concert_id}'") == "ON_SALE"
    request("PUT",f"/api/admin/ticket-types/{type_id}",admin,{
        "name":"GA","price":200000,"totalQuantity":20,"maxPerAccount":4,"zoneColor":"#123456"
    },expected=(400,409))
    check("Scoped draft preview, idempotent publication, separate acknowledgments and buyer gate work through the gateway")

    request("POST", f"/api/queue/concerts/{concert_id}/join", audience)
    access = until(lambda: request("GET", f"/api/queue/concerts/{concert_id}/status", audience).get("queueAccessToken"))
    key = str(uuid.uuid4())
    purchase_headers = {"Queue-Access-Token": access, "Idempotency-Key": key}
    request("POST", f"/api/reservations/concerts/{concert_id}/ticket-types/{type_id}/reserve",
            audience, {"quantity": 2}, headers=purchase_headers)
    order = request("POST", "/api/orders", audience, {
        "concertId": concert_id, "items": [{"ticketTypeId": type_id, "quantity": 2}],
    }, expected=(201,), headers=purchase_headers)
    order_id = order["id"]
    assert "MOCK" in request("GET", "/api/payments/providers", audience)
    if source_outage:
        compose("stop", "payment")
    try:
        request("POST", f"/api/payments/{order_id}/initiate", audience, {"provider": "MOCK"},
                expected=(202,) if source_outage else (200, 202))
        assert sql("ticketing", f"SELECT count(*) FROM ticketing_payment_intents WHERE order_id='{order_id}'") == "1"
    finally:
        if source_outage:
            compose("start", "payment")
    until(lambda: request("GET", f"/api/payments/{order_id}/status", audience).get("attemptState") == "READY")
    request("POST", f"/api/mock-payments/{order_id}/success", audience)
    until(lambda: request("GET", f"/api/payments/{order_id}/status", audience).get("orderStatus") == "PAID")
    request("POST", f"/api/mock-payments/{order_id}/success", audience)
    assert sql("ticketing", f"SELECT count(*) FROM tickets WHERE concert_id='{concert_id}'") == "2"
    assert sql("ticketing", f"SELECT replay_order('{order_id}') ->> 'status'") == "PAID"
    assert sql("ticketing", f"SELECT organization_id FROM orders WHERE id='{order_id}'") == first_org
    until(lambda: sql("notification", f"SELECT count(*) FROM notifications WHERE reference_id='{order_id}' AND channel='EMAIL' AND status='SENT'") == "1")
    check("Ticketing persists the intent during a Payment outage, then settles and delivers once")

    orders = "/api/organizer/manage/orders"
    assert request("GET", f"{orders}/{order_id}", organizer, headers=first_scope)["id"] == order_id
    request("GET", f"{orders}/{order_id}", organizer, expected=(404,), headers=second_scope)
    assert request("GET", orders, organizer, headers=second_scope) == []
    request("PATCH", f"{concerts}/{concert_id}/status", organizer, {"status": "CANCELLED"},
            headers=first_scope, expected=(400, 409))
    assert request("GET", public)["status"] == "ON_SALE"
    request("PATCH", f"{concerts}/{concert_id}/status", organizer, {"status": "COMPLETED"}, headers=first_scope)
    request("GET", f"/api/organizer/concerts/{concert_id}/revenue-summary", organizer, headers=first_scope)
    request("GET", f"/api/organizer/concerts/{concert_id}/revenue-summary", organizer,
            expected=(404,), headers=second_scope)
    today = dt.datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()
    period = f"from={today}&to={today + dt.timedelta(days=1)}&basis=ATTEMPT"
    report = "/api/organizer/reconciliation"
    def collected():
        data = request("GET", f"{report}?{period}", organizer, headers=first_scope)
        rows = data["content"]
        return data if len(rows) == 1 and rows[0]["paymentState"] == "SUCCEEDED" and data["totals"]["verifiedCollections"] == 200000 else None
    summary = until(collected)
    row, = summary["content"]
    assert row["orderId"] == order_id and row["organizationId"] == first_org and row["transactionId"]
    assert summary["totals"]["paidOrderSales"] == 200000
    assert request("GET", f"{report}?{period}", organizer, headers=second_scope)["content"] == []
    assert request("GET", f"{report}?{period}&concertId={second_concert}", organizer, headers=first_scope)["content"] == []
    assert request("GET", f"/api/admin/reconciliation?{period}&organizationId={first_org}", admin)["content"] == [row]
    request("GET", f"/api/admin/reconciliation?{period}", organizer, expected=(403,))
    req = urllib.request.Request(BASE + f"{report}/export?{period}",
                                 headers={**first_scope, "Authorization": "Bearer " + organizer})
    with urllib.request.urlopen(req, timeout=20) as response:
        assert response.headers.get_content_type() == "text/csv"
        exported, = list(csv.DictReader(response.read().decode().splitlines()))
        assert exported["order_id"] == row["orderId"] and exported["transaction_id"] == row["transactionId"]
        assert exported["collected_vnd"] == str(row["collectedAmount"])
    PROOF["reconciliation"] = {"orderId": order_id, "organizationId": first_org, "period": period,
                               "transactionId": row["transactionId"], "collectedAmount": row["collectedAmount"]}
    check("Reconciliation preserves ownership across replay, isolates finance scopes and exports the same amounts")
    for filters in ({"orderId": order_id}, {"buyerEmail": " AUDIENCE@TicketBox.com "}, {"transactionRef": row["transactionId"]}):
        support = orders + "/support?" + urllib.parse.urlencode({**filters, "size": 1})
        found = request("GET", support, organizer, headers=first_scope)
        assert found["totalElements"] == 1 and found["content"][0]["id"] == order_id
        assert request("GET", support + "&page=1", organizer, headers=first_scope)["content"] == []
        assert request("GET", support, organizer, headers=second_scope)["totalElements"] == 0
    check("Order support matches exact IDs, email and transaction references inside organization scope")
    support_detail = f"{orders}/{order_id}/support"
    for section in ("tickets", "payment", "delivery"):
        request("GET", f"{support_detail}/{section}", organizer, expected=(404,), headers=second_scope)
    assert len(request("GET", f"{support_detail}/tickets", organizer, headers=first_scope)) == 2
    assert request("GET", f"{support_detail}/payment", organizer, headers=first_scope)["attempt"]["transactionId"] == row["transactionId"]
    email_status, = request("GET", f"{support_detail}/delivery", organizer, headers=first_scope)
    assert email_status["status"] == "SENT"
    queue = "/api/admin/orders/support/queue"
    request("GET", queue + "?kind=UNKNOWN_PAYMENT", organizer, expected=(403,))
    for kind in ("UNKNOWN_PAYMENT", "MISSING_TICKETS", "PENDING_REFUND", "FAILED_EMAIL"):
        request("GET", queue + "?kind=" + kind, admin)
    email_id = str(uuid.UUID(email_status["id"]))
    if LOCAL_ACCEPTANCE:
        baseline = operations_snapshot()
    sql("notification", f"UPDATE notifications SET status='FAILED' WHERE id='{email_id}'")
    if LOCAL_ACCEPTANCE:
        active = operations_snapshot()
        assert active["notification"]["failedEmail"] == baseline["notification"]["failedEmail"] + 1
    failed_emails = request("GET", queue + "?kind=FAILED_EMAIL", admin)["content"]
    assert any(item["sourceId"] == email_id and item["orderId"] == order_id and item["retryable"] for item in failed_emails)
    retry_key = str(uuid.uuid4())
    for _ in range(2):
        request("POST", f"/api/admin/notifications/{email_id}/retry", admin, headers={"Idempotency-Key": retry_key})
    assert sql("notification", f"SELECT count(*) FROM notification_audit WHERE notification_id='{email_id}' AND id='{retry_key}'") == "1"
    assert until(lambda: sql("notification", f"SELECT status FROM notifications WHERE id='{email_id}'") == "SENT")
    if LOCAL_ACCEPTANCE:
        recovered = operations_snapshot()
        assert recovered["notification"]["failedEmail"] == baseline["notification"]["failedEmail"]
        PROOF["operations"] = {"condition": "failedEmail", "owner": "notification", "baseline": baseline, "active": active,
                               "recovered": recovered}
        check("Operations counts identify the failed email and clear after its authorized retry")
    check("Scoped support sections and the exception queue use owner data and replay email retry once")
    request("PUT", f"/api/organizations/{second_org}/members/{organizer_id}", audience, {"grants": []})
    request("GET", orders, organizer, expected=(403,), headers=second_scope)
    request("GET", support, organizer, expected=(403,), headers=second_scope)
    check("Ticketing scopes orders and reporting and honors revocation with the same token")

    for base in (BASE, CHECKIN_BASE):
        request("GET", f"/api/staff/concerts/{concert_id}/checkin-dataset", staff, expected=(403,), base=base)
        request("POST", "/api/staff/checkins/scan", staff, {}, expected=(403,), base=base)
    assert sql("checkin", f"SELECT count(*) FROM checkin_logs WHERE concert_id='{concert_id}'") == "0"
    request("GET", f"{concerts}/{concert_id}/checkin-summary", organizer, headers=first_scope)
    request("GET", f"{concerts}/{second_concert}/checkin-summary", organizer, expected=(404,), headers=first_scope)
    check("Check-in scopes organizer summaries and blocks deferred staff routes on gateway and LAN")

    if source_outage:
        compose("stop", "identity")
        try:
            request("GET", concerts, organizer, expected=(503,), headers=first_scope)
            request("GET", f"{orders}/{order_id}", organizer, expected=(503,), headers=first_scope)
            request("GET", f"/api/orders/{order_id}", audience, expected=(503,))
        finally:
            compose("start", "identity")
        until(lambda: login("admin"))
        check("Private organizer and buyer routes fail closed during Identity outage")

    guest_csv = "phone,full_name,category,sponsor_name,notes\n0901234567,Nguyễn Ánh,VIP,Partner,fixture\n".encode("utf-8")
    imported=upload(f"/api/admin/concerts/{concert_id}/guest-lists/import",admin,"guests.csv",guest_csv,"text/csv")
    until(lambda:request("GET",f"/api/admin/batch-logs/{imported['batchLogId']}",admin)["status"] in ("SUCCESS","PARTIAL","SKIPPED"))
    guests = f"{concerts}/{concert_id}/guest-lists"
    entries = request("GET", guests, organizer, headers=first_scope)["content"]
    assert len(entries) == 1 and entries[0]["fullName"] == "Nguyễn Ánh", entries
    request("GET", guests, audience, expected=(404,), headers=second_scope)
    request("GET", f"/api/organizer/manage/batch-logs/{imported['batchLogId']}",
            audience, expected=(404,), headers=second_scope)
    upload(f"/api/admin/concerts/{concert_id}/guest-lists/import",admin,"guests.csv",guest_csv,"text/csv")
    assert len(request("GET", guests, organizer, headers=first_scope)["content"]) == 1
    large_csv = "phone,full_name,category,sponsor_name,notes\n" + "".join(
        f"09{number:08d},{'ZZZ Target' if number == 110 else f'AAA Guest {number:03d}'},VIP,Partner,fixture\n"
        for number in range(111))
    large_import = upload(f"/api/admin/concerts/{second_concert}/guest-lists/import", admin, "large.csv",
                          large_csv.encode(), "text/csv")
    until(lambda: request("GET", f"/api/admin/batch-logs/{large_import['batchLogId']}", admin)["status"] == "SUCCESS")
    other_guests = f"{concerts}/{second_concert}/guest-lists"
    unfiltered = request("GET", f"{other_guests}?size=100", audience, headers=second_scope)
    assert unfiltered["totalElements"] == 111 and len(unfiltered["content"]) == 100
    filtered = request("GET", f"{other_guests}?query=Target&size=1", audience, headers=second_scope)
    assert filtered["totalElements"] == 1 and filtered["content"][0]["fullName"] == "ZZZ Target"
    assert request("GET", f"{other_guests}?query=Absent", audience, headers=second_scope)["totalElements"] == 0
    check("Guest filters search beyond the first 100 rows and return matching totals")
    check("Check-in scopes guest data and import results and deduplicates imports")

    job=upload(f"/api/admin/concerts/{concert_id}/artist-bio-jobs",admin,"press-kit.pdf",press_kit(),"application/pdf")
    completed=until(lambda:(lambda value:value if value["status"]=="DONE" else None)(
        request("GET",f"/api/admin/artist-bio-jobs/{job['jobId']}",admin)))
    assert completed.get("resultBio")
    request("POST",f"/api/admin/artist-bio-jobs/{job['jobId']}/apply",admin,
            {"artistBio":completed["resultBio"]})
    check("Catalog owns PDF extraction, AI job processing and reviewed publication")
    if source_outage:
        verify_order_refund(run_id, admin, organizer, order_id, type_id, first_org, period)
        verify_event_disruption(run_id, admin, audience, second_scope, second_concert)
    if source_outage and os.environ.get("PASSWORD_RESET_KEY"):
        verify_password_recovery(run_id)
    if LOCAL_ACCEPTANCE:
        verify_local_load(run_id, organizer, first_scope, event)
    PROOF.update(passed=True, concertId=concert_id, orderId=order_id)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--operations", action="store_true", help="Print owner-side counts from the isolated project")
    if parser.parse_args().operations:
        print(json.dumps(operations_snapshot(), indent=2))
    else:
        try:
            main()
        finally:
            target = REPORT_DIRECTORY / "split-journey.json"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(PROOF, indent=2))
            print(json.dumps(PROOF, indent=2))

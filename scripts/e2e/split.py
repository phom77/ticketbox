"""Acceptance checks for the six-service deployment, using isolated Compose data."""
import csv
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
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
    payload = json.load(response)
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


def main(*, source_outage=True):
    until(lambda: request("GET", "/api/health"))
    admin = until(lambda: login("admin"))
    staff = login("staff")
    organizer = login("organizer")
    audience = login("audience")
    until(lambda: request("GET", "/api/concerts"))
    request("POST", "/api/admin/concerts", audience, {}, expected=(403,))
    request("GET", "/internal/split/stock", expected=(404,))
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
        return data if data["totals"]["verifiedCollections"] == 200000 else None
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
    request("PUT", f"/api/organizations/{second_org}/members/{organizer_id}", audience, {"grants": []})
    request("GET", orders, organizer, expected=(403,), headers=second_scope)
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
            request("GET", f"/api/orders/{order_id}", audience)
        finally:
            compose("start", "identity")
        until(lambda: login("admin"))
        check("Privileged routes fail closed during Identity outage while buyer order access works")

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
    PROOF.update(passed=True, concertId=concert_id, orderId=order_id)


if __name__ == "__main__":
    try:
        main()
    finally:
        target = ROOT / ".artifacts/e2e/split-journey.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(PROOF, indent=2))
        print(json.dumps(PROOF, indent=2))

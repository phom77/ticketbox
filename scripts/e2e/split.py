"""Acceptance checks for the six-service deployment, using isolated Compose data."""
import concurrent.futures
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
    audience = login("audience")
    until(lambda: request("GET", "/api/concerts"))
    until(lambda: request("GET", "/api/staff/concerts?status=ON_SALE", staff))
    request("POST", "/api/admin/concerts", audience, {}, expected=(403,))
    request("GET", "/internal/split/stock", expected=(404,))
    check("Identity JWT and RBAC work across service boundaries")
    verify_localized_responses()
    check("Gateway preserves API language negotiation and provider callback acknowledgements")

    now = dt.datetime.now(dt.timezone.utc)
    concert = request("POST", "/api/admin/concerts", admin, {
        "title": "Split acceptance " + str(uuid.uuid4()), "venueName": "LAN arena",
        "venueAddress": "Test fixture", "eventDate": (now + dt.timedelta(days=7)).isoformat(),
        "saleStartAt": (now - dt.timedelta(minutes=1)).isoformat(),
        "saleEndAt": (now + dt.timedelta(days=1)).isoformat(),
    }, expected=(201,))
    concert_id = concert["id"]
    ticket_type = request("POST", f"/api/admin/concerts/{concert_id}/ticket-types", admin, {
        "name": "GA", "price": 100000, "totalQuantity": 20, "maxPerAccount": 4, "zoneColor": "#123456",
    }, expected=(201,))
    type_id = ticket_type["id"]
    request("PATCH", f"/api/admin/concerts/{concert_id}/status", admin, {"status": "ON_SALE"})
    assert sql("ticketing", f"SELECT status FROM concerts WHERE id='{concert_id}'") == "ON_SALE"
    request("PUT",f"/api/admin/ticket-types/{type_id}",admin,{
        "name":"GA","price":200000,"totalQuantity":20,"maxPerAccount":4,"zoneColor":"#123456"
    },expected=(400,409))
    check("Catalog activates acknowledged configurations and rejects price edits during sales")

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
    request("POST", f"/api/payments/{order_id}/initiate", audience, {"provider": "MOCK"}, expected=(200, 202))
    until(lambda: request("GET", f"/api/payments/{order_id}/status", audience).get("attemptState") == "READY")
    request("POST", f"/api/mock-payments/{order_id}/success", audience)
    until(lambda: request("GET", f"/api/payments/{order_id}/status", audience).get("orderStatus") == "PAID")
    request("POST", f"/api/mock-payments/{order_id}/success", audience)
    assert sql("ticketing", f"SELECT count(*) FROM tickets WHERE concert_id='{concert_id}'") == "2"
    assert sql("ticketing", f"SELECT replay_order('{order_id}') ->> 'status'") == "PAID"
    until(lambda: sql("notification", f"SELECT count(*) FROM notifications WHERE reference_id='{order_id}' AND channel='EMAIL' AND status='SENT'") == "1")
    check("Ticketing ES, separate Payment DB and Notification settle and deliver once")

    dataset = until(lambda: (lambda data: data if data["totalCount"] == 2 else None)(
        request("GET", f"/api/staff/concerts/{concert_id}/checkin-dataset", staff)))
    codes = [row["qrCode"] for row in dataset["tickets"]]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as workers:
        results = list(workers.map(lambda device: request("POST", "/api/staff/checkins/scan", staff, {
            "concertId": concert_id, "qrCode": codes[0], "deviceId": device, "gate": "GA",
        }), ["device-a", "device-b"]))
    assert sorted(result["status"] for result in results) == ["FAILED", "SUCCESS"]
    assert sql("checkin", f"SELECT count(*) FROM checkin_logs WHERE concert_id='{concert_id}'") == "1"
    check("Two scanners racing for one QR produce one accepted admission")

    if source_outage:
        compose("stop", "identity", "catalog", "ticketing")
    try:
        payload = {"concertId": concert_id, "deviceId": "offline-device", "logs": [{
            "qrCode": codes[1], "checkedAt": now.isoformat(timespec="milliseconds"), "gate": "VIP", "notes": None,
        }]}
        first = request("POST", "/api/staff/checkins/sync", staff, payload, base=CHECKIN_BASE)
        repeated = request("POST", "/api/staff/checkins/sync", staff, payload, base=CHECKIN_BASE)
        assert first["accepted"] == repeated["accepted"] == 1
        assert sql("checkin", f"SELECT count(*) FROM checkin_logs WHERE concert_id='{concert_id}'") == "2"
    finally:
        if source_outage:
            compose("start", "identity", "catalog", "ticketing")
    if source_outage:
        check("LAN Check-in works during source outage and repeated offline sync is idempotent")
    else:
        check("Repeated offline sync is idempotent")

    until(lambda: request("GET", "/api/health"))
    sql("ticketing", f"UPDATE checkin_ticket_outbox SET delivered_version=0 WHERE ticket_id IN (SELECT id FROM tickets WHERE concert_id='{concert_id}')")
    until(lambda: sql("ticketing", f"SELECT count(*) FROM checkin_ticket_outbox o JOIN tickets t ON t.id=o.ticket_id WHERE t.concert_id='{concert_id}' AND delivered_version<version") == "0")
    assert sql("checkin", f"SELECT count(*) FROM tickets WHERE concert_id='{concert_id}' AND status='USED'") == "2"
    until(lambda: sql("ticketing", f"SELECT count(*) FROM tickets WHERE concert_id='{concert_id}' AND status='USED'") == "2")
    check("Replayed issuance snapshots preserve admissions and ticket status feedback")
    csv = "phone,full_name,category,sponsor_name,notes\n0901234567,Nguyễn Ánh,VIP,Partner,fixture\n".encode("utf-8")
    imported=upload(f"/api/admin/concerts/{concert_id}/guest-lists/import",admin,"guests.csv",csv,"text/csv")
    until(lambda:request("GET",f"/api/admin/batch-logs/{imported['batchLogId']}",admin)["status"] in ("SUCCESS","PARTIAL","SKIPPED"))
    guests=request("GET",f"/api/staff/guestlist/list?concert_id={concert_id}",staff)
    assert len(guests)==1
    assert guests[0]["fullName"] == "Nguyễn Ánh", guests
    upload(f"/api/admin/concerts/{concert_id}/guest-lists/import",admin,"guests.csv",csv,"text/csv")
    assert len(request("GET",f"/api/staff/guestlist/list?concert_id={concert_id}",staff))==1
    check("Check-in owns CSV processing and duplicate imports preserve one guest")

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

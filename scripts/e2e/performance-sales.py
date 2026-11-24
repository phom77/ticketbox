"""Exercise GA, seated checkout and scoped admission on a loopback Compose fixture."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
import re
import uuid

from split import approve_performance_fixture, REPORT_DIRECTORY, login, request, sql, until


def new_id():
    return str(uuid.uuid4())


def rectangle(left, top, right, bottom):
    return [dict(x=x, y=y) for x, y in ((left, top), (right, top), (right, bottom), (left, bottom))]


def main():
    until(lambda: request("GET", "/api/health"))
    until(lambda: request("GET", "/api/v2/events"))
    admin = until(lambda: login("admin"))
    manager = login("organizer")
    staff = login("staff")
    buyer = login("audience")
    run = uuid.uuid4().hex[:12]
    organization = request("POST", "/api/admin/organizations", admin, {
        "name": "Seating " + run,
        "initialManagerId": request("GET", "/api/auth/me", manager)["id"],
    }, expected=(201,))["id"]
    scope = {"X-Organization-Id": organization}
    prefix = "/api/organizer/manage/v2"
    event = request("POST", prefix + "/events", manager, {
        "title": "Local hybrid series " + run, "description": "GA and numbered seats",
    }, headers=scope)
    venue = request("POST", prefix + "/venues", manager, {
        "name": "Fixture Arena", "address": "Fixture Road", "spaceName": "Main room",
    }, headers=scope)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    opened = (now + timedelta(seconds=40)).isoformat()
    closes = (now + timedelta(hours=6)).isoformat()

    def schedule(days):
        starts = now + timedelta(days=days)
        return request("POST", prefix + f"/events/{event['id']}/performances", manager, {
            "venueSpaceId": venue["spaces"][0]["id"], "startsAt": starts.isoformat(),
            "endsAt": (starts + timedelta(hours=3)).isoformat(), "timezone": "Asia/Ho_Chi_Minh",
            "saleStartAt": opened, "saleEndAt": closes, "maxPerAccount": 3, "publicVisible": True,
        }, headers=scope)

    small, ga, hybrid = schedule(2), schedule(3), schedule(4)
    draft = schedule(5)
    assert draft["status"] == "DRAFT"
    floor, balcony, row, seat = [new_id() for _ in range(4)]
    layout = {
        "width": 100, "height": 80, "shapes": [
            {"kind": "STAGE", "label": "Stage", "points": rectangle(30, 5, 70, 18)},
        ], "sections": [
            {"id": floor, "code": "FL", "label": "Floor", "kind": "GA",
             "points": rectangle(5, 24, 47, 73), "rows": []},
            {"id": balcony, "code": "BA", "label": "Balcony", "kind": "ASSIGNED",
             "points": rectangle(54, 24, 95, 73), "rows": [
                 {"id": row, "code": "A", "label": "A", "seats": [
                     {"id": seat, "label": "12", "x": 69, "y": 40, "accessible": True,
                      "restrictedView": False, "blocked": False, "segment": "A", "position": 1},
                 ]},
             ]},
        ],
    }
    hybrid_path = prefix + f"/performances/{hybrid['id']}"
    request("PUT", hybrid_path + "/layout", manager, {"expectedVersion": 0, "layout": layout}, headers=scope)
    template = request("POST", prefix + f"/venues/{venue['id']}/templates", manager, {
        "venueSpaceId": venue["spaces"][0]["id"], "name": "Hybrid fixture", "layout": layout,
    }, headers=scope)
    draft_path = prefix + f"/performances/{draft['id']}"
    copied = request("POST", draft_path + "/layout/copy", manager, {
        "templateId": template["id"], "revision": template["revision"], "expectedVersion": 0,
    }, headers=scope)
    assert copied["layout"]["sections"][1]["rows"][0]["seats"][0]["label"] == "12"
    copied["layout"]["shapes"][0]["points"] = rectangle(33, 5, 67, 20)
    request("PUT", draft_path + "/layout", manager,
            {"expectedVersion": copied["version"], "layout": copied["layout"]}, headers=scope)
    assert request("GET", hybrid_path + "/layout", manager, headers=scope)["layout"]["shapes"] == layout["shapes"]
    request("PUT", hybrid_path + "/layout", manager, {"expectedVersion": 0, "layout": layout},
            expected=(409,), headers=scope)

    def publish(show, groups, layout_version, *, shared_offer=False):
        path = prefix + f"/performances/{show['id']}"
        offers = [
            dict(id=new_id(), groupId=group["id"], name=("General admission" if group["kind"] == "GA" else "Reserved"),
                 price=(100000 if group["kind"] == "GA" else 250000), currency="VND",
                 saleStartAt=opened, saleEndAt=closes, active=True)
            for group in groups
        ]
        if shared_offer:
            offers.append({**offers[0], "id": new_id(), "name": "Early entry", "price": 90000})
        sale = request("PUT", path + "/sale", manager, {"expectedSaleVersion": 0, "groups": groups, "offers": offers}, headers=scope)
        approve_performance_fixture(path, show, event, sale, layout_version, manager, admin, scope)
        return offers

    def pool(label, section=None):
        return dict(id=new_id(), sectionId=section, sectionLabel=label, kind="GA", capacity=3, seats=[])

    small_offers = publish(small, [pool("One room")], 0)
    ga_offers = publish(ga, [pool("Open floor"), pool("Mezzanine")], 0, shared_offer=True)
    hybrid_offers = publish(hybrid, [pool("Floor", floor), dict(
        id=new_id(), sectionId=balcony, sectionLabel="Balcony", kind="ASSIGNED", capacity=1,
        seats=[dict(id=seat, rowLabel="A", seatLabel="12", blocked=False)],
    )], 1)
    public = request("GET", f"/api/v2/events/{event['id']}")
    assert {show["id"] for show in public["performances"]} == {small["id"], ga["id"], hybrid["id"]}
    v2 = f"/api/v2/performances/{hybrid['id']}"
    assert "rows" not in request("GET", v2 + "/layout")["sections"][0]
    assert request("GET", v2 + f"/layout/sections/{balcony}")["section"]["rows"][0]["seats"][0]["id"] == seat
    assert request("GET", v2 + f"/availability/sections/{balcony}")["seats"][0]["available"]
    until(lambda: datetime.now(timezone.utc) >= datetime.fromisoformat(opened))

    def buy(show, items, layout_version):
        sale_path = f"/api/v2/performances/{show['id']}"
        queue = f"/api/queue/concerts/{show['id']}"
        request("POST", queue + "/join", buyer)
        token = until(lambda: request("GET", queue + "/status", buyer).get("queueAccessToken"))
        hold_headers = {"Queue-Access-Token": token, "Idempotency-Key": new_id()}
        args = {"layoutVersion": layout_version, "holdVersion": 0, "items": items}
        hold = request("PUT", sale_path + "/hold", buyer, args, headers=hold_headers)
        assert request("PUT", sale_path + "/hold", buyer, args, headers=hold_headers) == hold
        order_headers = {"Queue-Access-Token": token, "Idempotency-Key": new_id()}
        checkout = {"holdVersion": hold["version"]}
        order = request("POST", sale_path + "/orders", buyer, checkout, expected=(201,), headers=order_headers)
        recovered = request("GET", "/api/orders/by-idempotency-key", buyer, headers=order_headers)
        assert re.fullmatch(r"DH-[0-9]{8,19}", order["referenceCode"])
        assert recovered["id"] == order["id"] and recovered["referenceCode"] == order["referenceCode"]
        assert order["performanceId"] == show["id"]
        order_id = order["id"]
        until(lambda: request("POST", f"/api/payments/{order_id}/initiate", buyer,
                              {"provider": "MOCK"}, expected=(200, 202, 429)))
        until(lambda: (request("GET", f"/api/payments/{order_id}/status", buyer, expected=(200, 429)) or {})
              .get("attemptState") == "READY")

        def settle():
            request("POST", f"/api/mock-payments/{order_id}/success", buyer, expected=(200, 429))
            return sql("ticketing", f"SELECT status FROM orders WHERE id='{order_id}'") == "PAID"

        until(settle)
        return order

    small_order = buy(small, [dict(offerId=small_offers[0]["id"], quantity=1)], None)
    ga_order = buy(ga, [dict(offerId=ga_offers[0]["id"], quantity=1)], None)
    hybrid_order = buy(hybrid, [dict(offerId=hybrid_offers[0]["id"], quantity=1),
                               dict(offerId=hybrid_offers[1]["id"], seatId=seat)], 1)
    tickets = [ticket for ticket in request("GET", "/api/tickets", buyer) if ticket.get("performanceId") == hybrid["id"]]
    assert len(tickets) == 2
    assert all(re.fullmatch(r"VE-[0-9]{8,19}", ticket["referenceCode"]) for ticket in tickets)
    assert len({ticket["referenceCode"] for ticket in tickets}) == len(tickets)
    order_code = hybrid_order["referenceCode"]
    support = request("GET", f"/api/admin/orders/support?referenceCode={order_code.lower()}", admin)
    assert [order["id"] for order in support["content"]] == [hybrid_order["id"]]
    notice = until(lambda: next((entry for entry in request("GET", "/api/notifications", buyer)["content"]
                                 if order_code in entry["body"]), None))
    assert hybrid_order["id"] not in notice["body"]
    assigned = next(ticket for ticket in tickets if ticket.get("seatLabel") == "12")
    assert assigned["sectionLabel"] == "Balcony" and assigned["rowLabel"] == "A"
    assert not request("GET", v2 + f"/availability/sections/{balcony}")["seats"][0]["available"]

    staff_id = request("GET", "/api/auth/me", staff)["id"]
    invite = request("POST", f"/api/organizations/{organization}/invitations", manager, {
        "accountId": staff_id, "grants": ["ADMISSION"],
    }, expected=(201,))
    request("POST", "/api/organizations/invitations/accept", staff, {"code": invite["code"]})
    directory = request("GET", f"/api/organizations/{organization}/admission-staff", manager)
    assert [member["accountId"] for member in directory] == [staff_id]
    performances = "/api/v2/staff/performances"
    assert not request("GET", performances, staff, headers=scope)["content"]
    request("PUT", hybrid_path + f"/staff/{staff_id}", manager, expected=(204,), headers=scope)
    request("GET", performances + f"/{ga['id']}/checkin-dataset", staff, expected=(403,), headers=scope)
    dataset_path = performances + f"/{hybrid['id']}/checkin-dataset"
    dataset = until(lambda: (data if (data := request("GET", dataset_path, staff, headers=scope))["totalCount"] == 2 else None))
    assert all("qrSecret" not in item for item in dataset["tickets"])
    assert {entry["ticketId"]: entry["referenceCode"] for entry in dataset["tickets"]} == {
        entry["id"]: entry["referenceCode"] for entry in tickets
    }
    assert all(entry["ticketTypeName"] for entry in dataset["tickets"])

    def scan(device_id):
        return request("POST", performances + f"/{hybrid['id']}/scan", staff, {
            "qrCode": assigned["qrCode"], "deviceId": device_id, "gate": "A",
        }, headers=scope)["status"]

    with ThreadPoolExecutor(max_workers=2) as workers:
        scans = list(workers.map(scan, ("device-a", "device-b")))
    assert scans.count("SUCCESS") == 1, scans
    request("DELETE", hybrid_path + f"/staff/{staff_id}", manager, expected=(204,), headers=scope)
    request("GET", dataset_path, staff, expected=(403,), headers=scope)
    request("GET", "/api/staff/concerts", staff, expected=(403,), headers=scope)
    assert sql("ticketing", f"SELECT count(*) FROM performance_seats WHERE performance_id='{hybrid['id']}' AND status='ALLOCATED'") == "1"

    operations = f"/api/admin/v2/performances/{ga['id']}/disruption"
    request("POST", operations + "/complete", admin, expected=(400,))
    action = request("POST", operations, admin, {
        "actionId": new_id(), "kind": "POSTPONE", "reason": "Local gateway rehearsal",
        "startsAt": (datetime.fromisoformat(ga["startsAt"]) + timedelta(days=1)).isoformat(),
        "endsAt": (datetime.fromisoformat(ga["endsAt"]) + timedelta(days=1)).isoformat(),
        "saleStartAt": ga["saleStartAt"], "saleEndAt": ga["saleEndAt"],
    })
    until(lambda: request("GET", operations, admin)["state"] == "PAUSED")
    assert next(show for show in request("GET", f"/api/v2/events/{event['id']}")["performances"]
                if show["id"] == ga["id"])["salesSuspended"]
    request("POST", operations + f"/{action['id']}/resume", admin)
    until(lambda: request("GET", operations, admin)["state"] == "RESUMED")

    # Advance only this fixture through the end of its scheduled show.
    sql("catalog", f"""BEGIN;
        UPDATE performances SET starts_at=now()-interval '2 hours', ends_at=now()-interval '1 hour',
            sale_start_at=now()-interval '4 hours', sale_end_at=now()-interval '2 hours',
            resumed_admission_at=NULL WHERE id='{ga['id']}';
        UPDATE performance_sale_offers SET sale_start_at=now()-interval '4 hours',
            sale_end_at=now()-interval '2 hours' WHERE performance_id='{ga['id']}';
        COMMIT;""")
    completed = request("POST", operations + "/complete", admin)
    assert completed["status"] == "COMPLETED"
    assert request("POST", operations + "/complete", admin)["saleVersion"] == completed["saleVersion"]
    zones = until(lambda: request("GET", f"/api/organizer/concerts/{ga['id']}/zone-revenue", manager, headers=scope))
    assert len(zones) == 2
    assert sum(zone["totalQuantity"] for zone in zones) == 6
    assert sum(zone["soldQuantity"] for zone in zones) == 1

    report = dict(eventId=event["id"], smallPerformance=small["id"], smallOrder=small_order["id"],
                  gaPerformance=ga["id"], hybridPerformance=hybrid["id"],
                  gaOrder=ga_order["id"], hybridOrder=hybrid_order["id"], assignedSeatScans=scans)
    REPORT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    (REPORT_DIRECTORY / "performance-sales.json").write_text(json.dumps(report, indent=2) + "\n")
    print("GA, hybrid checkout, versioned map, replay, scoped staff and duplicate scan verified.")


if __name__ == "__main__":
    main()

"""Measure a synthetic arena and hot inventory on an isolated loopback gateway."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
import math
import os
from pathlib import Path
from threading import Barrier
from time import perf_counter
from uuid import uuid4

from split import approve_performance_fixture, REPORT_DIRECTORY, login, request, sql, until


def key():
    return str(uuid4())


def measure(operation):
    started = perf_counter()
    result = operation()
    return result, (perf_counter() - started) * 1000


def percentiles(values):
    ordered = sorted(values)
    return {"samples": len(values), "p95Ms": round(ordered[math.ceil(len(values) * .95) - 1], 1)}


def main():
    until(lambda: request("GET", "/api/v2/events"))
    admin, manager = login("admin"), login("organizer")
    run = uuid4().hex[:10]
    owner = request("POST", "/api/admin/organizations", admin, {
        "name": "Arena rehearsal " + run,
        "initialManagerId": request("GET", "/api/auth/me", manager)["id"],
    }, expected=(201,))["id"]
    scope = {"X-Organization-Id": owner}
    root = "/api/organizer/manage/v2"
    event = request("POST", root + "/events", manager, {"title": "Arena " + run}, headers=scope)
    venue = request("POST", root + "/venues", manager,
                    {"name": "Arena PX", "address": "Fixture", "spaceName": "Main"}, headers=scope)
    now = datetime.now(timezone.utc)
    opens, closes = (now + timedelta(seconds=45)).isoformat(), (now + timedelta(hours=6)).isoformat()
    scheduled = request("POST", root + f"/events/{event['id']}/performances", manager, {
        "venueSpaceId": venue["spaces"][0]["id"], "startsAt": (now + timedelta(days=2)).isoformat(),
        "endsAt": (now + timedelta(days=2, hours=4)).isoformat(), "timezone": "Asia/Ho_Chi_Minh",
        "saleStartAt": opens, "saleEndAt": closes, "maxPerAccount": 1, "publicVisible": True,
    }, headers=scope)
    show = scheduled["id"]
    management = f"{root}/performances/{show}"
    public = f"/api/v2/performances/{show}"
    queue = f"/api/queue/concerts/{show}"

    sections, groups, offers = [], [], []
    section_count, rows_per_section, seats_per_row = 48, 42, 25
    for index in range(section_count + 1):
        x, y = (index % 8) * 160, (index // 8) * 180
        section_id, group_id = key(), key()
        ga = index == section_count
        kind = "GA" if ga else "ASSIGNED"
        label = "Floor" if ga else f"Section {index + 1}"
        rows, stock = [], []
        if not ga:
            for row_index in range(rows_per_section):
                row_code = str(row_index + 1)
                seats = [dict(id=key(), label=str(j + 1), x=x + j * 5 + 10, y=y + row_index * 3 + 10,
                              accessible=(row_index == 0 and j < 2), restrictedView=False,
                              blocked=False, segment="A", position=j + 1) for j in range(seats_per_row)]
                rows.append(dict(id=key(), code=row_code, label=row_code, seats=seats))
                stock.extend(dict(id=seat["id"], rowLabel=row_code, seatLabel=seat["label"], blocked=False) for seat in seats)
        sections.append(dict(id=section_id, code=str(index + 1), label=label, kind=kind, rows=rows,
                             points=[dict(x=a, y=b) for a, b in ((x, y), (x + 150, y), (x + 150, y + 165), (x, y + 165))]))
        groups.append(dict(id=group_id, sectionId=section_id, sectionLabel=label, kind=kind,
                           capacity=2 if ga else len(stock), seats=stock))
        offers.append(dict(id=key(), groupId=group_id, name=label, price=180000, currency="VND",
                           active=True, saleStartAt=opens, saleEndAt=closes))
    offers.append({**offers[-1], "id": key(), "name": "Floor advance", "price": 150000})
    layout = dict(width=1280, height=1260, sections=sections, shapes=[])
    layout_args = dict(expectedVersion=0, layout=layout)
    _, layout_ms = measure(lambda: request("PUT", management + "/layout", manager, layout_args, headers=scope))
    sale, sale_ms = measure(lambda: request("PUT", management + "/sale", manager, {
        "expectedSaleVersion": 0, "groups": groups, "offers": offers,
    }, headers=scope))

    _, publish_ms = measure(lambda: approve_performance_fixture(
        management, scheduled, event, sale, 1, manager, admin, scope))
    until(lambda: datetime.now(timezone.utc) >= datetime.fromisoformat(opens))
    sample_section = sections[0]["id"]
    first_seat = sections[0]["rows"][0]["seats"][0]["id"]
    assert all("rows" not in section for section in request("GET", public + "/layout")["sections"])

    def read(index):
        section = sections[index % section_count]["id"]
        detail, layout_time = measure(lambda: request("GET", public + f"/layout/sections/{section}"))
        availability, stock_time = measure(lambda: request("GET", public + f"/availability/sections/{section}"))
        assert len(detail["section"]["rows"]) == rows_per_section
        assert len(availability["seats"]) == rows_per_section * seats_per_row
        return layout_time, stock_time

    with ThreadPoolExecutor(max_workers=6) as pool:
        reads = list(pool.map(read, range(60)))

    def shopper(index):
        credentials = {"email": f"arena-{run}-{index}@example.test", "password": "fixture-arena-pass"}
        request("POST", "/api/auth/register", body={**credentials, "fullName": "Arena Fixture"}, expected=(201,))
        token = request("POST", "/api/auth/login", body=credentials)["accessToken"]
        request("POST", queue + "/join", token)
        admitted = until(lambda: request("GET", queue + "/status", token).get("queueAccessToken"))
        return token, {"Queue-Access-Token": admitted}

    shoppers = [shopper(i) for i in range(8)]
    ready = Barrier(len(shoppers), timeout=30)

    def compete(index):
        token, headers = shoppers[index]
        desired = dict(offerId=offers[0]["id"], seatId=first_seat) if index < 4 else dict(
            offerId=offers[-1 - (index % 2)]["id"], quantity=1,
        )
        ready.wait()
        hold, hold_ms = measure(lambda: request("PUT", public + "/hold", token, {
            "layoutVersion": 1, "holdVersion": 0, "items": [desired],
        }, expected=(200, 409), headers={**headers, "Idempotency-Key": key()}))
        if hold is None:
            return hold_ms, None
        order, checkout_ms = measure(lambda: request("POST", public + "/orders", token,
            {"holdVersion": hold["version"]}, expected=(201,), headers={**headers, "Idempotency-Key": key()}))
        assert order["performanceId"] == show
        return hold_ms, checkout_ms

    with ThreadPoolExecutor(max_workers=len(shoppers)) as pool:
        outcomes = list(pool.map(compete, range(len(shoppers))))
    assert sum(checkout is not None for _, checkout in outcomes[:4]) == 1
    assert sum(checkout is not None for _, checkout in outcomes[4:]) == 2
    section_stock = request("GET", public + f"/availability/sections/{sample_section}")
    assert not next(seat for seat in section_stock["seats"] if seat["id"] == first_seat)["available"]
    assert sql("ticketing", f"SELECT count(*) FROM performance_seats WHERE performance_id='{show}' AND id='{first_seat}' AND status='ALLOCATED'") == "1"
    assert sql("ticketing", f"SELECT available || ':' || held || ':' || allocated FROM performance_groups WHERE performance_id='{show}' AND kind='GA'") == "0:0:2"
    assert sql("ticketing", f"SELECT count(*) FROM orders WHERE concert_id='{show}'") == "3"
    host = {"logicalCpu": os.cpu_count()}
    meminfo = Path("/proc/meminfo")
    if meminfo.exists():
        memory = next(line for line in meminfo.read_text().splitlines() if line.startswith("MemTotal:"))
        host["memoryKiB"] = int(memory.split()[1])
    report = {
        "event": event["id"], "performance": show, "section": sample_section, "venue": venue["name"],
        "host": host,
        "fixture": {"assignedSeats": section_count * rows_per_section * seats_per_row, "sections": len(sections),
                    "layoutBytes": len(json.dumps(layout_args).encode()), "concurrentBuyers": len(shoppers)},
        "saveLayoutMs": round(layout_ms, 1), "savePricingMs": round(sale_ms, 1), "publishAndAcknowledgeMs": round(publish_ms, 1),
        "readSection": percentiles([layout_time for layout_time, _ in reads]),
        "readSectionAvailability": percentiles([stock_time for _, stock_time in reads]),
        "hold": percentiles([hold for hold, _ in outcomes]),
        "checkout": percentiles([checkout for _, checkout in outcomes if checkout is not None]),
        "conflicts": 5, "orders": 3, "duplicateSeats": 0, "remainingGA": 0,
    }
    REPORT_DIRECTORY.mkdir(parents=True, exist_ok=True)
    (REPORT_DIRECTORY / "performance-arena.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

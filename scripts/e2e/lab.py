#!/usr/bin/env python3
"""Exercise actual HTTP/JPA routing, checkout, partitions and optional role changes."""
import argparse
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
import uuid

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("lab_operations",ROOT/"scripts/lab.py")
ops=importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


def replica_outage(lab, request, audience, order_id, key):
    lab.compose("stop","ticketing-replica")
    started=time.monotonic()
    try:
        try:
            request("GET","/api/orders/my",audience)
            raise AssertionError("Replica history unexpectedly succeeded while replica was stopped")
        except urllib.error.HTTPError as error:
            assert error.code in (500,503), error.code
        assert request("GET",f"/api/orders/{order_id}",audience)["id"]==order_id
        assert request("GET","/api/orders/by-idempotency-key",audience,headers={"Idempotency-Key":key})["id"]==order_id
    finally:
        lab.compose("start","ticketing-replica")
    lab.caught_up("ticketing")
    lab.wait(lambda:order_id in [o["id"] for o in request("GET","/api/orders/my",audience)])
    return {"replicaErrorWasVisible":True,"primaryDetailAndRecoveryAvailable":True,
            "replicaRestartCaughtUp":True,"outageAndRecoverySeconds":round(time.monotonic()-started,3)}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project",default="ticketbox-e2e-lab")
    parser.add_argument("--port",default=os.environ.get("APP_PORT","18106"))
    parser.add_argument("--switchover",action="store_true",help="Planned switch Catalog, then Ticketing; leaves old primaries fenced")
    parser.add_argument("--replica-outage-only",action="store_true",help="Exercise Ticketing standby outage using an existing audience order")
    parser.add_argument("--output",type=Path,default=ROOT/".artifacts/verification/phase-5-6",
                        help="Directory for the lab verification report")
    args=parser.parse_args()
    lab=ops.Lab(args.project)
    proof={"passed":False,"checks":[]}
    output=args.output
    output.mkdir(parents=True,exist_ok=True)
    base="http://127.0.0.1:"+args.port

    def request(method,path,token=None,body=None,headers=None):
        supplied={"Content-Type":"application/json",**(headers or {})}
        if token: supplied["Authorization"]="Bearer "+token
        data=json.dumps(body).encode() if body is not None else None
        with urllib.request.urlopen(urllib.request.Request(base+path,data=data,headers=supplied,method=method),timeout=20) as response:
            payload=json.load(response)
            return payload.get("data",payload)

    def until(check):
        deadline=time.monotonic()+120
        last=None
        while time.monotonic()<deadline:
            try:
                result=check()
                if result:return result
            except (OSError,AssertionError,KeyError) as error:last=error
            time.sleep(1)
        raise AssertionError(f"HTTP condition timed out: {last}")

    def check(name):
        proof["checks"].append(name)
        print(name,flush=True)

    def clear_catalog_cache():
        # Only public catalog keys on this isolated project's Redis.
        lab.compose("exec","-T","redis","sh","-c","redis-cli --scan --pattern 'cache:*' | xargs -r redis-cli DEL")

    try:
        admin=until(lambda:request("POST","/api/auth/login",body={"email":"admin@ticketbox.com","password":"password123"})["accessToken"])
        audience=until(lambda:request("POST","/api/auth/login",body={"email":"audience@ticketbox.com","password":"password123"})["accessToken"])
        staff=until(lambda:request("POST","/api/auth/login",body={"email":"staff@ticketbox.com","password":"password123"})["accessToken"])
        until(lambda:request("GET","/api/concerts"))
        until(lambda:request("GET","/api/orders/my",audience) is not None)
        until(lambda:request("GET","/api/staff/concerts?status=ON_SALE",staff))
        if args.replica_outage_only:
            order=json.loads(lab.sql("ticketing","SELECT jsonb_build_object('id',id,'key',idempotency_key) FROM orders WHERE user_id='00000000-0000-0000-0000-000000000003' ORDER BY created_at DESC LIMIT 1"))
            proof["sqlLag"]=[lab.lag("ticketing")]
            proof["replicaOutage"]=replica_outage(lab,request,audience,order["id"],order["key"])
            check("Replica outage is visible while primary detail/recovery remain available, then standby catches up")
            proof["passed"]=True
            return
        proof["sqlLag"]=[lab.lag(service) for service in ("catalog","ticketing")]
        check("Catalog then Ticketing: paused replay returns stale SQL data, resume catches up")
        now=dt.datetime.now(dt.timezone.utc)
        concert=request("POST","/api/admin/concerts",admin,{
            "title":"Replica lab "+uuid.uuid4().hex,"venueName":"Lab arena","venueAddress":"Lab",
            "eventDate":(now+dt.timedelta(days=7)).isoformat(),"saleStartAt":(now-dt.timedelta(minutes=1)).isoformat(),
            "saleEndAt":(now+dt.timedelta(days=1)).isoformat()})
        cid=concert["id"]
        ticket_type=request("POST",f"/api/admin/concerts/{cid}/ticket-types",admin,{
            "name":"Lab GA","price":100000,"totalQuantity":20,"maxPerAccount":4,"zoneColor":"#123456"})
        tid=ticket_type["id"]
        request("PATCH",f"/api/admin/concerts/{cid}/status",admin,{"status":"ON_SALE"})
        lab.caught_up("catalog")
        lab.sql("catalog","SELECT pg_wal_replay_pause()",replica=True)
        lab.wait(lambda:lab.sql("catalog","SELECT pg_is_wal_replay_paused()",replica=True)=="t")
        original=concert["title"]
        changed="Primary title "+uuid.uuid4().hex
        try:
            lab.sql("catalog",f"UPDATE concerts SET title='{changed}' WHERE id='{cid}'")
            clear_catalog_cache()
            assert request("GET",f"/api/concerts/{cid}")["title"]==original
            assert lab.sql("catalog",f"SELECT title FROM concerts WHERE id='{cid}'")==changed
        finally:lab.sql("catalog","SELECT pg_wal_replay_resume()",replica=True)
        lab.caught_up("catalog")
        clear_catalog_cache()
        assert request("GET",f"/api/concerts/{cid}")["title"]==changed
        check("Catalog public API reads physical standby through Hibernate, then catches up")

        lab.caught_up("ticketing")
        lab.sql("ticketing","SELECT pg_wal_replay_pause()",replica=True)
        lab.wait(lambda:lab.sql("ticketing","SELECT pg_is_wal_replay_paused()",replica=True)=="t")
        key=str(uuid.uuid4())
        try:
            request("POST",f"/api/queue/concerts/{cid}/join",audience)
            access=until(lambda:request("GET",f"/api/queue/concerts/{cid}/status",audience).get("queueAccessToken"))
            headers={"Queue-Access-Token":access,"Idempotency-Key":key}
            request("POST",f"/api/reservations/concerts/{cid}/ticket-types/{tid}/reserve",audience,{"quantity":1},headers)
            order=request("POST","/api/orders",audience,{"concertId":cid,"items":[{"ticketTypeId":tid,"quantity":1}]},headers)
            oid=order["id"]
            assert oid not in [o["id"] for o in request("GET","/api/orders/my",audience)]
            assert request("GET",f"/api/orders/{oid}",audience)["id"]==oid
            assert request("GET","/api/orders/by-idempotency-key",audience,headers={"Idempotency-Key":key})["id"]==oid
            request("POST",f"/api/payments/{oid}/initiate",audience,{"provider":"MOCK"})
            until(lambda:request("GET",f"/api/payments/{oid}/status",audience).get("attemptState")=="READY")
            request("POST",f"/api/mock-payments/{oid}/success",audience)
            until(lambda:request("GET",f"/api/payments/{oid}/status",audience).get("orderStatus")=="PAID")
            assert lab.sql("ticketing",f"SELECT replay_order('{oid}')->>'status'")=="PAID"
        finally:lab.sql("ticketing","SELECT pg_wal_replay_resume()",replica=True)
        lab.caught_up("ticketing")
        assert oid in [o["id"] for o in request("GET","/api/orders/my",audience)]
        check("Stale order history coexists with primary checkout, idempotency recovery, payment and replay")
        dataset=until(lambda:request("GET",f"/api/staff/concerts/{cid}/checkin-dataset",staff).get("tickets"))
        scan=request("POST","/api/staff/checkins/scan",staff,{"concertId":cid,"qrCode":dataset[0]["qrCode"],"deviceId":"lab-device","gate":"GA"})
        assert scan["status"]=="SUCCESS"
        repeated=request("POST","/api/staff/checkins/scan",staff,{"concertId":cid,"qrCode":dataset[0]["qrCode"],"deviceId":"lab-device","gate":"GA"})
        assert repeated["status"]=="FAILED"
        assert lab.sql("checkin",f"SELECT count(*) FROM scan_audit WHERE concert_id='{cid}'")=="1"
        check("Real accepted scan reaches monthly audit; repeat scan preserves unique admission")
        proof["constraints"]={}
        for service in ("ticketing","checkin"):
            result=lab.sql(service,(ROOT/f"scripts/db/verify-lab-{service}.sql").read_text().replace("\\set ON_ERROR_STOP on", ""))
            proof["constraints"][service]=json.loads(result.splitlines()[-1])
        check("Migrated constraints, replay, foreign keys and parent/child append-only privileges pass")
        proof["replicaOutage"]=replica_outage(lab,request,audience,oid,key)
        check("Replica outage preserves primary detail/recovery and restart catches up")
        if args.switchover:
            proof["switchover"]=[]
            for service in ("catalog","ticketing"):
                proof["switchover"].append(lab.switchover(service))
                until(lambda:request("GET",f"/api/orders/{oid}",audience))
                until(lambda:request("GET",f"/api/admin/concerts/{cid}",admin))
                assert lab.sql(service,"SELECT pg_is_in_recovery()") == "f"
                lab.sql(service,"INSERT INTO lab_replication_probe VALUES('promoted-'||clock_timestamp()::text,'writable')")
                check(service+": WAL barrier, fenced old primary, promoted standby and restarted API work")
            assert request("GET","/api/orders/by-idempotency-key",audience,headers={"Idempotency-Key":key})["id"]==oid
        proof.update(passed=True,concertId=cid,orderId=oid)
    finally:
        result_file="replica-outage.json" if args.replica_outage_only else "lab-e2e.json"
        (output/result_file).write_text(json.dumps(proof,indent=2)+"\n")
        print(json.dumps(proof,indent=2))


if __name__=="__main__":main()

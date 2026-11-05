"""Restore rehearsal for every database in an isolated six-service deployment."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid

ROOT=Path(__file__).resolve().parents[2]
PROJECT=os.environ.get("E2E_PROJECT","ticketbox-e2e-split")
PORT=os.environ.get("E2E_PORT","18096")
assert re.fullmatch(r"ticketbox-e2e(?:-[a-z0-9-]+)?",PROJECT)
SERVICES=["identity","catalog","ticketing","checkin","payment","notification"]
WRITERS=["gateway",*SERVICES]
DATABASES={s:"ticketbox_"+s for s in SERVICES}
DATABASES.update(payment="ticketbox_payments",notification="ticketbox_notifications")
DIRECTORY=ROOT/".artifacts/e2e/split-backups"
DIRECTORY.mkdir(parents=True,exist_ok=True)
proof={"passed":False,"databases":[]}
suffix=uuid.uuid4().hex[:8]


def compose(*args,**options):
    return subprocess.check_output(["docker","compose","-p",PROJECT,"-f",str(ROOT/"compose.yaml"),*args],
                                   cwd=ROOT,env={**os.environ,"APP_PORT":PORT,
                                       "APP_PUBLIC_URL":"http://localhost:"+PORT,
                                       "APP_ALLOWED_ORIGINS":"http://localhost:"+PORT,
                                       "CHECKIN_PORT":os.environ.get("CHECKIN_PORT",str(int(PORT)+1))},**options)


def sql(service,db,query):
    return compose("exec","-T",service+"-db","psql","-U",service+"_owner","-d",db,
                   "-At","-v","ON_ERROR_STOP=1","-c",query).decode().strip()


def wait_http(path,token=None):
    import urllib.request
    deadline=time.monotonic()+120
    while time.monotonic()<deadline:
        try:
            headers={"Authorization":"Bearer "+token} if token else {}
            with urllib.request.urlopen(urllib.request.Request("http://localhost:"+PORT+path,headers=headers),timeout=5) as response:
                return json.load(response)
        except Exception:
            time.sleep(1)
    raise AssertionError("Restored API did not become ready: "+path)


def mail_stats():
    return json.loads(compose("exec","-T","smtp","node","-e",
        "fetch('http://localhost:8080/stats').then(r=>r.text()).then(console.log)").decode())

start=time.monotonic()
try:
    # Checkpoint after all already accepted emails have completed delivery.
    deadline=time.monotonic()+60
    while sql("notification",DATABASES["notification"],
              "SELECT count(*) FROM notifications WHERE channel='EMAIL' AND status='PENDING'")!="0":
        if time.monotonic()>deadline:raise AssertionError("Email deliveries did not quiesce")
        time.sleep(1)
    compose("stop",*WRITERS)
    mail_before=mail_stats()["accepted"]
    restored={}
    for service in SERVICES:
        database=DATABASES[service]
        data=compose("exec","-T",service+"-db","pg_dump","-U",service+"_owner","-d",database,"-Fc")
        (DIRECTORY/(service+".dump")).write_bytes(data)
        target=database+"_restore_"+suffix
        sql(service,database,'CREATE DATABASE "'+target+'"')
        compose("exec","-T",service+"-db","pg_restore","--no-owner","--exit-on-error","-U",service+"_owner","-d",target,input=data)
        tables=sql(service,database,"SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").splitlines()
        for table in tables:
            assert re.fullmatch(r"[a-z0-9_]+",table)
            query=f"SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM public.{table} t"
            assert sql(service,database,query)==sql(service,target,query),(service,table)
        restored[service]=target
        proof["databases"].append({"service":service,"tables":len(tables),"sha256":hashlib.sha256(data).hexdigest()})
    # Boot all six services against copied databases, leaving originals intact.
    overlay={"services":{s:{"environment":{
        ("DATABASE_URL" if s not in ("payment","notification") else s.upper()+"_DATABASE_URL"):
            "jdbc:postgresql://"+s+"-db:5432/"+restored[s]}} for s in SERVICES}}
    overlay_path=DIRECTORY/"overlay.json"
    overlay_path.write_text(json.dumps(overlay))
    command=["docker","compose","-p",PROJECT,"-f",str(ROOT/"compose.yaml"),"-f",str(overlay_path)]
    subprocess.check_call([*command,"up","-d","--no-deps",*SERVICES,"gateway"],cwd=ROOT,
        env={**os.environ,"APP_PORT":PORT,"APP_PUBLIC_URL":"http://localhost:"+PORT,
             "APP_ALLOWED_ORIGINS":"http://localhost:"+PORT,
             "CHECKIN_PORT":os.environ.get("CHECKIN_PORT",str(int(PORT)+1))})
    wait_http("/api/health")
    import urllib.request
    req=urllib.request.Request("http://localhost:"+PORT+"/api/auth/login",
        data=json.dumps({"email":"admin@ticketbox.com","password":"password123"}).encode(),
        headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=20) as response:
        token=json.load(response)["data"]["accessToken"]
    wait_http("/api/admin/orders",token)
    wait_http("/api/concerts")
    wait_http("/api/admin/notifications",token)
    time.sleep(4)
    assert mail_stats()["accepted"]==mail_before,"Restore resent historical mail"
    proof["noHistoricalResend"]=True
    proof["applicationRestored"]=True
    proof["passed"]=True
finally:
    # Return the isolated deployment to its original databases after checking the copies.
    if proof["passed"]:
        compose("up","-d","--no-deps",*SERVICES,"gateway")
    else:
        compose("stop",*WRITERS)
    proof["seconds"]=round(time.monotonic()-start,2)
    (ROOT/".artifacts/e2e/split-restore.json").write_text(json.dumps(proof,indent=2))
    print(json.dumps(proof,indent=2))

#!/usr/bin/env python3
"""Compare equal rows/indexes, recording repeated EXPLAIN ANALYZE BUFFERS plans."""
import argparse
import json
from pathlib import Path
import statistics
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lab import Lab


def run(lab, rows, repeats):
    output = Path(__file__).resolve().parents[2] / ".artifacts/verification/phase-5-6"
    output.mkdir(parents=True, exist_ok=True)
    summary = {"rowsPerTable": rows, "repeats": repeats, "queries": {}}
    for service, table in (("ticketing", "order_events"), ("checkin", "scan_audit")):
        schema = "lab_benchmark"
        # Only touches the reserved benchmark schema in an isolated lab project.
        lab.sql(service, f"DROP SCHEMA IF EXISTS {schema} CASCADE; CREATE SCHEMA {schema}")
        try:
            lab.sql(service, f"CREATE TABLE {schema}.ordinary (LIKE public.{table} INCLUDING ALL)")
            strategy = "HASH(order_id)" if table == "order_events" else "RANGE(recorded_at)"
            lab.sql(service, f"CREATE TABLE {schema}.partitioned (LIKE public.{table} INCLUDING ALL) PARTITION BY {strategy}")
            if table == "order_events":
                for i in range(4):
                    lab.sql(service, f"CREATE TABLE {schema}.part_{i} PARTITION OF {schema}.partitioned FOR VALUES WITH(MODULUS 4,REMAINDER {i})")
                lab.sql(service, f"""INSERT INTO {schema}.ordinary(order_id,stream_version,event_type,payload,recorded_at)
                    SELECT md5((i/4)::text)::uuid,i%4+1,CASE WHEN i%4=0 THEN 'OrderCreated' ELSE 'OrderPaid' END,
                    jsonb_build_object('padding',repeat('x',120)),timestamptz '2026-01-01' + (i%365)*interval '1 day'
                    FROM generate_series(0,{rows-1}) i""")
                queries = {"stream": "WHERE order_id=md5('123')::uuid ORDER BY stream_version",
                           "time_without_hash_key": "WHERE recorded_at >= '2026-05-01T00:00:00Z' AND recorded_at < '2026-06-01T00:00:00Z'"}
            else:
                for month in range(1,13):
                    start = f"2026-{month:02d}-01T00:00:00Z"
                    end = f"2026-{month+1:02d}-01T00:00:00Z" if month < 12 else "2027-01-01T00:00:00Z"
                    lab.sql(service, f"CREATE TABLE {schema}.part_{month} PARTITION OF {schema}.partitioned FOR VALUES FROM('{start}') TO('{end}')")
                lab.sql(service, f"""INSERT INTO {schema}.ordinary(id,recorded_at,ticket_id,concert_id,staff_id,device_id,is_offline)
                    SELECT md5(i::text)::uuid,timestamptz '2026-01-01' + (i%365)*interval '1 day',
                    md5(i::text)::uuid,md5((i%100)::text)::uuid,NULL,'benchmark',false
                    FROM generate_series(0,{rows-1}) i""")
                queries = {"month": "WHERE recorded_at >= '2026-05-01T00:00:00Z' AND recorded_at < '2026-06-01T00:00:00Z'",
                           "cross_month": "WHERE recorded_at >= '2026-05-31T00:00:00Z' AND recorded_at < '2026-06-02T00:00:00Z'",
                           "id_without_range_key": "WHERE id=md5('123')::uuid"}
            lab.sql(service, f"INSERT INTO {schema}.partitioned SELECT * FROM {schema}.ordinary; ANALYZE {schema}.ordinary; ANALYZE {schema}.partitioned")
            mismatch = lab.sql(service, f"SELECT count(*) FROM ((SELECT * FROM {schema}.ordinary EXCEPT ALL SELECT * FROM {schema}.partitioned) UNION ALL (SELECT * FROM {schema}.partitioned EXCEPT ALL SELECT * FROM {schema}.ordinary)) difference")
            assert mismatch == "0", mismatch
            for name, where in queries.items():
                comparison = {}
                for variant in ("ordinary", "partitioned"):
                    query = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM {schema}.{variant} {where}"
                    lab.sql(service, query)  # Warm both alternatives before measured runs.
                    plans = [json.loads(lab.sql(service, query))[0] for _ in range(repeats)]
                    (output / f"{table}-{name}-{variant}.json").write_text(json.dumps(plans, indent=2)+"\n")
                    def relations(node):
                        return ([node["Relation Name"]] if "Relation Name" in node else []) + [r for child in node.get("Plans",[]) for r in relations(child)]
                    comparison[variant] = {
                        "medianExecutionMs": statistics.median(p["Execution Time"] for p in plans),
                        "medianPlanningMs": statistics.median(p["Planning Time"] for p in plans),
                        "sharedHitBlocks": plans[-1]["Plan"].get("Shared Hit Blocks",0),
                        "sharedReadBlocks": plans[-1]["Plan"].get("Shared Read Blocks",0),
                        "relations": relations(plans[-1]["Plan"]), "rows": plans[-1]["Plan"]["Actual Rows"]}
                assert comparison["ordinary"]["rows"] == comparison["partitioned"]["rows"]
                summary["queries"][table+"."+name] = comparison
            writes = {}
            for variant in ("ordinary", "partitioned"):
                plans = []
                for sample in range(repeats+1):
                    if table == "order_events":
                        statement = f"INSERT INTO {schema}.{variant}(order_id,stream_version,event_type,payload) SELECT md5('write-'||i)::uuid,1,'OrderCreated',jsonb_build_object('padding',repeat('x',120)) FROM generate_series({sample*1000},{sample*1000+999}) i"
                    else:
                        statement = f"INSERT INTO {schema}.{variant}(id,recorded_at,ticket_id,concert_id,device_id,is_offline) SELECT md5('write-'||i)::uuid,'2026-05-15T00:00:00Z',md5(i::text)::uuid,md5('concert')::uuid,'write-benchmark',false FROM generate_series({sample*1000},{sample*1000+999}) i"
                    plan = json.loads(lab.sql(service,"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "+statement))[0]
                    if sample: plans.append(plan)
                (output/f"{table}-insert_batch-{variant}.json").write_text(json.dumps(plans,indent=2)+"\n")
                writes[variant] = {"batchRows":1000,"medianExecutionMs":statistics.median(p["Execution Time"] for p in plans),
                    "medianPlanningMs":statistics.median(p["Planning Time"] for p in plans),
                    "sharedHitBlocks":plans[-1]["Plan"].get("Shared Hit Blocks",0),
                    "sharedDirtiedBlocks":plans[-1]["Plan"].get("Shared Dirtied Blocks",0)}
                assert int(lab.sql(service,f"SELECT count(*) FROM {schema}.{variant}"))==rows+1000*(repeats+1)
            summary["queries"][table+".insert_batch"] = writes
        finally:
            lab.sql(service, f"DROP SCHEMA {schema} CASCADE")
    (output / "benchmark.json").write_text(json.dumps(summary,indent=2)+"\n")
    return summary


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project",default="ticketbox-e2e-lab")
    parser.add_argument("--rows",type=int,default=120000)
    parser.add_argument("--repeats",type=int,default=3)
    args=parser.parse_args()
    if args.rows<1000 or args.repeats<1:
        parser.error("Use at least 1000 rows and one measured repeat")
    print(json.dumps(run(Lab(args.project),args.rows,args.repeats),indent=2))

import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {root,base,compose,token,docker,sql,pause,until,request,account,admission,order,ready,paid,internal,coreReady} from './system.mjs';

mkdirSync(root+'/.artifacts/e2e',{recursive:true});
const proof={startedAt:new Date().toISOString(),passed:false,checks:[]};
const checks=proof.checks;
try {
 docker(['up','-d','--no-deps','--scale','payment=1','payment']);
 await coreReady();
 const admin=(await request('POST','/api/auth/login',null,{email:'admin@ticketbox.com',password:'password123'})).accessToken;
 const now=Date.now();const concert=await request('POST','/api/admin/concerts',admin,{title:'Distributed workflow '+randomUUID(),venueName:'Local acceptance',venueAddress:'Isolated network',eventDate:new Date(now+7*86400000).toISOString(),saleStartAt:new Date(now-60000).toISOString(),saleEndAt:new Date(now+86400000).toISOString()},201);
 const type=await request('POST',`/api/admin/concerts/${concert.id}/ticket-types`,admin,{name:'GA',price:250000,totalQuantity:1000,maxPerAccount:2,zoneColor:'#123456'},201);
 await request('PATCH',`/api/admin/concerts/${concert.id}/status`,admin,{status:'ON_SALE'});
 proof.concertId=concert.id;proof.typeId=type.id;
 const a=await account('e2e-a'),first=await order(a,concert.id,type.id);const initial=await ready(a,first);
 const again=await request('POST',`/api/payments/${first}/initiate`,a.token,{provider:'MOCK'},[200,202]);assert.equal(again.attemptId,initial.attemptId);
 await request('POST',`/api/payments/${first}/initiate`,a.token,{provider:'MOMO'},400);
 await paid(a,first);await paid(a,first);
 assert.equal(Number(sql('payment',`SELECT count(*) FROM payment_attempts WHERE order_id='${first}'`)),1);
 checks.push('Independent Payment DB; immutable intent; duplicate initiate/receipt settles once');

 docker(['stop','payment']);const b=await account('e2e-outage'),second=await order(b,concert.id,type.id);
 await request('POST',`/api/payments/${second}/initiate`,b.token,{provider:'MOCK'},202);
 const intent=JSON.parse(sql('core',`SELECT json_build_object('intentId',intent_id,'requestId',request_id) FROM ticketing_payment_intents WHERE order_id='${second}'`));
 assert.equal(Number(sql('payment',`SELECT count(*) FROM payment_attempts WHERE order_id='${second}'`)),0);
 docker(['start','payment']);await ready(b,second);await paid(b,second);
 assert.equal(sql('payment',`SELECT request_id FROM payment_attempts WHERE order_id='${second}'`),intent.requestId);
 checks.push('Payment outage returns durable pending intent; restart uses original requestId');

 const c=await account('e2e-core-crash'),third=await order(c,concert.id,type.id);await ready(c,third);
 docker(['stop','core']);assert.equal(internal('payment',`/internal/mock/${third}/true`,{}).status,200);
 assert.equal(internal('payment',`/internal/mock/${third}/true`,{}).status,200);
 await until(()=>Number(sql('payment',`SELECT attempts FROM payment_result_outbox o JOIN payment_attempts a ON a.intent_id=o.intent_id WHERE a.order_id='${third}'`))>0);
 const paymentIds=docker(['ps','-q','payment']).trim().split(/\s+/);assert.equal(paymentIds.length,1);
 execFileSync('docker',['kill','--signal','KILL',paymentIds[0]],{encoding:'utf8'});
 docker(['start','payment']);docker(['start','core']);await coreReady();
 await until(async()=>(await request('GET',`/api/payments/${third}/status`,c.token)).orderStatus==='PAID');
 const receipt=JSON.parse(sql('payment',`SELECT payload FROM payment_result_outbox o JOIN payment_attempts a ON a.intent_id=o.intent_id WHERE a.order_id='${third}'`));
 await until(()=>sql('payment',`SELECT state FROM payment_attempts WHERE order_id='${third}'`)==='SUCCEEDED');
 // Simulate an ACK lost after the Core commit by redelivering the exact persisted result.
 sql('payment',`UPDATE payment_result_outbox SET completed_at=NULL,next_attempt_at=now(),lease_owner=NULL,lease_until=NULL WHERE event_id='${receipt.eventId}'`);
 await until(()=>Number(sql('payment',`SELECT count(*) FROM payment_result_outbox WHERE event_id='${receipt.eventId}' AND completed_at IS NULL`))===0);
 assert.equal(Number(sql('core',`SELECT count(*) FROM tickets t JOIN order_items i ON i.id=t.order_item_id WHERE i.order_id='${third}'`)),1);
 assert.equal(Number(sql('core',`SELECT count(*) FROM ticketing_payment_inbox WHERE event_id='${receipt.eventId}'`)),1);
 const invalid={...receipt,eventId:randomUUID(),amount:1};assert.equal(internal('core','/internal/ticketing/payment-results',invalid).status,400);
 checks.push('Core outage + Payment process kill retains money; lost ACK replay does not issue duplicate tickets');

 const d=await account('e2e-late'),late=await order(d,concert.id,type.id);await ready(d,late);
 await request('POST',`/api/mock-payments/${late}/fail`,d.token);
 await until(async()=>(await request('GET',`/api/payments/${late}/status`,d.token)).attemptState==='FAILED');
 const failed=await request('POST',`/api/payments/${late}/initiate`,d.token,{provider:'MOCK'});
 assert.equal(failed.attemptState,'FAILED');assert.equal(failed.paymentUrl,null);
 await request('DELETE',`/api/orders/${late}`,d.token);
 await request('POST',`/api/mock-payments/${late}/success`,d.token);
 await until(()=>sql('payment',`SELECT state FROM payment_attempts WHERE order_id='${late}'`)==='RECONCILIATION_REQUIRED');
 await request('GET','/api/admin/payment-workflows/reviews',a.token,null,403);
 const reviews=await request('GET','/api/admin/payment-workflows/reviews',admin);const review=reviews.refunds.find(row=>row.order_id===late);assert(review);
 const action={actionId:randomUUID(),action:'RECORD_MANUAL_REFUND',caseId:review.request_id,detail:'Local fixture refund reference '+randomUUID()};
 await request('POST',`/api/admin/payment-workflows/${late}/review`,admin,action);
 await request('POST',`/api/admin/payment-workflows/${late}/review`,admin,action);
 assert.equal(Number(sql('payment',`SELECT count(*) FROM payment_audit WHERE id='${action.actionId}'`)),1);
 assert.equal(Number(sql('core',`SELECT count(*) FROM tickets t JOIN order_items i ON i.id=t.order_item_id WHERE i.order_id='${late}'`)),0);
 proof.refundReview={orderId:late,requestId:review.request_id,actionId:action.actionId,state:'RESOLVED_MANUALLY',fixtureOnly:true};
 checks.push('FAILED sessions expose no payment URL; later success never resurrects cancelled stock; compensation is audited');

 const e=await account('e2e-broker'),brokerOrder=await order(e,concert.id,type.id);await ready(e,brokerOrder);
 docker(['stop','rabbitmq']);await paid(e,brokerOrder);
 assert.equal(Number(sql('notification',`SELECT count(*) FROM notifications WHERE user_id='${e.id}'`)),0);
 docker(['start','rabbitmq']);
 await until(()=>Number(sql('notification',`SELECT count(*) FROM notifications WHERE user_id='${e.id}' AND channel='EMAIL' AND status='SENT'`))===1,180000);
 checks.push('Broker outage does not roll back paid tickets; durable publication recovers notification');

 const f=await account('e2e-redis'),oldAccess=await admission(f,concert.id);
 const before=Number(sql('core',`SELECT available_qty FROM ticket_inventory WHERE ticket_type_id='${type.id}'`));
 docker(['stop','redis']);await request('POST',`/api/reservations/concerts/${concert.id}/ticket-types/${type.id}/reserve`,f.token,{quantity:1},503,{'Queue-Access-Token':oldAccess});
 assert.equal(Number(sql('core',`SELECT available_qty FROM ticket_inventory WHERE ticket_type_id='${type.id}'`)),before);
 docker(['start','redis']);await pause(3000);
 const fourth=await order(f,concert.id,type.id,oldAccess);await ready(f,fourth);await paid(f,fourth);
 const lost=await account('e2e-lost-state'),stale=await admission(lost,concert.id);
 assert.equal(sql('core','SELECT current_database()'),'ticketbox_core');
 docker(['exec','-T','redis','redis-cli','FLUSHDB']);
 await request('POST',`/api/reservations/concerts/${concert.id}/ticket-types/${type.id}/reserve`,lost.token,{quantity:1},[403,409,503],{'Queue-Access-Token':stale});
 const renewed=await admission(lost,concert.id);assert.notEqual(renewed,stale);
 const afterLoss=await order(lost,concert.id,type.id,renewed);await ready(lost,afterLoss);await paid(lost,afterLoss);
 checks.push('Redis outage fails closed; AOF restart keeps access; actual state loss invalidates old session and permits fresh admission');

 docker(['up','-d','--no-deps','--scale','payment=2','payment']);
 assert.equal(docker(['ps','-q','payment']).trim().split(/\s+/).length,2);
 const scaleUsers=await Promise.all([account('e2e-scale-a'),account('e2e-scale-b')]);
 const scaled=await Promise.all(scaleUsers.map(async u=>{const id=await order(u,concert.id,type.id);await ready(u,id);await paid(u,id);return id;}));
 checks.push('Payment scales to two processes on its own DB with one settlement per order');

 const started=performance.now(),latencies=[];let active=0,dropped=0,errors=0;const running=[];
 for(let i=0;i<1000;i++){
  await pause(Math.max(0,started+i*10-performance.now()));
  if(active>=32){dropped++;continue;}active++;
  running.push((async()=>{const time=performance.now();try{const r=await fetch(base+(i%2?'/api/concerts':`/api/concerts/${concert.id}/availability`),{signal:AbortSignal.timeout(5000)});if(r.status!==200)errors++;await r.arrayBuffer();}catch{errors++;}finally{latencies.push(performance.now()-time);active--;}})());
 }
 await Promise.all(running);latencies.sort((a,b)=>a-b);
 proof.load={offeredRps:100,scheduled:1000,achieved:latencies.length,dropped,errors,seconds:(performance.now()-started)/1000,p95Ms:Math.round(latencies[Math.ceil(latencies.length*.95)-1]),p99Ms:Math.round(latencies[Math.ceil(latencies.length*.99)-1]),maxConcurrency:32};
 assert.equal(errors,0);assert.equal(dropped,0);assert(proof.load.p99Ms<2000);
 checks.push('Bounded local read load: 100 RPS offered, explicit achieved/dropped/error/latency evidence');

 assert.equal(sql('core',"SELECT has_table_privilege('core_runtime','payment_attempts','SELECT') OR has_table_privilege('core_runtime','payment_logs','INSERT')"),'f');
 assert.equal((await fetch(base+'/internal/ticketing/payment-results')).status,404);
 const guard=['-f','scripts/e2e/fixtures/embedded-guard.yaml','up','-d','--no-deps','core'];docker(guard);
 await until(()=>{const id=docker(['ps','-a','-q','core']).trim();return execFileSync('docker',['inspect','-f','{{.State.Status}}',id],{encoding:'utf8'}).trim()==='exited';},90000);
 assert(docker(['logs','--no-color','core']).includes('routing alone is unsafe'));
 docker(['up','-d','--no-deps','core']);await coreReady();
 checks.push('Legacy DB writes fenced; embedded rollback startup is refused after cutover; remote redeploy resumes');
 await until(()=>Number(sql('payment',"SELECT count(*) FROM payment_result_outbox WHERE completed_at IS NULL"))===0);
 await until(()=>Number(sql('notification',"SELECT count(*) FROM notifications WHERE channel='EMAIL' AND status='PENDING'"))===0);
 proof.stock=JSON.parse(sql('core',`SELECT json_build_object('total',s.total_quantity,'available',s.available_qty,'held',coalesce(h.qty,0),'allocated',coalesce(o.qty,0))
 FROM ticket_inventory s LEFT JOIN(SELECT ticket_type_id,sum(quantity) qty FROM ticket_holds GROUP BY ticket_type_id)h ON h.ticket_type_id=s.ticket_type_id
 LEFT JOIN(SELECT i.ticket_type_id,sum(i.quantity)qty FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.status IN ('PAID','AWAITING_PAYMENT') GROUP BY i.ticket_type_id)o ON o.ticket_type_id=s.ticket_type_id WHERE s.ticket_type_id='${type.id}'`));
 assert.equal(proof.stock.available+proof.stock.held+proof.stock.allocated,proof.stock.total);
 proof.orders=[first,second,third,brokerOrder,fourth,afterLoss,...scaled];
 assert.equal(Number(sql('core',`SELECT count(*) FROM tickets WHERE concert_id='${concert.id}'`)),proof.orders.length);
 proof.passed=true;
}finally{
 proof.completedAt=new Date().toISOString();writeFileSync(root+'/.artifacts/e2e/distributed-journey.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
}

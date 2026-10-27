import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {root,project,compose,docker,sql,databases,until,coreReady,request,pause} from './system.mjs';

const directory=root+'/.artifacts/e2e/backups';mkdirSync(directory,{recursive:true});
const proof={startedAt:new Date().toISOString(),passed:false,databases:[],localRpo:'Quiesced checkpoint: zero committed rows lost',localRtoTargetSeconds:300};
const suffix=randomUUID().replaceAll('-','').slice(0,8);const started=performance.now();
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const identifiers=/^[a-zA-Z0-9_]+$/;
let validationRedis;
function volumeBackup(name){
 assert(name.startsWith(project+'_'));
 const metadata=JSON.parse(execFileSync('docker',['volume','inspect',name],{encoding:'utf8'}))[0];
 assert.equal(metadata.Labels['com.docker.compose.project'],project);
 return execFileSync('docker',['run','--rm','-v',name+':/data:ro','alpine:3.20','tar','cf','-','-C','/data','.'],{maxBuffer:128*1024*1024});
}
function restoreVolume(name,bytes){
 assert(name.startsWith(project+'_restore_'));
 execFileSync('docker',['run','--rm','-i','-v',name+':/data','alpine:3.20','tar','xf','-','-C','/data'],{input:bytes,maxBuffer:128*1024*1024});
}
function fileManifest(name){
 const result=execFileSync('docker',['run','--rm','-v',name+':/data:ro','alpine:3.20','sh','-c','cd /data && find . -type f -exec sha256sum {} +'],{encoding:'utf8'});
 return result.trim().split('\n').sort().join('\n');
}
try {
 await coreReady();
 assert.equal(Number(sql('payment',"SELECT count(*) FROM payment_result_outbox WHERE completed_at IS NULL")),0);
 assert.equal(Number(sql('notification',"SELECT count(*) FROM notifications WHERE channel='EMAIL' AND status='PENDING'")),0);
 await until(()=>Number(sql('core',"SELECT count(*) FROM event_publication WHERE completion_date IS NULL"))===0);
 const mailStats=()=>JSON.parse(docker(['exec','-T','smtp','node','-e',"fetch('http://localhost:8080/stats').then(r=>r.text()).then(console.log)"]));
 const mailBefore=mailStats();
 const fixture=randomUUID();docker(['exec','-T','redis','redis-cli','SET','e2e:restore-fixture',fixture]);
 docker(['exec','-T','core','sh','-c','cat > /app/data/e2e-restore-fixture.txt'],{input:fixture});
 // Stop all domain writers, including both Payment replicas, before the checkpoint.
 docker(['stop','core','payment','notification']);docker(['stop','redis']);
 for(const [name,[service,user,database]] of Object.entries(databases)){
  assert.equal(sql(name,'SELECT current_database()'),database);
  const bytes=docker(['exec','-T',service,'pg_dump','-Fc','-U',user,'-d',database],{encoding:undefined});
  writeFileSync(`${directory}/${name}.dump`,bytes);
  const restored=database+'_restore_'+suffix;sql(name,`CREATE DATABASE "${restored}"`);
  docker(['exec','-T',service,'pg_restore','--exit-on-error','--no-owner','-U',user,'-d',restored],{input:bytes});
  const tables=sql(name,"SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name").split('\n').filter(Boolean);
  const inventory=[];
  for(const table of tables){
   assert(identifiers.test(table));
   const query=`COPY (SELECT row_to_json(t)::text FROM public."${table}" t ORDER BY row_to_json(t)::text) TO STDOUT`;
   const original=sql(name,query),copy=sql(name,query,restored);assert.equal(digest(original),digest(copy),`${name}.${table}`);
   inventory.push({table,sha256:digest(original),rows:Number(sql(name,`SELECT count(*) FROM public."${table}"`))});
  }
  proof.databases.push({name,restoredDatabase:restored,dumpSha256:digest(bytes),tables:inventory});
 }
 const artifacts=volumeBackup(project+'_core_artifacts');writeFileSync(directory+'/core-artifacts.tar',artifacts);
 const artifactTarget=project+'_restore_artifacts_'+suffix;restoreVolume(artifactTarget,artifacts);
 const manifest=fileManifest(project+'_core_artifacts');assert.equal(fileManifest(artifactTarget),manifest);
 proof.artifacts={dumpSha256:digest(artifacts),manifestSha256:digest(manifest),restoredVolume:artifactTarget};
 const redis=volumeBackup(project+'_redis_data');writeFileSync(directory+'/redis-aof.tar',redis);
 const redisTarget=project+'_restore_redis_'+suffix;restoreVolume(redisTarget,redis);
 validationRedis=project+'-redis-restore-'+suffix;
 execFileSync('docker',['run','--rm','-d','--name',validationRedis,'-v',redisTarget+':/data','redis:7-alpine','redis-server','--appendonly','yes','--maxmemory-policy','noeviction'],{encoding:'utf8'});
 await until(()=>execFileSync('docker',['exec',validationRedis,'redis-cli','GET','e2e:restore-fixture'],{encoding:'utf8'}).trim()===fixture,30000);
 proof.redis={dumpSha256:digest(redis),restoredVolume:redisTarget,fixtureRecovered:true};
 const restoreMap=Object.fromEntries(proof.databases.map(d=>[d.name,d.restoredDatabase]));
 const overlay=root+'/.artifacts/e2e/restore-overlay.yml';
 writeFileSync(overlay,`services:
  core:
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://core-db:5432/${restoreMap.core}
    volumes: [restored_core_artifacts:/app/data]
  payment:
    environment:
      PAYMENT_DATABASE_URL: jdbc:postgresql://payment-db:5432/${restoreMap.payment}
  notification:
    environment:
      NOTIFICATION_DATABASE_URL: jdbc:postgresql://notification-db:5432/${restoreMap.notification}
  redis:
    volumes: [restored_redis:/data]
volumes:
  restored_core_artifacts:
    external: true
    name: ${artifactTarget}
  restored_redis:
    external: true
    name: ${redisTarget}
`);
 docker(['-f',overlay,'up','-d','--no-deps','--scale','payment=2','redis','core','payment','notification']);await coreReady();
 const admin=(await request('POST','/api/auth/login',null,{email:'admin@ticketbox.com',password:'password123'})).accessToken;
 const history=await until(async()=>{try{return await request('GET','/api/admin/notifications',admin);}catch{return false;}});
 assert.equal(history.totalElements,Number(sql('notification','SELECT count(*) FROM notifications',restoreMap.notification)));
 const orders=await request('GET','/api/admin/orders',admin);const orderCount=Array.isArray(orders)?orders.length:orders.totalElements;
 assert.equal(orderCount,Number(sql('core','SELECT count(*) FROM orders',restoreMap.core)));
 await request('GET','/api/admin/payment-workflows/reviews',admin);
 assert.equal(docker(['exec','-T','core','cat','/app/data/e2e-restore-fixture.txt']).trim(),fixture);
 assert.equal(docker(['exec','-T','redis','redis-cli','GET','e2e:restore-fixture']).trim(),fixture);
 await pause(4000);assert.equal(mailStats().accepted,mailBefore.accepted,'Restore must not resend historical SENT mail');
 proof.applicationRestored={login:true,orderHistory:orderCount,notificationHistory:history.totalElements,reviewApi:true,artifacts:true,redis:true,noHistoricalResend:true};
 docker(['up','-d','--no-deps','--scale','payment=2','redis','core','payment','notification']);await coreReady();
 proof.seconds=Math.round((performance.now()-started)/10)/100;
 assert(proof.seconds<=proof.localRtoTargetSeconds,'Local restore exceeded the declared acceptance target');
 proof.passed=true;
}finally{
 if(validationRedis)try{execFileSync('docker',['stop','--time','5',validationRedis],{encoding:'utf8'});}catch{}
 // Preserve the original checkpoint and validation databases/volumes for review.
 if(!proof.passed){
  try{docker(['stop','core','payment','notification']);}catch{}
  proof.recovery='Keep domain writers stopped. Original databases/volumes were not overwritten; inspect evidence, then start the standard remote compose configuration.';
 }
 proof.completedAt=new Date().toISOString();writeFileSync(root+'/.artifacts/e2e/restore.json',JSON.stringify(proof,null,2));
 console.log(JSON.stringify({passed:proof.passed,databases:proof.databases.map(d=>({name:d.name,tables:d.tables.length})),seconds:proof.seconds,artifacts:proof.artifacts,redis:proof.redis},null,2));
}

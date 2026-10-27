import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const project=process.env.E2E_PROJECT||'ticketbox-e2e';
assert(/^ticketbox-e2e(?:-[a-z0-9-]+)?$/.test(project),'Fault and restore tests require an isolated ticketbox-e2e project');
const port=process.env.E2E_PORT||'18092';
export const base=`http://localhost:${port}`;
export const compose=['compose','-p',project,'-f','compose.yaml'];
export const token=process.env.PAYMENT_SERVICE_TOKEN||'ticketbox-local-payment-service-token-change-before-deploy';
export const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function docker(args,options={}){return execFileSync('docker',[...compose,...args],{cwd:root,env:{...process.env,APP_PORT:port,APP_PUBLIC_URL:base,APP_ALLOWED_ORIGINS:base,PAYMENT_SERVICE_TOKEN:token},encoding:'utf8',maxBuffer:128*1024*1024,...options});}
export const databases={core:['core-db','core_owner','ticketbox_core'],payment:['payment-db','payment_owner','ticketbox_payments'],notification:['notification-db','notification_owner','ticketbox_notifications']};
export function sql(name,text,database){
 const [service,user,original]=databases[name];
 assert(!database||database===original||new RegExp(`^${original}_restore_[a-f0-9]{8}$`).test(database));
 return docker(['exec','-T',service,'psql','-X','-A','-t','-v','ON_ERROR_STOP=1','-U',user,'-d',database||original,'-c',text]).trim();
}
export async function until(check,timeout=120000){
 const deadline=Date.now()+timeout;let error;
 while(Date.now()<deadline){try{const value=await check();if(value)return value;}catch(failure){error=failure;}await pause(1000);}
 throw error||new Error('Timed out');
}
export async function request(method,url,auth,body,expected=200,extra={}){
 const headers={'Content-Type':'application/json',...extra};if(auth)headers.Authorization=`Bearer ${auth}`;
 const accepted=Array.isArray(expected)?expected:[expected];
 for(let retry=0;retry<20;retry++){
  const response=await fetch(base+url,{method,headers,body:body==null?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if([429,503].includes(response.status)&&!accepted.includes(response.status)){
   await response.arrayBuffer();await pause(Math.max(1,Number(response.headers.get('Retry-After'))||1)*1000);continue;
  }
  assert(accepted.includes(response.status),`${method} ${url}: expected ${accepted}, received ${response.status}`);
  const json=await response.json();return json.data;
 }
 throw new Error('Overload retries exhausted: '+url);
}
export async function account(prefix){
 const email=`${prefix}-${randomUUID()}@ticketbox.test`,password='JourneyPassword123';
 const user=await request('POST','/api/auth/register',null,{email,password,fullName:'End-to-end test user'},201);
 const login=await request('POST','/api/auth/login',null,{email,password});return {id:user.id,token:login.accessToken};
}
export async function admission(user,concert){
 const url=`/api/queue/concerts/${concert}`;
 await until(async()=>{try{await request('POST',url+'/join',user.token);return true;}catch{return false;}},30000);
 return until(async()=>{const status=await request('GET',url+'/status',user.token);return status.queueAccessToken;});
}
export async function order(user,concert,type,existingToken){
 const access=existingToken||await admission(user,concert);const headers={'Queue-Access-Token':access,'Idempotency-Key':randomUUID()};
 await request('POST',`/api/reservations/concerts/${concert}/ticket-types/${type}/reserve`,user.token,{quantity:1},200,headers);
 return (await request('POST','/api/orders',user.token,{concertId:concert,items:[{ticketTypeId:type,quantity:1}]},201,headers)).id;
}
export async function ready(user,orderId){
 await request('POST',`/api/payments/${orderId}/initiate`,user.token,{provider:'MOCK'},[200,202]);
 return until(async()=>{const status=await request('GET',`/api/payments/${orderId}/status`,user.token);return status.attemptState==='READY'&&status;});
}
export async function paid(user,orderId){
 await request('POST',`/api/mock-payments/${orderId}/success`,user.token);
 await until(async()=>(await request('GET',`/api/payments/${orderId}/status`,user.token)).orderStatus==='PAID');
}
export function internal(service,url,body){
 const program=`fetch('http://${service}:8080'+process.argv[1],{method:'POST',headers:{'Content-Type':'application/json','X-Service-Token':process.argv[3]},body:process.argv[2]}).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.text()}))).catch(e=>{console.error(e.message);process.exitCode=1})`;
 return JSON.parse(docker(['exec','-T','smtp','node','-e',program,url,JSON.stringify(body),token]));
}
export async function coreReady(){return until(async()=>(await fetch(base+'/api/health',{signal:AbortSignal.timeout(3000)})).ok,240000);}

// Run against `npm run build` output. Requires Playwright + Chromium (or the Playwright Docker image).
// PLAYWRIGHT_MODULE can point to an installed playwright/index.mjs outside the repository dependencies.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE
 ?pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href:'playwright');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const output=resolve(root,process.env.CHECKOUT_UI_OUTPUT||'.artifacts/e2e/checkout');
mkdirSync(output,{recursive:true});
const dist=resolve(root,'frontend/dist');
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const path=resolve(dist,'.'+pathname);
 const file=path.startsWith(dist+sep)&&existsSync(path)&&extname(path)?path:resolve(dist,'index.html');
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream';
 res.writeHead(200,{'Content-Type':mime});res.end(readFileSync(file));
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
const checks=[];
const user={id:'11111111-1111-4111-8111-111111111111',email:'checkout@test.local',fullName:'Checkout Test',role:'AUDIENCE'};
const jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({...user,sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
const concertId='22222222-2222-4222-8222-222222222222';
const typeId='33333333-3333-4333-8333-333333333333';
const orderId='44444444-4444-4444-8444-444444444444';
const expiresAt=new Date(Date.now()+900000).toISOString();
const concert={id:concertId,title:'Checkout recovery',venueName:'Test venue',venueAddress:'Local',eventDate:new Date(Date.now()+86400000).toISOString(),saleStartAt:new Date(Date.now()-60000).toISOString(),saleEndAt:expiresAt,status:'ON_SALE',posterUrl:null,ticketTypes:[]};
const order={id:orderId,concertId,concertTitle:concert.title,status:'AWAITING_PAYMENT',totalAmount:250000,paymentUrl:null,expiresAt,createdAt:new Date().toISOString(),items:[{id:typeId,ticketTypeId:typeId,ticketTypeName:'GA',unitPrice:250000,quantity:1,subtotal:250000}]};
const basketState={event:{id:concertId,title:concert.title,venue:concert.venueName,date:concert.eventDate,image:null},selection:[{id:typeId,name:'GA',price:250000,quantity:1}],queueAccessToken:'queue-fixture'};

async function fixture(options={}) {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.addCookies([{name:'ticketbox_auth_token',value:jwt,url:origin}]);
 const page=await context.newPage();
 const state={attempt:'FAILED',committed:false,postKeys:[],cancelCalls:0,orderStatus:'AWAITING_PAYMENT',...options};
 const reply=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},body:JSON.stringify({code:status,data,message:status===409?'Request has already been processed':'OK'})});
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(path.startsWith('/api/')) {
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});
   if(path==='/api/auth/me')return reply(route,user);
   if(path==='/api/orders/by-idempotency-key')return reply(route,state.committed?{...order,status:state.orderStatus}:null,state.committed?200:404);
   if(path==='/api/orders'&&req.method()==='POST') {
    state.postKeys.push(req.headers()['idempotency-key']);
    if(state.createMode==='pending')return reply(route,null,409);
    state.committed=true;
    if(state.createMode==='lost')return route.abort('failed');
    if(state.createMode==='reload')return; // The browser reload interrupts the withheld response.
    return reply(route,order,201);
   }
   if(path===`/api/orders/${orderId}`) {
    if(req.method()==='DELETE') {state.cancelCalls++;if(state.cancelConflict)return reply(route,null,409);state.orderStatus='CANCELLED';}
    return reply(route,{...order,status:state.orderStatus});
   }
   if(path===`/api/payments/${orderId}/status`)return reply(route,{orderId,orderStatus:state.orderStatus,provider:'MOCK',attemptId:'attempt',attemptState:state.attempt,paymentUrl:state.attempt==='READY'?'/mock-pay':null});
   if(path===`/api/payments/${orderId}/initiate`) {state.attempt='FAILED';return reply(route,{orderId,provider:'MOCK',attemptId:'attempt',attemptState:'FAILED',paymentUrl:null});}
   if(path===`/api/concerts/${concertId}`)return reply(route,concert);
   if(path==='/api/concerts')return reply(route,{content:[],totalPages:0,totalElements:0});
   if(path.includes('/queue/'))return reply(route,{status:'WAITING',position:1,peopleAhead:0,estimatedWaitSeconds:1,queueAccessToken:null,sessionExpiresAt:null,waitingRoomCount:1,queueSize:1,activeShoppers:0});
   if(path.includes('/notifications'))return reply(route,{count:0,content:[]});
   return reply(route,[]);
  }
  if(url.origin!==origin)return route.abort();
  return route.continue();
 });
 return {page,state,close:()=>context.close()};
}
async function startCreate(page) {
 await page.goto(origin);
 await page.evaluate(state=>{history.replaceState({usr:state,key:'test',idx:0},'','/checkout');},basketState);
 await page.reload();
}
const failedHeading=page=>page.getByRole('heading',{name:'Phiên thanh toán đã thất bại'});
const waitFor=async check=>{for(let n=0;n<100;n++){if(await check())return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out waiting for test condition');};
try {
 {
  const f=await fixture();await f.page.goto(origin+`/checkout?orderId=${orderId}`);
  await failedHeading(f.page).waitFor();
  assert.equal(await f.page.getByRole('button',{name:'Tiếp tục với thanh toán demo'}).count(),0);
  for(const [width,height] of [[1440,900],[768,1024],[390,844]]) {
   await f.page.setViewportSize({width,height});
   assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await f.page.screenshot({path:resolve(output,`failed-${width}.png`),fullPage:true});
  }
  await f.page.getByRole('button',{name:'Hủy đơn và chọn vé lại'}).click();
  await f.page.waitForURL(`**/concerts/${concertId}/waiting-room`);assert.equal(f.state.cancelCalls,1);
  checks.push('FAILED restore blocks payment; cancellation precedes new queue; 3 responsive viewports');await f.close();
 }
 {
  const f=await fixture({attempt:'READY'});await f.page.goto(origin+`/checkout?orderId=${orderId}`);
  await f.page.getByRole('button',{name:'Tiếp tục với thanh toán demo'}).click();await failedHeading(f.page).waitFor();
  checks.push('FAILED returned by initiate switches to recovery panel');await f.close();
 }
 {
  const f=await fixture();await f.page.goto(origin+`/payment/result?orderId=${orderId}`);await failedHeading(f.page).waitFor();
  checks.push('Server FAILED return redirects to failed checkout without relying on provider query hints');await f.close();
 }
 {
  const f=await fixture({createMode:'lost',attempt:'READY'});await startCreate(f.page);
  await f.page.waitForURL(`**/checkout?orderId=${orderId}`);assert.equal(f.state.postKeys.length,1);
  await f.page.getByRole('button',{name:'Tiếp tục với thanh toán demo'}).waitFor();
  checks.push('Lost create response recovers committed order without second POST');await f.close();
 }
 {
  const f=await fixture({createMode:'reload',attempt:'READY'});await startCreate(f.page);
  await waitFor(()=>f.state.postKeys.length===1);assert(f.state.committed);
  const key=await f.page.evaluate(()=>JSON.parse(sessionStorage.getItem('ticketbox.checkout-request')).key);
  assert.equal(key,f.state.postKeys[0]);
  await f.page.reload();await f.page.waitForURL(`**/checkout?orderId=${orderId}`);assert.equal(f.state.postKeys.length,1);
  await f.page.getByRole('button',{name:'Tiếp tục với thanh toán demo'}).waitFor();
  checks.push('Reload during missing response retains command identity and recovers without consumed queue access');await f.close();
 }
 {
  const f=await fixture({createMode:'reload',attempt:'READY'});await startCreate(f.page);
  await f.page.waitForURL(`**/checkout?orderId=${orderId}`,{timeout:25000});
  assert.equal(f.state.postKeys.length,1);
  await f.page.getByRole('button',{name:'Tiếp tục với thanh toán demo'}).waitFor();
  checks.push('Silent missing create response times out and recovers automatically without a duplicate POST');await f.close();
 }
 {
  const f=await fixture({createMode:'pending',attempt:'READY'});await startCreate(f.page);
  const retry=f.page.getByRole('button',{name:'Kiểm tra lại đơn',exact:true});await retry.waitFor();
  assert.equal(new URL(f.page.url()).pathname,'/checkout');assert.equal(f.state.postKeys.length,1);
  await f.page.screenshot({path:resolve(output,'pending-recovery.png'),fullPage:true});
  f.state.committed=true;await retry.click();await f.page.waitForURL(`**/checkout?orderId=${orderId}`);
  assert.equal(f.state.postKeys.length,1);
  checks.push('Unresolved 409 stays recoverable; explicit retry finds original order without writing again');await f.close();
 }
 {
  const f=await fixture({createMode:'pending',attempt:'READY'});await startCreate(f.page);
  const retry=f.page.getByRole('button',{name:'Kiểm tra lại đơn',exact:true});await retry.waitFor();
  f.state.createMode='normal';await retry.click();await f.page.waitForURL(`**/checkout?orderId=${orderId}`);
  assert.equal(f.state.postKeys.length,2);assert.equal(new Set(f.state.postKeys).size,1);
  checks.push('Retry with no committed order reuses the same command key');await f.close();
 }
 {
  const f=await fixture({cancelConflict:true});await f.page.goto(origin+`/checkout?orderId=${orderId}`);await failedHeading(f.page).waitFor();
  await f.page.getByRole('button',{name:'Hủy đơn và chọn vé lại'}).click();await f.page.getByRole('alert').waitFor();
  assert.equal(new URL(f.page.url()).pathname,'/checkout');f.state.orderStatus='PAID';
  await f.page.getByRole('button',{name:'Kiểm tra trạng thái đơn'}).click();await f.page.waitForURL('**/booking-confirmation');
  assert.equal(f.state.postKeys.length,0);
  checks.push('Late paid result wins cancellation: refresh opens confirmation and never starts new purchase');await f.close();
 }
 console.log(JSON.stringify({passed:true,checks},null,2));
 writeFileSync(resolve(output,'results.json'),JSON.stringify({passed:true,checks},null,2));
} finally {await browser.close();await new Promise(done=>server.close(done));}

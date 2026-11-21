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
const dist=resolve(root,process.env.CHECKOUT_UI_DIST||'frontend/dist');
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
 const context=await browser.newContext({locale:'vi-VN',viewport:{width:1440,height:900}});
 const fixtureUser=options.fixtureUser??user;
 const fixtureToken=fixtureUser===user?jwt:'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({...fixtureUser,sub:fixtureUser.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
 if(options.authenticated!==false) await context.addCookies([{name:'ticketbox_auth_token',value:fixtureToken,url:origin}]);
 const page=await context.newPage();
 const state={attempt:'FAILED',committed:false,postKeys:[],paymentAttempts:0,cancelCalls:0,orderStatus:'AWAITING_PAYMENT',resetRequests:[],resetConfirmations:[],...options};
 const currentOrder=()=>({...order,...state.orderDetails,status:state.orderStatus});
 const reply=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},body:JSON.stringify({code:status,data,message:status===409?'Request has already been processed':'OK'})});
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(path.startsWith('/api/')) {
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});
   if(path==='/api/auth/me')return reply(route,fixtureUser,state.authStatus??200);
   if(path==='/api/auth/password-reset') {
    state.resetRequests.push(req.postDataJSON());
    return reply(route,null,state.resetRequestStatus??202);
   }
   if(path==='/api/auth/password-reset/confirm') {
    state.resetConfirmations.push({body:req.postDataJSON(),referer:req.headers().referer});
    return reply(route,null,state.resetConfirmStatus??200);
   }
   if(path==='/api/users/me/profile')return reply(route,{...user,phone:null});
   if(path==='/api/orders/my')return reply(route,[currentOrder()]);
   if(path==='/api/orders/by-idempotency-key')return reply(route,state.committed?currentOrder():null,state.committed?200:404);
   if(path==='/api/orders'&&req.method()==='POST') {
    state.postKeys.push(req.headers()['idempotency-key']);
    if(state.createMode==='pending')return reply(route,null,409);
    state.committed=true;
    if(state.createMode==='lost')return route.abort('failed');
    if(state.createMode==='reload')return; // The browser reload interrupts the withheld response.
    return reply(route,currentOrder(),201);
   }
   if(path===`/api/orders/${orderId}`) {
    if(req.method()==='DELETE') {state.cancelCalls++;if(state.cancelConflict)return reply(route,null,409);state.orderStatus=state.cancelResult??'CANCELLED';}
    return reply(route,currentOrder(),state.orderAccessCode??200);
   }
   if(path==='/api/payments/providers') return reply(route,state.providers??['MOCK']);
   if(path===`/api/payments/${orderId}/status`)return reply(route,{orderId,orderStatus:state.orderStatus,provider:'MOCK',attemptId:'attempt',attemptState:state.attempt,paymentUrl:state.attempt==='READY'?'/mock-pay':null},state.paymentStatusCode??200);
   if(path===`/api/payments/${orderId}/initiate`) {
    state.paymentAttempts++;
    state.attempt=state.initiateState??'FAILED';
    return reply(route,{orderId,provider:'MOCK',attemptId:'attempt',attemptState:state.attempt,paymentUrl:null},state.attempt==='PROCESSING'?202:200);
   }
   if(path===`/api/concerts/${concertId}`)return reply(route,{...concert,organizationName:state.organizationName},state.concertStatus??200);
   if(path==='/api/tickets' && state.orderStatus==='PAID')return reply(route,[{
    id:'fixture-issued-ticket',concertId,concertTitle:concert.title,ticketTypeId:typeId,ticketTypeName:'GA',
    qrCode:'fixture-issued-qr',status:'VALID',issuedAt:order.createdAt,
   }]);
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
async function checkBuyerInformation(destination) {
 for(const [name,value] of [['Hỗ trợ TicketBox',process.env.VITE_SUPPORT_URL],['Điều kiện mua và hoàn vé',process.env.VITE_TERMS_URL]]) {
  const link=destination.getByRole('link',{name,exact:true});
  if(value?.startsWith('https://')) {
   assert.equal(await link.getAttribute('href'),new URL(value).href);
   await link.focus();assert(await link.evaluate(node=>node===document.activeElement));
  } else assert.equal(await link.count(),0);
 }
}
try {
 {
  const otherBuyer={...user,id:'55555555-5555-4555-8555-555555555555',email:'other@example.test'};
  for(const options of [
   {fixtureUser:otherBuyer,orderAccessCode:404,orderStatus:'PAID'},
   {orderStatus:'CANCELLED'},
  ]) {
   const f=await fixture(options);
   await f.page.goto(origin);
   await f.page.evaluate((snapshot)=>history.replaceState({usr:{order:snapshot},key:'stale'},'','/booking-confirmation'),{...order,status:'PAID'});
   await f.page.reload();
   const heading=f.page.getByRole('heading',{level:1});
   await heading.waitFor();
   assert.notEqual(await heading.textContent(),'Đặt vé thành công','A paid order saved in browser history is not proof for the current account');
   await f.page.getByRole('heading',{name:'Chưa thể xác nhận đơn hàng'}).waitFor();
   assert.equal(await f.page.getByText(order.concertTitle,{exact:true}).count(),0);
   assert.equal(await f.page.getByRole('link',{name:'Xem vé của tôi'}).count(),0);
   await f.close();
  }
  checks.push('Stale browser history cannot disclose another buyer’s order or confirm an order the server closed');
 }
 {
  const amount=259000;
  const f=await fixture({attempt:'READY',orderDetails:{totalAmount:amount}});
  await f.page.setViewportSize({width:390,height:844});
  await f.page.goto(origin+`/checkout?orderId=${orderId}`);
  const pay=f.page.getByRole('button',{name:'Tiếp tục với thanh toán demo'});
  await pay.waitFor();
  assert.equal(await f.page.getByText(/^(Hạn|Thời gian) thanh toán$/i).count(),1,'Checkout must show one payment deadline');
  const amountLabel=new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(amount);
  const action=f.page.locator('.purchase-action-bar');
  await action.getByText(amountLabel,{exact:true}).waitFor();
  assert.equal(await action.getByRole('button',{name:'Tiếp tục với thanh toán demo'}).count(),1);
  for(const [language,name] of [['vi','Ngôn ngữ'],['en','Ngôn ngữ']]) {
   await f.page.getByRole('combobox',{name}).selectOption(language);
   for(const [width,height] of [[320,844],[390,844],[834,1024],[1440,900]]) {
    await f.page.setViewportSize({width,height});
    assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await f.page.screenshot({path:resolve(output,`checkout-ready-${language}-${width}.png`),fullPage:true});
   }
  }
  await f.page.setViewportSize({width:390,height:844});
  const rect=await action.boundingBox();
  assert(rect && rect.y>=0 && rect.y+rect.height<=844,'Total and continue must be in view on mobile');
  assert.equal(f.state.paymentAttempts,0);
  checks.push('Checkout shows a single deadline and a mobile action with the verified restored order total');await f.close();
 }
 {
  const f=await fixture({attempt:'PROCESSING'});
  await f.page.goto(origin+`/checkout?orderId=${orderId}`);
  await f.page.getByRole('link',{name:'Kiểm tra trạng thái đơn'}).click();
  await f.page.waitForURL(`**/payment/result?orderId=${orderId}`);
  await f.page.getByRole('heading',{name:'Đang xác nhận thanh toán'}).waitFor();
  assert.equal(await f.page.getByRole('button',{name:/Tiếp tục với/}).count(),0);
  assert.equal(f.state.paymentAttempts,0);
  checks.push('A restored attempt under verification offers the same order and never initializes again');await f.close();
 }
 {
  const f=await fixture({attempt:'UNKNOWN'});
  await f.page.setViewportSize({width:390,height:844});
  await f.page.goto(origin+`/payment/result?orderId=${orderId}`);
  await f.page.getByText(/Cổng thanh toán chưa trả kết quả rõ ràng/).waitFor();
  await f.page.screenshot({path:resolve(output,'checkout-verifying.png'),fullPage:true});
  f.state.orderDetails={expiresAt:new Date(Date.now()-1000).toISOString()};
  await f.page.getByRole('heading',{name:'Đã qua hạn thanh toán'}).waitFor();
  await f.page.getByText(/giao dịch vẫn đang được kiểm tra/i).waitFor();
  await f.page.screenshot({path:resolve(output,'checkout-expired-verifying.png'),fullPage:true});
  assert.equal(await f.page.getByRole('link',{name:'Quay lại đơn thanh toán'}).count(),0);
  await f.page.getByRole('link',{name:'Xem lịch sử đơn hàng'}).click();
  await f.page.getByRole('region',{name:'Lịch sử đơn hàng'}).waitFor();
  assert.equal(f.state.paymentAttempts,0);
  assert.equal(f.state.postKeys.length,0);
  checks.push('A transaction still under verification after the deadline offers only order history');await f.close();
 }
 {
  const f=await fixture({orderStatus:'PAID',attempt:'SUCCEEDED',concertStatus:503,paymentStatusCode:503});
  await f.page.goto(origin+`/payment/result?orderId=${orderId}`);
  await f.page.getByRole('heading',{name:'Đặt vé thành công'}).waitFor();
  await f.page.getByRole('heading',{name:concert.title}).waitFor();
  assert.equal(await f.page.locator('.mini-qr').count(),0);
  assert.equal(await f.page.getByLabel('Minh họa mã QR vé').count(),0);
  assert.equal(await f.page.getByText(orderId.slice(0,8).toUpperCase(),{exact:true}).count(),1);
  await f.page.screenshot({path:resolve(output,'checkout-confirmed.png'),fullPage:true});
  await f.page.reload();
  await f.page.getByRole('link',{name:'Xem vé của tôi'}).click();
  const group=f.page.getByRole('article',{name:concert.title,exact:true});
  await group.getByRole('button',{name:`Xem vé · ${concert.title}`}).click();
  await group.getByRole('button',{name:/^Mở mã QR · /}).click();
  const dialog=f.page.getByRole('dialog',{name:concert.title});
  await dialog.getByRole('img',{name:`Mã QR vé cho ${concert.title}`}).waitFor();
  checks.push('A verified paid order opens the actual issued ticket despite independent Catalog and payment-status errors');await f.close();
 }
 {
  const f=await fixture({authenticated:false});await f.page.goto(origin+'/login');
  await f.page.getByRole('link',{name:'Quên mật khẩu?'}).click();
  await f.page.waitForURL('**/forgot-password');
  for(const email of ['buyer@example.test','missing@example.test']) {
   await f.page.getByLabel('Địa chỉ email').fill(email);
   await f.page.getByRole('button',{name:'Gửi liên kết đặt lại mật khẩu'}).click();
   await f.page.getByText('Nếu email đủ điều kiện, TicketBox sẽ gửi hướng dẫn đặt lại mật khẩu.').waitFor();
   assert.deepEqual(f.state.resetRequests.at(-1),{email});
   await f.page.reload();
  }
  checks.push('Password reset email requests present the same acceptance state');await f.close();
 }
 {
  const f=await fixture();const token='fixture+reset/token';
  await f.page.goto(origin+`/reset-password#token=${encodeURIComponent(token)}`);
  await f.page.getByRole('heading',{name:'Tạo mật khẩu mới'}).waitFor();
  assert.equal(new URL(f.page.url()).hash,'');
  assert.equal(await f.page.locator('meta[name="referrer"]').getAttribute('content'),'no-referrer');
  assert.equal(await f.page.evaluate(value=>[...Object.values(localStorage),...Object.values(sessionStorage)].some(item=>item.includes(value)),token),false);
  const password=f.page.getByLabel('Mật khẩu mới',{exact:true});
  const confirmation=f.page.getByLabel('Xác nhận mật khẩu mới');
  const save=f.page.getByRole('button',{name:'Lưu mật khẩu mới'});
  for(const [width,height] of [[1440,900],[768,1024],[390,844]]) {
   await f.page.setViewportSize({width,height});
   assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await f.page.screenshot({path:resolve(output,`reset-password-${width}.png`)});
  }
  const long='ệ'.repeat(25);
  await password.fill(long);await confirmation.fill(long);await save.click();
  await f.page.getByRole('alert').waitFor();assert.equal(f.state.resetConfirmations.length,0);
  await password.fill('password-new');await confirmation.fill('password-typo');await save.click();
  await f.page.getByText('Mật khẩu xác nhận không khớp.').waitFor();assert.equal(f.state.resetConfirmations.length,0);
  await confirmation.fill('password-new');await save.click();
  await f.page.getByRole('heading',{name:'Mật khẩu đã được cập nhật'}).waitFor();
  assert.deepEqual(f.state.resetConfirmations,[{body:{token,password:'password-new'},referer:undefined}]);
  assert.equal((await f.page.context().cookies()).some(cookie=>cookie.name==='ticketbox_auth_token'),false);
  await f.page.getByRole('link',{name:'Đăng nhập'}).click();await f.page.waitForURL('**/login');
  assert.equal(await f.page.locator('meta[name="referrer"]').count(),0);
  checks.push('Reset token stays in memory and submits without a referrer; validated password forces sign-in');await f.close();
 }
 {
  const f=await fixture({authStatus:401,resetConfirmStatus:410});
  await f.page.goto(origin+'/reset-password#token=expired-fixture');
  await f.page.getByLabel('Mật khẩu mới',{exact:true}).fill('password-new');
  await f.page.getByLabel('Xác nhận mật khẩu mới').fill('password-new');
  await f.page.getByRole('button',{name:'Lưu mật khẩu mới'}).click();
  await f.page.getByText('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.').waitFor();
  await f.page.getByRole('link',{name:'Yêu cầu liên kết mới'}).click();await f.page.waitForURL('**/forgot-password');
  assert.equal(await f.page.locator('meta[name="referrer"]').count(),0);
  checks.push('Invalid or expired links offer a fresh request and remove route-scoped metadata');await f.close();
 }
 {
  const f=await fixture({authenticated:false,organizationName:'Ban tổ chức hòa nhạc thử nghiệm'});
  await f.page.goto(origin+`/concerts/${concertId}`);
  await f.page.getByText('Ban tổ chức hòa nhạc thử nghiệm',{exact:true}).waitFor();
  await f.page.setViewportSize({width:390,height:844});
  await checkBuyerInformation(f.page.getByRole('contentinfo'));
  await checkBuyerInformation(f.page.locator('.booking-card'));
  checks.push('Published organizer is rendered and support/policy links require HTTPS configuration');await f.close();
 }
 {
  const f=await fixture();await f.page.goto(origin);
  const footer=f.page.getByRole('contentinfo');
  await footer.getByRole('link',{name:'Quay lại sự kiện'}).waitFor();
  for(const [width,height] of [[1440,900],[768,1024],[390,844]]) {
   await f.page.setViewportSize({width,height});
   assert(await footer.evaluate(node=>node.scrollWidth<=node.clientWidth+1));
   await footer.screenshot({path:resolve(output,`buyer-footer-${width}.png`)});
  }
  assert.equal(await footer.locator('a[href^="#"], form').count(),0);
  const history=footer.getByRole('link',{name:'Lịch sử đơn hàng',exact:true});
  await history.focus();await f.page.keyboard.press('Enter');
  await f.page.getByRole('region',{name:'Lịch sử đơn hàng'}).waitFor();
  await f.page.reload();
  await f.page.getByRole('link',{name:'Tiếp tục thanh toán'}).waitFor();
  checks.push('Footer links reach real buyer destinations and order history stays selected after reload');await f.close();
 }
 {
  const f=await fixture({authenticated:false});await f.page.goto(origin);
  const footer=f.page.getByRole('contentinfo');
  assert.equal(await footer.getByRole('link',{name:'Đăng nhập'}).getAttribute('href'),'/login');
  assert.equal(await footer.getByRole('link',{name:/Lịch sử đơn hàng|Vé của tôi/}).count(),0);
  checks.push('Signed-out footer keeps only public and sign-in destinations');await f.close();
 }
 {
  const f=await fixture();await f.page.goto(origin+'/booking-confirmation?status=paid');
  const history=f.page.getByRole('link',{name:'Xem lịch sử đơn hàng'});
  await history.waitFor();
  await f.page.getByRole('heading',{name:'Chưa thể xác nhận đơn hàng'}).waitFor();
  assert.equal(await f.page.getByText('Đặt vé thành công').count(),0);
  await history.click();await f.page.getByRole('region',{name:'Lịch sử đơn hàng'}).waitFor();
  assert.equal(f.state.postKeys.length,0);
  checks.push('Opening confirmation without an order never claims settlement or creates a new order');await f.close();
 }
 {
  const f=await fixture({orderStatus:'EXPIRED'});await f.page.goto(origin+`/payment/result?orderId=${orderId}`);
  await f.page.getByRole('heading',{name:'Đơn hàng đã hết hạn'}).waitFor();
  assert.equal(await f.page.getByRole('link',{name:'Thử thanh toán lại'}).count(),0);
  await f.page.getByRole('link',{name:'Xem lịch sử đơn hàng'}).click();
  await f.page.getByRole('region',{name:'Lịch sử đơn hàng'}).getByText('Hết hạn').waitFor();
  assert.equal(f.state.postKeys.length,0);
  checks.push('Expired payment returns direct buyers to the original order history');await f.close();
 }
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
  const pay=f.page.getByRole('button',{name:'Tiếp tục với thanh toán demo'});
  await pay.waitFor();
  const language=f.page.getByRole('combobox',{name:'Ngôn ngữ'});
  await language.focus();
  await f.page.keyboard.press('End');
  await f.page.keyboard.press('Enter');
  await f.page.getByRole('button',{name:'Continue with demo payment'}).waitFor();
  assert.match(await f.page.getByRole('complementary',{name:'Order summary'}).textContent(),/₫|VND/);
  assert.match(f.page.url(),new RegExp(orderId));
  assert.equal(f.state.postKeys.length,0);
  assert.equal(f.state.cancelCalls,0);
  await f.page.getByRole('combobox',{name:'Language'}).selectOption('vi');
  await pay.waitFor();await checkBuyerInformation(f.page.getByRole('complementary',{name:'Tóm tắt đơn hàng'}));
  await pay.click();await failedHeading(f.page).waitFor();
  checks.push('Keyboard language switch retains the order and currency; FAILED initiation opens recovery');await f.close();
 }
 {
  const f=await fixture({attempt:'READY',initiateState:'PROCESSING'});await f.page.goto(origin+`/checkout?orderId=${orderId}`);
  await f.page.getByRole('button',{name:'Tiếp tục với thanh toán demo'}).click();
  await f.page.waitForURL(`**/payment/result?orderId=${orderId}&pending=true`);
  await f.page.getByText('Cổng thanh toán chưa trả kết quả rõ ràng.',{exact:false}).waitFor();
  f.state.attempt='READY';await f.page.waitForURL(`**/checkout?orderId=${orderId}`);
  assert.equal(f.state.postKeys.length,0);
  checks.push('A 202 PROCESSING intent waits for the same order to become ready');await f.close();
 }
 {
  const f=await fixture();await f.page.goto(origin+`/payment/result?orderId=${orderId}`);await failedHeading(f.page).waitFor();
  checks.push('Server FAILED return redirects to failed checkout without relying on provider query hints');await f.close();
 }
 for (const responseCode of ['00','24']) {
  const f=await fixture({attempt:'READY',providers:['VNPAY']});
  await f.page.goto(origin+`/payment/result?vnp_TxnRef=${orderId}&vnp_ResponseCode=${responseCode}`);
  await f.page.getByText('Đã nhận kết quả từ cổng thanh toán. Đang chờ TicketBox xác nhận đơn hàng...').waitFor();
  f.state.orderStatus='PAID';
  await f.page.waitForURL('**/booking-confirmation');await f.close();
 }
 checks.push('VNPAY browser return stays pending for either return code until the server confirms');
 {
  const f=await fixture({attempt:'READY',providers:[]});
  await f.page.goto(origin+`/checkout?orderId=${orderId}`);
  await f.page.getByText('Cổng thanh toán chưa sẵn sàng.').waitFor();
  assert(await f.page.getByRole('button',{name:'Chưa có cổng thanh toán'}).isDisabled());
  f.state.providers=['MOCK'];
  await f.page.getByRole('button',{name:'Thử lại',exact:true}).click();
  await f.page.getByRole('button',{name:'Tiếp tục với thanh toán demo'}).waitFor();
  assert.equal(f.state.paymentAttempts,0);
  checks.push('An unready provider profile shows a retry and blocks payment');await f.close();
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
  await f.page.getByRole('link',{name:'Xem vé của tôi'}).waitFor();
  assert.equal(f.state.postKeys.length,0);
  checks.push('Late paid result wins cancellation: refresh opens confirmation and never starts new purchase');await f.close();
 }
 {
  const f=await fixture({cancelResult:'PAID'});await f.page.goto(origin+`/checkout?orderId=${orderId}`);
  await failedHeading(f.page).waitFor();
  await f.page.getByRole('button',{name:'Hủy đơn và chọn vé lại'}).click();
  await f.page.waitForURL('**/booking-confirmation');
  await f.page.getByRole('link',{name:'Xem vé của tôi'}).waitFor();
  assert.equal(f.state.cancelCalls,1);
  assert.equal(f.state.postKeys.length,0);
  assert.equal(f.state.paymentAttempts,0);
  checks.push('A paid order returned by the cancel request opens confirmation instead of starting a new purchase');await f.close();
 }
 console.log(JSON.stringify({passed:true,checks},null,2));
 writeFileSync(resolve(output,'results.json'),JSON.stringify({passed:true,checks},null,2));
} finally {await browser.close();await new Promise(done=>server.close(done));}

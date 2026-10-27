package com.ticketbox.payments;

import com.ticketbox.payments.PaymentContract.*;
import com.ticketbox.payments.provider.*;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.concurrent.Semaphore;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PaymentFacade {
 private final PaymentStore store;private final PaymentGatewayResolver gateways;
 private final Semaphore creates=new Semaphore(8);
 public PaymentFacade(PaymentStore store,PaymentGatewayResolver gateways){this.store=store;this.gateways=gateways;}
 public Snapshot submit(Intent intent) {
  Provider provider;
  try {provider=Provider.valueOf(intent.provider());}catch(RuntimeException error){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Unknown provider");}
  PaymentGateway gateway=gateways.resolve(provider);
  var attempt=store.prepare(intent);
  if(!"CREATED".equals(attempt.state()))return attempt.snapshot();
  if(!creates.tryAcquire())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Payment capacity exhausted");
  try {
   if(store.start(intent.orderId())){
    PaymentInitiationResult created;
    try {created=gateway.initiatePayment(attempt.order(),intent.requestId());}
    catch(GatewayNotSubmittedException unsent){store.created(intent.orderId(),null,"Not submitted",true);throw unsent;}
    catch(RuntimeException unknown){store.created(intent.orderId(),null,unknown.getClass().getSimpleName(),false);return store.find(intent.orderId()).snapshot();}
    store.created(intent.orderId(),created,null,false);
   }
   return store.find(intent.orderId()).snapshot();
  }finally{creates.release();}
 }
 public WebhookAck webhook(Provider provider,Map<String,String> body){
  var receipt=gateways.resolve(provider).verifyWebhook(body);
  try{return store.receive(provider,receipt,body.get("requestId"));}
  catch(org.springframework.dao.DataIntegrityViolationException conflict){store.transactionConflict(receipt.orderId());return new WebhookAck("97","Transaction requires review");}
 }
 public void mock(UUID order,boolean success){
  gateways.resolve(Provider.MOCK);var a=store.find(order);
  var result=store.receive(Provider.MOCK,new PaymentWebhookResult(true,success,order,"MOCK-TXN-"+order,a.intent().amount(),"{\"provider\":\"MOCK\"}",null),null);
  if(!List.of("00","02").contains(result.responseCode()))throw new ResponseStatusException(HttpStatus.CONFLICT,result.message());
 }
}

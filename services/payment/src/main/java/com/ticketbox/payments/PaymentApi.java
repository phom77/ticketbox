package com.ticketbox.payments;

import com.ticketbox.payments.PaymentContract.*;
import com.ticketbox.payments.provider.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.context.annotation.Profile;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

@RestController
public class PaymentApi {
 private final PaymentFacade facade;private final PaymentStore store;
 public PaymentApi(PaymentFacade facade,PaymentStore store){this.facade=facade;this.store=store;}
 @PostMapping("/internal/intents")public Snapshot create(@RequestBody Intent intent){return facade.submit(intent);}
 @GetMapping("/internal/attempts/{order}")public Snapshot status(@PathVariable UUID order){return store.find(order).snapshot();}
 @PostMapping("/internal/webhooks/{provider}")public WebhookAck webhook(@PathVariable Provider provider,@RequestBody Map<String,String> payload){return facade.webhook(provider,payload);}
 @GetMapping("/api/payments/webhooks/vnpay")public Object vnpay(@RequestParam Map<String,String> payload){var result=facade.webhook(Provider.VNPAY,payload);return Map.of("RspCode",result.responseCode(),"Message",result.message());}
 @PostMapping("/api/payments/webhooks/momo")public Object momo(@RequestBody Map<String,Object> body){
  Map<String,String> payload=new HashMap<>();body.forEach((k,v)->payload.put(k,Objects.toString(v,"")));var result=facade.webhook(Provider.MOMO,payload);
  return Map.of("partnerCode",payload.getOrDefault("partnerCode",""),"orderId",payload.getOrDefault("orderId",""),"requestId",payload.getOrDefault("requestId",""),
   "responseTime",System.currentTimeMillis(),"resultCode",List.of("00","02").contains(result.responseCode())?0:99,"message",result.message());
 }
 @GetMapping("/internal/reviews")public Object reviews(){return store.reviews();}
 public record Review(UUID actionId,UUID actorId,String action,String detail,UUID caseId){}
 @PostMapping("/internal/reviews/{order}")public Object review(@PathVariable UUID order,@RequestBody Review review){
  if(review.actionId()==null || review.actorId()==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Action/actor identity required");
  return store.review(order,review.actionId(),review.actorId(),review.action(),review.detail(),review.caseId());
 }
 @RestController @Profile("!prod")static class MockApi {
  private final PaymentFacade facade;MockApi(PaymentFacade facade){this.facade=facade;}
  @PostMapping("/internal/mock/{order}/{success}")public void mock(@PathVariable UUID order,@PathVariable boolean success){facade.mock(order,success);}
 }
 @RestControllerAdvice static class Errors {
  @ExceptionHandler(ResponseStatusException.class)ResponseEntity<?> status(ResponseStatusException error){return ResponseEntity.status(error.getStatusCode()).body(Map.of("message",Objects.toString(error.getReason(),"Request rejected")));}
  @ExceptionHandler(AppException.class)ResponseEntity<?> gateway(AppException error){return ResponseEntity.status(error.getErrorCode()==ErrorCode.INVALID_REQUEST?400:503).body(Map.of("message",error.getMessage()));}
  @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)ResponseEntity<?> conflict(){return ResponseEntity.status(409).body(Map.of("message","Payment identity/transaction conflict"));}
 }
}

package com.ticketbox.payments;

import com.ticketbox.payments.PaymentContract.*;
import com.ticketbox.payments.provider.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.jdbc.core.JdbcTemplate;

@Component
public class PaymentWorkers {
 private final PaymentStore store;private final RestClient core;private final ObjectMapper json;private final PaymentGatewayResolver gateways;
 private final JdbcTemplate db;private final java.util.concurrent.atomic.AtomicLong pending=new java.util.concurrent.atomic.AtomicLong(),reviews=new java.util.concurrent.atomic.AtomicLong();
 public PaymentWorkers(PaymentStore store,ObjectMapper json,PaymentGatewayResolver gateways,JdbcTemplate db,MeterRegistry metrics,
   @Value("${payment.core-url}")String url,@Value("${payment.service-token}")String token){
  this.store=store;this.json=json;this.gateways=gateways;this.db=db;
  var factory=new SimpleClientHttpRequestFactory();factory.setConnectTimeout(2000);factory.setReadTimeout(5000);
  core=RestClient.builder().baseUrl(url).defaultHeader("X-Service-Token",token).requestFactory(factory).build();
  metrics.gauge("ticketbox.payment.results.pending",pending);metrics.gauge("ticketbox.payment.reviews.open",reviews);
 }
 @Scheduled(fixedDelayString="${payment.worker-interval-ms:1000}")public void results(){
  for(var delivery:store.claimResults(4))try {
   var result=json.readValue(delivery.payload(),Result.class);
   var ack=core.post().uri("/internal/ticketing/payment-results").body(result).retrieve().body(Ack.class);
   store.acknowledged(delivery,ack);
  }catch(Exception error){store.deliveryFailed(delivery,error.getClass().getSimpleName());}
 }
 @Scheduled(fixedDelayString="${payment.query-interval-ms:10000}")public void queries(){
  for(var a:store.claimQueries(2)){
   PaymentQueryResult result=PaymentQueryResult.unknown();
   try {result=gateways.resolve(Provider.valueOf(a.intent().provider())).queryPayment(a.order(),a.intent().requestId(),a.raw());}
   catch(RuntimeException ignored){/* Retain uncertain money under the original request identity. */}
   try{store.queryResult(a,result);}catch(org.springframework.dao.DataIntegrityViolationException conflict){store.transactionConflict(a.intent().orderId());}
  }
 }
 @Scheduled(fixedDelay=10000)public void metrics(){
  pending.set(db.queryForObject("SELECT count(*) FROM payment_result_outbox WHERE completed_at IS NULL",Long.class));
  reviews.set(db.queryForObject("SELECT (SELECT count(*) FROM refund_reviews WHERE state='REVIEW_REQUIRED')+(SELECT count(*) FROM payment_attempts WHERE state='REVIEW_REQUIRED')",Long.class));
 }
}

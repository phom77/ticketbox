package com.ticketbox.infrastructure.integration;

import com.ticketbox.shared.payment.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import java.util.*;

@Component @ConditionalOnProperty(name="ticketbox.payments.mode",havingValue="remote")
public class PaymentRemoteClient {
 private final RestClient http;
 public PaymentRemoteClient(@Value("${ticketbox.payments.url}")String url,@Value("${ticketbox.payments.service-token}")String token) {
  if(token.length()<32)throw new IllegalStateException("Payment service token must be at least 32 characters");
  var factory=new SimpleClientHttpRequestFactory();factory.setConnectTimeout(2000);factory.setReadTimeout(15000);
  http=RestClient.builder().baseUrl(url).requestFactory(factory).defaultHeader("X-Service-Token",token).build();
 }
 public PaymentSnapshot submit(PaymentIntent intent) {
  var snapshot=http.post().uri("/internal/intents").body(intent).retrieve().body(PaymentSnapshot.class);
  return new PaymentSnapshot(snapshot.attemptId(),"SETTLEMENT_PENDING".equals(snapshot.state())?"UNKNOWN":snapshot.state(),snapshot.paymentUrl(),snapshot.providerRef());
 }
 public void mock(UUID order,boolean success){http.post().uri("/internal/mock/{id}/{success}",order,success).retrieve().toBodilessEntity();}
 public Map webhook(String provider,Map<String,String> body){return http.post().uri("/internal/webhooks/{provider}",provider).body(body).retrieve().body(Map.class);}
 public Object reviews(){return http.get().uri("/internal/reviews").retrieve().body(Object.class);}
 public Object review(UUID order,Map<String,Object> body){return http.post().uri("/internal/reviews/{id}",order).body(body).retrieve().body(Object.class);}
}

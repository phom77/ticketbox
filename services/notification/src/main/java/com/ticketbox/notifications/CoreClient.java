package com.ticketbox.notifications;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import java.util.UUID;

@Component
public class CoreClient {
 private final RestClient http;
 public CoreClient(@Value("${notification.core-url}") String base,@Value("${notification.service-token}") String token) {
  if(token.length()<32) throw new IllegalStateException("Service token must be at least 32 characters");
  var timeouts=new SimpleClientHttpRequestFactory();timeouts.setConnectTimeout(2000);timeouts.setReadTimeout(5000);
  http=RestClient.builder().baseUrl(base).requestFactory(timeouts).defaultHeader("X-Service-Token",token).build();
 }
 public JsonNode contact(UUID user){return http.get().uri("/internal/notifications/users/{id}",user).retrieve().body(JsonNode.class);}
 public byte[] document(UUID order){return http.get().uri("/internal/notifications/orders/{id}/document",order).retrieve().body(byte[].class);}
}

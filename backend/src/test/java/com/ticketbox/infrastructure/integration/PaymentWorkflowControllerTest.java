package com.ticketbox.infrastructure.integration;

import com.ticketbox.infrastructure.security.*;
import com.ticketbox.module.ticket.PaymentWorkflowPort;
import com.ticketbox.shared.payment.*;
import com.ticketbox.shared.exception.GlobalExceptionHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.http.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers=PaymentWorkflowController.class,properties={"ticketbox.payments.mode=remote","ticketbox.payments.service-token=core-payment-test-token-at-least-32-characters"})
@Import({SecurityConfig.class,GlobalExceptionHandler.class})
class PaymentWorkflowControllerTest {
 @Autowired MockMvc api;@Autowired ObjectMapper json;
 @MockBean JwtService jwt;@MockBean PaymentWorkflowPort workflow;@MockBean PaymentRemoteClient remote;
 PaymentResult receipt(){return new PaymentResult(1,UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),"MOCK","fixture",BigDecimal.TEN,"VND",1,"txn",OffsetDateTime.now());}
 UsernamePasswordAuthenticationToken actor(UUID id,String role){return new UsernamePasswordAuthenticationToken(id.toString(),null,List.of(new SimpleGrantedAuthority("ROLE_"+role)));}
 @Test void serviceCredentialIsMandatoryBeforeApplyingMoney()throws Exception {
  byte[] body=json.writeValueAsBytes(receipt());
  api.perform(post("/internal/ticketing/payment-results").contentType("application/json").content(body)).andExpect(status().isUnauthorized());
  api.perform(post("/internal/ticketing/payment-results").header("X-Service-Token","wrong").contentType("application/json").content(body)).andExpect(status().isUnauthorized());
  verifyNoInteractions(workflow);
 }
 @Test void validCredentialReturnsPersistedAck()throws Exception {
  var receipt=receipt();when(workflow.receive(any())).thenReturn(new PaymentAck(receipt.eventId(),"ACCEPTED","Tickets confirmed"));
  api.perform(post("/internal/ticketing/payment-results").header("X-Service-Token","core-payment-test-token-at-least-32-characters").contentType("application/json").content(json.writeValueAsBytes(receipt)))
   .andExpect(status().isOk()).andExpect(jsonPath("$.eventId").value(receipt.eventId().toString())).andExpect(jsonPath("$.decision").value("ACCEPTED"));
 }
 @Test void reviewIsAdminOnlyAndActorComesFromAuthentication()throws Exception {
  UUID id=UUID.randomUUID(),order=UUID.randomUUID();var body=Map.of("actorId",UUID.randomUUID().toString(),"actionId",UUID.randomUUID().toString());
  api.perform(post("/api/admin/payment-workflows/"+order+"/review").with(authentication(actor(id,"ORGANIZER"))).contentType("application/json").content(json.writeValueAsBytes(body))).andExpect(status().isForbidden());
  when(remote.review(eq(order),anyMap())).thenReturn(Map.of("recorded",true));
  api.perform(post("/api/admin/payment-workflows/"+order+"/review").with(authentication(actor(id,"ADMIN"))).contentType("application/json").content(json.writeValueAsBytes(body))).andExpect(status().isOk());
  verify(remote).review(eq(order),argThat(value->id.toString().equals(value.get("actorId"))));
 }
 @Test void internalAuthenticationFailureIsServiceUnavailableForValidCustomerSession()throws Exception {
  when(remote.reviews()).thenThrow(org.springframework.web.client.HttpClientErrorException.create(HttpStatus.UNAUTHORIZED,"Unauthorized",HttpHeaders.EMPTY,new byte[0],java.nio.charset.StandardCharsets.UTF_8));
  api.perform(get("/api/admin/payment-workflows/reviews").with(authentication(actor(UUID.randomUUID(),"ADMIN"))))
   .andExpect(status().isServiceUnavailable()).andExpect(header().string("Retry-After","1"));
 }
}

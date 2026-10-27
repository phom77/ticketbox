package com.ticketbox.infrastructure.integration;

import com.ticketbox.module.ticket.PaymentWorkflowPort;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;

@Component @RequiredArgsConstructor
@ConditionalOnProperty(name="ticketbox.payments.mode",havingValue="remote")
public class PaymentIntentDispatcher {
 private final PaymentWorkflowPort workflow;
 private final PaymentRemoteClient remote;
 @Scheduled(fixedDelayString="${ticketbox.payments.dispatch-interval-ms:1000}")
 public void dispatch(){
  for(var claim:workflow.claim(2))try {workflow.snapshot(claim,remote.submit(claim.intent()));}
  catch(RuntimeException error){workflow.failed(claim,error.getClass().getSimpleName());}
 }
}

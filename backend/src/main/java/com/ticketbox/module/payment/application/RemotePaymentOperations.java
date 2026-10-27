package com.ticketbox.module.payment.application;

import com.ticketbox.infrastructure.integration.*;
import com.ticketbox.module.ticket.PaymentWorkflowPort;
import com.ticketbox.module.payment.domain.PaymentLog;
import com.ticketbox.module.payment.application.gateway.PaymentGatewayResolver;
import com.ticketbox.module.payment.web.dto.PaymentInitiationResponse;
import com.ticketbox.shared.exception.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import java.util.*;

@Service @RequiredArgsConstructor
@ConditionalOnProperty(name="ticketbox.payments.mode",havingValue="remote")
public class RemotePaymentOperations implements PaymentOperations {
 private final PaymentWorkflowPort workflow;
 private final PaymentRemoteClient remote;
 private final PaymentGatewayResolver providers;
 public PaymentInitiationResponse initiatePayment(UUID order,String name,UUID user) {
  PaymentLog.Provider provider;
  try {provider=PaymentLog.Provider.valueOf(name==null||name.isBlank()?"MOCK":name.trim().toUpperCase(Locale.ROOT));}
  catch(RuntimeException error){throw new AppException(ErrorCode.INVALID_REQUEST,"Cổng thanh toán không hợp lệ");}
  providers.resolve(provider); // Retains production MOCK guard; provider I/O belongs to the service.
  // Checkout commits a local intent and returns immediately. The dispatcher owns remote I/O.
  var intent=workflow.prepare(order,user,provider.name());
  var progress=workflow.owned(order,user);var snapshot=progress.snapshot();
  String paymentUrl="READY".equals(snapshot.state()) && "AWAITING_PAYMENT".equals(progress.order().status()) &&
      progress.order().expiresAt().isAfter(java.time.OffsetDateTime.now())?snapshot.paymentUrl():null;
  return new PaymentInitiationResponse(order,provider.name(),provider==PaymentLog.Provider.VNPAY?order.toString():intent.requestId(),
   paymentUrl,snapshot.attemptId(),snapshot.state());
 }
 public PaymentService.PaymentStatusResponse getPaymentStatus(UUID order,UUID user) {
  var progress=workflow.owned(order,user);var view=progress.order();var intent=progress.intent();var snapshot=progress.snapshot();
  return new PaymentService.PaymentStatusResponse(order,view.status(),intent==null?view.paymentProvider():intent.provider(),
   intent==null?view.paymentRef():intent.requestId(),view.totalAmount(),snapshot==null?null:snapshot.attemptId(),snapshot==null?null:snapshot.state(),
   snapshot!=null && "READY".equals(snapshot.state()) && "AWAITING_PAYMENT".equals(view.status()) && view.expiresAt().isAfter(java.time.OffsetDateTime.now())?snapshot.paymentUrl():null);
 }
 public PaymentService.WebhookHandleResult handleWebhook(PaymentLog.Provider provider,Map<String,String> payload) {
  var result=remote.webhook(provider.name(),payload);return new PaymentService.WebhookHandleResult(result.get("responseCode").toString(),result.get("message").toString());
 }
 public void processMockPaymentSuccess(UUID id){providers.resolve(PaymentLog.Provider.MOCK);remote.mock(id,true);}
 public void processMockPaymentFail(UUID id){providers.resolve(PaymentLog.Provider.MOCK);remote.mock(id,false);}
}

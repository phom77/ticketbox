package com.ticketbox.notifications;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.mail.javamail.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
public class DeliveryWorker {
 private static final Logger log=LoggerFactory.getLogger(DeliveryWorker.class);
 private final NotificationStore store;private final CoreClient core;private final JavaMailSender smtp;
 public DeliveryWorker(NotificationStore store,CoreClient core,JavaMailSender smtp){this.store=store;this.core=core;this.smtp=smtp;}
 @Scheduled(fixedDelayString="${notification.delivery-interval-ms:1000}")
 public void deliver() {
  for(int i=0;i<10;i++) {
   var delivery=store.claim();if(delivery==null)return;
   try {
    var contact=core.contact(delivery.user());
    String email=contact.path("email").asText();if(email.isBlank())throw new IllegalStateException("Contact email unavailable");
    byte[] document=delivery.order()==null?null:core.document(delivery.order());
    var message=smtp.createMimeMessage();var mail=new MimeMessageHelper(message,document!=null,"UTF-8");
    mail.setFrom("noreply@ticketbox.vn");mail.setTo(email);mail.setSubject(delivery.subject());mail.setText(delivery.body(),false);
    if(document!=null)mail.addAttachment("ticket-"+delivery.order()+".pdf",new ByteArrayResource(document),"application/pdf");
    if(!store.renew(delivery))continue;
    smtp.send(message);store.sent(delivery);
   } catch(Exception failure) {
    // No DB transaction is held while calling Core or SMTP. Delivery remains observable after failure.
    store.failed(delivery,failure.getClass().getSimpleName());
    log.warn("Delivery {} retained/failed: {}",delivery.id(),failure.getClass().getSimpleName());
   }
  }
 }
}

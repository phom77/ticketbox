package com.ticketbox.module.ticket.application;

import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.jdbc.core.JdbcTemplate;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.concurrent.atomic.AtomicLong;

@Component @ConditionalOnProperty(name="ticketbox.payments.mode",havingValue="remote")
public class PaymentWorkflowMetrics {
 private final JdbcTemplate db;private final AtomicLong pending=new AtomicLong(),oldest=new AtomicLong();
 public PaymentWorkflowMetrics(JdbcTemplate db,MeterRegistry metrics){this.db=db;metrics.gauge("ticketbox.payment.intents.pending",pending);metrics.gauge("ticketbox.payment.intents.oldest.seconds",oldest);}
 @Scheduled(fixedDelay=10000)public void sample(){
  var row=db.queryForMap("SELECT count(*) AS pending,coalesce(extract(epoch FROM now()-min(created_at)),0) AS age FROM ticketing_payment_intents WHERE state NOT IN ('SETTLED','REJECTED','FAILED')");
  pending.set(((Number)row.get("pending")).longValue());oldest.set(((Number)row.get("age")).longValue());
 }
}

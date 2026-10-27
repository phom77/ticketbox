package com.ticketbox.infrastructure.integration;

import org.flywaydb.core.api.callback.*;
import org.springframework.boot.autoconfigure.flyway.FlywayConfigurationCustomizer;
import org.springframework.context.annotation.*;
import org.springframework.beans.factory.annotation.Value;

/** Runs as the migration owner, before runtime beans start. Never mix old/new money writers. */
@Configuration
public class PaymentCutoverConfiguration {
 @Bean FlywayConfigurationCustomizer paymentOwnership(@Value("${ticketbox.payments.mode:embedded}")String mode,
         @Value("${spring.datasource.username}")String runtimeUser) {
  if(!java.util.List.of("embedded","remote").contains(mode))throw new IllegalArgumentException("Invalid payment mode");
  return configuration->configuration.callbacks(new Callback(){
   public boolean supports(Event event,Context context){return event==Event.AFTER_MIGRATE;}
   public boolean canHandleInTransaction(Event event,Context context){return true;}
   public String getCallbackName(){return "payment-ownership-fence";}
   public void handle(Event event,Context context){try(var statement=context.getConnection().createStatement()){
    var previous=statement.executeQuery("SELECT mode FROM payment_cutover_control WHERE id=1");
    boolean remoteBefore=previous.next() && "remote".equals(previous.getString(1));previous.close();
    if("embedded".equals(mode)) {if(remoteBefore)throw new IllegalStateException("Payment was cut over: drain/restore the documented workflow before rollback; routing alone is unsafe");return;}
    var open=statement.executeQuery("SELECT count(*) FROM payment_attempts WHERE state<>'SUCCEEDED'");open.next();
    if(open.getLong(1)>0)throw new IllegalStateException("Legacy payment attempts are still open; drain/reconcile before cutover");open.close();
    var bound=statement.executeQuery("SELECT count(*) FROM orders o WHERE status='AWAITING_PAYMENT' AND (payment_url IS NOT NULL OR payment_ref IS NOT NULL OR payment_provider IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM ticketing_payment_intents i WHERE i.order_id=o.id)");bound.next();
    if(bound.getLong(1)>0)throw new IllegalStateException("Legacy bound checkout sessions must be drained before cutover");bound.close();
    String role="\""+runtimeUser.replace("\"","\"\"")+"\"";
    statement.execute("REVOKE SELECT,INSERT,UPDATE,DELETE ON payment_attempts,payment_logs FROM "+role);
    statement.execute("GRANT REFERENCES ON payment_attempts,payment_logs TO "+role);
    statement.execute("REVOKE INSERT,UPDATE,DELETE ON payment_cutover_control FROM "+role);
    try(var check=context.getConnection().prepareStatement("SELECT has_table_privilege(?,'payment_attempts','INSERT') OR has_table_privilege(?,'payment_attempts','SELECT')")){
     check.setString(1,runtimeUser);check.setString(2,runtimeUser);var permissions=check.executeQuery();permissions.next();
     if(permissions.getBoolean(1))throw new IllegalStateException("Remote payment requires a restricted runtime role distinct from the migration owner");
    }
    statement.execute("INSERT INTO payment_cutover_control VALUES(1,'remote') ON CONFLICT(id) DO UPDATE SET mode='remote'");
   }catch(java.sql.SQLException error){throw new IllegalStateException("Payment cutover preflight failed",error);}}
  });
 }
}

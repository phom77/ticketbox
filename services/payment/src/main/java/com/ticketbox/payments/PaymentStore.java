package com.ticketbox.payments;

import com.ticketbox.payments.PaymentContract.*;
import com.ticketbox.payments.provider.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.time.OffsetDateTime;
import java.util.*;

@Service
public class PaymentStore {
 private final JdbcTemplate db;private final ObjectMapper json;
 public PaymentStore(JdbcTemplate db,ObjectMapper json){this.db=db;this.json=json;}
 public record Attempt(UUID id,Intent intent,String state,String url,String raw,String transaction,UUID lease) {
  public OrderView order(){return new OrderView(intent.orderId(),intent.userId(),intent.amount(),"AWAITING_PAYMENT",intent.provider(),intent.requestId(),url,intent.expiresAt());}
  public Snapshot snapshot(){return new Snapshot(id,state,url,Provider.VNPAY.name().equals(intent.provider())?intent.orderId().toString():intent.requestId());}
 }
 private Attempt row(ResultSet rs)throws SQLException {
  var intent=new Intent(1,rs.getObject("intent_id",UUID.class),rs.getObject("order_id",UUID.class),rs.getObject("user_id",UUID.class),rs.getString("provider"),
   rs.getBigDecimal("amount"),rs.getString("currency"),rs.getObject("expires_at",OffsetDateTime.class),rs.getLong("order_version"),rs.getString("request_id"),rs.getString("correlation_id"));
  return new Attempt(rs.getObject("id",UUID.class),intent,rs.getString("state"),rs.getString("payment_url"),rs.getString("raw_payload"),rs.getString("provider_transaction_id"),rs.getObject("lease_owner",UUID.class));
 }
 public Attempt find(UUID order){return db.query("SELECT * FROM payment_attempts WHERE order_id=?",(rs,n)->row(rs),order).stream().findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));}
 private Attempt lock(UUID order){return db.query("SELECT * FROM payment_attempts WHERE order_id=? FOR UPDATE",(rs,n)->row(rs),order).stream().findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));}
 @Transactional public Attempt prepare(Intent i) {
  if(i.schemaVersion()!=1 || i.orderVersion()!=1 || i.intentId()==null || i.orderId()==null || i.userId()==null || i.expiresAt()==null ||
    i.amount()==null || i.amount().signum()<0 || i.amount().stripTrailingZeros().scale()>0 || !"VND".equals(i.currency()) || i.requestId()==null ||
    i.requestId().isBlank() || i.requestId().length()>100 || i.correlationId()==null || i.correlationId().isBlank() || i.correlationId().length()>200)
   throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid payment intent");
  i=new Intent(i.schemaVersion(),i.intentId(),i.orderId(),i.userId(),i.provider(),i.amount().setScale(0),i.currency(),
    i.expiresAt().withOffsetSameInstant(java.time.ZoneOffset.UTC).truncatedTo(java.time.temporal.ChronoUnit.MICROS),i.orderVersion(),i.requestId(),i.correlationId());
  db.update("""
   INSERT INTO payment_attempts(intent_id,order_id,user_id,provider,amount,currency,order_version,request_id,correlation_id,expires_at,state)
   VALUES(?,?,?,?,?,?,?,?,?,?,'CREATED') ON CONFLICT(order_id) DO NOTHING
   """,i.intentId(),i.orderId(),i.userId(),i.provider(),i.amount(),i.currency(),i.orderVersion(),i.requestId(),i.correlationId(),i.expiresAt());
  Attempt a=lock(i.orderId());
  if(!a.intent().equals(i))throw new ResponseStatusException(HttpStatus.CONFLICT,"Intent snapshot is immutable");
  if("CREATED".equals(a.state()) && !i.expiresAt().isAfter(OffsetDateTime.now())) {
   db.update("UPDATE payment_attempts SET state='FAILED',last_error='Intent expired before provider submission' WHERE order_id=?",i.orderId());
   return find(i.orderId());
  }
  return a;
 }
 @Transactional public boolean start(UUID order) {
  return db.update("UPDATE payment_attempts SET state='PROCESSING',next_query_at=now()+interval '2 minutes',updated_at=now() WHERE order_id=? AND state='CREATED' AND expires_at>now()",order)==1;
 }
 @Transactional public void created(UUID order,PaymentInitiationResult result,String error,boolean unsent) {
  db.update("UPDATE payment_attempts SET state=?,payment_url=?,raw_payload=?,last_error=?,next_query_at=now()+interval '30 seconds',updated_at=now() WHERE order_id=? AND state IN ('PROCESSING','UNKNOWN')",
    result!=null?"READY":unsent?"CREATED":"UNKNOWN",result==null?null:result.paymentUrl(),result==null?null:result.rawPayload(),error,order);
 }
 @Transactional public WebhookAck receive(Provider provider,PaymentWebhookResult receipt,String requestId) {
  if(!receipt.valid())return new WebhookAck("97",Objects.toString(receipt.failureReason(),"Invalid signature"));
  Attempt a=lock(receipt.orderId());Intent i=a.intent();
  if(!i.provider().equals(provider.name()) || (provider==Provider.MOMO && !i.requestId().equals(requestId)))return new WebhookAck("01","Attempt mismatch");
  if(receipt.amount()==null || i.amount().compareTo(receipt.amount())!=0){
   if(receipt.success() && receipt.amount()!=null && receipt.amount().signum()>=0 && receipt.providerRef()!=null && !receipt.providerRef().isBlank())
    compensation(i,receipt.providerRef(),receipt.amount(),"Verified money differs from immutable intent amount");
   return new WebhookAck("04","Amount mismatch");
  }
  if(List.of("SETTLEMENT_PENDING","SUCCEEDED","RECONCILIATION_REQUIRED").contains(a.state()))
  {
   if(Objects.equals(a.transaction(),receipt.providerRef()) && receipt.success())return new WebhookAck("02","Already received");
   if(receipt.success() && receipt.providerRef()!=null && !receipt.providerRef().isBlank())compensation(i,receipt.providerRef(),receipt.amount(),"Additional verified transaction for an already attributed intent");
   return new WebhookAck("97","Conflicting receipt");
  }
  if(receipt.pending()){db.update("UPDATE payment_attempts SET state='UNKNOWN',next_query_at=now()+interval '30 seconds' WHERE order_id=?",i.orderId());return new WebhookAck("00","Pending reconciliation");}
  if(!receipt.success()){
   db.update("UPDATE payment_attempts SET state='FAILED',raw_payload=?,lease_owner=NULL,lease_until=NULL WHERE order_id=?",receipt.rawPayload(),i.orderId());
   audit(i.orderId(),null,UUID.randomUUID(),"PROVIDER_FAILED","Verified provider failure; later success remains admissible");return new WebhookAck("00","Failure recorded");
  }
  if(receipt.providerRef()==null || receipt.providerRef().isBlank())return new WebhookAck("97","Transaction missing");
  db.update("UPDATE payment_attempts SET state='SETTLEMENT_PENDING',provider_transaction_id=?,raw_payload=?,lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE order_id=?",receipt.providerRef(),receipt.rawPayload(),i.orderId());
  UUID event=stable("result:"+i.intentId());
  var result=new Result(1,event,i.intentId(),i.orderId(),i.userId(),i.provider(),i.requestId(),i.amount(),i.currency(),i.orderVersion(),receipt.providerRef(),OffsetDateTime.now());
  try {db.update("INSERT INTO payment_result_outbox(event_id,intent_id,payload) VALUES(?,?,?) ON CONFLICT DO NOTHING",event,i.intentId(),json.writeValueAsString(result));}
  catch(com.fasterxml.jackson.core.JsonProcessingException error){throw new IllegalStateException(error);}
  audit(i.orderId(),null,UUID.randomUUID(),"MONEY_VERIFIED",receipt.providerRef());return new WebhookAck("00","Durably received; awaiting Ticketing ACK");
 }
 public record Delivery(UUID id,String payload,UUID owner){}
 @Transactional public List<Delivery> claimResults(int limit) {
  UUID owner=UUID.randomUUID();return db.query("""
   UPDATE payment_result_outbox SET lease_owner=?,lease_until=now()+interval '1 minute'
   WHERE event_id IN (SELECT event_id FROM payment_result_outbox WHERE completed_at IS NULL AND next_attempt_at<=now()
    AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT ?) RETURNING *
   """,(rs,n)->new Delivery(rs.getObject("event_id",UUID.class),rs.getString("payload"),owner),owner,limit);
 }
 @Transactional public void acknowledged(Delivery delivery,Ack ack) {
  if(!delivery.id().equals(ack.eventId()) || !List.of("ACCEPTED","REJECTED").contains(ack.decision()))throw new IllegalArgumentException("Invalid Ticketing ACK");
  var attempts=db.query("SELECT a.* FROM payment_attempts a JOIN payment_result_outbox o ON o.intent_id=a.intent_id WHERE o.event_id=? AND o.lease_owner=? AND o.completed_at IS NULL FOR UPDATE OF a,o",(rs,n)->row(rs),delivery.id(),delivery.owner());
  if(attempts.isEmpty())return;var a=attempts.getFirst();
  db.update("UPDATE payment_attempts SET state=?,updated_at=now() WHERE intent_id=?","ACCEPTED".equals(ack.decision())?"SUCCEEDED":"RECONCILIATION_REQUIRED",a.intent().intentId());
  if("REJECTED".equals(ack.decision()))compensation(a.intent(),a.transaction(),a.intent().amount(),ack.reason());
  db.update("UPDATE payment_result_outbox SET completed_at=now(),lease_owner=NULL,lease_until=NULL,last_error=NULL WHERE event_id=?",delivery.id());
 }
 @Transactional public void deliveryFailed(Delivery d,String error){db.update("UPDATE payment_result_outbox SET attempts=attempts+1,last_error=?,next_attempt_at=now()+interval '3 seconds',lease_owner=NULL,lease_until=NULL WHERE event_id=? AND lease_owner=?",error,d.id(),d.owner());}
 @Transactional public List<Attempt> claimQueries(int limit){UUID owner=UUID.randomUUID();return db.query("""
  UPDATE payment_attempts SET lease_owner=?,lease_until=now()+interval '2 minutes'
  WHERE id IN (SELECT id FROM payment_attempts WHERE state IN ('PROCESSING','READY','UNKNOWN') AND next_query_at<=now()
   AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_query_at FOR UPDATE SKIP LOCKED LIMIT ?) RETURNING *
  """,(rs,n)->row(rs),owner,limit);}
 @Transactional public void queryUnknown(Attempt a){db.update("""
  UPDATE payment_attempts SET state=CASE WHEN query_count+1>=288 OR expires_at<now()-interval '1 day' THEN 'REVIEW_REQUIRED' ELSE 'UNKNOWN' END,
   query_count=query_count+1,next_query_at=now()+interval '30 seconds',lease_owner=NULL,lease_until=NULL,updated_at=now()
  WHERE order_id=? AND lease_owner=? AND state IN ('PROCESSING','READY','UNKNOWN')
  """,a.intent().orderId(),a.lease());}
 @Transactional public void queryResult(Attempt a,PaymentQueryResult result) {
  Attempt current=lock(a.intent().orderId());if(!Objects.equals(a.lease(),current.lease()))return;
  if(result.verified() && (result.success() || result.terminalFailure()) && result.amount()!=null && result.amount().compareTo(a.intent().amount())==0 && (!result.success() || (result.transactionId()!=null && !result.transactionId().isBlank())))
   receive(Provider.valueOf(a.intent().provider()),new PaymentWebhookResult(true,result.success(),a.intent().orderId(),result.transactionId(),result.amount(),result.rawPayload(),null),a.intent().requestId());
  else queryUnknown(a);
 }
 public Object reviews(){return Map.of("uncertain",db.queryForList("SELECT order_id,provider,state,query_count,last_error FROM payment_attempts WHERE state='REVIEW_REQUIRED'"),"refunds",db.queryForList("SELECT * FROM refund_reviews WHERE state='REVIEW_REQUIRED'"));}
 @Transactional public Object review(UUID order,UUID action,UUID actor,String kind,String detail,UUID caseId) {
  if(detail==null || detail.isBlank() || detail.length()>1000)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Review detail required");
  Attempt a=lock(order);
  var previous=db.queryForList("SELECT order_id,actor_id,action,detail FROM payment_audit WHERE id=?",action);
  if(!previous.isEmpty()){
   var saved=previous.getFirst();boolean same=order.equals(saved.get("order_id")) && actor.equals(saved.get("actor_id")) && Objects.equals(kind,saved.get("action")) && Objects.equals(detail,saved.get("detail"));
   if("RECORD_MANUAL_REFUND".equals(kind))same= same && caseId!=null && db.queryForObject("SELECT count(*) FROM refund_reviews WHERE request_id=? AND external_reference=? AND resolved_by=?",Integer.class,caseId,detail,actor)==1;
   if(!same)throw new ResponseStatusException(HttpStatus.CONFLICT,"Action identity already used for another review");
   return Map.of("replayed",true);
  }
  if("REDRIVE_QUERY".equals(kind)) {
   if(db.update("UPDATE payment_attempts SET state='UNKNOWN',query_count=0,next_query_at=now(),lease_owner=NULL,lease_until=NULL WHERE order_id=? AND state='REVIEW_REQUIRED'",order)!=1)
    throw new ResponseStatusException(HttpStatus.CONFLICT,"Only uncertain review can be redriven");
  }else if("RECORD_MANUAL_REFUND".equals(kind)){
   if(caseId==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Compensation requestId required");
   if(db.update("UPDATE refund_reviews SET state='RESOLVED_MANUALLY',external_reference=?,resolved_by=?,resolved_at=now() WHERE order_id=? AND request_id=? AND state='REVIEW_REQUIRED'",detail,actor,order,caseId)!=1)
    throw new ResponseStatusException(HttpStatus.CONFLICT,"No open compensation review");
  }else throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Unknown review action");
  audit(order,actor,action,kind,detail);return Map.of("recorded",true,"requestId",action);
 }
 private void compensation(Intent i,String transaction,java.math.BigDecimal amount,String reason){
  db.update("INSERT INTO refund_reviews(request_id,intent_id,order_id,provider,transaction_id,amount,reason) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING",
   stable("refund:"+i.provider()+":"+transaction),i.intentId(),i.orderId(),i.provider(),transaction,amount,reason);
 }
 @Transactional public void transactionConflict(UUID order) {
  lock(order);
  db.update("UPDATE payment_attempts SET state='REVIEW_REQUIRED',last_error='Provider transaction already attributed',lease_owner=NULL,lease_until=NULL WHERE order_id=? AND state NOT IN ('SUCCEEDED','RECONCILIATION_REQUIRED','SETTLEMENT_PENDING')",order);
  db.update("INSERT INTO payment_audit(id,order_id,action,detail) VALUES(?,?,'TRANSACTION_CONFLICT','Provider transaction identity requires review') ON CONFLICT DO NOTHING",stable("conflict:"+order),order);
 }
 private void audit(UUID order,UUID actor,UUID id,String kind,String detail){db.update("INSERT INTO payment_audit(id,order_id,actor_id,action,detail) VALUES(?,?,?,?,?)",id,order,actor,kind,detail);}
 static UUID stable(String key){return UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8));}
}

package com.ticketbox.notifications;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.List;

@Service
public class NotificationStore {
 private final JdbcTemplate db;
 public NotificationStore(JdbcTemplate db){this.db=db;}
 @Transactional public void accept(JsonNode event) {
  if(!event.path("schemaVersion").isInt() || event.path("schemaVersion").asInt()!=1) throw new IllegalArgumentException("Unsupported schema version");
  java.time.OffsetDateTime.parse(event.path("occurredAt").asText());
  String type=event.path("eventType").asText();
  if(!List.of("ticketing.order-confirmed","concert.reminder-requested").contains(type)) throw new IllegalArgumentException("Unknown event type");
  UUID id=UUID.fromString(event.path("eventId").asText()), user=UUID.fromString(event.path("userId").asText());
  UUID aggregate=UUID.fromString(event.path("aggregateId").asText());
  String correlation=event.path("correlationId").asText();
  if(correlation.isBlank() || correlation.length()>200) throw new IllegalArgumentException("Invalid correlation ID");
  JsonNode payload=event.path("payload");boolean payment=type.equals("ticketing.order-confirmed");
  if(payment && (!aggregate.toString().equals(payload.path("orderId").asText()) || !payload.path("amount").isNumber() || payload.path("amount").decimalValue().signum()<0))
   throw new IllegalArgumentException("Invalid order payload");
  if(!payment && !aggregate.toString().equals(payload.path("concertId").asText())) throw new IllegalArgumentException("Invalid concert payload");
  if(db.update("INSERT INTO notification_inbox(event_id,event_type,correlation_id) VALUES(?,?,?) ON CONFLICT DO NOTHING",id,type,correlation)==0) return;
  String businessType=payment?"PAYMENT_SUCCEEDED":"CONCERT_REMINDER";
  String title=payload.path("concertTitle").asText("TicketBox");
  if(title.length()>350) title=title.substring(0,350);
  String subject=payment?"Ve "+title+" da san sang":"Nhac lich: "+title;
  String body=payment?"Don hang "+aggregate+" da thanh toan thanh cong. Tong tien: "+payload.path("amount").asText()+" VND. Mo My Tickets de xem ve va QR.":
    "Concert "+title+" bat dau luc "+payload.path("eventDate").asText()+". Dia diem: "+payload.path("venueName").asText()+". Mo My Tickets de xem QR.";
  for(String channel:List.of("APP","EMAIL")) {
   String key=businessType+":"+channel+":"+(payment?id:aggregate+":"+user);
   UUID message=UUID.nameUUIDFromBytes(key.getBytes(StandardCharsets.UTF_8));
   db.update("INSERT INTO notifications(user_id,channel,event_type,subject,body,status,sent_at,reference_id,message_id) VALUES(?,?,?,?,?,?,CASE WHEN ?='APP' THEN now() ELSE NULL END,?,?) ON CONFLICT (message_id) DO NOTHING",
     user,channel,businessType,subject,body,channel.equals("APP")?"SENT":"PENDING",channel,payment?aggregate:null,message);
  }
 }
 public record Delivery(UUID id,UUID user,UUID order,String subject,String body,UUID owner){}
 @Transactional public Delivery claim() {
  UUID owner=UUID.randomUUID();
  var rows=db.query("""
   UPDATE notifications SET delivery_owner=?,delivery_lease_until=now()+interval '2 minutes',updated_at=now()
   WHERE id=(SELECT id FROM notifications WHERE channel='EMAIL' AND status='PENDING' AND next_attempt_at<=now()
    AND (delivery_lease_until IS NULL OR delivery_lease_until<now()) ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
   RETURNING id,user_id,reference_id,subject,body
   """,(rs,n)->new Delivery(rs.getObject("id",UUID.class),rs.getObject("user_id",UUID.class),rs.getObject("reference_id",UUID.class),rs.getString("subject"),rs.getString("body"),owner),owner);
  return rows.isEmpty()?null:rows.getFirst();
 }
 @Transactional public boolean renew(Delivery d) {
  return db.update("UPDATE notifications SET delivery_lease_until=now()+interval '2 minutes' WHERE id=? AND delivery_owner=? AND status='PENDING'",d.id(),d.owner())==1;
 }
 @Transactional public void sent(Delivery d) {
  db.update("UPDATE notifications SET status='SENT',sent_at=now(),last_error=NULL,delivery_owner=NULL,delivery_lease_until=NULL,updated_at=now() WHERE id=? AND delivery_owner=? AND status='PENDING'",d.id(),d.owner());
 }
 @Transactional public void failed(Delivery d,String error) {
  db.update("""
   UPDATE notifications SET attempts=attempts+1,status=CASE WHEN attempts+1>=5 THEN 'FAILED' ELSE 'PENDING' END,
    last_error=?,next_attempt_at=now()+least(300,power(2,least(attempts+1,8))) * interval '1 second',
    delivery_owner=NULL,delivery_lease_until=NULL,updated_at=now()
   WHERE id=? AND delivery_owner=? AND status='PENDING'
   """,error.substring(0,Math.min(1000,error.length())),d.id(),d.owner());
 }
}

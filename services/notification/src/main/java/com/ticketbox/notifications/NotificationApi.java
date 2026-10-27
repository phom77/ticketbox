package com.ticketbox.notifications;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.*;

@RestController
public class NotificationApi {
 private final JdbcTemplate db;
 public NotificationApi(JdbcTemplate db){this.db=db;}
 static Map<String,Object> response(Object data){return Map.of("code",200,"message","Thanh cong","timestamp",Instant.now(),"data",data);}
 private Map<String,Object> view(Map<String,Object> row) {
  Map<String,Object> value=new LinkedHashMap<>();
  for(String key:List.of("id","channel","event_type","subject","body","status","sent_at","read_at","created_at")) {
   String name=switch(key){case "event_type"->"eventType";case "sent_at"->"sentAt";case "read_at"->"readAt";case "created_at"->"createdAt";default->key;};
   Object item=row.get(key);if(item instanceof java.sql.Timestamp time)item=time.toInstant();
   value.put(name,item);
  }
  value.put("read",row.get("read_at")!=null);return value;
 }
 private Object list(UUID user,int page,int size) {
  if(page<0 || size<1 || size>100 || page>1000000)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid pagination");
  String where=user==null?"":" WHERE user_id=?";
  Long total=user==null?db.queryForObject("SELECT count(*) FROM notifications",Long.class):db.queryForObject("SELECT count(*) FROM notifications"+where,Long.class,user);
  var rows=user==null?db.queryForList("SELECT * FROM notifications ORDER BY created_at DESC,id LIMIT ? OFFSET ?",size,(long)page*size):
   db.queryForList("SELECT * FROM notifications"+where+" ORDER BY created_at DESC,id LIMIT ? OFFSET ?",user,size,(long)page*size);
  return response(Map.of("content",rows.stream().map(this::view).toList(),"number",page,"size",size,"totalElements",total,
    "totalPages",(total+size-1)/size,"first",page==0,"last",((long)page+1)*size>=total,"empty",rows.isEmpty()));
 }
 @GetMapping("/api/notifications") public Object own(Authentication auth,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return list(UUID.fromString(auth.getName()),page,size);}
 @GetMapping("/api/admin/notifications") public Object all(@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size){return list(null,page,size);}
 @GetMapping("/api/notifications/unread-count") public Object unread(Authentication auth){return response(Map.of("count",db.queryForObject("SELECT count(*) FROM notifications WHERE user_id=? AND channel='APP' AND read_at IS NULL",Long.class,UUID.fromString(auth.getName()))));}
 @PatchMapping("/api/notifications/{id}/read") @Transactional public Object read(@PathVariable UUID id,Authentication auth){
  var rows=db.queryForList("UPDATE notifications SET read_at=coalesce(read_at,now()),updated_at=now() WHERE id=? AND user_id=? RETURNING *",id,UUID.fromString(auth.getName()));
  if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND);return response(view(rows.getFirst()));
 }
 @PostMapping("/api/admin/notifications/{id}/retry") @Transactional public Object retry(@PathVariable UUID id,Authentication auth){
  var rows=db.queryForList("UPDATE notifications SET status='PENDING',attempts=0,last_error=NULL,next_attempt_at=now(),delivery_owner=NULL,delivery_lease_until=NULL,updated_at=now() WHERE id=? AND channel='EMAIL' AND status IN ('FAILED','SKIPPED') RETURNING *",id);
  if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"Only terminal unsent email can be retried");
  db.update("INSERT INTO notification_audit(notification_id,actor_id,action) VALUES(?,?,'RETRY_REQUESTED')",id,UUID.fromString(auth.getName()));return response(view(rows.getFirst()));
 }
 @RestControllerAdvice static class Errors {
  @ExceptionHandler(ResponseStatusException.class) ResponseEntity<?> status(ResponseStatusException error){return ResponseEntity.status(error.getStatusCode()).body(Map.of("code",error.getStatusCode().value(),"message",Objects.toString(error.getReason(),"Request rejected"),"timestamp",Instant.now()));}
 }
}

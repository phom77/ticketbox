package com.ticketbox.notifications;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.*;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.core.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"notification.delivery-interval-ms=3600000","management.health.mail.enabled=false","spring.mail.host=localhost"})
@AutoConfigureMockMvc @Testcontainers @DirtiesContext
class NotificationIntegrationTest {
 static final String SECRET="notification-test-fixture-secret-with-at-least-sixty-four-characters-not-production";
 @Container static final PostgreSQLContainer<?> postgres=new PostgreSQLContainer<>("postgres:16-alpine");
 @Container static final RabbitMQContainer rabbit=new RabbitMQContainer("rabbitmq:3-management-alpine");
 static final AtomicInteger coreStatus=new AtomicInteger(200);
 static final HttpServer core=startCore();
 static HttpServer startCore() {
  try {
   var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
   server.createContext("/internal/notifications/",request->{
    int status="test-internal-token-with-at-least-32-characters".equals(request.getRequestHeaders().getFirst("X-Service-Token"))?coreStatus.get():401;
    boolean document=request.getRequestURI().getPath().endsWith("/document");
    byte[] bytes=(document?"%PDF-1.4 test fixture":"{\"email\":\"fixture@ticketbox.test\",\"fullName\":\"Fixture\"}").getBytes(StandardCharsets.UTF_8);
    request.getResponseHeaders().set("Content-Type",document?"application/pdf":"application/json");
    request.sendResponseHeaders(status,bytes.length);request.getResponseBody().write(bytes);request.close();
   });server.start();return server;
  } catch(Exception exception){throw new IllegalStateException(exception);}
 }
 @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {
  p.add("spring.datasource.url",postgres::getJdbcUrl);p.add("spring.datasource.username",postgres::getUsername);p.add("spring.datasource.password",postgres::getPassword);
  p.add("spring.rabbitmq.host",rabbit::getHost);p.add("spring.rabbitmq.port",rabbit::getAmqpPort);
  p.add("spring.rabbitmq.username",rabbit::getAdminUsername);p.add("spring.rabbitmq.password",rabbit::getAdminPassword);
  p.add("notification.jwt-secret",()->SECRET);p.add("notification.core-url",()->"http://127.0.0.1:"+core.getAddress().getPort());
  p.add("notification.service-token",()->"test-internal-token-with-at-least-32-characters");
 }
 @Autowired NotificationStore store;@Autowired DeliveryWorker worker;@Autowired JdbcTemplate db;
 @Autowired RabbitTemplate broker;@Autowired RabbitAdmin admin;@Autowired ObjectMapper json;@Autowired MockMvc api;
 @MockBean JavaMailSender smtp;
 @BeforeEach void smtpFixture(){
  db.execute("TRUNCATE notification_audit, notifications, notification_inbox");
  coreStatus.set(200);when(smtp.createMimeMessage()).thenAnswer(i->new MimeMessage(Session.getInstance(new Properties())));
 }
 @AfterAll static void stop(@Autowired org.springframework.amqp.rabbit.listener.RabbitListenerEndpointRegistry listeners,
     @Autowired org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor tasks){
  listeners.stop();tasks.destroy();core.stop(0);
 }
 Map<String,Object> event(UUID id,UUID user){UUID order=UUID.randomUUID();return Map.of("schemaVersion",1,"eventType","ticketing.order-confirmed","eventId",id,"aggregateId",order,"userId",user,"occurredAt",Instant.now().toString(),"correlationId",id.toString(),"payload",Map.of("orderId",order,"amount",250000,"concertTitle","Fixture"));}
 void publish(Object value)throws Exception {var properties=new MessageProperties();properties.setContentType("application/json");properties.setDeliveryMode(MessageDeliveryMode.PERSISTENT);broker.send("ticketbox.events","notification.commands.v1",new Message(json.writeValueAsBytes(value),properties));}
 String jwt(UUID user,String role){return Jwts.builder().subject(user.toString()).claim("role",role).expiration(Date.from(Instant.now().plusSeconds(300))).signWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8))).compact();}
 UUID email(UUID user){return db.queryForObject("SELECT id FROM notifications WHERE user_id=? AND channel='EMAIL'",UUID.class,user);}

 @Test void brokerReplayIsIdempotentAndCoreOutageRetainsEmail()throws Exception {
  UUID user=UUID.randomUUID(),id=UUID.randomUUID();var command=event(id,user);coreStatus.set(503);
  publish(command);publish(command);
  await().atMost(Duration.ofSeconds(15)).untilAsserted(()->assertThat(db.queryForObject("SELECT count(*) FROM notifications WHERE user_id=?",Integer.class,user)).isEqualTo(2));
  assertThat(db.queryForObject("SELECT count(*) FROM notification_inbox WHERE event_id=?",Integer.class,id)).isEqualTo(1);
  worker.deliver();assertThat(db.queryForObject("SELECT status FROM notifications WHERE id=?",String.class,email(user))).isEqualTo("PENDING");
  coreStatus.set(200);db.update("UPDATE notifications SET next_attempt_at=now() WHERE user_id=?",user);worker.deliver();
  assertThat(db.queryForObject("SELECT status FROM notifications WHERE id=?",String.class,email(user))).isEqualTo("SENT");
  verify(smtp,times(1)).send(any(MimeMessage.class));
 }
 @Test void ownershipRoleAndAuditedRetryCannotResendSentEmail()throws Exception {
  UUID user=UUID.randomUUID(),other=UUID.randomUUID(),operator=UUID.randomUUID();store.accept(json.valueToTree(event(UUID.randomUUID(),user)));
  UUID id=email(user);
  api.perform(get("/api/notifications")).andExpect(status().isUnauthorized());
  api.perform(get("/api/admin/notifications").header("Authorization","Bearer "+jwt(user,"AUDIENCE"))).andExpect(status().isForbidden());
  api.perform(patch("/api/notifications/"+id+"/read").header("Authorization","Bearer "+jwt(other,"AUDIENCE"))).andExpect(status().isNotFound());
  api.perform(patch("/api/notifications/"+id+"/read").header("Authorization","Bearer "+jwt(user,"AUDIENCE"))).andExpect(status().isOk()).andExpect(jsonPath("$.data.read").value(true));
  db.update("UPDATE notifications SET status='FAILED',attempts=5 WHERE id=?",id);
  api.perform(post("/api/admin/notifications/"+id+"/retry").header("Authorization","Bearer "+jwt(operator,"ADMIN"))).andExpect(status().isOk());
  assertThat(db.queryForObject("SELECT count(*) FROM notification_audit WHERE notification_id=? AND actor_id=?",Integer.class,id,operator)).isEqualTo(1);
  db.update("UPDATE notifications SET status='SENT' WHERE id=?",id);
  api.perform(post("/api/admin/notifications/"+id+"/retry").header("Authorization","Bearer "+jwt(operator,"ADMIN"))).andExpect(status().isConflict());
 }
 @Test void expiredDeliveryLeaseFencesOldOwner() {
  UUID user=UUID.randomUUID();store.accept(json.valueToTree(event(UUID.randomUUID(),user)));
  var first=store.claim();assertThat(first).isNotNull();db.update("UPDATE notifications SET delivery_lease_until=now()-interval '1 second' WHERE id=?",first.id());
  var second=store.claim();assertThat(second.id()).isEqualTo(first.id());assertThat(second.owner()).isNotEqualTo(first.owner());
  store.sent(first);assertThat(db.queryForObject("SELECT status FROM notifications WHERE id=?",String.class,first.id())).isEqualTo("PENDING");
  store.sent(second);assertThat(db.queryForObject("SELECT status FROM notifications WHERE id=?",String.class,first.id())).isEqualTo("SENT");
 }
 @Test void unsupportedSchemaGoesToDeadLetterQueue()throws Exception {
  admin.purgeQueue("notification.commands.v1.dlq", false);
  publish(Map.of("schemaVersion",99));
  var invalidDate=new HashMap<>(event(UUID.randomUUID(),UUID.randomUUID()));invalidDate.put("occurredAt","not-a-date");publish(invalidDate);
  await().atMost(Duration.ofSeconds(15)).untilAsserted(()->assertThat((Integer)admin.getQueueProperties("notification.commands.v1.dlq").get("QUEUE_MESSAGE_COUNT")).isEqualTo(2));
 }
}

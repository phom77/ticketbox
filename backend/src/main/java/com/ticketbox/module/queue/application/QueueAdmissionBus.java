package com.ticketbox.module.queue.application;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** Pub/Sub is a hint; each node reads authoritative Redis state and only pushes to its local audience. */
@Component @RequiredArgsConstructor @Slf4j
public class QueueAdmissionBus implements MessageListener {
    public static final String TOPIC="ticketbox:queue:admission-hints";
    private final StringRedisTemplate redis;
    private final QueueRealtimeService realtime;
    @EventListener
    public void publish(QueueAdmissionEvent event) {
        try { redis.convertAndSend(TOPIC,event.concertId()+":"+event.userId()); }
        catch (RuntimeException exception) { log.warn("Admission committed; status reconciliation will recover missing push"); }
    }
    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String[] fields=new String(message.getBody(),StandardCharsets.UTF_8).split(":",2);
            realtime.onAdmissionHint(UUID.fromString(fields[0]),UUID.fromString(fields[1]));
        } catch (RuntimeException exception) { log.debug("Admission hint could not be delivered",exception); }
    }
}

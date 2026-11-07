package org.ticketbox.ticketing.queue.web.websocket;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.ticketbox.ticketing.queue.application.QueueRealtimeService;

@Component
public class QueueDisconnectListener {
    private final QueueRealtimeService realtime;

    public QueueDisconnectListener(QueueRealtimeService realtime) {
        this.realtime = realtime;
    }

    @EventListener
    public void disconnect(SessionDisconnectEvent event) {
        realtime.handleDisconnect(event.getSessionId());
    }
}

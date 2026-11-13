package org.ticketbox.ticketing.queue.web.websocket;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.web.server.ResponseStatusException;
import org.ticketbox.ticketing.infrastructure.security.JwtService;
import org.ticketbox.ticketing.web.security.BuyerSessions;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JwtStompChannelInterceptorTest {
    @Test
    void privateQueueMessagesStopAfterAnExistingSessionIsRevoked() {
        var jwt = mock(JwtService.class);
        var sessions = mock(BuyerSessions.class);
        when(jwt.isTokenValid("fixture-token")).thenReturn(true);
        when(jwt.extractRole("fixture-token")).thenReturn("AUDIENCE");
        when(jwt.extractUserId("fixture-token")).thenReturn(UUID.randomUUID());
        var interceptor = new JwtStompChannelInterceptor(jwt, sessions);
        var connect = StompHeaderAccessor.create(StompCommand.CONNECT);
        connect.setSessionId("buyer-socket");
        connect.addNativeHeader("Authorization", "Bearer fixture-token");
        connect.setLeaveMutable(true);
        interceptor.preSend(MessageBuilder.createMessage(new byte[0], connect.getMessageHeaders()), null);

        var frame = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        frame.setSessionId("buyer-socket");
        frame.setDestination("/queue/concerts/fixture-userbuyer-socket");
        var message = MessageBuilder.createMessage(new byte[0], frame.getMessageHeaders());
        var outbound = interceptor.outbound();
        assertThat(outbound.beforeHandle(message, null, null)).isSameAs(message);
        doThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED)).when(sessions).require("Bearer fixture-token");
        assertThat(outbound.beforeHandle(message, null, null)).isNull();
    }
}

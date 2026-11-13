package org.ticketbox.ticketing.queue.web.websocket;

import lombok.RequiredArgsConstructor;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;
import org.ticketbox.ticketing.infrastructure.security.JwtService;

import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.MessageHandler;
import org.springframework.messaging.support.ExecutorChannelInterceptor;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.server.ResponseStatusException;
import org.ticketbox.ticketing.web.security.BuyerSessions;

/**
 * Authenticates the STOMP CONNECT frame because browsers cannot attach JWT headers to the SockJS
 * handshake.
 */
@Component
@RequiredArgsConstructor
public class JwtStompChannelInterceptor implements ChannelInterceptor {

    private final JwtService jwtService;
    private final BuyerSessions sessions;
    private final ConcurrentHashMap<String, String> authorizations = new ConcurrentHashMap<>();

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) return message;
        if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            String destination = accessor.getDestination();
            if (destination == null
                    || (!destination.matches("/user/queue/concerts/[0-9a-fA-F-]+")
                            && !destination.matches("/topic/queue/concerts/[0-9a-fA-F-]+"))) {
                throw new IllegalArgumentException("Unsupported queue subscription");
            }
            if (destination.startsWith("/user/")) requireSession(accessor.getSessionId());
            return message;
        }
        if (StompCommand.SEND.equals(accessor.getCommand())) requireSession(accessor.getSessionId());
        if (!StompCommand.CONNECT.equals(accessor.getCommand())) {
            return message;
        }

        String authorization = accessor.getFirstNativeHeader("Authorization");
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new IllegalArgumentException("WebSocket authentication is required");
        }

        String token = authorization.substring(7);
        if (!jwtService.isTokenValid(token) || !"AUDIENCE".equals(jwtService.extractRole(token))) {
            throw new IllegalArgumentException("Only audience accounts can join the waiting room");
        }
        sessions.require(authorization);
        String session = accessor.getSessionId();
        if (session == null) throw new IllegalArgumentException("WebSocket session is required");
        authorizations.put(session, authorization);

        String userId = jwtService.extractUserId(token).toString();
        accessor.setUser(
                new UsernamePasswordAuthenticationToken(
                        userId, null, List.of(new SimpleGrantedAuthority("ROLE_AUDIENCE"))));
        return message;
    }

    public ExecutorChannelInterceptor outbound() {
        return new ExecutorChannelInterceptor() {
            @Override
            public Message<?> beforeHandle(Message<?> message, MessageChannel channel, MessageHandler handler) {
                var headers = message.getHeaders();
                String destination = SimpMessageHeaderAccessor.getDestination(headers);
                if (SimpMessageHeaderAccessor.getMessageType(headers) == SimpMessageType.MESSAGE
                        && destination != null && destination.startsWith("/queue/")) {
                    try {
                        requireSession(SimpMessageHeaderAccessor.getSessionId(headers));
                    } catch (ResponseStatusException unavailable) {
                        return null;
                    }
                }
                return message;
            }
        };
    }

    @EventListener
    public void disconnect(SessionDisconnectEvent event) {
        authorizations.remove(event.getSessionId());
    }

    private void requireSession(String id) {
        sessions.require(id == null ? null : authorizations.get(id));
    }
}

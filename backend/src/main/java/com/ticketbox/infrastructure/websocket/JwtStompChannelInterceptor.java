package com.ticketbox.infrastructure.websocket;

import com.ticketbox.infrastructure.security.JwtService;
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

import java.util.List;

/** Authenticates the STOMP CONNECT frame because browsers cannot attach JWT headers to the SockJS handshake. */
@Component
@RequiredArgsConstructor
public class JwtStompChannelInterceptor implements ChannelInterceptor {

    private final JwtService jwtService;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null) return message;
        if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            String destination = accessor.getDestination();
            if (destination == null || (!destination.matches("/user/queue/concerts/[0-9a-fA-F-]+")
                    && !destination.matches("/topic/queue/concerts/[0-9a-fA-F-]+"))) {
                throw new IllegalArgumentException("Unsupported queue subscription");
            }
            return message;
        }
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

        String userId = jwtService.extractUserId(token).toString();
        accessor.setUser(new UsernamePasswordAuthenticationToken(
                userId,
                null,
                List.of(new SimpleGrantedAuthority("ROLE_AUDIENCE"))
        ));
        return message;
    }
}

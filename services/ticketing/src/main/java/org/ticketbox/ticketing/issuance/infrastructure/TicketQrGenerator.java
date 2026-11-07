package org.ticketbox.ticketing.issuance.infrastructure;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

import javax.crypto.SecretKey;

public class TicketQrGenerator {
    public static String generateQrToken(
            UUID concertId, UUID ticketTypeId, UUID userId, String qrSecret) {
        SecretKey key = Keys.hmacShaKeyFor(qrSecret.getBytes(StandardCharsets.UTF_8));
        return Jwts.builder()
                .subject(UUID.randomUUID().toString())
                .claim("concertId", concertId.toString())
                .claim("ticketTypeId", ticketTypeId.toString())
                .claim("userId", userId.toString())
                .issuedAt(new Date())
                .signWith(key)
                .compact();
    }
}

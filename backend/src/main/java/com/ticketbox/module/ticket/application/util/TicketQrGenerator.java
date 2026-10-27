package com.ticketbox.module.ticket.application.util;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

public class TicketQrGenerator {
    public static String generateQrToken(UUID concertId, UUID ticketTypeId, UUID userId, String qrSecret) {
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

package com.ticketbox.module.checkin.application;

import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;

@Service
public class QrJwtService {
    public boolean verify(String jwtToken, String qrSecret) {
        if (jwtToken == null || qrSecret == null) {
            return false;
        }
        try {
            SecretKey key = Keys.hmacShaKeyFor(qrSecret.getBytes(StandardCharsets.UTF_8));
            Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(jwtToken);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}

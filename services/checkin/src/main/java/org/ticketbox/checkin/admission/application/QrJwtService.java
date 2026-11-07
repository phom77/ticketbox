package org.ticketbox.checkin.admission.application;

import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;

import javax.crypto.SecretKey;

@Service
public class QrJwtService {
    public boolean verify(String jwtToken, String qrSecret) {
        if (jwtToken == null || qrSecret == null) {
            return false;
        }
        try {
            SecretKey key = Keys.hmacShaKeyFor(qrSecret.getBytes(StandardCharsets.UTF_8));
            Jwts.parser().verifyWith(key).build().parseSignedClaims(jwtToken);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}

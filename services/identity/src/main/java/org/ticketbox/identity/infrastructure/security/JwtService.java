package org.ticketbox.identity.infrastructure.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.ticketbox.identity.auth.application.port.SessionReader;
import org.ticketbox.identity.auth.application.port.TokenIssuer;

import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

import javax.crypto.SecretKey;

@Service
public class JwtService implements TokenIssuer, SessionReader {

    private final SecretKey secretKey;
    private final long expirationMs;

    public JwtService(
            @Value("${ticketbox.security.jwt.secret}") String secret,
            @Value("${ticketbox.security.jwt.expiration-ms:86400000}") long expirationMs) {
        this.secretKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationMs;
    }

    public String generateToken(
            UUID userId, String email, String role, String fullName, long sessionVersion) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("email", email);
        claims.put("role", role);
        claims.put("fullName", fullName);
        claims.put("sessionVersion", sessionVersion);

        return Jwts.builder()
                .claims(claims)
                .subject(userId.toString())
                .issuedAt(new Date(System.currentTimeMillis()))
                .expiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(secretKey)
                .compact();
    }

    public UUID extractUserId(String token) {
        String subject = extractClaim(token, Claims::getSubject);
        return UUID.fromString(subject);
    }

    public String extractRole(String token) {
        return extractClaim(token, claims -> claims.get("role", String.class));
    }

    @Override
    public Optional<Session> read(String token) {
        try {
            Claims claims = extractAllClaims(token);
            Long version = claims.get("sessionVersion", Long.class);
            if (version == null || claims.getExpiration() == null) {
                return Optional.empty();
            }
            return Optional.of(new Session(UUID.fromString(claims.getSubject()), version));
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    private <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parser().verifyWith(secretKey).build().parseSignedClaims(token).getPayload();
    }

    public boolean isTokenValid(String token) {
        try {
            Claims claims = extractAllClaims(token);
            return !claims.getExpiration().before(new Date());
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    public long getExpirationMs() {
        return expirationMs;
    }
}

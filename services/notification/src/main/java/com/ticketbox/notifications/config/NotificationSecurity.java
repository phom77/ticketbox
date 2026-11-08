package com.ticketbox.notifications.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ticketbox.notifications.web.ApiMessages;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import jakarta.servlet.*;
import jakarta.servlet.http.*;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Configuration
public class NotificationSecurity {
    @Bean
    SecurityFilterChain security(
            HttpSecurity http,
            @Value("${notification.jwt-secret}") String secret,
            ObjectMapper json,
            ApiMessages messages)
            throws Exception {
        if (secret.length() < 64)
            throw new IllegalStateException("JWT secret must be at least 64 characters");
        var key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        var jwt =
                new OncePerRequestFilter() {
                    @Override
                    protected void doFilterInternal(
                            HttpServletRequest request,
                            HttpServletResponse response,
                            FilterChain chain)
                            throws ServletException, IOException {
                        String header = request.getHeader("Authorization");
                        if (header != null && header.startsWith("Bearer "))
                            try {
                                var claims =
                                        Jwts.parser()
                                                .verifyWith(key)
                                                .build()
                                                .parseSignedClaims(header.substring(7))
                                                .getPayload();
                                UUID user = UUID.fromString(claims.getSubject());
                                String role = claims.get("role", String.class);
                                if (claims.getExpiration() != null
                                        && List.of("AUDIENCE", "STAFF", "ORGANIZER", "ADMIN")
                                                .contains(role))
                                    SecurityContextHolder.getContext()
                                            .setAuthentication(
                                                    new UsernamePasswordAuthenticationToken(
                                                            user.toString(),
                                                            null,
                                                            List.of(
                                                                    new SimpleGrantedAuthority(
                                                                            "ROLE_" + role))));
                            } catch (RuntimeException ignored) {
                                SecurityContextHolder.clearContext();
                            }
                        chain.doFilter(request, response);
                    }
                };
        return http.csrf(c -> c.disable())
                .sessionManagement(c -> c.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(
                        c ->
                                c.requestMatchers("/actuator/health/**")
                                        .permitAll()
                                        .requestMatchers(
                                                "/api/admin/notifications/**", "/actuator/**")
                                        .hasRole("ADMIN")
                                        .requestMatchers("/api/notifications/**")
                                        .authenticated()
                                        .anyRequest()
                                        .denyAll())
                .exceptionHandling(
                        c ->
                                c.authenticationEntryPoint(
                                                (request, response, error) ->
                                                        reject(
                                                                request,
                                                                response,
                                                                json,
                                                                messages,
                                                                401,
                                                                "error.unauthenticated"))
                                        .accessDeniedHandler(
                                                (request, response, error) ->
                                                        reject(
                                                                request,
                                                                response,
                                                                json,
                                                                messages,
                                                                403,
                                                                "error.unauthorized")))
                .addFilterBefore(jwt, UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    private static void reject(
            HttpServletRequest request,
            HttpServletResponse response,
            ObjectMapper json,
            ApiMessages messages,
            int status,
            String key)
            throws IOException {
        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("application/json");
        String message = messages.responseText(key, messages.resolveLocale(request), response);
        json.writeValue(response.getWriter(), Map.of("code", status, "message", message));
    }
}

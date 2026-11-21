package org.ticketbox.ticketing.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;

import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;
import org.ticketbox.ticketing.queue.application.port.AdmissionHealth;
import org.ticketbox.ticketing.queue.application.port.AdmissionHealth.Path;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@RequiredArgsConstructor
public class PurchaseAdmissionHealthInterceptor implements HandlerInterceptor {
    public static final String CONCERT = PurchaseAdmissionHealthInterceptor.class.getName() + ".concert";
    static final String GLOBAL_THROTTLE = PurchaseAdmissionHealthInterceptor.class.getName() + ".throttle";
    private static final String START = PurchaseAdmissionHealthInterceptor.class.getName() + ".start";
    private final AdmissionHealth health;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (health.enabled() && "POST".equals(request.getMethod())) {
            request.setAttribute(START, System.nanoTime());
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler,
            Exception exception) {
        if (!(request.getAttribute(START) instanceof Long start)) return;
        String uri = request.getRequestURI();
        Path path = "/api/orders".equals(uri) ? Path.CHECKOUT
                : uri.endsWith("/reserve") ? Path.RESERVE
                : uri.startsWith("/api/payments/") || uri.startsWith("/api/mock-payments/") ? Path.PAYMENT : null;
        boolean global = Boolean.TRUE.equals(request.getAttribute(GLOBAL_THROTTLE));
        if (global) {
            health.record(null, path == null ? Path.RESERVE : path, false, true, true);
            return;
        }
        if (path == null) return;
        int status = response.getStatus();
        boolean failure = status >= 500 || exception != null;
        if (!failure && (status >= 300 && status != 409)) return;

        UUID concert = request.getAttribute(CONCERT) instanceof UUID id ? id : null;
        if (path == Path.RESERVE
                && request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE) instanceof Map<?, ?> variables
                && variables.get("concertId") instanceof String id) {
            try {
                concert = UUID.fromString(id);
            } catch (IllegalArgumentException ignored) {
                // MVC handles malformed concert IDs.
            }
        }
        boolean slow = !failure && path != Path.PAYMENT
                && System.nanoTime() - start > TimeUnit.MILLISECONDS.toNanos(500);
        health.record(concert, path, slow, failure, status == 503);
    }
}

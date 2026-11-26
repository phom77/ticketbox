package org.ticketbox.catalog.web.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.util.List;
import java.util.Set;
import org.springframework.http.HttpMethod;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.servlet.HandlerInterceptor;
import org.ticketbox.catalog.application.error.AppException;
import org.ticketbox.catalog.application.error.ErrorCode;

/**
 * Organizer sessions keep read access to legacy one-date concerts but cannot change them: creation, details, status,
 * poster, category, ticket types and artist bio. Platform operators use the Admin routes, which are not guarded. Writes
 * to artist bio jobs by id are decided by the job service, because a job may belong to a native event.
 * Set `ticketbox.organizer-legacy-read-only=false` to roll back.
 */
public final class OrganizerLegacyGuard implements HandlerInterceptor {
    public static final String MESSAGE = "error.concert.organizer-legacy-read-only";
    private static final Set<String> READ = Set.of(HttpMethod.GET.name(), HttpMethod.HEAD.name(),
            HttpMethod.OPTIONS.name());
    private static final String BASE = "/api/organizer/manage";
    private static final List<String> WRITE_PATTERNS = List.of(
            BASE + "/concerts", BASE + "/concerts/*", BASE + "/concerts/*/status", BASE + "/concerts/*/poster",
            BASE + "/concerts/*/category", BASE + "/concerts/*/ticket-types", BASE + "/ticket-types/**",
            BASE + "/concerts/*/artist-bio", BASE + "/concerts/*/artist-bio-jobs",
            BASE + "/concerts/*/artist-bio-jobs/compose");
    private final AntPathMatcher matcher = new AntPathMatcher();
    private final boolean readOnly;

    public OrganizerLegacyGuard(boolean readOnly) {
        this.readOnly = readOnly;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (readOnly && !READ.contains(request.getMethod())
                && WRITE_PATTERNS.stream().anyMatch(pattern -> matcher.match(pattern, request.getRequestURI()))) {
            throw new AppException(ErrorCode.UNAUTHORIZED, MESSAGE);
        }
        return true;
    }
}

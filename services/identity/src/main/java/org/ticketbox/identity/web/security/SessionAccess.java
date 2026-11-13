package org.ticketbox.identity.web.security;

import org.springframework.stereotype.Component;
import org.ticketbox.identity.application.error.AppException;
import org.ticketbox.identity.application.error.ErrorCode;
import org.ticketbox.identity.auth.application.CurrentSession;

import java.util.UUID;

@Component
public class SessionAccess {
    private final CurrentSession sessions;

    public SessionAccess(CurrentSession sessions) {
        this.sessions = sessions;
    }

    public UUID requireAccount(String authorization) {
        return sessions.require(bearer(authorization)).getId();
    }

    public UUID requirePlatformAdmin(String authorization) {
        return sessions.requirePlatformAdmin(bearer(authorization));
    }

    public void requireAudience(String authorization) {
        var account = sessions.require(bearer(authorization));
        if (account.getRole() != org.ticketbox.identity.account.domain.User.Role.AUDIENCE) {
            throw new AppException(ErrorCode.FORBIDDEN, "error.forbidden");
        }
    }

    private String bearer(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new AppException(ErrorCode.UNAUTHENTICATED, "error.unauthenticated");
        }
        return authorization.substring(7);
    }
}

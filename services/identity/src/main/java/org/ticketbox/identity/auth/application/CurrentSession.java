package org.ticketbox.identity.auth.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.identity.account.application.port.UserRepository;
import org.ticketbox.identity.account.domain.User;
import org.ticketbox.identity.application.error.AppException;
import org.ticketbox.identity.application.error.ErrorCode;
import org.ticketbox.identity.auth.application.port.SessionReader;

import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class CurrentSession {
    private final SessionReader tokens;
    private final UserRepository accounts;

    public CurrentSession(SessionReader tokens, UserRepository accounts) {
        this.tokens = tokens;
        this.accounts = accounts;
    }

    public User require(String token) {
        SessionReader.Session session = tokens.read(token).orElseThrow(this::unauthenticated);
        return accounts.findById(session.accountId())
                .filter(user -> user.isActive() && user.getSessionVersion() == session.version())
                .orElseThrow(this::unauthenticated);
    }

    public UUID requirePlatformAdmin(String token) {
        User user = require(token);
        if (user.getRole() != User.Role.ADMIN) {
            throw new AppException(ErrorCode.FORBIDDEN, "error.forbidden");
        }
        return user.getId();
    }

    private AppException unauthenticated() {
        return new AppException(ErrorCode.UNAUTHENTICATED, "error.unauthenticated");
    }
}

package org.ticketbox.identity.auth.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.ticketbox.identity.auth.application.PasswordRecovery;

import java.util.UUID;

@RestController
class PasswordRecoveryController {
    private final PasswordRecovery recovery;

    PasswordRecoveryController(PasswordRecovery recovery) {
        this.recovery = recovery;
    }

    @PostMapping("/api/auth/password-reset")
    ResponseEntity<Void> request(@RequestBody Request input, HttpServletRequest request) {
        if (!recovery.enabled()) return ResponseEntity.status(503).cacheControl(CacheControl.noStore()).build();
        String client = request.getHeader("X-TicketBox-Client-Ip");
        recovery.request(input.email(), client == null ? request.getRemoteAddr() : client);
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore()).build();
    }

    @PostMapping("/api/auth/password-reset/confirm")
    ResponseEntity<Void> confirm(@RequestBody Confirmation input) {
        recovery.confirm(input.token(), input.password());
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @PostMapping("/internal/split/password-reset/mail/claim")
    ResponseEntity<PasswordRecovery.Mail> claim() {
        return recovery.claim().map(mail -> ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(mail))
                .orElseGet(() -> ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build());
    }

    @PostMapping("/internal/split/password-reset/mail/finish")
    ResponseEntity<Void> finish(@RequestBody Outcome input) {
        recovery.finish(input.id(), input.leaseId(), input.delivered());
        return ResponseEntity.noContent().build();
    }

    record Request(String email) {}
    record Confirmation(String token, String password) {}
    record Outcome(UUID id, UUID leaseId, boolean delivered) {}
}

package org.ticketbox.identity.account.application.port;

import java.util.UUID;

public interface AccountAccessAudit {
    void record(UUID actor, UUID target, String action, String value);
}

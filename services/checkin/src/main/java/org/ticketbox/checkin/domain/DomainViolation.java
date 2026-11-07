package org.ticketbox.checkin.domain;

public final class DomainViolation extends IllegalStateException {
    private final String rule;

    public DomainViolation(String rule, String message) {
        super(message);
        this.rule = rule;
    }

    public String rule() {
        return rule;
    }
}

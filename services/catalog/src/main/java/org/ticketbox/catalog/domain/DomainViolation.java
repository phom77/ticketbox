package org.ticketbox.catalog.domain;

public final class DomainViolation extends IllegalStateException {
    private final String rule;
    private final Object[] messageArguments;

    public DomainViolation(String rule, String message, Object... messageArguments) {
        super(message);
        this.rule = rule;
        this.messageArguments = messageArguments.clone();
    }

    public Object[] messageArguments() {
        return messageArguments.clone();
    }

    public String rule() {
        return rule;
    }
}

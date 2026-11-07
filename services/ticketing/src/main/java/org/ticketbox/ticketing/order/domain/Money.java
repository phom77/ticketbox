package org.ticketbox.ticketing.order.domain;

import org.ticketbox.ticketing.domain.DomainViolation;

import java.math.BigDecimal;
import java.util.Objects;

public record Money(BigDecimal amount) {
    public Money {
        Objects.requireNonNull(amount, "amount");
        if (amount.signum() < 0 || amount.stripTrailingZeros().scale() > 0) {
            throw new DomainViolation("INVALID_REQUEST", "Giá tiền VND phải là số nguyên không âm");
        }
    }

    public Money multiply(int quantity) {
        if (quantity < 1) throw new DomainViolation("INVALID_REQUEST", "Số lượng phải lớn hơn 0");
        return new Money(amount.multiply(BigDecimal.valueOf(quantity)));
    }
}

package org.ticketbox.ticketing.queue.domain;

import org.ticketbox.ticketing.domain.DomainViolation;

import java.util.UUID;

public record ShoppingSession(UUID concertId, UUID userId, String token) {
    public void authorize(String presentedToken) {
        requireToken(presentedToken);
        if (!presentedToken.equals(token))
            throw new DomainViolation(
                    "UNAUTHORIZED", "Phiên mua vé của bạn không còn hoạt động hoặc đã hết hạn");
    }

    public static void requireToken(String token) {
        if (token == null || token.isBlank())
            throw new DomainViolation(
                    "UNAUTHORIZED", "Vui lòng vào phòng chờ trước khi tạo đơn hàng");
    }
}

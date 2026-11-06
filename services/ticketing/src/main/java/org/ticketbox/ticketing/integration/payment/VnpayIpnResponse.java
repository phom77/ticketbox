package org.ticketbox.ticketing.integration.payment;

public record VnpayIpnResponse(
        String RspCode,
        String Message
) {}

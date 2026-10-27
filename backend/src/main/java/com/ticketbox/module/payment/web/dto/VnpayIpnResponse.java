package com.ticketbox.module.payment.web.dto;

public record VnpayIpnResponse(
        String RspCode,
        String Message
) {}

package org.ticketbox.ticketing.application.port.payment;

public record VnpayIpnResponse(String RspCode, String Message) {}

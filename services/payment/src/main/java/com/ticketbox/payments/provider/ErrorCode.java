package com.ticketbox.payments.provider;
public enum ErrorCode {
 INVALID_REQUEST, PAYMENT_GATEWAY_UNAVAILABLE, INVALID_STATUS_TRANSITION, INTERNAL_SERVER_ERROR;
 public String getMessage(){return name();}
}

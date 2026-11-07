package com.ticketbox.payments.application.port;

import com.ticketbox.payments.application.dto.PaymentContract.Ack;

public interface PaymentResults {
    Ack deliver(String payload) throws Exception;
}

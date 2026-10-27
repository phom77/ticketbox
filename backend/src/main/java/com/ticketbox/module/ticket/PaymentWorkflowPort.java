package com.ticketbox.module.ticket;

import com.ticketbox.shared.payment.*;
import java.util.List;
import java.util.UUID;

public interface PaymentWorkflowPort {
    PaymentIntent prepare(UUID orderId, UUID userId, String provider);
    Progress owned(UUID orderId, UUID userId);
    List<Claim> claim(int limit);
    void snapshot(Claim claim, PaymentSnapshot snapshot);
    void failed(Claim claim, String error);
    PaymentAck receive(PaymentResult result);
    record Progress(OrderView order, PaymentIntent intent, PaymentSnapshot snapshot) {}
    record Claim(PaymentIntent intent, UUID owner) {}
}

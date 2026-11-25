package org.ticketbox.ticketing.order.application.port;

/** Tells the buyer about a refund request change. Delivery is durable and asynchronous. */
public interface RefundRequestNotifier {
    enum Kind {
        RECEIVED,
        APPROVED,
        REJECTED
    }

    void notifyBuyer(Kind kind, RefundRequestStore.Row context);
}

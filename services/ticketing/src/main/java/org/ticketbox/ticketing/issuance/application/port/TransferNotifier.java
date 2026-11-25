package org.ticketbox.ticketing.issuance.application.port;

import org.ticketbox.ticketing.issuance.domain.TicketTransfer;

/** Tells both people about a transfer change. Delivery is durable and asynchronous. */
public interface TransferNotifier {
    enum Kind {
        OFFERED,
        ACCEPTED,
        DECLINED,
        CANCELLED,
        EXPIRED
    }

    void notifyBoth(Kind kind, TicketTransfer transfer, TicketTransferStore.Detail context);
}

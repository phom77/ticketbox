package org.ticketbox.ticketing.issuance.application.port;

import org.ticketbox.ticketing.issuance.domain.TicketTransfer;
import org.ticketbox.ticketing.issuance.domain.TransferEligibility;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Storage for ticket transfers and the order-lock protocol that serialises them with other order changes. */
public interface TicketTransferStore {
    record TicketFacts(UUID ticketId, UUID orderId, UUID concertId, UUID ticketTypeId, UUID holderId,
            String concertTitle, OffsetDateTime eventDate, TransferEligibility.Facts rules) {}

    record Detail(TicketTransfer transfer, UUID orderId, UUID concertId, String concertTitle, OffsetDateTime eventDate,
            String ticketTypeName, String venueName, String sectionLabel, String rowLabel, String seatLabel) {}

    Optional<UUID> orderIdOfTicket(UUID ticketId);

    /** Takes the order's row lock, the same lock that payment, refund and expiry use. */
    void lockOrder(UUID orderId);

    Optional<TicketFacts> facts(UUID ticketId);

    Optional<TicketTransfer> find(UUID transferId);

    Optional<TicketTransfer> findPendingByTicket(UUID ticketId);

    Optional<TicketTransfer> findLatestByTicket(UUID ticketId);

    Optional<TicketTransfer> findByNewTicket(UUID ticketId);

    Optional<Detail> detail(UUID transferId);

    List<Detail> detailsFor(UUID accountId, int limit);

    void insert(TicketTransfer transfer);

    void update(TicketTransfer transfer);

    /** Marks the original ticket TRANSFERRED and inserts the recipient's ticket with the given identity and QR. */
    void replaceTicket(UUID originalTicketId, UUID replacementTicketId, UUID recipientId, String qrCode,
            String qrSecret);

    long countOffersSince(UUID senderId, OffsetDateTime since);

    List<UUID> dueTransferIds(OffsetDateTime now, int limit);
}

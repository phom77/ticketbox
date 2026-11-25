package org.ticketbox.ticketing.issuance.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.application.error.ErrorCode;
import org.ticketbox.ticketing.application.port.identity.UserContactPort;
import org.ticketbox.ticketing.application.port.identity.UserContactView;
import org.ticketbox.ticketing.domain.DomainViolation;
import org.ticketbox.ticketing.issuance.application.dto.TransferRecipient;
import org.ticketbox.ticketing.issuance.application.dto.TransferState;
import org.ticketbox.ticketing.issuance.application.dto.TransferView;
import org.ticketbox.ticketing.issuance.application.port.TicketSigner;
import org.ticketbox.ticketing.issuance.application.port.TicketTransferStore;
import org.ticketbox.ticketing.issuance.application.port.TicketTransferStore.Detail;
import org.ticketbox.ticketing.issuance.application.port.TicketTransferStore.TicketFacts;
import org.ticketbox.ticketing.issuance.application.port.TransferNotifier;
import org.ticketbox.ticketing.issuance.application.port.TransferNotifier.Kind;
import org.ticketbox.ticketing.issuance.domain.TicketTransfer;
import org.ticketbox.ticketing.issuance.domain.TransferEligibility;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayDeque;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Offer, accept, decline, cancel and expire ticket transfers. Every change takes the order row lock
 * first, so an accept and a cancel on the same ticket are applied one after the other.
 */
@Service
public class TicketTransferService {
    static final int OFFERS_PER_HOUR = 20;
    static final int LOOKUPS_PER_TEN_MINUTES = 30;
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private final TicketTransferStore store;
    private final UserContactPort identity;
    private final TicketSigner signer;
    private final TransferNotifier notifier;
    private final TransactionTemplate transaction;
    private final Map<UUID, ArrayDeque<Instant>> lookups = new ConcurrentHashMap<>();

    public TicketTransferService(TicketTransferStore store, UserContactPort identity, TicketSigner signer,
            TransferNotifier notifier, TransactionTemplate transaction) {
        this.store = store;
        this.identity = identity;
        this.signer = signer;
        this.notifier = notifier;
        this.transaction = transaction;
    }

    /** Shows the sender who the exact email belongs to before the offer is sent. */
    public TransferRecipient previewRecipient(UUID senderId, UUID ticketId, String email) {
        requireHeld(ticketId, senderId);
        throttleLookups(senderId);
        UserContactView recipient = resolve(email);
        if (recipient.id().equals(senderId)) throw new AppException(ErrorCode.TRANSFER_NOT_ALLOWED, "error.transfer.self");
        return new TransferRecipient(displayName(recipient));
    }

    @Transactional
    public TransferView offer(UUID senderId, UUID ticketId, String email) {
        TicketFacts first = requireHeld(ticketId, senderId);
        throttleLookups(senderId);
        UserContactView recipient = resolve(email);
        UserContactView sender = identity.findById(senderId).orElse(null);
        store.lockOrder(first.orderId());
        TicketFacts facts = store.facts(ticketId).filter(f -> f.holderId().equals(senderId))
                .orElseThrow(TicketTransferService::ticketNotFound);
        var pending = store.findPendingByTicket(ticketId);
        if (pending.isPresent()) {
            if (pending.get().recipientId().equals(recipient.id())) return view(store.detail(pending.get().id()).orElseThrow(), senderId);
            throw new AppException(ErrorCode.TRANSFER_NOT_ALLOWED, "error.transfer.pending");
        }
        OffsetDateTime now = OffsetDateTime.now();
        TransferEligibility.blocker(facts.rules(), now).ifPresent(reason -> {
            throw new AppException(ErrorCode.TRANSFER_NOT_ALLOWED, reason.messageKey());
        });
        if (store.countOffersSince(senderId, now.minusHours(1)) >= OFFERS_PER_HOUR) {
            throw new AppException(ErrorCode.RATE_LIMIT_EXCEEDED, "error.transfer.rate-limited");
        }
        TicketTransfer transfer = TicketTransfer.offer(ticketId, senderId, recipient.id(),
                sender == null ? fallbackName() : displayName(sender), displayName(recipient), now,
                facts.rules().cutoffAt());
        store.insert(transfer);
        Detail detail = store.detail(transfer.id()).orElseThrow();
        notifier.notifyBoth(Kind.OFFERED, transfer, detail);
        return view(detail, senderId);
    }

    @Transactional
    public TransferView accept(UUID accountId, UUID transferId) {
        TicketTransfer transfer = lockedTransfer(accountId, transferId);
        TicketFacts facts = store.facts(transfer.ticketId()).orElseThrow(TicketTransferService::notFound);
        UUID replacement = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        transfer.accept(accountId, now, replacement);
        TransferEligibility.blocker(facts.rules(), now).ifPresent(reason -> {
            throw new AppException(ErrorCode.TRANSFER_NOT_ALLOWED, reason.messageKey());
        });
        String secret = UUID.randomUUID().toString();
        String qr = signer.sign(facts.concertId(), facts.ticketTypeId(), accountId, secret);
        store.replaceTicket(transfer.ticketId(), replacement, accountId, qr, secret);
        store.update(transfer);
        Detail detail = store.detail(transferId).orElseThrow();
        notifier.notifyBoth(Kind.ACCEPTED, transfer, detail);
        return view(detail, accountId);
    }

    @Transactional
    public TransferView decline(UUID accountId, UUID transferId) {
        TicketTransfer transfer = lockedTransfer(accountId, transferId);
        transfer.decline(accountId, OffsetDateTime.now());
        return finish(Kind.DECLINED, transfer, accountId);
    }

    @Transactional
    public TransferView cancel(UUID accountId, UUID transferId) {
        TicketTransfer transfer = lockedTransfer(accountId, transferId);
        transfer.cancel(accountId, OffsetDateTime.now());
        return finish(Kind.CANCELLED, transfer, accountId);
    }

    /** Expires every offer past its cut-off; each offer is its own transaction so one failure stops nothing else. */
    public int expireDue() {
        int expired = 0;
        for (UUID id : store.dueTransferIds(OffsetDateTime.now(), 100)) {
            try {
                Boolean done = transaction.execute(status -> expireOne(id));
                if (Boolean.TRUE.equals(done)) expired++;
            } catch (RuntimeException failure) {
                org.slf4j.LoggerFactory.getLogger(getClass()).warn("Transfer expiry will retry: {}", failure.getMessage());
            }
        }
        return expired;
    }

    @Transactional(readOnly = true)
    public List<TransferView> mine(UUID accountId) {
        return store.detailsFor(accountId, 100).stream().map(detail -> view(detail, accountId)).toList();
    }

    @Transactional(readOnly = true)
    public TransferView get(UUID accountId, UUID transferId) {
        Detail detail = store.detail(transferId).filter(d -> d.transfer().involves(accountId))
                .orElseThrow(TicketTransferService::notFound);
        return view(detail, accountId);
    }

    @Transactional(readOnly = true)
    public TransferState state(UUID accountId, UUID ticketId) {
        TicketFacts facts = requireHeld(ticketId, accountId);
        var latest = store.findLatestByTicket(ticketId);
        TransferView pending = latest.filter(t -> t.status() == TicketTransfer.Status.PENDING)
                .flatMap(t -> store.detail(t.id())).map(d -> view(d, accountId)).orElse(null);
        String receivedFrom = store.findByNewTicket(ticketId).map(TicketTransfer::senderName).orElse(null);
        String transferredTo = latest.filter(t -> t.status() == TicketTransfer.Status.ACCEPTED)
                .map(TicketTransfer::recipientName).orElse(null);
        var blocker = TransferEligibility.blocker(facts.rules(), OffsetDateTime.now());
        boolean can = blocker.isEmpty() && pending == null;
        return new TransferState(can, blocker.map(Enum::name).orElse(null), facts.rules().cutoffAt(), pending,
                receivedFrom, transferredTo);
    }

    private boolean expireOne(UUID transferId) {
        TicketTransfer transfer = store.find(transferId).orElse(null);
        if (transfer == null) return false;
        UUID orderId = store.orderIdOfTicket(transfer.ticketId()).orElse(null);
        if (orderId == null) return false;
        store.lockOrder(orderId);
        transfer = store.find(transferId).orElseThrow();
        if (transfer.status() != TicketTransfer.Status.PENDING) return false;
        try {
            transfer.expire(OffsetDateTime.now());
        } catch (DomainViolation notDue) {
            return false;
        }
        store.update(transfer);
        notifier.notifyBoth(Kind.EXPIRED, transfer, store.detail(transferId).orElseThrow());
        return true;
    }

    private TransferView finish(Kind kind, TicketTransfer transfer, UUID accountId) {
        store.update(transfer);
        Detail detail = store.detail(transfer.id()).orElseThrow();
        notifier.notifyBoth(kind, transfer, detail);
        return view(detail, accountId);
    }

    /** Loads the transfer for one of its people, takes the order lock, then reloads it under the lock. */
    private TicketTransfer lockedTransfer(UUID accountId, UUID transferId) {
        TicketTransfer unlocked = store.find(transferId).filter(t -> t.involves(accountId))
                .orElseThrow(TicketTransferService::notFound);
        store.lockOrder(store.orderIdOfTicket(unlocked.ticketId()).orElseThrow(TicketTransferService::notFound));
        return store.find(transferId).orElseThrow(TicketTransferService::notFound);
    }

    private TicketFacts requireHeld(UUID ticketId, UUID holderId) {
        return store.facts(ticketId).filter(f -> f.holderId().equals(holderId))
                .orElseThrow(TicketTransferService::ticketNotFound);
    }

    private UserContactView resolve(String email) {
        String normalized = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() > 254 || !EMAIL.matcher(normalized).matches()) {
            throw new AppException(ErrorCode.TRANSFER_RECIPIENT_NOT_FOUND, "error.transfer.recipient-unknown");
        }
        return identity.findAccountIdByEmail(normalized).flatMap(identity::findById)
                .orElseThrow(() -> new AppException(ErrorCode.TRANSFER_RECIPIENT_NOT_FOUND,
                        "error.transfer.recipient-unknown"));
    }

    private void throttleLookups(UUID senderId) {
        var calls = lookups.computeIfAbsent(senderId, id -> new ArrayDeque<>());
        Instant now = Instant.now();
        synchronized (calls) {
            while (!calls.isEmpty() && calls.peekFirst().isBefore(now.minus(Duration.ofMinutes(10)))) calls.pollFirst();
            if (calls.size() >= LOOKUPS_PER_TEN_MINUTES) {
                throw new AppException(ErrorCode.RATE_LIMIT_EXCEEDED, "error.transfer.rate-limited");
            }
            calls.addLast(now);
        }
    }

    private static TransferView view(Detail detail, UUID viewer) {
        TicketTransfer t = detail.transfer();
        boolean sender = t.senderId().equals(viewer);
        return new TransferView(t.id(), t.ticketId(), detail.orderId(), sender ? "SENT" : "RECEIVED", t.status().name(),
                sender ? t.recipientName() : t.senderName(), detail.concertId(), detail.concertTitle(),
                detail.eventDate(), detail.ticketTypeName(), detail.venueName(), detail.sectionLabel(),
                detail.rowLabel(), detail.seatLabel(), t.createdAt(), t.expiresAt(), t.decidedAt(),
                sender ? null : t.newTicketId());
    }

    private static String displayName(UserContactView user) {
        return user.fullName() == null || user.fullName().isBlank() ? fallbackName() : user.fullName().trim();
    }

    private static String fallbackName() {
        return "TicketBox member";
    }

    private static AppException ticketNotFound() {
        return new AppException(ErrorCode.TICKET_NOT_FOUND, "error.ticket-not-found");
    }

    private static AppException notFound() {
        return new AppException(ErrorCode.TRANSFER_NOT_FOUND, "error.transfer.not-found");
    }
}

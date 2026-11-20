package org.ticketbox.ticketing.performance.application;

import static org.ticketbox.ticketing.application.error.ErrorCode.*;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.ticketbox.ticketing.application.error.AppException;
import org.ticketbox.ticketing.inventory.hold.application.port.PurchaseLock;
import org.ticketbox.ticketing.order.application.port.PurchaseSessions;
import org.ticketbox.ticketing.performance.application.port.PerformanceStock;
import org.ticketbox.ticketing.performance.application.port.PerformanceStock.*;
import org.ticketbox.ticketing.performance.domain.PerformanceSale.Kind;
import org.ticketbox.ticketing.queue.application.port.QueueAccessPort;

@Service
public class PerformanceHolds {
    private static final int MAX_SELECTION_QUANTITY = 100;

    private final PerformanceStock stock;
    private final PurchaseLock buyers;
    private final QueueAccessPort queue;
    private final PurchaseSessions sessions;

    public PerformanceHolds(PerformanceStock stock, PurchaseLock buyers, QueueAccessPort queue,
                            PurchaseSessions sessions) {
        this.stock = stock;
        this.buyers = buyers;
        this.queue = queue;
        this.sessions = sessions;
    }

    @Transactional
    public HoldView replace(Scope scope, String token, String requestKey, Long layoutVersion,
                            long holdVersion, List<Pick> items) {
        if (requestKey == null || requestKey.isBlank() || requestKey.length() > 128) {
            throw new AppException(INVALID_REQUEST, "error.idempotency-key.invalid");
        }
        var picks = normalize(items);
        Sale sale = requireSale(scope.performanceId(), true);
        buyers.lock(scope.userId(), scope.performanceId());
        var expiresWithSession = sessionDeadline(scope, token);
        var tokenHash = hash(token);
        var payloadHash = hash(tokenHash + ":" + layoutVersion + ":" + holdVersion + ":" + picks);
        var existing = stock.current(scope).orElse(null);
        var replay = stock.request(scope, requestKey);
        if (replay.isPresent()) {
            var saved = replay.get();
            if (!saved.payloadHash().equals(payloadHash)) throw new AppException(DUPLICATE_IDEMPOTENCY_KEY);
            return view(saved.hold(), existing != null && existing.version() == saved.hold().version()
                    && isActive(saved.hold(), OffsetDateTime.now()));
        }

        if (!Objects.equals(layoutVersion, sale.layoutVersion())) {
            throw new AppException(PERFORMANCE_CONFLICT, "error.performance.stale-layout");
        }
        boolean sameSession = existing != null && existing.tokenHash().equals(tokenHash);
        long currentVersion = sameSession ? existing.version() : 0;
        if (holdVersion != currentVersion) {
            throw new AppException(PERFORMANCE_CONFLICT, "error.performance.stale-hold");
        }

        var previous = existing == null ? List.<Line>of() : existing.items();
        var now = OffsetDateTime.now();
        if (!picks.isEmpty()) requireOnSale(sale, now);
        long desired = picks.stream().mapToLong(Pick::quantity).sum();
        if (desired > 0 && stock.activeOrderQuantity(scope) + desired > sale.maxPerAccount()) {
            throw new AppException(TICKET_LIMIT_EXCEEDED);
        }
        boolean retainsPrior = sameSession && isActive(existing, now);
        var lines = pricedLines(scope.performanceId(), picks, retainsPrior ? previous : List.of(), now);
        var expiry = lines.isEmpty() ? null : earlier(expiresWithSession, sale.saleEndAt());
        if (expiry != null && retainsPrior && existing.expiresAt() != null) {
            expiry = earlier(expiry, existing.expiresAt());
        }
        if (expiry != null && !expiry.isAfter(now)) {
            throw new AppException(UNAUTHORIZED, "error.shopping-session.expired");
        }
        var hold = new Hold(existing == null ? UUID.randomUUID() : existing.id(), tokenHash,
                existing == null ? 1 : existing.version() + 1, expiry, lines);
        stock.replace(scope, hold, previous);
        if (expiry != null && !expiry.isAfter(OffsetDateTime.now())) {
            throw new AppException(UNAUTHORIZED, "error.shopping-session.expired");
        }
        stock.remember(scope, requestKey, new SavedRequest(payloadHash, hold));
        return view(hold, true);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public HoldView current(Scope scope, String token) {
        requireSale(scope.performanceId(), false);
        queue.validateAccess(scope.performanceId(), scope.userId(), token);
        var tokenHash = hash(token);
        var now = OffsetDateTime.now();
        return stock.current(scope).filter(hold -> hold.tokenHash().equals(tokenHash))
                .map(hold -> isActive(hold, now) ? view(hold, true)
                        : new HoldView(hold.version(), null, List.of(), BigDecimal.ZERO, false))
                .orElseGet(() -> new HoldView(0, null, List.of(), BigDecimal.ZERO, true));
    }

    @Transactional
    public void release(Scope scope, String token) {
        requireSale(scope.performanceId(), true);
        queue.validateAccess(scope.performanceId(), scope.userId(), token);
        releaseSession(scope, token);
    }

    @Transactional
    public void releaseSession(Scope scope, String token) {
        if (token == null || token.isBlank() || stock.sale(scope.performanceId(), false).isEmpty()) return;
        buyers.lock(scope.userId(), scope.performanceId());
        stock.current(scope).filter(hold -> hold.tokenHash().equals(hash(token)) && !hold.items().isEmpty())
                .ifPresent(hold -> clear(scope, hold));
    }

    @Transactional
    public void expire(Scope scope) {
        buyers.lock(scope.userId(), scope.performanceId());
        stock.current(scope).filter(hold -> hold.expiresAt() != null && !isActive(hold, OffsetDateTime.now()))
                .ifPresent(hold -> clear(scope, hold));
    }

    @Transactional
    public Checkout lockForCheckout(Scope scope, String token, long holdVersion) {
        Sale sale = requireSale(scope.performanceId(), true);
        buyers.lock(scope.userId(), scope.performanceId());
        queue.validateAccess(scope.performanceId(), scope.userId(), token);
        var now = OffsetDateTime.now();
        requireOnSale(sale, now);
        var hold = stock.current(scope)
                .filter(current -> current.tokenHash().equals(hash(token)) && isActive(current, now)
                        && current.version() == holdVersion && !current.items().isEmpty())
                .orElseThrow(() -> new AppException(PERFORMANCE_CONFLICT, "error.performance.stale-hold"));
        return new Checkout(sale, hold, now);
    }

    public void allocate(Scope scope, Hold hold, List<Allocation> allocations) {
        stock.allocate(scope, hold, allocations);
        if (!hold.expiresAt().isAfter(OffsetDateTime.now())) {
            throw new AppException(PERFORMANCE_CONFLICT, "error.performance.stale-hold");
        }
    }

    private void clear(Scope scope, Hold hold) {
        stock.replace(scope, new Hold(hold.id(), hold.tokenHash(), hold.version() + 1, null, List.of()), hold.items());
    }

    private OffsetDateTime sessionDeadline(Scope scope, String token) {
        queue.validateAccess(scope.performanceId(), scope.userId(), token);
        Long ttl = sessions.remainingSeconds(scope.performanceId(), scope.userId());
        if (ttl == null || ttl <= 0) throw new AppException(UNAUTHORIZED, "error.shopping-session.expired");
        return OffsetDateTime.now().plusSeconds(ttl);
    }

    private List<Line> pricedLines(UUID performanceId, List<Pick> picks, List<Line> previous, OffsetDateTime now) {
        if (picks.isEmpty()) return List.of();
        var offers = stock.offers(performanceId).stream().collect(Collectors.toMap(Offer::id, Function.identity()));
        var result = new ArrayList<Line>();
        for (Pick pick : picks) {
            int remaining = pick.quantity();
            for (Line line : previous) {
                if (remaining == 0) break;
                if (!line.offerId().equals(pick.offerId()) || !Objects.equals(line.seatId(), pick.seatId())) continue;
                int retained = Math.min(line.quantity(), remaining);
                result.add(line.withQuantity(retained));
                remaining -= retained;
            }
            if (remaining > 0) {
                result.add(quote(performanceId, pick, offers.get(pick.offerId()), remaining, now));
            }
        }
        return List.copyOf(result);
    }

    private Line quote(UUID performanceId, Pick pick, Offer offer, int quantity, OffsetDateTime now) {
        if (offer == null || !offer.activeAt(now) || ((offer.kind() == Kind.ASSIGNED) != (pick.seatId() != null))) {
            throw new AppException(PERFORMANCE_CONFLICT, "error.performance.offer-unavailable");
        }
        Seat seat = pick.seatId() == null ? null : stock.seat(performanceId, pick.seatId())
                .filter(candidate -> candidate.groupId().equals(offer.groupId()))
                .orElseThrow(() -> new AppException(INVALID_REQUEST, "error.performance.seat-outside-offer"));
        return new Line(offer.id(), offer.groupId(), pick.seatId(), quantity, offer.price(), offer.name(),
                offer.sectionLabel(), seat == null ? null : seat.rowLabel(), seat == null ? null : seat.seatLabel());
    }

    private static List<Pick> normalize(List<Pick> items) {
        if (items == null || items.size() > MAX_SELECTION_QUANTITY) throw new AppException(INVALID_REQUEST);
        var seats = new HashSet<UUID>();
        var gaOffers = new HashSet<UUID>();
        var normalized = new ArrayList<Pick>();
        for (Pick item : items) {
            if (item == null || item.offerId() == null) throw new AppException(INVALID_REQUEST);
            if (item.seatId() == null) {
                if (item.quantity() == null || item.quantity() < 1 || item.quantity() > MAX_SELECTION_QUANTITY
                        || !gaOffers.add(item.offerId())) throw new AppException(INVALID_REQUEST);
            } else if (!seats.add(item.seatId()) || (item.quantity() != null && item.quantity() != 1)) {
                throw new AppException(INVALID_REQUEST);
            }
            normalized.add(new Pick(item.offerId(), item.seatId(), item.seatId() == null ? item.quantity() : 1));
        }
        normalized.sort(Comparator.comparing(Pick::offerId)
                .thenComparing(Pick::seatId, Comparator.nullsFirst(Comparator.naturalOrder())));
        return normalized;
    }

    private Sale requireSale(UUID performanceId, boolean lock) {
        return stock.sale(performanceId, lock).filter(Sale::publicVisible)
                .orElseThrow(() -> new AppException(CONCERT_NOT_FOUND));
    }

    private static void requireOnSale(Sale sale, OffsetDateTime now) {
        if (!sale.onSale() || sale.suspended()) throw new AppException(CONCERT_NOT_ON_SALE);
        if (now.isBefore(sale.saleStartAt()) || !now.isBefore(sale.saleEndAt())) throw new AppException(SALE_NOT_OPEN);
    }

    private static boolean isActive(Hold hold, OffsetDateTime now) {
        return hold.items().isEmpty() || (hold.expiresAt() != null && hold.expiresAt().isAfter(now));
    }

    private static OffsetDateTime earlier(OffsetDateTime first, OffsetDateTime second) {
        return first.isBefore(second) ? first : second;
    }

    private static HoldView view(Hold hold, boolean active) {
        return new HoldView(hold.version(), hold.expiresAt(), hold.items(), hold.items().stream()
                .map(line -> line.unitPrice().multiply(BigDecimal.valueOf(line.quantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add), active);
    }

    private static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException failure) {
            throw new IllegalStateException("SHA-256 is required", failure);
        }
    }

    public record Pick(UUID offerId, UUID seatId, Integer quantity) {}

    public record HoldView(long version, OffsetDateTime expiresAt, List<Line> items,
                           BigDecimal totalAmount, boolean active) {}

    public record Checkout(Sale sale, Hold hold, OffsetDateTime now) {}
}
